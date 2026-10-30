#!/usr/bin/env bash
# Mycelium Stage One on fpd-prod: BRIX-native shared memory for the EXISTING runner (PROPOSAL; run only within Chris's
# approval of the exact Stage One scope in greenfield/docs/mycelium/STAGE_ONE_FINAL_PROPOSAL_2026-10-29.md). Root only.
#   sudo bash mycelium-bridge.sh precheck                 read-only; changes nothing
#   sudo bash mycelium-bridge.sh setup <commit>           persistent install: user mycmem, package, credential, one PC copy
#   sudo bash mycelium-bridge.sh whoami                   shred the PC copy; Unix boundary checks; exact DB privilege check
#   sudo bash mycelium-bridge.sh prepare <batch> <commit> manifest -> optional seed -> READ ONLY snapshot -> sealed local copy
#   sudo MYC_BILLING_CONFIRMED=yes bash mycelium-bridge.sh run <batch> <commit>
#                                                         the approved turns through the INSTALLED myc-stageb, then ingest+verify
#   sudo bash mycelium-bridge.sh ingest <batch>           recovery/continuation ONLY: the exact pinned batch; never a model call
# Stage Two cycles: a manifest with "workbench": true pins the workbench at the run commit into WBR/<batch>/tree and hands
# MYC_POST=/usr/local/bin/myc-post to the installed myc-stageb v5.2, so each answer's artifacts are scored before the
# next turn; a STALL record from myc-post (two turns in a row without progress) ends the cycle early, and the completed
# prefix is ingested. "window_s" (<= 3600) sets the approved window.
#   sudo bash mycelium-bridge.sh verify <batch>           read-only fresh-process verification
#   sudo bash mycelium-bridge.sh credential               rotation: new password into the credential + one PC copy
#   sudo bash mycelium-bridge.sh upgrade-package <commit> replace /opt/mycelium-memory with the package at <commit>; the user,
#                                                         login, credential, store and receipts are kept; the previous
#                                                         package is kept for `upgrade-package <previous commit>`
#   sudo bash mycelium-bridge.sh close                    shred the credential (the PC close step disables the login)
#   sudo bash mycelium-bridge.sh teardown                 remove the package/config/user it created; memory evidence is kept
# Ownership and refusals are the proven trial pattern (exclusive receipt, record-after-create, never adopt), in its OWN
# namespace. The CLIs (user myc) never see the credential, the snapshot store or any SQL route; mycmem is in no other group.
# One run lock covers prepare/run/ingest/verify; every one of them re-checks the Unix boundary, and every bridge process
# re-checks the database capability (bridgeGuard) before its first query. Stops at the first failure; never retries; never calls a model outside `run`.
set -euo pipefail
umask 077
HOST=ep-little-thunder-zahn9b42.c-2.eu-west-2.aws.neon.tech DBNAME=neondb ROLE=mycelium_bridge_fpd_r2 U=mycmem
RC=/var/lib/mycelium-bridge PKG=/opt/mycelium-memory ETC=/etc/mycelium STORE=/var/lib/mycelium-memory VER=/home/ct_admin/mycelium-bridge.pw
ALLOWD=/etc/myc-stageb ARCH=/root REPO=/var/lib/hubsync/repo BRANCH=origin/findpitches-v3/greenfield SUB=greenfield/mycelium/memory
RUNS=greenfield/mycelium/runs TASKS=greenfield/mycelium/tasks STEP_S=90 GRACE_S=5 NODE_MIN=22.19.0 TEST=0 MAX_TURNS=6 WINDOW_S=1800 WBR=/var/lib/mycelium-workbench POSTBIN=/usr/local/bin/myc-post
GATE=/usr/local/bin/myc-gate STAGEB=/usr/local/bin/myc-stageb
GATE_V3=bca72724623b69439d2876eb4dd9aa3bb11e8b16f75a09f6238dab7e9d962dc1
SB_V52=7445ad75f10f722676c0c6da580346f000857485615da33004fe851ead4b1f82 POST_V1=74e73ec0a7a52035ec9afc72c6ae5e19d5df25e47294ee99ecbd436c5774db56   # reviewed cycle hook (install-cycle.sh)
AS_HS=(runuser -u hubsync -- env -i HOME=/var/lib/hubsync LANG=C.UTF-8 PATH=/usr/local/bin:/usr/bin:/bin)
AS_U=(runuser -u "$U" -- env -i HOME=/nonexistent LANG=C.UTF-8 PATH=/usr/local/bin:/usr/bin:/bin)
if [[ ${BRIDGE_TEST:-0} == 1 ]]; then   # offline test harness only: everything under $T_ROOT; users/groups are files
  TEST=1 RC=$T_ROOT/var/lib/mycelium-bridge PKG=$T_ROOT/opt/mycelium-memory ETC=$T_ROOT/etc/mycelium STORE=$T_ROOT/var/lib/mycelium-memory
  VER=$T_ROOT/home/ct_admin/mycelium-bridge.pw ALLOWD=$T_ROOT/etc/myc-stageb ARCH=$T_ROOT/root REPO=$T_REPO BRANCH=$T_BRANCH
  GATE=$T_GATE STAGEB=$T_STAGEB GATE_V3=$(sha256sum "$T_GATE" | cut -c1-64) SB_V52=$(sha256sum "$T_STAGEB" | cut -c1-64) POST_V1=${T_POST_V1:-${T_POSTBIN:+$(sha256sum "$T_POSTBIN" | cut -c1-64)}} WBR=${T_WBR:-$T_ROOT/var/lib/mycelium-workbench} POSTBIN=${T_POSTBIN:-} STEP_S=${T_STEP:-90} AS_HS=(env HOME=$T_HSHOME) AS_U=(env)
