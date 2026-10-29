#!/usr/bin/env bash
# Offline end-to-end rehearsal of Stage One on a fake fpd-prod: mycelium-bridge.sh (setup, whoami, prepare, run, ingest,
# verify, credential, close, teardown) driving the REAL runner (myc-gate v3, myc-stageb v5.1, myc-agent v6) with FAKE
# claude/codex CLIs, a local bare repo as GitHub, and the REAL bridge code against PGlite connected AS the restricted
# bridge role. No network, no Neon, no model calls, no root.   bash stage-one/test-bridge-host.sh
set -uo pipefail
for c in git jq flock iconv dd timeout awk node sha256sum shred; do command -v $c >/dev/null || { echo "bridge host tests: need $c"; exit 1; }; done
D=$(cd "$(dirname "$0")" && pwd); MEM=$(cd "$D/.." && pwd); S=$D/mycelium-bridge.sh; SB=$(cd "$MEM/../stageb" && pwd)
T=$(mktemp -d); trap 'chmod -R u+w "$T" 2>/dev/null; rm -rf "$T"' EXIT
pass=0; failn=0
ok()  { echo "  PASS $*"; pass=$((pass + 1)); }
bad() { echo "  FAIL $*"; failn=$((failn + 1)); }
B=findpitches-v3/greenfield TD=greenfield/mycelium/tasks RUNS=greenfield/mycelium/runs R=$T/root
export GIT_AUTHOR_NAME=chris GIT_AUTHOR_EMAIL=c@x GIT_COMMITTER_NAME=chris GIT_COMMITTER_EMAIL=c@x
# --- GitHub: a bare remote holding the memory package; Chris's clone; the HubSync clone
git init -q --bare "$T/remote.git"; git clone -q "$T/remote.git" "$T/human" 2>/dev/null
(cd "$T/human" && git checkout -q -b "$B" && mkdir -p greenfield/mycelium/memory "$RUNS" \
  && tar -C "$MEM" --exclude=./node_modules --exclude=./.env.local -cf - . | tar -C greenfield/mycelium/memory -xf - \
  && git add -A && git commit -qm pkg && git push -q origin "$B") 2>/dev/null
mkdir -p "$T/hs" "$T/spool" "$T/myc" "$T/stub" "$T/bin" "$T/ctl" "$T/decisions"
git clone -q --branch "$B" "$T/remote.git" "$T/hs/repo" 2>/dev/null
push() { (cd "$T/human" && git add -A && git commit -qm "$1" && git pull -q --rebase origin "$B" && git push -q origin "$B") >/dev/null 2>&1 || { echo "push failed" >&2; exit 1; }
  git --git-dir="$T/remote.git" rev-parse "$B"; }
hsfetch() { git -C "$T/hs/repo" fetch -q origin "+refs/heads/$B:refs/remotes/origin/$B"; }
manifest() {  # batch t1 t2
  jq -n --arg b "$1" --arg t1 "$2" --arg t2 "$3" '{batch:$b, purpose:"offline rehearsal",
    seed:{kind:"question", title:("FindPitches: how should Mycelium verify a vendor pitch is real, open and actionable? (" + $b + ")"), body:"Seed for the rehearsal."},
    selection:{search:("FindPitches: how should Mycelium verify a vendor pitch is real, open and actionable? (" + $b + ")"), limit:20, maxDepth:2, maxResults:60},
    tasks:[{task:$t1, agent:"claude"}, {task:$t2, agent:"codex"}]}' > "$T/human/$RUNS/$1.json"; }
task() {  # id agent instructions
  (cd "$T/human" && mkdir -p "$TD/$1/events" && jq -n --arg t "$1" --arg a "$2" --arg i "$3" --arg rl "$TD/$1/result.md" \
     '{task_id:$t, assigned_agent:$a, instructions:$i, status:"pending", result_location:$rl}' > "$TD/$1/task.json" \
   && jq -n '{seq:1, status:"pending", at:"2026-10-29T10:00:00Z", actor:"chris", reason:"created by Chris"}' > "$TD/$1/events/0001.json"); }
