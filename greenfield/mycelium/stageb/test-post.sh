#!/usr/bin/env bash
# Offline tests for myc-post (TEST mode: no systemd sandbox, no root; the sandbox itself is verified on fpd-prod by
# install-cycle.sh selftest). Uses the real workbench code on two small cases.   bash test-post.sh
set -uo pipefail
for c in jq node iconv; do command -v $c >/dev/null || { echo "post tests: need $c"; exit 1; }; done
D=$(cd "$(dirname "$0")" && pwd); WBSRC=$(cd "$D/../brain/workbench" && pwd); P=$D/myc-post
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
pass=0; failn=0
ok()  { echo "  PASS $*"; pass=$((pass + 1)); }
bad() { echo "  FAIL $*"; failn=$((failn + 1)); }
export MYC_TEST=1 MYC_SPOOL=$T/spool MYC_WB_ROOT=$T/wb MYC_POST_BATCH=cycle-test
WB=$T/wb/cycle-test; mkdir -p "$WB/tree"; cp -a "$WBSRC/." "$WB/tree/"
rm -f "$WB/tree/cases/"*.json
# fixture isolation: agent tests that assert results on the SHIPPED cases do not apply to this two-case fixture
rm -f "$WB/tree/test/claude-h1b.test.mjs"
for n in small-a small-b; do jq -n --arg n "$n" '{name:$n, author:"baseline", description:"small test case", budget:120, anchorSignal:0.6,
  families:{hub:{n:10,yield:0,out:6,to:{x:0.7,y:0.3},words:["dir"],seeds:3}, x:{n:120,yield:0.4,out:3,to:{x:0.8,y:0.2},words:["traders"],schedule:"cycle:30"}, y:{n:120,yield:0.02,out:3,to:{y:0.8,x:0.2},words:["news"]}}}' > "$WB/tree/cases/$n.json"; done
n=0
turn() {  # agent answer-file -> runs myc-post on a fresh run; sets R
  n=$((n + 1)); local id; id=$(printf 'MYC-20261031-%03d' "$n"); R="$id-r1793400000-0a1b2c3d"
  mkdir -p "$T/spool/$R/out"; jq -n --arg t "$id" --arg a "$1" '{run_id:"x", task_id:$t, agent:$a}' > "$T/spool/$R/job.json"
  cp "$2" "$T/spool/$R/out/result.md"; bash "$P" "$R" > "$T/out" 2>&1
}
res() { cat "$T/spool/$R/out/result.md"; }
mech='function create(api) { const q = api.seeds.map(s => s.id), seen = new Set(q); let h = 0;
  return { choose() { return h < q.length ? { fetch: q[h++] } : { fetch: q[Math.floor(Math.random() * q.length)] }; },
    observe(o) { for (const l of o.links) if (!seen.has(l.to)) { seen.add(l.to); q.push(l.to); } } }; }'
cat > "$T/a1.md" <<EOF
Codex: a breadth-first mechanism that never stops (prose).