fi
ENV=$ETC/bridge.env RECEIPT=$RC/created LOG=$RC/log SNAPS=$STORE/snapshots BATCHES=$STORE/batches
BRIDGE=(node --env-file="$ENV" "$PKG/scripts/bridge.mjs"); [[ $TEST == 1 ]] && read -ra BRIDGE <<<"$T_BRIDGE"
HEADER="mycelium-bridge receipt v1" OURS=0
say()  { echo "bridge: $*"; [[ $OURS == 1 ]] && echo "$(date -u +%FT%TZ) $*" >> "$LOG" || true; }
stop() { say "STOP: $*"; exit 1; }
exists() { [[ -e $1 || -L $1 ]]; }
user_exists()  { if [[ $TEST == 1 ]]; then [[ -e $T_ROOT/users/$U ]]; else getent passwd "$U" >/dev/null; fi; }
group_exists() { if [[ $TEST == 1 ]]; then [[ -e $T_ROOT/groups/$U ]]; else getent group "$U" >/dev/null; fi; }
record() { printf '%s %s\n' "$1" "$2" >> "$RECEIPT"; }
recorded() { [[ -f $RECEIPT ]] && grep -qxF "$1 $2" "$RECEIPT"; }
excl() { ( set -C; : > "$1" ) 2>/dev/null; }
me() { [[ $TEST == 1 ]] && id -u || echo 0; }
recognise() {
  [[ -d $RC && ! -L $RC && $(stat -c '%u %a' "$RC") == "$(me) 700" && -f $RECEIPT && ! -L $RECEIPT \
     && $(stat -c %u "$RECEIPT") == "$(me)" && $(head -1 "$RECEIPT") == "$HEADER" ]] && OURS=1
}
need_install() { recognise || stop "no recognised install receipt (setup not run by this script); nothing changed"
  recorded dir "$PKG" && recorded file "$ENV" && [[ -f $ENV && ! -L $ENV ]] || stop "install incomplete or credential closed"; }
node_ok() { command -v node >/dev/null && node -e "const [a,b,c]=process.versions.node.split('.').map(Number),[x,y,z]='$NODE_MIN'.split('.').map(Number);process.exit(a>x||(a==x&&(b>y||(b==y&&c>=z)))?0:1)"; }
own() { [[ $TEST == 1 ]] || chown "$1" "$2"; }
sha() { sha256sum "$1" | cut -c1-64; }
genpw() {  # URL-safe base64, 40 characters (240 bits), upper+lower+digit, no character three times running
  node -e 'const c=require("crypto");for(;;){const p=c.randomBytes(30).toString("base64url");if(/[A-Z]/.test(p)&&/[a-z]/.test(p)&&/[0-9]/.test(p)&&!/(.)\1\1/.test(p)){process.stdout.write(p);break}}'; }
write_credential() {  # new password -> $ENV (atomic, root:mycmem 0640) and ONE PC copy $VER (ct_admin 0600, exclusive)
  local pwf; pwf=$(mktemp "$RC/pw.XXXXXX")   # shredded below; after a STOP, `close` shreds any leftover
  genpw > "$pwf"; grep -qE '^[A-Za-z0-9_-]{40}$' "$pwf" || stop "password generation failed"
  [[ -d $(dirname "$VER") && ! -L $(dirname "$VER") ]] || stop "$(dirname "$VER") missing"
  excl "$VER" || stop "$VER already exists (an earlier PC copy was not collected); nothing changed"; record file "$VER"
  chmod 0600 "$VER"; own ct_admin:ct_admin "$VER"; cat "$pwf" >| "$VER"
  local tmp; tmp=$(mktemp "$ETC/.bridge.env.XXXXXX"); chmod 0640 "$tmp"; own "root:$U" "$tmp"
  { printf 'MYCELIUM_DATABASE_URL=postgresql://%s:' "$ROLE"; cat "$pwf"; printf '@%s/%s?sslmode=require\n' "$HOST" "$DBNAME"
    printf 'MYCELIUM_DATABASE_HOST=%s\nMYCELIUM_DATABASE_NAME=%s\n' "$HOST" "$DBNAME"; } >| "$tmp"
  mv -f "$tmp" "$ENV"; shred -u "$pwf"
}
step() {  # <label> <write:0|1> args... : one fresh node process as $U, bounded; output to $OUT
  local label=$1 w=$2; shift 2; local t=$(( STEP_S - GRACE_S ))
  local envw=(); [[ $w == 1 ]] && envw=(env MYCELIUM_REMOTE_WRITES_APPROVED=yes)
  if "${AS_U[@]}" "${envw[@]}" timeout -k "$GRACE_S" "$t" "${BRIDGE[@]}" "$@" > "$OUT" 2>&1; then say "$label: $(head -c 2000 "$OUT")"
  else return 1; fi
}
hs_git() { "${AS_HS[@]}" git -C "$REPO" "$@"; }
pinned() {  # <commit>: must be a full commit on the branch in the HubSync clone
  [[ $1 =~ ^[0-9a-f]{40}$ ]] || stop "give the full 40-character commit"
  hs_git cat-file -e "$1^{commit}" 2>/dev/null || stop "commit $1 not in the HubSync clone (wait for HubSync, then retry)"
  hs_git merge-base --is-ancestor "$1" "$BRANCH" || stop "commit $1 is not on $BRANCH"
}
lock() { exec 8>>"$STORE/lock"; flock -n 8 || stop "another bridge prepare/run/ingest/verify holds the lock"; }
bstate() { tail -1 "$BD/receipt" | cut -d' ' -f2; }   # last state line of the batch receipt
bmark() { printf '%s %s %s\n' "$(date -u +%FT%TZ)" "$1" "${2:-}" >> "$BD/receipt"; say "batch $BATCH: $1 ${2:-}"; }
batch_dir() { BATCH=$1; [[ $BATCH =~ ^[a-z0-9][a-z0-9-]{2,63}$ ]] || stop "bad batch name"; BD=$BATCHES/$BATCH; OUT=$BD/out
  [[ -d $BD && ! -L $BD && -f $BD/receipt ]] || stop "batch $BATCH was not prepared here"; }