# --- memory: PGlite seeded like Neon today, plus the bridge login
IDS=$(cd "$MEM" && node test/pglite-init.mjs "$T/pgdata" s1-proof s1-recover) || { echo "pglite init failed"; exit 1; }
SEED1=$(jq -r '."s1-proof"' <<<"$IDS") SEED2=$(jq -r '."s1-recover"' <<<"$IDS")
nodes() { (cd "$MEM" && node --input-type=module -e "import { PGlite } from '@electric-sql/pglite'; const pg = new PGlite('$T/pgdata');
  console.log((await pg.query('SELECT count(*)::int AS n FROM mycelium_memory.nodes')).rows[0].n); await pg.close();"); }
# --- fake CLIs: save the prompt; answer with one valid contribution (Codex refines the earlier turn it was given)
cat > "$T/stub/claude" <<'EOF'
#!/usr/bin/env bash
[[ $1 == auth ]] && { echo '{"loggedIn":true,"authMethod":"claude.ai","apiProvider":"firstParty"}'; exit 0; }
[[ $1 == --version ]] && { echo "2.1.308 (Claude Code)"; exit 0; }
p=$(cat); printf '%s' "$p" > "$CTL/prompt.claude"; echo claude >> "$CTL/calls"
s=$(grep -o '^\[node [0-9a-f-]*\] kind="question"' <<<"$p" | head -1 | grep -o '[0-9a-f-]\{36\}')
a=$(printf 'Organiser pages first.\n\n```mycelium-contribution\n{"kind":"hypothesis","title":"Organiser application pages are the primary evidence","body":"Check the official page and its date.","links":[{"to":"%s","relation":"answers"}],"stances":[{"node":"%s","stance":"supports","weight":0.6}]}\n```\n' "$s" "$s")
jq -n --arg r "$a" '{type:"result", is_error:false, result:$r, usage:{input_tokens:5, output_tokens:20, cache_read_input_tokens:0}, modelUsage:{"claude-sonnet-5-5":{}}, total_cost_usd:0.01}'
EOF
cat > "$T/stub/codex" <<'EOF'
#!/usr/bin/env bash
[[ $1 == login ]] && { echo "Logged in using ChatGPT"; exit 0; }
[[ $1 == --version ]] && { echo "codex-cli 0.164.0"; exit 0; }
p=$(cat); printf '%s' "$p" > "$CTL/prompt.codex"; echo codex >> "$CTL/calls"
out=""; prev=""; for a in "$@"; do [[ $prev == -o ]] && out=$a; prev=$a; done
s=$(grep -o '^\[node [0-9a-f-]*\] kind="question"' <<<"$p" | head -1 | grep -o '[0-9a-f-]\{36\}')
t=$(grep -o 'tasks/MYC-[0-9]*-[0-9]*/result.md' <<<"$p" | head -1 | cut -d/ -f2)
printf 'Refine it.\n\n```mycelium-contribution\n{"kind":"probe_design","title":"Two-source verification","body":"Organiser page plus a dated listing.","links":[{"to":"@%s","relation":"refines"},{"to":"%s","relation":"tests"}],"stances":[]}\n```\n' "$t" "$s" > "$out"
echo '{"type":"turn.completed","usage":{"input_tokens":100,"cached_input_tokens":0,"output_tokens":20}}'
EOF
cat > "$T/bin/npm" <<'EOF'
#!/usr/bin/env bash
[[ $1 == --version ]] && { echo 10.9.0; exit 0; }
[[ $1 == ci ]] && { mkdir -p node_modules; exit 0; }
exit 1
EOF
printf '#!/usr/bin/env bash\nexec "$@"\n' > "$T/bin/myc-run"; chmod +x "$T/stub/"* "$T/bin/"*
mkdir -p "$R/home/ct_admin" "$R/opt" "$R/etc/myc-stageb" "$R/var/lib" "$R/root" "$R/users" "$R/groups"
export BRIDGE_TEST=1 T_ROOT=$R T_REPO=$T/hs/repo T_BRANCH=origin/$B T_GATE=$SB/myc-gate T_STAGEB=$SB/myc-stageb T_HSHOME=$T/hs \
  T_BRIDGE="node $MEM/test/pglite-bridge.mjs" T_PGDATA=$T/pgdata PATH="$T/stub:$T/bin:$PATH" CTL=$T/ctl \
  MYC_TEST=1 MYC_HOME=$T/hs MYC_SPOOL=$T/spool MYC_STATE=$T/state/state.json MYC_AS_MYC="env HOME=$T/myc" MYC_GATE=$SB/myc-gate \
  MYC_AGENT=$SB/myc-agent MYC_GUARD=$T/bin/myc-run MYC_DECISIONS=$T/decisions MYC_MEMSNAP=$R/var/lib/mycelium-memory/snapshots
run() { bash "$S" "$@" > "$T/out" 2>&1; }
calls() { [[ -f $T/ctl/calls ]] && wc -l < "$T/ctl/calls" | tr -d ' ' || echo 0; }
snapR() { (cd "$R" && find . -printf '%p %y %m %s\n' | sort; find . -type f -exec sha256sum {} + | sort) 2>/dev/null; }
E=$R/etc/mycelium/bridge.env V=$R/home/ct_admin/mycelium-bridge.pw ST=$R/var/lib/mycelium-memory

echo "1. pre-existing paths, users or groups are refused by precheck and setup; nothing changes"
C0=$(git --git-dir="$T/remote.git" rev-parse "$B"); hsfetch
for what in user group etc store pkg pwcopy; do
  case $what in user) touch "$R/users/mycmem" ;; group) touch "$R/groups/mycmem" ;; etc) mkdir -p "$R/etc/mycelium" ;;
    store) mkdir -p "$ST" ;; pkg) mkdir -p "$R/opt/mycelium-memory" ;; pwcopy) echo x > "$V" ;; esac
  before=$(snapR); run precheck; r1=$?; run setup "$C0"; r2=$?
  [[ $r1 != 0 && $r2 != 0 && $(snapR) == "$before" ]] && ok "pre-existing $what: refused, nothing changed" || { bad "collision $what"; cat "$T/out"; }
  rm -rf "$R/users/mycmem" "$R/groups/mycmem" "$R/etc/mycelium" "$ST" "$R/opt/mycelium-memory" "$V"
