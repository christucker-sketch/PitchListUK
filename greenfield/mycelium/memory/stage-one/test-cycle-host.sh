#!/usr/bin/env bash
# Offline rehearsal of a Stage Two COLLABORATION CYCLE on a fake fpd-prod: mycelium-bridge.sh run of a "workbench": true
# manifest through the REAL runner (myc-gate v3, myc-stageb v5.2 with the MYC_POST hook, myc-agent v6) and the REAL
# myc-post + workbench, with FAKE claude/codex CLIs that write artifacts, then the real bridge ingest into PGlite as the
# restricted role. Scenario A: artifacts, then two non-progress turns -> STALL stops the cycle after 4 of 6 turns and the
# completed prefix is ingested. Scenario B: six progressing turns run to the end. No network, Neon, model or root needed.
#   bash stage-one/test-cycle-host.sh
set -uo pipefail
for c in git jq flock iconv timeout awk node sha256sum shred; do command -v $c >/dev/null || { echo "cycle tests: need $c"; exit 1; }; done
D=$(cd "$(dirname "$0")" && pwd); MEM=$(cd "$D/.." && pwd); S=$D/mycelium-bridge.sh; SB=$(cd "$MEM/../stageb" && pwd); WBSRC=$(cd "$MEM/../brain/workbench" && pwd)
T=$(mktemp -d); trap 'chmod -R u+w "$T" 2>/dev/null; rm -rf "$T"' EXIT
pass=0; failn=0
ok()  { echo "  PASS $*"; pass=$((pass + 1)); }
bad() { echo "  FAIL $*"; failn=$((failn + 1)); }
B=findpitches-v3/greenfield TD=greenfield/mycelium/tasks RUNS=greenfield/mycelium/runs R=$T/root
export GIT_AUTHOR_NAME=chris GIT_AUTHOR_EMAIL=c@x GIT_COMMITTER_NAME=chris GIT_COMMITTER_EMAIL=c@x
git init -q --bare "$T/remote.git"; git clone -q "$T/remote.git" "$T/human" 2>/dev/null
(cd "$T/human" && git checkout -q -b "$B" && mkdir -p greenfield/mycelium/memory greenfield/mycelium/brain/workbench "$RUNS" \
  && tar -C "$MEM" --exclude=./node_modules --exclude=./.env.local -cf - . | tar -C greenfield/mycelium/memory -xf - \
  && tar -C "$WBSRC" -cf - . | tar -C greenfield/mycelium/brain/workbench -xf - \
  && rm -f greenfield/mycelium/brain/workbench/cases/*.json \
  && for n in small-a small-b; do jq -n --arg n "$n" '{name:$n, author:"baseline", description:"small rehearsal case", budget:120, anchorSignal:0.6,
       families:{hub:{n:10,yield:0,out:6,to:{x:0.7,y:0.3},words:["dir"],seeds:3}, x:{n:120,yield:0.4,out:3,to:{x:0.8,y:0.2},words:["traders"],schedule:"cycle:30"}, y:{n:120,yield:0.02,out:3,to:{y:0.8,x:0.2},words:["news"]}}}' \
       > greenfield/mycelium/brain/workbench/cases/$n.json; done \
  && git add -A && git commit -qm pkg && git push -q origin "$B") 2>/dev/null
mkdir -p "$T/hs" "$T/spool" "$T/myc" "$T/stub" "$T/bin" "$T/ctl" "$T/decisions"
git clone -q --branch "$B" "$T/remote.git" "$T/hs/repo" 2>/dev/null
push() { (cd "$T/human" && git add -A && git commit -qm "$1" && git pull -q --rebase origin "$B" && git push -q origin "$B") >/dev/null 2>&1 || { echo "push failed" >&2; exit 1; }
  git --git-dir="$T/remote.git" rev-parse "$B"; }
hsfetch() { git -C "$T/hs/repo" fetch -q origin "+refs/heads/$B:refs/remotes/origin/$B"; }
cycle_manifest() {  # batch prefix -> 6 alternating turns, Codex first
  jq -n --arg b "$1" --arg p "$2" '{batch:$b, purpose:"cycle rehearsal", window_s:3600, workbench:true,
    seed:{kind:"question", title:("FindPitches cycle rehearsal seed (" + $b + ")"), body:"Which mechanism should allocate attention?"},
    selection:{search:("FindPitches cycle rehearsal seed (" + $b + ")"), limit:20, maxDepth:2, maxResults:60},
    tasks:[range(1;7) | {task:($p + "-00" + tostring), agent:(if . % 2 == 1 then "codex" else "claude" end)}]}' > "$T/human/$RUNS/$1.json"; }
task() { (cd "$T/human" && mkdir -p "$TD/$1/events" && jq -n --arg t "$1" --arg a "$2" --arg i "$3" --arg rl "$TD/$1/result.md" \
     '{task_id:$t, assigned_agent:$a, instructions:$i, status:"pending", result_location:$rl}' > "$TD/$1/task.json" \
   && jq -n '{seq:1, status:"pending", at:"2026-10-31T10:00:00Z", actor:"chris", reason:"created by Chris"}' > "$TD/$1/events/0001.json"); }
IDS=$(cd "$MEM" && node test/pglite-init.mjs "$T/pgdata" cycle-a cycle-b) || { echo "pglite init failed"; exit 1; }
nodes() { (cd "$MEM" && node --input-type=module -e "import { PGlite } from '@electric-sql/pglite'; const pg = new PGlite('$T/pgdata');
  console.log((await pg.query('SELECT count(*)::int AS n FROM mycelium_memory.nodes')).rows[0].n); await pg.close();"); }
# --- fake CLIs: the answer depends on the scenario line for this turn (CTL/scenario: "<turn> <action>")
cat > "$T/stub/answer.mjs" <<'EOF'
import { readFileSync } from 'node:fs';
const [agent] = process.argv.slice(2), p = readFileSync(0, 'utf8');
const turn = Number((p.match(/task MYC-\d{8}-(\d{3})/) || [])[1]);
const act = (readFileSync(process.env.CTL + '/scenario', 'utf8').split('\n').find(l => l.startsWith(turn + ' ')) || '').split(' ')[1] || 'prose';
const seed = (p.match(/^\[node ([0-9a-f-]{36})\] kind="question"/m) || [])[1];
const prev = (p.match(/tasks\/(MYC-\d{8}-\d{3})\/result\.md/) || [])[1];
const mech = name => `// ${name}: breadth-first with random fallback\nfunction create(api) { const q = api.seeds.map(s => s.id), seen = new Set(q); let h = 0;\n  return { choose() { return h < q.length ? { fetch: q[h++] } : { fetch: q[Math.floor(Math.random() * q.length)] }; },\n    observe(o) { for (const l of o.links) if (!seen.has(l.to)) { seen.add(l.to); q.push(l.to); } } }; }\n`;
let out = `${agent} turn ${turn}: ${act}. Saw scoreboard: ${/\| verified \|/.test(p)}. Saw my files: ${p.includes('Files ' + agent + ' has changed during this cycle') && p.includes('mycelium-file path=mechanisms/' + agent + '-')}.\n\n`;
const [kind, name] = act.split(':');
if (kind === 'mech' || kind === 'same') out += '```mycelium-file path=mechanisms/' + agent + '-' + name + '.js\n' + mech(agent + '-' + name) + '```\n\n'
  + '```mycelium-prediction\n' + JSON.stringify({ mechanism: agent + '-' + name, case: 'small-a', metric: 'verified', op: '>', value: 1 }) + '\n```\n\n';
const links = [{ to: seed, relation: 'answers' }]; if (prev) links.push({ to: '@' + prev, relation: 'responds to' });
if (kind !== 'nocontrib') out += '```mycelium-contribution\n' + JSON.stringify({ kind: 'cycle-step', title: `${agent} turn ${turn}`, body: act, links, stances: [] }) + '\n```\n';
process.stdout.write(out);
EOF
cat > "$T/stub/claude" <<'EOF'
#!/usr/bin/env bash
[[ $1 == auth ]] && { echo '{"loggedIn":true,"authMethod":"claude.ai","apiProvider":"firstParty"}'; exit 0; }
[[ $1 == --version ]] && { echo "2.1.308 (Claude Code)"; exit 0; }
p=$(cat); n=$(grep -o 'task MYC-[0-9]*-[0-9]*' <<<"$p" | head -1 | cut -d- -f3); printf '%s' "$p" > "$CTL/prompt.$n"; echo claude >> "$CTL/calls"
a=$(node "$(dirname "$0")/answer.mjs" claude <<<"$p")
jq -n --arg r "$a" '{type:"result", is_error:false, result:$r, usage:{input_tokens:5, output_tokens:20, cache_read_input_tokens:0}, modelUsage:{"claude-sonnet-5-5":{}}, total_cost_usd:0.01}'
EOF
cat > "$T/stub/codex" <<'EOF'
#!/usr/bin/env bash
[[ $1 == login ]] && { echo "Logged in using ChatGPT"; exit 0; }
[[ $1 == --version ]] && { echo "codex-cli 0.164.0"; exit 0; }
p=$(cat); n=$(grep -o 'task MYC-[0-9]*-[0-9]*' <<<"$p" | head -1 | cut -d- -f3); printf '%s' "$p" > "$CTL/prompt.$n"; echo codex >> "$CTL/calls"
out=""; prev=""; for a in "$@"; do [[ $prev == -o ]] && out=$a; prev=$a; done
node "$(dirname "$0")/answer.mjs" codex <<<"$p" > "$out"
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
export BRIDGE_TEST=1 T_ROOT=$R T_REPO=$T/hs/repo T_BRANCH=origin/$B T_GATE=$SB/myc-gate T_STAGEB=$SB/myc-stageb T_HSHOME=$T/hs T_POSTBIN=$SB/myc-post \
  T_BRIDGE="node $MEM/test/pglite-bridge.mjs" T_PGDATA=$T/pgdata PATH="$T/stub:$T/bin:$PATH" CTL=$T/ctl \
  MYC_TEST=1 MYC_HOME=$T/hs MYC_SPOOL=$T/spool MYC_STATE=$T/state/state.json MYC_AS_MYC="env HOME=$T/myc" MYC_GATE=$SB/myc-gate \
  MYC_AGENT=$SB/myc-agent MYC_GUARD=$T/bin/myc-run MYC_DECISIONS=$T/decisions MYC_MEMSNAP=$R/var/lib/mycelium-memory/snapshots MYC_BILLING_CONFIRMED=yes
run() { bash "$S" "$@" > "$T/out" 2>&1; }
calls() { [[ -f $T/ctl/calls ]] && wc -l < "$T/ctl/calls" | tr -d ' ' || echo 0; }
ST=$R/var/lib/mycelium-memory WB=$R/var/lib/mycelium-workbench
res() { git --git-dir="$T/remote.git" show "$B:$TD/$1/result.md" 2>/dev/null; }
prepare_cycle() {  # batch prefix -> commit with manifest + 6 digest-pinned descriptors (each turn refs the previous result)
  cycle_manifest "$1" "$2"; local c h; c=$(push "manifest $1"); hsfetch; run prepare "$1" "$c" || { echo "prepare $1 failed" >&2; cat "$T/out" >&2; }
  h=$(cat "$ST/batches/$1/snapshot.sha256")
  for i in 1 2 3 4 5 6; do a=codex; (( i % 2 == 0 )) && a=claude
    ref=""; (( i > 1 )) && ref=$'\nref: '"$TD/$2-00$((i - 1))/result.md"
    task "$2-00$i" "$a" "Cycle turn $i. Advance the workbench."$'\n\nmemref: sha256:'"$h$ref"; done
  push "tasks $1"; }

run precheck >/dev/null; run setup "$(git --git-dir="$T/remote.git" rev-parse "$B")" || { echo "setup failed"; cat "$T/out"; exit 1; }
run whoami || { echo "whoami failed"; cat "$T/out"; exit 1; }

echo "0. upgrade-package replaces the installed bridge package, keeping the login, credential and store"
C1=$(git --git-dir="$T/remote.git" rev-parse "$B"); envsha=$(sha256sum "$R/etc/mycelium/bridge.env" | cut -c1-64)
echo "// upgraded" >> "$T/human/greenfield/mycelium/memory/scripts/check.mjs"; C2=$(push "package change"); hsfetch
run upgrade-package "$C2" && grep -q '// upgraded' "$R/opt/mycelium-memory/scripts/check.mjs" && [[ $(sha256sum "$R/etc/mycelium/bridge.env" | cut -c1-64) == "$envsha" ]] \
  && grep -q "^commit $C2$" "$R/var/lib/mycelium-bridge/created" && ok "upgraded to the new commit; credential untouched" || { bad "upgrade"; cat "$T/out"; }
grep -q 'reused the installed node_modules; no download' "$T/out" && ok "unchanged lockfile: dependencies reused, no npm download" || { bad "deps reuse"; cat "$T/out"; }
run whoami && ok "the upgraded package still passes whoami" || { bad "whoami after upgrade"; cat "$T/out"; }
run upgrade-package "$C2"; [[ $? != 0 ]] && grep -q 'already at' "$T/out" && ok "upgrading to the same commit is refused" || bad "same commit"
run upgrade-package "$C1" && ! grep -q '// upgraded' "$R/opt/mycelium-memory/scripts/check.mjs" && ok "rollback by upgrading to the previous commit" || { bad "rollback"; cat "$T/out"; }
run upgrade-package "$C2" >/dev/null

echo "A. a cycle that stalls: artifacts, then two turns without progress -> stops after 4 of 6, ingests the completed prefix"
printf '1 mech:c1\n2 mech:h1b\n3 same:c1\n4 prose\n5 mech:late\n6 mech:later\n' > "$T/ctl/scenario"
CA=$(prepare_cycle cycle-a MYC-20261101 | tail -1); hsfetch
n0=$(nodes); c0=$(calls); run run cycle-a "$CA"; rc=$?
[[ $rc == 0 && $(calls) == $((c0 + 4)) ]] && grep -q 'STALLED after MYC-20261101-004' "$ST/batches/cycle-a/receipt" && ok "4 calls, then STALLED: turns 5 and 6 were never run" || { bad "stall stop"; tail -30 "$T/out"; }
grep -q 'workbench pinned at' "$T/out" && [[ -f $WB/cycle-a/tree/mechanisms/codex-c1.js && -f $WB/cycle-a/tree/mechanisms/claude-h1b.js ]] && ok "artifacts from turns 1-2 entered the batch's pinned workbench" || bad "tree"
res MYC-20261101-001 | grep -q '## Workbench result (machine-written' && res MYC-20261101-001 | grep -q 'codex-c1 | ' && res MYC-20261101-001 | grep -qE 'verified > 1 -> (HELD|FAILED)' \
  && ok "turn 1's GitHub result carries its scored artifact and prediction verdict" || { bad "result 1"; res MYC-20261101-001 | tail -20; }
grep -q 'Saw scoreboard: true' "$T/ctl/prompt.002" 2>/dev/null || res MYC-20261101-002 | grep -q 'Saw scoreboard: true' && ok "turn 2 (Claude) received turn 1's real scoreboard automatically" || bad "handoff scoreboard"
grep -q '^## Workbench source at commit' "$T/ctl/prompt.001" && grep -q 'mycelium-file path=mechanisms/baseline-fixed.js' "$T/ctl/prompt.001" && grep -q '^## Workbench source at commit' "$T/ctl/prompt.004" \
  && ok "every turn's sealed snapshot carries the starting source of the workbench mechanisms and cases" || bad "snapshot sources"
res MYC-20261101-003 | grep -q 'Saw my files: true' && ok "turn 3 (Codex) received its OWN earlier files via turn 2's result (cumulative code state)" || { bad "carry files"; res MYC-20261101-003 | head -3; }
tail -2 "$WB/cycle-a/progress.jsonl" | jq -se '.[0].progress == false and .[1].progress == false and .[1].stall == true' >/dev/null && ok "progress records: repeat = no progress, prose = no progress, STALL" || { bad "progress"; cat "$WB/cycle-a/progress.jsonl"; }
[[ $(tail -1 "$ST/batches/cycle-a/receipt" | cut -d' ' -f2) == VERIFIED && $(nodes) == $((n0 + 4)) && ! -e $R/etc/myc-stageb/cycle-a.allowed ]] \
  && ok "the completed prefix (4 contributions) ingested and VERIFIED; allowlist archived" || { bad "prefix ingest"; tail -15 "$T/out"; }
git --git-dir="$T/remote.git" show "$B:$TD/MYC-20261101-005/events/0001.json" >/dev/null 2>&1 && ! git --git-dir="$T/remote.git" show "$B:$TD/MYC-20261101-005/events/0002.json" >/dev/null 2>&1 && ok "unrun turns stay unclaimed on GitHub" || bad "unrun turns"

echo "C. an installed hook that is not the reviewed version is refused before any allowance or call"
printf '1 mech:x\n' > "$T/ctl/scenario"
CC=$(prepare_cycle cycle-c MYC-20261103 | tail -1); hsfetch
c0=$(calls); T_POST_V1=$(printf '0%.0s' {1..64}) run run cycle-c "$CC"; rc=$?
[[ $rc != 0 && $(calls) == "$c0" ]] && grep -q 'not the reviewed cycle versions' "$T/out" && [[ $(tail -1 "$ST/batches/cycle-c/receipt" | cut -d' ' -f2) == PREPARED && ! -e $R/etc/myc-stageb/cycle-c.allowed ]] \
  && ok "wrong myc-post hash: refused, no call, no allowlist, batch still PREPARED" || { bad "hook pin"; tail -5 "$T/out"; }

echo "B. a cycle that keeps progressing runs all six turns"
printf '1 mech:a\n2 mech:b\n3 mech:c\n4 mech:d\n5 mech:e\n6 mech:f\n' > "$T/ctl/scenario"
CB=$(prepare_cycle cycle-b MYC-20261102 | tail -1); hsfetch
n0=$(nodes); c0=$(calls); run run cycle-b "$CB"; rc=$?
[[ $rc == 0 && $(calls) == $((c0 + 6)) ]] && ! grep -q STALLED "$ST/batches/cycle-b/receipt" && [[ $(tail -1 "$ST/batches/cycle-b/receipt" | cut -d' ' -f2) == VERIFIED && $(nodes) == $((n0 + 6)) ]] \
  && ok "6 calls, 6 artifacts, 6 contributions ingested and VERIFIED" || { bad "full cycle"; tail -20 "$T/out"; }
[[ $(ls "$WB/cycle-b/tree/mechanisms" | grep -cE '^(codex|claude)-[a-f]\.js$') == 6 ]] && [[ $(jq -s 'map(select(.progress)) | length' "$WB/cycle-b/progress.jsonl") == 6 ]] && ok "six distinct mechanisms in the tree; six progress records" || bad "six artifacts"
for i in 1 2 3 4 5 6; do [[ $(res "MYC-20261102-00$i" | wc -c) -le 16384 ]] || bad "result $i over 16 KB"; done; ok "every published result within the gate's 16 KB"

echo; echo "cycle tests: $pass passed, $failn failed (no model calls, no network)"; [[ $failn == 0 ]]