workdir() {  # fresh per-step input folder readable by $U only through its group
  local w; w=$(mktemp -d "$STORE/work/$BATCH.XXXXXX"); chmod 0750 "$w"; own "root:$U" "$w"; echo "$w"; }
put() { install -m 0640 "$1" "$2"; own "root:$U" "$2"; }

boundary() {  # Unix trust boundary: the CLIs and the Git writer cannot read the credential; mycmem cannot read theirs
  [[ $TEST == 1 ]] && { say "boundary checks: skipped in the offline harness"; return 0; }
  local u p
  for u in myc hubsync; do runuser -u "$u" -- test -r "$ENV" && stop "$u can read the bridge credential"; id -Gn "$u" | tr ' ' '\n' | grep -qx "$U" && stop "$u is in group $U"; done
  for p in /var/lib/hubsync/.ssh /home/myc/.claude /home/myc/.claude.json /home/myc/.codex /home/myc/.config; do
    [[ -e $p ]] || continue; runuser -u "$U" -- test -r "$p" && stop "$U can read $p"; done
  [[ $(id -Gn "$U") == "$U" ]] || stop "$U has supplementary groups: $(id -Gn "$U")"
  sudo -n -l -U "$U" 2>/dev/null | grep -q 'may run' && stop "$U has sudo rules"
  if command -v getfacl >/dev/null; then getfacl -cp "$ENV" "$ETC" 2>/dev/null | grep -qE '^(user|group):[^:]+:' && stop "ACL entries on the credential path"; fi
  [[ $(stat -c '%U:%G %a' "$ETC") == "root:$U 750" && $(stat -c '%U:%G %a' "$ENV") == "root:$U 640" ]] || stop "credential path ownership/modes changed"
  say "boundary OK: myc and hubsync cannot read the credential; $U cannot read the deploy key or CLI sign-ins; no extra groups, sudo or ACLs"
}