done

echo "1b. a setup that is closed and torn down before any batch leaves nothing behind, so setup can run again (29 Oct live case)"
run setup "$C0" || { bad "setup 1b"; cat "$T/out"; }
run close && run teardown && [[ ! -e $ST && ! -e $R/opt/mycelium-memory && ! -e $R/etc/mycelium && ! -e $R/users/mycmem && ! -e $V ]] \
  && ok "close + teardown with no batch: package, config, user, PC copy and the empty store all removed" || { bad "teardown empty"; cat "$T/out"; }
rm -f "$R"/root/mycelium-bridge-receipt-*.txt

echo "2. setup (persistent install), whoami (PC copy shredded, exact privileges as the bridge role)"
run precheck && grep -q "PRECHECK OK" "$T/out" && ok "precheck on a clean host" || { bad precheck; cat "$T/out"; }
run setup "$C0" && [[ -f $E && $(stat -c %a "$E") == 640 && -f $V && $(stat -c %a "$V") == 600 && -f $R/opt/mycelium-memory/scripts/bridge.mjs ]] \
  && grep -q '^MYCELIUM_DATABASE_URL=postgresql://mycelium_bridge_fpd_r2:' "$E" && ! grep -q "$(cat "$V")" "$T/out" && ok "setup: package, store, credential 0640, one PC copy 0600; password never printed" || { bad setup; cat "$T/out"; }
[[ $(stat -c %a "$ST/snapshots") == 750 && $(stat -c %a "$ST/batches") == 700 ]] && ok "snapshot store 0750, batch receipts 0700" || bad "store modes"
run setup "$C0"; [[ $? != 0 ]] && grep -q "one-time" "$T/out" && ok "a second setup is refused" || bad "re-setup"
run whoami && [[ ! -e $V ]] && grep -q "WHOAMI OK" "$T/out" && ok "whoami: PC copy shredded; exact least-privilege check passed AS mycelium_bridge_fpd_r2" || { bad whoami; cat "$T/out"; }

echo "3. prepare: manifest at a pinned commit -> seed -> READ ONLY snapshot -> sealed local copy (never in Git)"
manifest s1-proof MYC-20261029-001 MYC-20261029-002; C1=$(push "manifest s1-proof"); hsfetch
n0=$(nodes); run prepare s1-proof "$C1" && grep -q "PREPARE OK" "$T/out" || { bad prepare; cat "$T/out"; }
H=$(cat "$ST/batches/s1-proof/snapshot.sha256"); F=$ST/snapshots/$H.md
[[ -f $F && $(stat -c %a "$F") == 440 && $(sha256sum "$F" | cut -c1-64) == "$H" ]] && grep -q "$SEED1" "$F" && [[ $(nodes) == $((n0 + 1)) ]] \
  && ok "snapshot sealed (0440, named by its digest) and holds the seed question; exactly 1 node written (the seed)" || bad "snapshot"