\`\`\`mycelium-file path=mechanisms/codex-bfs.js
$mech
\`\`\`

\`\`\`mycelium-file path=mechanisms/claude-steal.js
function create(){ return { choose(){ return {wait:true} }, observe(){} } }
\`\`\`

\`\`\`mycelium-file path=evaluate.mjs
export const hacked = true;
\`\`\`

\`\`\`mycelium-prediction
{"mechanism":"codex-bfs","case":"small-a","metric":"verifiedVsBaseline","op":">","value":-1000}
\`\`\`
\`\`\`mycelium-prediction
{"mechanism":"codex-bfs","case":"small-a","metric":"verified","op":"<","value":0}
\`\`\`

\`\`\`mycelium-contribution
{"kind":"k","title":"t","body":"b","links":[{"to":"x","relation":"r"}]}
\`\`\`
EOF
echo "1. an answer's own-namespace artifacts are scored; foreign and core paths are refused"
turn codex "$T/a1.md"
[[ -f $WB/tree/mechanisms/codex-bfs.js && ! -f $WB/tree/mechanisms/claude-steal.js ]] && ! grep -q hacked "$WB/tree/evaluate.mjs" && ok "codex-bfs entered the tree; claude-steal.js and evaluate.mjs refused" || { bad "namespace"; cat "$T/out"; }
res | grep -q '^## Workbench result (machine-written' && res | grep -q 'REJECTED mechanisms/claude-steal.js' && res | grep -q 'REJECTED evaluate.mjs' && ok "the section lists accepted and rejected artifacts with reasons" || { bad "section"; res | tail -30; }
res | grep -q 'codex-bfs | ' && ok "the scoreboard includes the new mechanism" || { bad "board"; res | tail -20; }
res | grep -q 'verifiedVsBaseline > -1000 -> HELD' && res | grep -q 'verified < 0 -> FAILED' && ok "predictions are scored HELD / FAILED against the new scoreboard" || { bad "predictions"; res | grep Predictions; }
[[ $(stat -c %s "$T/spool/$R/out/result.md") -le 16384 ]] && iconv -f UTF-8 -t UTF-8 "$T/spool/$R/out/result.md" >/dev/null && ! LC_ALL=C grep -qaP '[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]' "$T/spool/$R/out/result.md" \
  && ok "result stays within the gate's 16 KB, clean UTF-8 rules" || bad "result rules"
tail -1 "$WB/progress.jsonl" | jq -e '.agent == "codex" and .accepted == 1 and .novel == 1 and .progress == true and .stall == false and .tests_pass >= 8 and .tests_fail == 0' >/dev/null && ok "progress record: 1 accepted, novel, progress; workbench tests ran in their own copy and passed" || { bad "progress"; tail -1 "$WB/progress.jsonl"; }
echo "2. the next agent receives its own current files; repeats and empty turns count as no progress; two in a row = STALL"
printf 'Claude: case and mechanism.\n\n```mycelium-file path=mechanisms/claude-wait.js\nfunction create(api){ return { choose(){ return { fetch: api.seeds[0].id } }, observe(){} } }\n```\n' > "$T/a2.md"
turn claude "$T/a2.md"; res | grep -q 'Files codex has changed during this cycle' && res | grep -q 'mycelium-file path=mechanisms/codex-bfs.js' && ! res | grep -q 'mycelium-file path=mechanisms/codex-c1.js' && ok "Claude's turn result carries the files Codex changed this cycle (not its unchanged starting files)" || { bad "carry"; res | tail -15; }
turn codex "$T/a1.md"; tail -1 "$WB/progress.jsonl" | jq -e '.novel == 0 and .progress == false and .stall == false' >/dev/null && ok "re-submitting identical files: no progress (not yet a stall)" || { bad "repeat"; tail -1 "$WB/progress.jsonl"; }
printf 'Claude: a cosmetic edit.\n\n```mycelium-file path=mechanisms/claude-wait.js\n// same behaviour, new comment\nfunction create(api){ return { choose(){ return { fetch: api.seeds[0].id } }, observe(){} } }\n```\n' > "$T/a2c.md"
turn claude "$T/a2c.md"; tail -1 "$WB/progress.jsonl" | jq -e '.novel == 1 and .scoreboard == "unchanged" and .progress == false and .stall == true' >/dev/null && res | grep -q 'STALL' \
  && ok "a changed file that leaves the scoreboard unchanged is not progress; second in a row: STALL flagged in record and section" || { bad "cosmetic stall"; tail -2 "$WB/progress.jsonl"; }