# GitHub side of ingestion: from the HubSync clone at ONE pinned commit, every turn must be completed by the gate, under the
# allowlisted descriptor, with an exact run id and a result whose sha256 the completion event pins. Builds batch.json.
collect() {  # <commit> <out dir> -> <dir>/{batch.json,result-N.md}
  local c=$1 o=$2 i=0 t a desc r ev last run h rb ref; rm -rf "$o"; mkdir -m 0700 "$o"
  local items='[]'
  while read -r t a; do
    if [[ $("${AS_HS[@]}" "$GATE" state "$t" 2>/dev/null | head -1) != "$t completed "* ]]; then
      if [[ $i -gt 0 ]] && grep -q ' STALLED ' "$BD/receipt"; then break; fi   # a stalled cycle ingests its completed prefix
      stop "$t is not completed (validated by myc-gate); nothing ingested"
    fi
    desc=$(hs_git rev-parse "$c:$TASKS/$t/task.json") || stop "$t has no descriptor at $c"
    grep -qxF "$t $a $desc" "$BD/allowed" || stop "$t descriptor at $c is not the one allowlisted for this batch"
    last=$(hs_git ls-tree --name-only "$c" "$TASKS/$t/events/" | sort | tail -1)
    ev=$(hs_git show "$c:$last") || stop "$t: cannot read $last"
    run=$(jq -r 'select(.status == "completed" and .actor == "hubsync-gate" and .reason == "result_accepted") | .run_id' <<<"$ev")
    [[ $run =~ ^$t-r[0-9]{10}-[0-9a-f]{8}$ ]] || stop "$t: last event is not an accepted completion with an exact run id"
    h=$(jq -r .output_sha256 <<<"$ev"); [[ $h =~ ^[0-9a-f]{64}$ ]] || stop "$t: completion pins no sha256"
    rb=$(hs_git rev-parse "$c:$TASKS/$t/result.md") || stop "$t: no result at $c"
    hs_git cat-file -p "$rb" > "$o/result-$i.md"; [[ $(sha "$o/result-$i.md") == "$h" ]] || stop "$t: result bytes do not match the completion event"
    items=$(jq -c --arg t "$t" --arg a "$a" --arg r "$run" --arg d "$desc" --arg b "$rb" --arg h "$h" \
      '. + [{task:$t, agent:$a, run:$r, descriptor_blob:$d, result_blob:$b, result_sha256:$h}]' <<<"$items")
    i=$((i + 1))
  done < <(jq -r '.tasks[] | "\(.task) \(.agent)"' "$BD/manifest.json")
  jq -n --arg b "$BATCH" --arg c "$c" --arg m "$(sha "$BD/manifest.json")" --arg s "$(cat "$BD/snapshot.sha256")" --argjson it "$items" \
    '{batch:$b, commit:$c, manifest_sha256:$m, snapshot_sha256:$s, items:$it}' > "$o/batch.json"
}
db_files() {  # <collect dir>: copy the pinned inputs for one node step into a fresh work dir; sets ARGS
  local o=$1 w; w=$(workdir); put "$BD/manifest.json" "$w/manifest.json"; put "$BD/batch.json" "$w/batch.json"
  put "$SNAPS/$(cat "$BD/snapshot.sha256").md" "$w/snapshot.md"
  ARGS=("$w/manifest.json" "$w/batch.json" "$w/snapshot.md"); local f
  for f in "$o"/result-*.md; do put "$f" "$w/$(basename "$f")"; ARGS+=("$w/$(basename "$f")"); done
  WORK=$w
}
do_ingest() {
  local c
  if [[ -f $BD/batch.json ]]; then   # recovery: rebuild at the SAME commit and require byte-identical inputs
    c=$(jq -r .commit "$BD/batch.json"); collect "$c" "$BD/collect"
    cmp -s "$BD/collect/batch.json" "$BD/batch.json" || stop "rebuilt batch differs from the pinned one; nothing ingested"
  else
    "${AS_HS[@]}" "$GATE" state "$(jq -r '.tasks[0].task' "$BD/manifest.json")" >/dev/null 2>&1 || true   # fresh fetch
    c=$(hs_git rev-parse "$BRANCH"); collect "$c" "$BD/collect"; install -m 0600 "$BD/collect/batch.json" "$BD/batch.json"
  fi
  bmark INGEST_PENDING "batch=$(sha "$BD/batch.json") commit=$c"
  db_files "$BD/collect"
  step ingest 1 ingest "${ARGS[@]}" || { rm -rf "$WORK"; stop "ingest stopped: $(head -c 400 "$OUT"). Memory may or may not hold part of this batch. Nothing retried. Reconcile ONLY with: sudo bash $0 ingest $BATCH (exact same batch; no model call)"; }
  bmark INGESTED
  step verify 0 verify "${ARGS[@]}" || { rm -rf "$WORK"; stop "fresh-process verification failed: $(head -c 400 "$OUT"). Inspect; reconcile with: sudo bash $0 ingest $BATCH"; }
  rm -rf "$WORK"; bmark VERIFIED "$(grep -o 'ids .*' "$OUT" || true)"
}
# Recovery from an interrupted `run` (CALLS_STARTED, or a previous HELD check), e.g. power loss or SIGKILL after the last
# completion but before CALLS_DONE: database-only, never a model call. Closes any leftover allowance FIRST, then accepts
# the batch only if every turn is completed on GitHub under the recorded descriptors, in order; otherwise it is HELD.
reconcile_calls() {
  [[ -f $BD/allowed ]] || stop "no recorded allowance for $BATCH; inspect by hand"
  if exists "$ALLOWD/$BATCH.allowed"; then
    cmp -s "$ALLOWD/$BATCH.allowed" "$BD/allowed" || stop "$ALLOWD/$BATCH.allowed is not the allowance this batch recorded; left alone, inspect"
    mv -f "$ALLOWD/$BATCH.allowed" "$BD/allowed.archived"; say "leftover allowlist closed and archived (no further claim is possible for $BATCH)"
  fi
  [[ $(cut -d' ' -f1,2 "$BD/allowed") == "$(jq -r '.tasks[] | "\(.task) \(.agent)"' "$BD/manifest.json")" ]] || stop "recorded allowance does not match the manifest turns"
  local t s held=""
  while read -r t; do
    s=$("${AS_HS[@]}" "$GATE" state "$t" 2>/dev/null | head -1) || stop "could not read the state of $t"
    [[ $s == "$t completed "* ]] || held+=" ${s:-$t unknown}"
  done < <(jq -r '.tasks[].task' "$BD/manifest.json")
  if [[ -n $held ]]; then bmark HELD "not all turns completed:$held"; stop "batch $BATCH is HELD:$held. No model call is made and nothing is ingested; Chris decides"; fi
  bmark CALLS_DONE "reconciled: every turn completed on GitHub; allowance closed; no model call"
}
usage_receipt() {  # call count and timings from the completion events (GitHub, gate-written)
  local c t; c=$(jq -r .commit "$BD/batch.json")
  while read -r t; do hs_git show "$c:$(hs_git ls-tree --name-only "$c" "$TASKS/$t/events/" | sort | tail -1)" \
    | jq -c --arg t "$t" '{task:$t, run:.run_id, usage:.usage}'; done < <(jq -r '.tasks[].task' "$BD/manifest.json") > "$BD/usage.jsonl"
  say "usage (from the gate's completion events): $(jq -sc . "$BD/usage.jsonl")"
}