grep -q "memref: sha256:$H" "$T/out" && ok "prints the exact memref line for the task descriptors" || bad "memref line"
run prepare s1-proof "$C1"; [[ $? != 0 ]] && grep -q "never re-prepared" "$T/out" && ok "a batch is never re-prepared" || bad "re-prepare"
run run s1-proof "$C1"; [[ $? != 0 ]] && grep -q "MYC_BILLING_CONFIRMED" "$T/out" && ok "run needs the billing confirmation" || bad "billing"

echo "4. run refuses descriptors that do not pin this snapshot (before any allowlist, claim or call)"
task MYC-20261029-001 claude $'Turn 1. Contribute one block.\nmemref: sha256:'"$(printf 'f%.0s' {1..64})"
task MYC-20261029-002 codex $'Turn 2. Refine turn 1.\nmemref: sha256:'"$H"$'\nref: '"$TD/MYC-20261029-001/result.md"
CB=$(push "tasks with a wrong digest"); hsfetch
export MYC_BILLING_CONFIRMED=yes
c0=$(calls); run run s1-proof "$CB"; [[ $? != 0 && $(calls) == "$c0" && ! -e $R/etc/myc-stageb/s1-proof.allowed ]] && grep -q "does not carry exactly one" "$T/out" \
  && ok "wrong digest: refused, no allowlist, no call" || { bad "wrong digest"; cat "$T/out"; }
task MYC-20261029-001 claude $'Turn 1. Contribute one block.\nmemref: sha256:'"$H"
C2=$(push "tasks pin the snapshot"); hsfetch

echo "5. run: two turns through the installed runner, then ingest + fresh-process verify; allowlist archived"
c0=$(calls); run run s1-proof "$C2"; rr=$?
[[ $rr == 0 ]] && grep -q "RUN OK: 2 turn(s)" "$T/out" && [[ $(calls) == $((c0 + 2)) ]] && ok "RUN OK with exactly 2 calls" || { bad "run"; cat "$T/out"; }
grep -q "Organiser application pages" "$T/ctl/prompt.codex" && grep -q "$SEED1" "$T/ctl/prompt.claude" && grep -q "$SEED1" "$T/ctl/prompt.codex" \
  && ok "Claude saw the sealed memory; Codex saw the memory AND Claude's answer" || bad "prompts"
[[ $(tail -1 "$ST/batches/s1-proof/receipt" | cut -d' ' -f2) == VERIFIED && $(nodes) == $((n0 + 3)) ]] && ok "receipt VERIFIED; exactly 2 contributions added" || bad "verified"
[[ ! -e $R/etc/myc-stageb/s1-proof.allowed && -f $ST/batches/s1-proof/allowed.archived ]] && ok "allowlist closed and archived" || bad "allowlist"
jq -se 'length == 2 and all(.usage.agent != null)' "$ST/batches/s1-proof/usage.jsonl" >/dev/null && ok "usage receipt from the gate's completion events" || bad "usage"
! git --git-dir="$T/remote.git" log --all -p | grep -q "kind=\"question\"" && ok "no snapshot text in Git history" || bad "snapshot in git"
c0=$(calls); run run s1-proof "$C2"; [[ $? != 0 && $(calls) == "$c0" ]] && grep -q "not PREPARED" "$T/out" && ok "a batch runs its turns at most once" || bad "rerun"
run ingest s1-proof && grep -q "re-verifying only" "$T/out" && [[ $(nodes) == $((n0 + 3)) ]] && ok "ingest after VERIFIED re-verifies only" || { bad "ingest verified"; cat "$T/out"; }
run verify s1-proof && grep -q "VERIFY OK" "$T/out" && ok "verify (read-only) from the pinned batch" || { bad verify; cat "$T/out"; }

