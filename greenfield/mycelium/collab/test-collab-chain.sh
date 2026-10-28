#!/usr/bin/env bash
# Offline test of the proposed memory-design exchange: the EXACT proposed task descriptors and launcher, driven through
# the real repo myc-stageb -> myc-gate -> myc-agent (v6) with FAKE claude/codex CLIs and a LOCAL bare repo.
# No network, no GitHub, no model, no root.   bash test-collab-chain.sh
set -uo pipefail
for c in git jq flock iconv dd timeout awk; do command -v $c >/dev/null || { echo "collab chain tests: need $c"; exit 1; }; done
D=$(cd "$(dirname "$0")" && pwd); S=$D/../stageb; GATE=$S/myc-gate; STAGEB=$S/myc-stageb; AGENTX=$S/myc-agent
LAUNCH=$D/memory-collab-launch.sh PT=$D/proposed-tasks CTXP=greenfield/mycelium/collab/memory-design-context-2026-10-28.md
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
pass=0; failn=0
ok()  { echo "  PASS $*"; pass=$((pass + 1)); }
bad() { echo "  FAIL $*"; failn=$((failn + 1)); }
B=findpitches-v3/greenfield; TD=greenfield/mycelium/tasks; IDS=(MYC-20261028-001 MYC-20261028-002 MYC-20261028-003 MYC-20261028-004)
declare -A WANT_BLOB=([MYC-20261028-001]=f6f95fba672dfbe3f0da7c57ce5b7c47901991e5 [MYC-20261028-002]=e085a918658e70703fdbfcf54837f0fbb259cbf0
                      [MYC-20261028-003]=c5ed9dc8e5c3210035cb8c3f08d672f8aaa562ac [MYC-20261028-004]=765d5b276be71198e851a103dc87a6aec08846ba)
export GIT_AUTHOR_NAME=chris GIT_AUTHOR_EMAIL=c@x GIT_COMMITTER_NAME=chris GIT_COMMITTER_EMAIL=c@x

# fake CLIs: same command shapes as the real ones; each call saves its prompt and answers "<agent> turn <n> ..."
mkdir -p "$T/stub" "$T/bin"
cat > "$T/stub/codex" <<'EOF'
#!/usr/bin/env bash
[[ $1 == login ]] && { echo "Logged in using ChatGPT"; exit 0; }
[[ $1 == --version ]] && { echo "codex-cli 0.164.0"; exit 0; }
n=$(( $(cat "$CTL/calls" 2>/dev/null | wc -l) + 1 )); echo codex >> "$CTL/calls"; cat > "$CTL/prompt.$n"
[[ -f $CTL/fail.$n ]] && { echo "boom" >&2; exit 1; }
out=""; prev=""; for a in "$@"; do [[ $prev == -o ]] && out=$a; prev=$a; done
if [[ -f $CTL/answer.$n ]]; then cat "$CTL/answer.$n" > "$out"; else printf '# Codex turn %s\nX1. TURN-%s-TOKEN builds on the previous turn.\n' "$n" "$n" > "$out"; fi
echo '{"type":"turn.completed","usage":{"input_tokens":100,"cached_input_tokens":0,"output_tokens":20}}'
EOF
cat > "$T/stub/claude" <<'EOF'
#!/usr/bin/env bash
[[ $1 == auth ]] && { echo '{"loggedIn":true,"authMethod":"claude.ai","apiProvider":"firstParty"}'; exit 0; }
[[ $1 == --version ]] && { echo "2.1.308 (Claude Code)"; exit 0; }
n=$(( $(cat "$CTL/calls" 2>/dev/null | wc -l) + 1 )); echo claude >> "$CTL/calls"; cat > "$CTL/prompt.$n"
[[ -f $CTL/fail.$n ]] && { jq -n '{type:"result", is_error:true, result:"API error"}'; exit 0; }
if [[ -f $CTL/answer.$n ]]; then a=$(cat "$CTL/answer.$n"); else a=$(printf '# Claude turn %s\nC1. TURN-%s-TOKEN builds on the previous turn.' "$n" "$n"); fi
jq -n --arg r "$a" '{type:"result", is_error:false, result:$r, usage:{input_tokens:5, output_tokens:20, cache_read_input_tokens:0}, modelUsage:{"claude-sonnet-5-5":{}}, total_cost_usd:0.01}'
EOF
printf '#!/usr/bin/env bash\nexec "$@"\n' > "$T/bin/myc-run"; chmod +x "$T/stub/"* "$T/bin/myc-run"