MODE=${1:-}
[[ $MODE =~ ^(precheck|setup|whoami|prepare|run|ingest|verify|credential|upgrade-package|close|teardown)$ ]] || { echo "usage: sudo bash mycelium-bridge.sh precheck|setup <commit>|whoami|prepare <batch> <commit>|run <batch> <commit>|ingest <batch>|verify <batch>|credential|upgrade-package <commit>|close|teardown"; exit 2; }
if [[ $TEST != 1 ]]; then [[ $EUID -eq 0 ]] || stop "run with sudo"; [[ $(hostname) == fpd-prod ]] || stop "fpd-prod only"; fi
recognise || true
say "$MODE started $(date -u +%FT%TZ)"

case $MODE in
precheck)
  node_ok && say "node $(node --version) (>= $NODE_MIN)" || stop "node >= $NODE_MIN is not installed"
  [[ -f $GATE && $(sha "$GATE") == "$GATE_V3" ]] && say "myc-gate is v3 (memref)" || say "NOTE: myc-gate is not v3 yet ($(sha "$GATE" 2>/dev/null | cut -c1-12)); install it with upgrade-gate.sh before 'run'"
  if [[ $OURS == 1 ]]; then say "already installed by this script: $(grep -c . "$RECEIPT") receipt lines"; else
    user_exists && stop "user $U already exists; it will not be used or changed"
    group_exists && stop "group $U already exists; it will not be used or changed"
    for p in "$RC" "$PKG" "$ETC" "$STORE" "$VER"; do exists "$p" && stop "$p already exists; refusing to adopt or change it"; done
    say "user/group $U and $RC, $PKG, $ETC, $STORE, $VER are all absent"; fi
  [[ -d $REPO/.git ]] || stop "no HubSync clone at $REPO"
  if [[ $TEST != 1 ]]; then c=$(curl -sS -o /dev/null -m 15 -w '%{http_code}' "https://$HOST/" || true); say "HTTPS to $HOST: ${c:-unreachable}"
    [[ $c =~ ^[0-9]{3}$ && $c != 000 ]] || stop "Neon endpoint unreachable over HTTPS"; fi
  say "PRECHECK OK: nothing changed" ;;

setup)
  C=${2:-}; node_ok || stop "node >= $NODE_MIN missing"; [[ $OURS == 0 ]] || stop "already installed by this script; setup is one-time"
  user_exists && stop "user $U already exists"; group_exists && stop "group $U already exists"
  for p in "$RC" "$PKG" "$ETC" "$STORE" "$VER"; do exists "$p" && stop "$p already exists; refusing to adopt or change it"; done
  pinned "$C"
  mkdir -m 0700 "$RC" || stop "could not create $RC exclusively"
  excl "$RECEIPT" || stop "receipt creation failed"; printf '%s\ncommit %s\n' "$HEADER" "$C" >> "$RECEIPT"; OURS=1
  if [[ $TEST == 1 ]]; then excl "$T_ROOT/users/$U" && excl "$T_ROOT/groups/$U" || stop "useradd failed"
  else useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin --user-group "$U" || stop "useradd failed (nothing else created; run teardown)"; fi
  record user "$U"; say "created system user and group $U (no home, no shell, no other group)"
  mkdir -m 0755 "$PKG" || stop "could not create $PKG exclusively (run teardown)"; record dir "$PKG"
  hs_git archive "$C" "$SUB" | tar -x -C "$PKG" --strip-components=3 --no-same-owner
  [[ -f $PKG/scripts/bridge.mjs && -f $PKG/package-lock.json ]] || stop "package extraction incomplete (run teardown)"
  (cd "$PKG" && npm ci --ignore-scripts --omit=dev --no-audit --no-fund --cache "$RC/npm-cache" >/dev/null) || stop "npm ci failed (run teardown)"
  rm -rf "$RC/npm-cache"; [[ $TEST == 1 ]] || chown -R root:root "$PKG"; chmod -R go-w,o+rX "$PKG"
  say "package $SUB@${C:0:12} installed read-only at $PKG (root-owned)"
  mkdir -m 0755 "$STORE" || stop "could not create $STORE exclusively (run teardown)"; record dir "$STORE"
  mkdir -m 0750 "$SNAPS" && own root:hubsync "$SNAPS" && mkdir -m 0700 "$BATCHES" && mkdir -m 0711 "$STORE/work" || stop "store layout failed (run teardown)"
  say "snapshot store $SNAPS (root:hubsync 0750, read by myc-gate only), batch receipts $BATCHES (root 0700)"
  mkdir -m 0750 "$ETC" || stop "could not create $ETC exclusively (run teardown)"; record dir "$ETC"; own "root:$U" "$ETC"
  record file "$ENV"; write_credential
  say "credential at $ENV (root:$U 0640; password not shown); one-time PC copy at $VER (ct_admin 0600)"
  say "SETUP OK. Next on the PC: -Mode before (BEFORE copying), then scp $VER to the PC, then -Mode create (it removes its copy); then 'whoami' here (it shreds this copy)" ;;

whoami)
  need_install
  if recorded file "$VER" && [[ -f $VER && ! -L $VER ]]; then shred -u "$VER"; record closed "$VER"; say "shredded the one-time PC copy of the password on fpd-prod"; fi
  boundary; OUT=$RC/out
  step whoami 0 whoami || stop "privilege check failed: $(head -c 600 "$OUT")"
  say "WHOAMI OK" ;;