echo "6. recovery: the acknowledgement of turn 2's write is lost after commit -> STOP, INGEST_PENDING -> ingest reconciles"
manifest s1-recover MYC-20261029-003 MYC-20261029-004; C3=$(push "manifest s1-recover"); hsfetch
run prepare s1-recover "$C3" || { bad "prepare 2"; cat "$T/out"; }
H2=$(cat "$ST/batches/s1-recover/snapshot.sha256")
task MYC-20261029-003 claude $'Turn 1.\nmemref: sha256:'"$H2"
task MYC-20261029-004 codex $'Turn 2.\nmemref: sha256:'"$H2"$'\nref: '"$TD/MYC-20261029-003/result.md"
C4=$(push "recover tasks"); hsfetch
# the id turn 2 will get is derived from its run id, unknown until it runs: inject on its title instead
echo "Two-source verification" > "$T/inject"; export T_INJECT_ONCE=$T/inject
n1=$(nodes); c0=$(calls); run run s1-recover "$C4"; rr=$?
[[ $rr != 0 ]] && grep -q "Memory may or may not hold part of this batch" "$T/out" && [[ $(tail -1 "$ST/batches/s1-recover/receipt" | cut -d' ' -f2) == INGEST_PENDING ]] \
  && [[ $(calls) == $((c0 + 2)) && $(nodes) == $((n1 + 2)) ]] && ok "lost ack: STOP with INGEST_PENDING; both rows actually committed; no retry" || { bad "lost ack"; cat "$T/out"; }
[[ ! -e $R/etc/myc-stageb/s1-recover.allowed ]] && ok "the allowlist was closed before ingestion" || bad "allowlist after failure"
c0=$(calls); run ingest s1-recover && [[ $(calls) == "$c0" && $(nodes) == $((n1 + 2)) ]] && [[ $(tail -1 "$ST/batches/s1-recover/receipt" | cut -d' ' -f2) == VERIFIED ]] \
  && ok "ingest: exact pinned batch reconciled (no duplicate, no model call), VERIFIED" || { bad "reconcile"; cat "$T/out"; }
cp "$ST/batches/s1-recover/batch.json" "$T/b.json"; jq '.items[0].result_sha256 = ("0" * 64)' "$T/b.json" > "$ST/batches/s1-recover/batch.json"
run verify s1-recover; [[ $? != 0 ]] && grep -q "rebuilt batch differs" "$T/out" && ok "a tampered pinned batch is refused" || bad "tampered batch"
cp "$T/b.json" "$ST/batches/s1-recover/batch.json"
chmod u+w "$ST/snapshots/$H2.md"; echo x >> "$ST/snapshots/$H2.md"
run verify s1-recover; [[ $? != 0 ]] && grep -q "snapshot bytes do not match" "$T/out" && ok "a tampered sealed snapshot is refused" || { bad "tampered snapshot"; cat "$T/out"; }
unset T_INJECT_ONCE

echo "6b. interrupted orchestration (SIGKILL/power loss: no EXIT trap ran): ingest reconciles from CALLS_STARTED, database-only"
emulate_run() {  # batch commit turns... : exactly what `run` leaves durable before it is killed (allowance still in place)
  local b=$1 c=$2; shift 2; local bd=$ST/batches/$b t a
  : > "$bd/allowed"; while read -r t a; do echo "$t $a $(git --git-dir="$T/remote.git" rev-parse "$c:$TD/$t/task.json")" >> "$bd/allowed"; done < <(jq -r '.tasks[] | "\(.task) \(.agent)"' "$bd/manifest.json")
  printf '%s CALLS_STARTED turns=2 window=1800s commit=%s\n' "$(date -u +%FT%TZ)" "$c" >> "$bd/receipt"
  cp "$bd/allowed" "$R/etc/myc-stageb/$b.allowed"
  for t in "$@"; do MYC_ALLOW="$R/etc/myc-stageb/$b.allowed" MYC_AS_HUBSYNC="env HOME=$T/hs MYC_ALLOW=$R/etc/myc-stageb/$b.allowed MYC_MAX_CALLS=2" \
    MYC_WINDOW_S=1800 bash "$SB/myc-stageb" "$t" > /dev/null 2>&1; done
}
crash_batch() {  # batch t1 t2 -> prepared, descriptors pinned; prints the commit
  manifest "$1" "$2" "$3"; local c; c=$(push "manifest $1"); hsfetch; run prepare "$1" "$c" || { echo "prepare $1 failed" >&2; cat "$T/out" >&2; }
  local h; h=$(cat "$ST/batches/$1/snapshot.sha256")
  task "$2" claude $'Turn 1.\nmemref: sha256:'"$h"; task "$3" codex $'Turn 2.\nmemref: sha256:'"$h"$'\nref: '"$TD/$2/result.md"
  push "tasks $1"; }