setup() {  # a fresh world: remote with the context pack and the four proposed tasks (event 1 by chris), the 4-line allowlist
  rm -rf "$T/w"; mkdir -p "$T/w/hs" "$T/w/spool" "$T/w/myc" "$T/w/ctl" "$T/w/decisions"
  git init -q --bare "$T/w/remote.git"; git clone -q "$T/w/remote.git" "$T/w/human" 2>/dev/null
  (cd "$T/w/human" && git checkout -q -b "$B" && mkdir -p "$(dirname "$CTXP")" && cp "$D/$(basename "$CTXP")" "$CTXP" \
    && for id in "${IDS[@]}"; do mkdir -p "$TD/$id/events"; cp "$PT/$id/task.json" "$TD/$id/task.json"
         jq -n '{seq:1, status:"pending", at:"2026-10-28T12:00:00Z", actor:"chris", reason:"created on Chris explicit approval"}' > "$TD/$id/events/0001.json"; done \
    && git add -A && git commit -qm "chris: memory design exchange tasks" && git push -q origin "$B") 2>/dev/null
  git clone -q --branch "$B" "$T/w/remote.git" "$T/w/hs/repo" 2>/dev/null
  : > "$T/w/allowed"; for id in "${IDS[@]}"; do echo "$id $(jq -r .assigned_agent "$PT/$id/task.json") ${WANT_BLOB[$id]}" >> "$T/w/allowed"; done
}
export PATH="$T/stub:$PATH" MYC_TEST=1 MYC_BILLING_CONFIRMED=yes COLLAB_TEST=1 T_GATE=$GATE T_STAGEB=$STAGEB
env_w() { export CTL=$T/w/ctl MYC_HOME=$T/w/hs MYC_SPOOL=$T/w/spool MYC_STATE=$T/w/state/state.json MYC_AS_MYC="env HOME=$T/w/myc" \
  MYC_GATE=$GATE MYC_AGENT=$AGENTX MYC_DECISIONS=$T/w/decisions MYC_GUARD=$T/bin/myc-run MYC_ALLOW=$T/w/allowed \
  T_ALLOW=$T/w/allowed T_AS_HUBSYNC="env HOME=$T/w/hs"; }
launch() { bash "$LAUNCH" > "$T/w/out" 2>&1; }
st() { MYC_MAX_CALLS=4 "$GATE" state "$1" 2>/dev/null | head -1; }
calls() { [[ -f $T/w/ctl/calls ]] && wc -l < "$T/w/ctl/calls" | tr -d ' ' || echo 0; }
res() { git --git-dir="$T/w/remote.git" show "$B:$TD/$1/result.md" 2>/dev/null; }

echo "1. the proposed descriptors are exactly what the allowlist will pin, and pass the writer's five-field contract"
setup; env_w; good=1
for id in "${IDS[@]}"; do
  [[ $(git hash-object "$PT/$id/task.json") == "${WANT_BLOB[$id]}" ]] || { good=0; echo "    blob $id"; }
  [[ $(st "$id") == "$id pending seq=1" ]] || { good=0; echo "    state $id: $(st "$id")"; }
  [[ $(jq -r .instructions "$PT/$id/task.json" | grep -c '^ref: ') -le 2 && $(jq -r .instructions "$PT/$id/task.json" | wc -c) -le 4096 ]] || { good=0; echo "    limits $id"; }
done
[[ $(git --git-dir="$T/w/remote.git" cat-file -s "$B:$CTXP") -le 32768 ]] || { good=0; echo "    context pack over 32 KB"; }
[[ $good == 1 ]] && ok "4 descriptors: pinned blobs match, pending, <=2 refs, <=4096 bytes; context pack <=32 KB" || bad "descriptors"
[[ $(cut -d' ' -f2 "$T/w/allowed" | tr '\n' ' ') == "claude codex claude codex " ]] && ok "agents alternate: claude, codex, claude, codex" || bad "agent order"

echo "2. order is enforced by the writer, not only by the launcher: a turn cannot be claimed before its predecessor completes"
MYC_AS_HUBSYNC="env HOME=$T/w/hs MYC_MAX_CALLS=4" MYC_WINDOW_S=3600 "$STAGEB" MYC-20261028-002 > "$T/w/o" 2>&1
[[ $(calls) == 0 && $(st MYC-20261028-002) == "MYC-20261028-002 pending seq=1" ]] && grep -q 'not completed' "$T/w/o" \
  && ok "turn 2 run first: claim refused (its ref to turn 1's result is not completed), no call, still pending" || { bad "order"; cat "$T/w/o"; }