prepare)
  need_install; BATCH=${2:-}; C=${3:-}; [[ $BATCH =~ ^[a-z0-9][a-z0-9-]{2,63}$ ]] || stop "bad batch name"; pinned "$C"; lock; boundary
  BD=$BATCHES/$BATCH; OUT=$BD/out
  mkdir -m 0700 "$BD" 2>/dev/null || stop "batch $BATCH was already prepared once; a batch is never re-prepared (no new snapshot for an old batch)"
  hs_git show "$C:$RUNS/$BATCH.json" > "$BD/manifest.json" 2>/dev/null || stop "no manifest $RUNS/$BATCH.json at $C"
  printf '%s PREPARING manifest=%s commit=%s\n' "$(date -u +%FT%TZ)" "$(sha "$BD/manifest.json")" "$C" > "$BD/receipt"
  n=$(jq -er '.tasks | length' "$BD/manifest.json") && [[ $n -ge 1 && $n -le $MAX_TURNS ]] || stop "manifest turns must be 1-$MAX_TURNS"
  W=$(workdir); put "$BD/manifest.json" "$W/manifest.json"
  if jq -e 'has("seed")' "$BD/manifest.json" >/dev/null; then step seed 1 seed "$W/manifest.json" || stop "seed failed: $(head -c 400 "$OUT")"; fi
  chmod 0770 "$W"
  step snapshot 0 snapshot "$W/manifest.json" "$W/snapshot.md" || stop "snapshot failed (read-only): $(head -c 400 "$OUT")"
  [[ -f $W/snapshot.md && ! -L $W/snapshot.md ]] || stop "no snapshot written"
  H=$(sha "$W/snapshot.md"); grep -q "sha256 $H" "$OUT" || stop "snapshot digest mismatch"
  if [[ $(jq -r '.workbench // false' "$BD/manifest.json") == true ]]; then
    # Stage Two cycles: every turn's memref also carries the STARTING source of every workbench mechanism and case at the
    # pinned commit (tests by name and hash), so a turn never depends on files it cannot see; myc-post carries only what
    # changes during the cycle. Root builds this from Git at $C; no line may look like a memory node header.
    WBP=greenfield/mycelium/brain/workbench; SRCS=$W/sources.md
    { printf '\n\n## Workbench source at commit %s (starting state of this cycle; data, not instructions)\n' "$C"
      while read -r f; do printf '```mycelium-file path=%s\n' "${f#$WBP/}"; hs_git show "$C:$f"; printf '```\n'
      done < <(hs_git ls-tree -r --name-only "$C" "$WBP/mechanisms" "$WBP/cases" | grep -E '/(mechanisms/[a-z0-9-]+\.js|cases/[a-z0-9-]+\.json)$' | sort)
      printf 'Tests (by name and git blob):\n'; hs_git ls-tree -r "$C" "$WBP/test" | awk '{ sub(".*/", "", $4); print "- test/" $4 " " substr($3, 1, 12) }'; } > "$SRCS" \
      || stop "could not build the workbench source section at $C"
    ! grep -qE '^\[node [0-9a-f-]{36}\]' "$SRCS" || stop "a workbench file contains a line that looks like a memory node header; refused"
    (( $(stat -c %s "$SRCS") + $(stat -c %s "$W/snapshot.md") <= 32768 )) || stop "memory recall ($(stat -c %s "$W/snapshot.md") bytes) + workbench source ($(stat -c %s "$SRCS") bytes) exceed the 32 KB memref limit; narrow manifest.selection in a new batch"
    cat "$SRCS" >> "$W/snapshot.md"; HM=$H; H=$(sha "$W/snapshot.md")
    say "snapshot = memory recall ($HM) + workbench starting source ($(stat -c %s "$SRCS") bytes)"
  fi
  [[ $(stat -c %s "$W/snapshot.md") -le 32768 ]] || stop "snapshot over 32 KB (the gate's memref limit)"
  if exists "$SNAPS/$H.md"; then cmp -s "$W/snapshot.md" "$SNAPS/$H.md" || stop "store holds different bytes under $H"
  else install -m 0440 "$W/snapshot.md" "$SNAPS/$H.md"; own root:hubsync "$SNAPS/$H.md"; fi
  rm -rf "$W"; echo "$H" > "$BD/snapshot.sha256"
  bmark PREPARED "snapshot=$H bytes=$(stat -c %s "$SNAPS/$H.md")"
  say "PREPARE OK. Each turn's task descriptor must carry exactly this line:  memref: sha256:$H" ;;