printf 'Claude: only prose this time.\n' > "$T/a3.md"
turn claude "$T/a3.md"; tail -1 "$WB/progress.jsonl" | jq -e '.accepted == 0 and .progress == false and .stall == true' >/dev/null && ok "a prose-only turn is not progress" || { bad "stall"; tail -2 "$WB/progress.jsonl"; }
printf 'Codex: a test.\n\n```mycelium-file path=test/codex-probe.test.mjs\nimport test from "node:test"; import assert from "node:assert/strict"; import { parseCase } from "../world.mjs";\ntest("bad budget refused", () => assert.throws(() => parseCase({})));\n```\n' > "$T/a3t.md"
turn codex "$T/a3t.md"; tail -1 "$WB/progress.jsonl" | jq -e '.novel_tests == 1 and .progress == true and .stall == false and .tests_fail == 0' >/dev/null && ok "a new test is progress (and runs in the test copy)" || { bad "test progress"; tail -1 "$WB/progress.jsonl"; }
echo "2b. handoff budget: an agent cannot accumulate more changed files than the next turn can receive; an answer that
    leaves no room for the other agent's changed files is a HANDOFF INCOMPLETE stall, never a silent truncation"
pad() { head -c "$1" /dev/zero | tr '\0' 'x' | fold -w 100; }
big() { printf '```mycelium-file path=%s\n// %s\nfunction create(api){ const q = api.seeds.map(s => s.id); return { choose(){ return { fetch: q[0] } }, observe(){} } }\n' "$1" "$2"; pad "$3"; printf '\n```\n'; }
{ echo "Codex: two big files."; big mechanisms/codex-big1.js a 2500 | sed 's/^x/\/\/x/'; big mechanisms/codex-big2.js b 2400 | sed 's/^x/\/\/x/'; } > "$T/b1.md"
turn codex "$T/b1.md"; tail -1 "$WB/progress.jsonl" | jq -e '.accepted == 2' >/dev/null && ok "two files within the 6 KB per-turn and changed-set limits are accepted" || { bad "budget accept"; res | grep -E "accepted|REJECTED"; }
{ echo "Codex: one more."; big mechanisms/codex-big3.js c 1500 | sed 's/^x/\/\/x/'; } > "$T/b2.md"
turn codex "$T/b2.md"; res | grep -q 'REJECTED mechanisms/codex-big3.js: not applied:.*over the 6144 bytes' && [[ ! -f $WB/tree/mechanisms/codex-big3.js ]] \
  && ok "a file that would push Codex's changed files over 6 KB is refused, with the reason" || { bad "changed-set cap"; res | grep -E "accepted|REJECTED"; }
{ echo "Claude: a long answer."; pad 9800; echo; } > "$T/b3.md"
turn claude "$T/b3.md"; tail -1 "$WB/progress.jsonl" | jq -e '.handoff_complete == false and .stall == true' >/dev/null && res | grep -q 'HANDOFF INCOMPLETE' \
  && [[ $(stat -c %s "$T/spool/$R/out/result.md") -le 16384 ]] && ok "no room for Codex's changed files: HANDOFF INCOMPLETE, STALL, result still within 16 KB" || { bad "handoff"; tail -1 "$WB/progress.jsonl"; res | tail -5; }
rm -f "$WB/tree/mechanisms/codex-big1.js" "$WB/tree/mechanisms/codex-big2.js"

echo "2c. hostile sandbox outputs (real evaluator, then the sandbox side swaps its outputs): never followed, never trusted"
mkdir -p "$T/out-of-sandbox"; printf 'CANARY_PARENT_ONLY\n' > "$T/out-of-sandbox/secret.txt"
printf '{"cases":{"small-a":{"codex-bfs":{"verified":{"mean":99999,"se":0,"n":6}}}}}\n' > "$T/out-of-sandbox/forged.json"
cat > "$T/hostile" <<'SH'
#!/usr/bin/env bash
"$@"; rc=$?
if [[ " $* " == *" --json "* ]]; then W=$(dirname "$2"); ln -sf "$HOSTILE_DIR/forged.json" "$W/.board.json"; ln -sf "$HOSTILE_DIR/secret.txt" "$W/.board.md"
  printf '{"not-a-key":{"verified":5},"%s":{"verified":"x"}}' "$(printf '0%.0s' {1..16})" > "$W/.cache.json.real"; ln -sf "$HOSTILE_DIR/forged.json" "$W/.cache.json"; fi