echo "3. the full exchange: four calls, alternating CLIs, each turn receives the previous CLI's unedited answer"
launch; rc=$?
good=1; for id in "${IDS[@]}"; do [[ $(st "$id") == "$id completed seq=3"* ]] || good=0; done
[[ $rc == 0 && $good == 1 && $(calls) == 4 && $(tr '\n' ' ' < "$T/w/ctl/calls") == "claude codex claude codex " ]] && grep -q 'DONE: all four turns' "$T/w/out" \
  && ok "4 turns completed, exactly 4 calls in the order claude, codex, claude, codex" || { bad "chain rc=$rc calls=$(calls)"; cat "$T/w/out"; }
good=1
for n in 1 2 3 4; do grep -q "## Reference: $CTXP" "$T/w/ctl/prompt.$n" && grep -q 'Founding vision' "$T/w/ctl/prompt.$n" || { good=0; echo "    context missing in turn $n"; }; done
for n in 2 3 4; do p=$((n - 1)); grep -q "## Reference: $TD/${IDS[$p - 1]}/result.md" "$T/w/ctl/prompt.$n" && grep -q "TURN-$p-TOKEN" "$T/w/ctl/prompt.$n" \
  || { good=0; echo "    turn $n lacks turn $p"; }; done
! grep -q 'TURN-' "$T/w/ctl/prompt.1" || good=0
[[ $good == 1 ]] && ok "every turn gets the context pack; turns 2-4 get the previous turn's result verbatim (pinned blob); turn 1 gets none" || bad "cross-reference"
[[ $(res MYC-20261028-004) == *"TURN-4-TOKEN"* && $(res MYC-20261028-001) == *"TURN-1-TOKEN"* ]] && ok "all four results published to the hub by myc-gate (the single writer)" || bad "results"
c0=$(calls); launch; [[ $(calls) == "$c0" ]] && grep -c 'already completed' "$T/w/out" | grep -qx 4 && ok "launcher rerun after completion: no call" || { bad "rerun"; cat "$T/w/out"; }

echo "4. fail-closed: a failed turn stops the exchange and holds the grant"
setup; env_w; touch "$T/w/ctl/fail.2"; launch; rc=$?
[[ $rc != 0 && $(calls) == 2 && $(st MYC-20261028-002) == "MYC-20261028-002 failed"* && $(st MYC-20261028-003) == "MYC-20261028-003 pending seq=1" ]] \
  && grep -q 'STOP: MYC-20261028-002' "$T/w/out" && ok "codex turn 2 transport failure: launcher stops, turns 3-4 never called (2 calls)" || { bad "fail stop rc=$rc calls=$(calls)"; cat "$T/w/out"; }
rm -f "$T/w/ctl/fail.2"; launch; rc=$?
[[ $rc != 0 && $(calls) == 2 ]] && grep -q 'not pending' "$T/w/out" && ok "rerun after a failure: still stopped, no further call" || { bad "rerun after fail"; cat "$T/w/out"; }
MYC_AS_HUBSYNC="env HOME=$T/w/hs MYC_MAX_CALLS=4" MYC_WINDOW_S=3600 "$STAGEB" MYC-20261028-003 > "$T/w/o" 2>&1
[[ $(calls) == 2 ]] && grep -q 'grant does not allow' "$T/w/o" && ok "running turn 3 by hand after the failure: grant held, no call" || { bad "held grant"; cat "$T/w/o"; }

echo "5. fail-closed: a decision request instead of design text pauses everything for Chris"
setup; env_w; printf 'MYCELIUM-DECISION-REQUEST v1\nShould memory allow hard deletion?\n' > "$T/w/ctl/answer.1"; launch; rc=$?
[[ $rc != 0 && $(calls) == 1 && $(st MYC-20261028-001) == "MYC-20261028-001 awaiting_approval"* && $(st MYC-20261028-002) == "MYC-20261028-002 pending seq=1" ]] \
  && ok "turn 1 returns the decision envelope: awaiting_approval, launcher stops after 1 call" || { bad "decision stop rc=$rc calls=$(calls)"; cat "$T/w/out"; }

echo "6. the launcher refuses to start without its preconditions"
setup; env_w; MYC_BILLING_CONFIRMED=no launch; r1=$?; head -3 "$T/w/allowed" > "$T/w/a3"; mv "$T/w/a3" "$T/w/allowed"; launch; r2=$?
[[ $r1 != 0 && $r2 != 0 && $(calls) == 0 ]] && grep -q 'exactly the four approved lines' "$T/w/out" && ok "no billing confirmation, or an allowlist without exactly 4 lines: refused, no call" || bad "preconditions"

echo; echo "collab chain tests: $pass passed, $failn failed"; [[ $failn == 0 ]]