run)
  need_install; [[ ${MYC_BILLING_CONFIRMED:-} == yes ]] || stop "first confirm Claude usage credits are OFF and no Codex credits/API key are in use, then run with MYC_BILLING_CONFIRMED=yes"
  batch_dir "${2:-}"; C=${3:-}; pinned "$C"; lock; boundary
  [[ $(bstate) == PREPARED ]] || stop "batch $BATCH is $(bstate), not PREPARED: a batch runs its turns at most once. For memory recovery use: ingest $BATCH"
  [[ $(sha "$GATE") == "$GATE_V3" ]] || stop "installed myc-gate is not the reviewed v3 (memref); run upgrade-gate.sh first"
  hs_git show "$C:$RUNS/$BATCH.json" | cmp -s - "$BD/manifest.json" || stop "the manifest at $C differs from the prepared one"
  H=$(cat "$BD/snapshot.sha256"); exists "$ALLOWD/$BATCH.allowed" && stop "an allowlist for $BATCH already exists; inspect it"
  : > "$BD/allowed"
  while read -r t a; do
    tj=$(hs_git show "$C:$TASKS/$t/task.json") || stop "$t has no descriptor at $C"
    [[ $(jq -r .assigned_agent <<<"$tj") == "$a" ]] || stop "$t is not assigned to $a"
    [[ $(jq -r .instructions <<<"$tj" | grep -c '^memref: ') == 1 ]] && jq -r .instructions <<<"$tj" | grep -qx "memref: sha256:$H" \
      || stop "$t does not carry exactly one 'memref: sha256:$H' line"
    [[ $(hs_git ls-tree --name-only "$C" "$TASKS/$t/events/" | wc -l) == 1 ]] || stop "$t already has events beyond creation at $C"
    echo "$t $a $(hs_git rev-parse "$C:$TASKS/$t/task.json")" >> "$BD/allowed"
  done < <(jq -r '.tasks[] | "\(.task) \(.agent)"' "$BD/manifest.json")
  n=$(grep -c . "$BD/allowed")
  WIN=$(jq -r '.window_s // 1800' "$BD/manifest.json"); [[ $WIN =~ ^[0-9]+$ && $WIN -ge 600 && $WIN -le 3600 ]] || stop "manifest window_s must be 600-3600"; WINDOW_S=$WIN
  POSTENV=()
  if [[ $(jq -r '.workbench // false' "$BD/manifest.json") == true ]]; then
    [[ -n $POSTBIN && -x $POSTBIN ]] || stop "this batch needs the workbench hook, but $POSTBIN is not installed (install-cycle.sh)"
    [[ $(sha "$POSTBIN") == "$POST_V1" && $(sha "$STAGEB") == "$SB_V52" ]] || stop "installed myc-post / myc-stageb are not the reviewed cycle versions (install-cycle.sh)"
    WB=$WBR/$BATCH; exists "$WB" && stop "$WB already exists; a batch's workbench is created once"
    install -d -m 0755 "$WB" "$WB/tree" && hs_git archive "$C" greenfield/mycelium/brain/workbench | tar -x -C "$WB/tree" --strip-components=4 --no-same-owner
    [[ -f $WB/tree/evaluate.mjs && -f $WB/tree/post/apply.mjs ]] || stop "the workbench is missing at $C"
    [[ $TEST == 1 ]] || chown -R root:root "$WB"
    POSTENV=(MYC_POST="$POSTBIN" MYC_POST_BATCH="$BATCH" MYC_WB_ROOT="$WBR")
    say "workbench pinned at $C into $WB/tree (scored after every turn by $POSTBIN)"
  fi
  bmark CALLS_STARTED "turns=$n window=${WINDOW_S}s commit=$C"   # durable BEFORE the allowance exists: any crash from here on is reconciled by `ingest`
  install -m 0640 "$BD/allowed" "$ALLOWD/$BATCH.allowed"; own root:hubsync "$ALLOWD/$BATCH.allowed"
  trap 'mv -f "$ALLOWD/$BATCH.allowed" "$BD/allowed.archived" 2>/dev/null && say "allowlist closed and archived (no further claim is possible for $BATCH)"' EXIT
  AH=("${AS_HS[@]}" MYC_ALLOW="$ALLOWD/$BATCH.allowed" MYC_MAX_CALLS="$n")
  while read -r t; do
    s=$("${AH[@]}" "$GATE" state "$t" | head -1) || stop "could not read the state of $t"
    [[ $s == "$t pending "* ]] || stop "$t is not pending ($s); Chris decides"
    say "turn $t: one myc-stageb run"
    env "${POSTENV[@]}" MYC_ALLOW="$ALLOWD/$BATCH.allowed" MYC_AS_HUBSYNC="${AH[*]}" MYC_WINDOW_S=$WINDOW_S "$STAGEB" "$t" || stop "myc-stageb stopped on $t; no further turn"
    s=$("${AH[@]}" "$GATE" state "$t" | head -1); [[ $s == "$t completed "* ]] || stop "$t ended as: $s; no further turn"
    if [[ ${#POSTENV[@]} -gt 0 && -f $WB/progress.jsonl && $(tail -1 "$WB/progress.jsonl" | jq -r '.stall') == true ]]; then
      bmark STALLED "after $t: two turns in a row without progress; remaining turns are not run"; break
    fi
  done < <(jq -r '.tasks[].task' "$BD/manifest.json")
  mv -f "$ALLOWD/$BATCH.allowed" "$BD/allowed.archived"; trap - EXIT; say "allowlist closed and archived"
  bmark CALLS_DONE
  do_ingest; usage_receipt
  say "RUN OK: $n turn(s) completed, ingested and verified in a fresh process. Receipt: $BD/receipt" ;;

ingest)
  need_install; batch_dir "${2:-}"; lock; boundary
  case $(bstate) in CALLS_STARTED|HELD) reconcile_calls ;; CALLS_DONE|INGEST_PENDING|INGESTED) ;; VERIFIED) say "already VERIFIED; re-verifying only"; ;; *) stop "batch $BATCH is $(bstate); ingest needs completed turns" ;; esac
  if [[ $(bstate) == VERIFIED ]]; then c=$(jq -r .commit "$BD/batch.json"); collect "$c" "$BD/collect"; cmp -s "$BD/collect/batch.json" "$BD/batch.json" || stop "rebuilt batch differs"
    db_files "$BD/collect"; step verify 0 verify "${ARGS[@]}" || stop "verification failed: $(head -c 400 "$OUT")"; rm -rf "$WORK"
  else do_ingest; usage_receipt; fi
  say "INGEST OK: $BATCH verified" ;;