exit $rc
SH
chmod +x "$T/hostile"
printf 'Codex: probe.\n\n```mycelium-file path=mechanisms/codex-probe.js\n%s\n```\n' "$mech" > "$T/h1.md"
cp "$WB/cache.json" "$T/cache.before" 2>/dev/null || : > "$T/cache.before"
HOSTILE_DIR=$T/out-of-sandbox T_SANDBOX=$T/hostile turn codex "$T/h1.md"
! res | grep -q 'CANARY_PARENT_ONLY' && ! res | grep -q 99999 && res | grep -q 'output was refused' && cmp -s "$WB/cache.json" "$T/cache.before" \
  && ok "symlinked board/markdown/cache are refused: no parent-only content, no forged score, cache unchanged" || { bad "hostile outputs"; res | tail -8; }

echo "3. failures never block recording the answer"
cp "$T/a3.md" "$T/a4.md"; mv "$WB/tree" "$WB/tree.off"; turn codex "$T/a4.md"
res | grep -q 'Workbench result: NOT RUN (no pinned workbench' && head -1 "$T/spool/$R/out/result.md" | grep -q 'Claude: only prose' && ok "no workbench: NOT RUN appended, answer intact, exit 0" || { bad "notrun"; res; }
mv "$WB/tree.off" "$WB/tree"
big=$(head -c 15900 /dev/zero | tr '\0' 'x'); printf '%s\n' "$big" > "$T/a5.md"; turn codex "$T/a5.md"
[[ $(stat -c %s "$T/spool/$R/out/result.md") -le 16384 ]] && ok "an answer near the limit gets only a one-line note" || bad "near limit"
mkdir -p "$T/spool/x"; MYC_POST_BATCH='Bad Batch' bash "$P" "MYC-20261031-001-r1793400000-0a1b2c3d" >/dev/null 2>&1; [[ $? == 2 ]] && ok "bad batch name refused" || bad "bad batch"
echo "4. sandbox selftest: detects a missing sandbox; passes under a stand-in (unshare -n + setpriv nobody) when root"
mkdir -p "$T/sec/dir" "$T/ro" "$T/rw1" "$T/rw2"; echo s > "$T/sec/file"; chmod 600 "$T/sec/file"; chmod 700 "$T/sec/dir"; chmod 755 "$T/ro"
export T_PROBE_SECRETS="$T/sec/file $T/sec/dir" T_PROBE_RO=$T/ro
bash "$P" --selftest "$T/rw1" > "$T/out" 2>&1; [[ $? == 1 ]] && grep -q 'SELFTEST FAILED' "$T/out" && ok "no isolation: SELFTEST FAILED (secrets readable, writes allowed)" || { bad "selftest negative"; cat "$T/out"; }
if [[ $(id -u) == 0 ]] && command -v unshare >/dev/null && command -v setpriv >/dev/null; then
  chmod 711 "$T"
  T_SANDBOX="unshare -n setpriv --reuid=65534 --regid=65534 --clear-groups" bash "$P" --selftest "$T/rw2" > "$T/out" 2>&1
  [[ $? == 0 ]] && grep -q 'SANDBOX SELFTEST OK' "$T/out" && ok "stand-in sandbox: SELFTEST OK (not root, nothing readable, read-only system, no network)" || { bad "selftest positive"; cat "$T/out"; }
  printf 'Codex again.\n\n```mycelium-file path=mechanisms/codex-bfs2.js\n%s\n```\n' "$mech" > "$T/a6.md"
  T_SANDBOX="unshare -n setpriv --reuid=65534 --regid=65534 --clear-groups" turn codex "$T/a6.md"
  res | grep -q 'codex-bfs2 | ' && ok "a full turn evaluates inside the stand-in sandbox" || { bad "sandboxed turn"; res | tail -12; cat "$T/out"; }
else echo "  (skipped positive selftest: needs root, unshare and setpriv)"; fi
unset T_PROBE_SECRETS T_PROBE_RO
echo; echo "post tests: $pass passed, $failn failed (no model calls)"; [[ $failn == 0 ]]