C5=$(crash_batch s1-crash MYC-20261029-005 MYC-20261029-006 | tail -1); hsfetch
emulate_run s1-crash "$C5" MYC-20261029-005 MYC-20261029-006
n2=$(nodes); c0=$(calls)
[[ -e $R/etc/myc-stageb/s1-crash.allowed && $(tail -1 "$ST/batches/s1-crash/receipt" | cut -d' ' -f2) == CALLS_STARTED ]] && ok "killed after the final completion: CALLS_STARTED, allowance still open" || bad "crash setup"
run run s1-crash "$C5"; [[ $? != 0 && $(calls) == "$c0" ]] && grep -q "not PREPARED" "$T/out" && ok "run refuses to start the turns again" || bad "crash rerun"
run ingest s1-crash && [[ $(calls) == "$c0" && $(nodes) == $((n2 + 2)) && ! -e $R/etc/myc-stageb/s1-crash.allowed ]] && grep -q "reconciled: every turn completed" "$ST/batches/s1-crash/receipt" \
  && [[ $(tail -1 "$ST/batches/s1-crash/receipt" | cut -d' ' -f2) == VERIFIED ]] && ok "ingest: allowance closed first, completion verified on GitHub, ingested + VERIFIED; no call" || { bad "crash reconcile"; cat "$T/out"; }
C7=$(crash_batch s1-half MYC-20261029-007 MYC-20261029-008 | tail -1); hsfetch
emulate_run s1-half "$C7" MYC-20261029-007
n3=$(nodes); c0=$(calls)
run ingest s1-half; [[ $? != 0 && $(calls) == "$c0" && $(nodes) == "$n3" && ! -e $R/etc/myc-stageb/s1-half.allowed ]] && grep -q "is HELD: MYC-20261029-008 pending" "$T/out" \
  && ok "killed after turn 1 only: HELD, allowance closed, nothing ingested, no call" || { bad "half"; cat "$T/out"; }
run ingest s1-half; [[ $? != 0 && $(calls) == "$c0" ]] && grep -q "HELD" "$T/out" && ok "a held batch stays held (no new call, ever)" || bad "half rerun"
cp "$ST/batches/s1-half/allowed" "$R/etc/myc-stageb/s1-half.allowed"; echo "MYC-20261029-999 claude x" >> "$R/etc/myc-stageb/s1-half.allowed"
run ingest s1-half; [[ $? != 0 && -e $R/etc/myc-stageb/s1-half.allowed ]] && grep -q "not the allowance this batch recorded" "$T/out" && ok "a foreign allowlist is left alone" || bad "foreign allowance"
rm -f "$R/etc/myc-stageb/s1-half.allowed"
( exec 9>>"$ST/lock"; flock 9; sleep 4 ) & sleep 0.5
run verify s1-proof; [[ $? != 0 ]] && grep -q "holds the lock" "$T/out" && ok "verify takes the run lock (cannot race an ingest)" || bad "verify lock"
wait; run verify s1-proof && [[ -z $(ls -d "$ST/batches/s1-proof"/verify.* 2>/dev/null) ]] && ok "verify uses an isolated collection folder and removes it" || bad "verify isolation"

echo "7. rotation, close and teardown (memory evidence kept)"
old=$(sha256sum "$E"); run credential && [[ -f $V && $(sha256sum "$E") != "$old" ]] && ok "credential: new password + one PC copy" || { bad credential; cat "$T/out"; }
run credential; [[ $? != 0 ]] && grep -q "not collected" "$T/out" && ok "a second rotation before the PC step is refused" || bad "double rotate"
run close && [[ ! -e $E && ! -e $V ]] && ok "close shreds the credential and PC copy" || bad close
run whoami; [[ $? != 0 ]] && ok "nothing runs without the credential" || bad "post-close"
run teardown && [[ ! -e $R/opt/mycelium-memory && ! -e $R/etc/mycelium && ! -e $R/users/mycmem && -d $ST/batches/s1-proof ]] \
  && ok "teardown removes what it created; snapshots and batch receipts kept" || { bad teardown; cat "$T/out"; }

echo; echo "bridge host tests: $pass passed, $failn failed (no model calls, no network)"; [[ $failn == 0 ]]