verify)
  need_install; batch_dir "${2:-}"; lock; boundary; [[ -f $BD/batch.json ]] || stop "batch $BATCH has no pinned batch yet"
  V=$(mktemp -d "$BD/verify.XXXXXX"); OUT=$V/out
  c=$(jq -r .commit "$BD/batch.json"); collect "$c" "$V/collect"; cmp -s "$V/collect/batch.json" "$BD/batch.json" || { rm -rf "$V"; stop "rebuilt batch differs"; }
  db_files "$V/collect"; step verify 0 verify "${ARGS[@]}" || { rm -rf "$WORK"; m=$(head -c 400 "$OUT"); rm -rf "$V"; stop "verification failed: $m"; }; rm -rf "$WORK" "$V"
  say "VERIFY OK: $BATCH" ;;

upgrade-package)
  need_install; C=${2:-}; pinned "$C"; lock
  OLD=$(grep '^commit ' "$RECEIPT" | tail -1 | cut -d' ' -f2); [[ $C != "$OLD" ]] || stop "the package is already at $C"
  NEW=$RC/pkg-$C; rm -rf "$NEW"; mkdir -m 0755 "$NEW"
  hs_git archive "$C" "$SUB" | tar -x -C "$NEW" --strip-components=3 --no-same-owner
  [[ -f $NEW/scripts/bridge.mjs && -f $NEW/package-lock.json ]] || { rm -rf "$NEW"; stop "package extraction incomplete; nothing changed"; }
  if [[ -d $PKG/node_modules ]] && cmp -s "$NEW/package-lock.json" "$PKG/package-lock.json"; then
    cp -a "$PKG/node_modules" "$NEW/node_modules"; say "dependencies unchanged (identical package-lock.json): reused the installed node_modules; no download"
  else (cd "$NEW" && npm ci --ignore-scripts --omit=dev --no-audit --no-fund --cache "$RC/npm-cache" >/dev/null) || { rm -rf "$NEW" "$RC/npm-cache"; stop "npm ci failed; nothing changed"; }; fi
  rm -rf "$RC/npm-cache"; [[ $TEST == 1 ]] || chown -R root:root "$NEW"; chmod -R go-w,o+rX "$NEW"
  rm -rf "$RC/pkg-$OLD"; mv "$PKG" "$RC/pkg-$OLD"; mv "$NEW" "$PKG"
  printf 'commit %s\n' "$C" >> "$RECEIPT"
  say "UPGRADE OK: package $SUB at ${C:0:12} (previous ${OLD:0:12} kept at $RC/pkg-$OLD; roll back with: upgrade-package $OLD)" ;;

credential)
  need_install; write_credential
  say "new password written to $ENV and one PC copy at $VER. On the PC: -Mode before, then scp, then -Mode rotate. The OLD password stays valid until that step; the NEW one works only after it" ;;

close)
  recognise || { echo "bridge: CLOSE: no recognised receipt, so nothing here was created by this script; nothing changed"; exit 0; }
  for f in "$ENV" "$VER"; do
    recorded file "$f" || continue
    if [[ -L $f ]]; then stop "$f is a symlink: left alone"; elif [[ -f $f ]]; then shred -u "$f"; record closed "$f"; say "shredded $f"; fi
  done
  for f in "$RC"/pw.* "$ETC"/.bridge.env.*; do [[ -f $f && ! -L $f ]] && shred -u "$f"; done
  say "CLOSE OK on fpd-prod: no bridge credential remains here. The PC close step disables the login" ;;

teardown)
  recognise || { echo "bridge: TEARDOWN: no recognised receipt; nothing changed"; exit 0; }
  for f in "$ENV" "$VER"; do recorded file "$f" && exists "$f" && stop "$f still exists; run close first"; done
  if recorded dir "$PKG" && [[ -d $PKG && ! -L $PKG ]]; then rm -rf --one-file-system "$PKG"; say "removed $PKG"; fi
  if recorded dir "$ETC" && [[ -d $ETC && ! -L $ETC ]]; then
    if [[ -z $(ls -A "$ETC") ]]; then rmdir "$ETC"; say "removed empty $ETC"; else say "$ETC holds files this script did not create; left in place"; fi
  fi
  if recorded dir "$STORE" && [[ -d $STORE && ! -L $STORE ]]; then
    if [[ -z $(ls -A "$SNAPS" 2>/dev/null) && -z $(ls -A "$BATCHES" 2>/dev/null) && -z $(ls -A "$STORE/work" 2>/dev/null) ]]; then
      rm -rf --one-file-system "$STORE"; say "removed $STORE (it held no snapshot or batch)"
    else say "kept $STORE: snapshots and batch receipts are evidence (retention: until Chris decides)"; fi
  fi
  if recorded user "$U" && user_exists; then
    if [[ $TEST == 1 ]]; then rm -f "$T_ROOT/users/$U" "$T_ROOT/groups/$U"; else userdel "$U"; fi; say "removed user and group $U"
  fi
  a=$ARCH/mycelium-bridge-receipt-$(date -u +%Y%m%dT%H%M%SZ).txt; cat "$RECEIPT" "$LOG" > "$a" 2>/dev/null || true; chmod 600 "$a"
  rm -rf --one-file-system "$RC"
  echo "bridge: TEARDOWN OK; receipt and log archived at $a" ;;
esac
