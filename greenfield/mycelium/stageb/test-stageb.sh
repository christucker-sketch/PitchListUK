#!/usr/bin/env bash
# Offline tests for Stage B v2 (myc-gate / myc-agent / myc-stageb) against a LOCAL bare repo with FAKE codex/claude.
# No network, no GitHub, no model calls, no root, no python.   bash test-stageb.sh
# Includes Claude's own versions of Codex's review regressions R1-R6 (25 Oct).
set -uo pipefail
for c in git jq flock iconv dd timeout awk; do command -v $c >/dev/null || { echo "stage B tests: need $c"; exit 1; }; done
D=$(cd "$(dirname "$0")" && pwd)
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
pass=0; failn=0
ok()  { echo "  PASS $*"; pass=$((pass + 1)); }
bad() { echo "  FAIL $*"; failn=$((failn + 1)); }
B=findpitches-v3/greenfield; TD=greenfield/mycelium/tasks
export GIT_AUTHOR_NAME=chris GIT_AUTHOR_EMAIL=c@x GIT_COMMITTER_NAME=chris GIT_COMMITTER_EMAIL=c@x
git init -q --bare "$T/remote.git"
git clone -q "$T/remote.git" "$T/human" 2>/dev/null
(cd "$T/human" && git checkout -q -b "$B" && mkdir -p team && echo hub > team/README.md && git add -A && git commit -qm init && git push -q origin "$B") 2>/dev/null
mkdir -p "$T/hs" "$T/spool" "$T/myc/bin" "$T/stub" "$T/ctl"
git clone -q --branch "$B" "$T/remote.git" "$T/hs/repo" 2>/dev/null
printf '#!/usr/bin/env bash\nexec "$@"\n' > "$T/myc/bin/myc-run"
cat > "$T/stub/codex" <<'EOF'
#!/usr/bin/env bash
[[ $1 == login ]] && { echo "Logged in using ChatGPT"; exit 0; }
[[ $1 == --version ]] && { echo "codex-cli 0.164.0"; exit 0; }
echo call >> "$CTL/calls"
[[ -f $CTL/codex_sleep ]] && { sleep 1; }
[[ -f $CTL/codex_ignore_term ]] && { trap "" TERM; sleep 5; }
[[ -f $CTL/codex_fail ]] && { echo "boom" >&2; exit 1; }
out=""; prev=""; for a in "$@"; do [[ $prev == -o ]] && out=$a; prev=$a; done
p=$(cat); printf '# Codex review\n1. risk one\n2. risk two\nsaw-instructions: %s\n' "$(grep -c 'Task' <<<"$p")" > "$out"
[[ -f $CTL/codex_secret ]] && echo "token ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123" >> "$out"
echo '{"type":"turn.completed","usage":{"input_tokens":14000,"cached_input_tokens":12000,"output_tokens":90}}'
EOF
cat > "$T/stub/claude" <<'EOF'
#!/usr/bin/env bash
if [[ $1 == auth ]]; then
  echo x >> "$CTL/claude_auth_calls"
  [[ -f $CTL/claude_tty_strict && -t 0 ]] && exit 7   # real CLI: stopped by the terminal under timeout
  [[ -f $CTL/claude_auth_fail ]] && exit 1
  [[ -f $CTL/claude_auth_fail_second && $(wc -l < "$CTL/claude_auth_calls") -ge 2 ]] && exit 1
  [[ -f $CTL/claude_auth_slow ]] && sleep 3
  echo '{"loggedIn":true,"authMethod":"claude.ai","apiProvider":"firstParty"}'; exit 0
fi
[[ $1 == --version ]] && { echo "2.1.308 (Claude Code)"; exit 0; }
echo call >> "$CTL/calls"; printf '%s\n' "$@" > $CTL/claude_argv
p=$(cat); ref=$(grep -A2 '^## Reference: ' <<<"$p" | sed -n 3p)
jq -n --arg r "# Claude review
agree with: $ref" '{type:"result",is_error:false,result:$r,usage:{input_tokens:5,output_tokens:200,cache_read_input_tokens:0},modelUsage:{"claude-sonnet-5-5":{}},total_cost_usd:0.01}'
EOF
chmod +x "$T/myc/bin/myc-run" "$T/stub/"*
export PATH="$T/stub:$PATH" CTL=$T/ctl MYC_HOME=$T/hs MYC_SPOOL=$T/spool MYC_STATE=$T/state/state.json MYC_TEST=1 \
  MYC_AS_HUBSYNC="env HOME=$T/hs" MYC_AS_MYC="env HOME=$T/myc" MYC_GATE=$D/myc-gate MYC_AGENT=$D/myc-agent \
  MYC_GUARD=$T/myc/bin/myc-run MYC_BILLING_CONFIRMED=yes MYC_ALLOW=$T/allowed
GATE=$D/myc-gate; STAGEB=$D/myc-stageb; AGENTX=$D/myc-agent

mk_task() {  # id agent instructions [jq-filter applied to task.json] [actor of event 1]
  (cd "$T/human" && git pull -q --rebase origin "$B" && mkdir -p "$TD/$1/events" \
   && jq -n --arg t "$1" --arg a "$2" --arg i "$3" --arg rl "$TD/$1/result.md" \
        '{task_id:$t, assigned_agent:$a, instructions:$i, status:"pending", result_location:$rl}' | jq "${4:-.}" > "$TD/$1/task.json" \
   && jq -n --arg who "${5:-chris}" '{seq:1, status:"pending", at:"2026-10-25T10:00:00Z", actor:$who, reason:"created by Chris"}' > "$TD/$1/events/0001.json" \
   && git add -A && git commit -qm "chris: task $1" && git push -q origin "$B") 2>/dev/null
}
human_event() {  # id seq json
  (cd "$T/human" && git pull -q --rebase origin "$B" && printf '%s\n' "$3" > "$TD/$1/events/$(printf %04d "$2").json" && git add -A && git commit -qm "chris: event $1/$2" && git push -q origin "$B") 2>/dev/null
}
new_grant() { : > "$T/allowed"; rm -f "$MYC_STATE"; : > "$T/ctl/calls"; }   # a fresh, independent Stage B grant
allow() { echo "$1 $2 $(git --git-dir="$T/remote.git" rev-parse "$B:$TD/$1/task.json")" >> "$T/allowed"; }
remote_has() { git --git-dir="$T/remote.git" cat-file -e "$B:$1" 2>/dev/null; }
remote_cat() { git --git-dir="$T/remote.git" show "$B:$1"; }
st() { "$GATE" state "$1" 2>/dev/null; }
calls() { [[ -f $T/ctl/calls ]] && wc -l < "$T/ctl/calls" | tr -d " " || echo 0; }
nev() { git --git-dir="$T/remote.git" ls-tree --name-only "$B" "$TD/$1/events/" 2>/dev/null | wc -l; }

echo "1. the two-task Stage B exchange (Codex -> Claude via GitHub)"
new_grant
(cd "$T/human" && git pull -q --rebase origin "$B" && mkdir -p greenfield/mycelium/hubsync && echo '#!/bin/sh # watcher' > greenfield/mycelium/hubsync/hubsync && git add -A && git commit -qm ref && git push -q origin "$B") 2>/dev/null
mk_task MYC-20261025-001 codex $'Read-only review of the hub watcher. List at most 3 risks.\nref: greenfield/mycelium/hubsync/hubsync'
mk_task MYC-20261025-002 claude $'Read the Codex review and say which risks you agree with.\nref: greenfield/mycelium/tasks/MYC-20261025-001/result.md'
"$STAGEB" MYC-20261025-001 > "$T/out" 2>&1; [[ $? != 0 ]] && grep -q "not in the Stage B allowlist" "$T/out" && [[ $(calls) == 0 && $(nev MYC-20261025-001) == 1 ]] \
  && ok "task not in Chris's pinned allowlist is refused; no claim, no call" || { bad "allowlist"; cat "$T/out"; }
allow MYC-20261025-001 codex; allow MYC-20261025-002 claude
[[ $(st MYC-20261025-001) == *" pending seq=1"* ]] && ok "task 1 validates as pending" || bad "task 1 state: $(st MYC-20261025-001)"
"$STAGEB" MYC-20261025-002 > "$T/out" 2>&1; [[ $? != 0 ]] && grep -q "not completed" "$T/out" && [[ $(calls) == 0 && $(nev MYC-20261025-002) == 1 ]] \
  && ok "task 2 refused before task 1 is completed; no claim, no call" || { bad "task 2 early"; cat "$T/out"; }
"$STAGEB" MYC-20261025-001 > "$T/out" 2>&1
[[ $(st MYC-20261025-001) == *" completed seq=3"* ]] && remote_has "$TD/MYC-20261025-001/result.md" && [[ $(calls) == 1 ]] \
  && ok "task 1 completed: claim -> admit -> one call -> record" || { bad "task 1 run"; cat "$T/out"; }
h1=$(remote_cat "$TD/MYC-20261025-001/result.md" | sha256sum | cut -c1-64)
[[ $(remote_cat "$TD/MYC-20261025-001/events/0003.json" | jq -r .output_sha256) == "$h1" ]] && ok "completion event pins the result sha256" || bad "sha"
remote_cat "$TD/MYC-20261025-001/events/0003.json" | jq -e '.usage.input_tokens == 14000 and .usage.cached_input_tokens == 12000 and .usage.cli_version == "codex-cli 0.164.0" and .usage.agent == "codex"' >/dev/null \
  && ok "usage and CLI version recorded from allowlisted fields" || bad "usage"
"$STAGEB" MYC-20261025-002 > "$T/out" 2>&1
[[ $(st MYC-20261025-002) == *" completed "* ]] && remote_cat "$TD/MYC-20261025-002/result.md" | grep -q "agree with: # Codex review" && [[ $(calls) == 2 ]] \
  && ok "task 2 (Claude) read task 1's result from GitHub, no relay" || { bad "task 2 run"; cat "$T/out"; }
grep -qx -- '--settings' $T/ctl/claude_argv && grep -qx -- '--strict-mcp-config' $T/ctl/claude_argv && ! grep -q -- '--fallback-model' $T/ctl/claude_argv \
  && ok "Claude ran with the no-retry settings file, no MCP, no fallback model" || bad "claude flags"
remote_cat "$TD/MYC-20261025-002/events/0003.json" | jq -e '.usage.api_equivalent_usd_not_billed == 0.01' >/dev/null && ok "API-equivalent estimate labelled not billed" || bad "estimate label"
"$GATE" complete "$(remote_cat "$TD/MYC-20261025-001/events/0002.json" | jq -r .run_id)" > "$T/out" 2>&1; grep -q "already recorded" "$T/out" \
  && ok "re-running complete after success changes nothing" || { bad "complete rerun"; cat "$T/out"; }
rm -f "$MYC_STATE"; "$STAGEB" MYC-20261025-001 > "$T/out" 2>&1; [[ $? != 0 ]] && grep -q "only a pending task can be claimed" "$T/out" && [[ $(calls) == 2 ]] \
  && ok "completed task cannot be replayed, even with local state deleted" || { bad "replay"; cat "$T/out"; }
mk_task MYC-20261025-003 codex "x"; allow MYC-20261025-003 codex; rm -f "$MYC_STATE"
"$STAGEB" MYC-20261025-003 > "$T/out" 2>&1; grep -q "call cap reached" "$T/out" && [[ $(calls) == 2 && $(nev MYC-20261025-003) == 1 ]] \
  && ok "third task refused by the 2-call grant (from GitHub, local state deleted)" || { bad "cap"; cat "$T/out"; }
for f in $(git --git-dir="$T/remote.git" log --format= --name-only --author=hubsync "$B" | sort -u); do [[ $f =~ ^$TD/MYC-[0-9]{8}-[0-9]{3}/(events/[0-9]{4}\.json|result\.md)$ ]] || bad "writer pushed $f"; done
ok "writer pushed only task events/results"

echo "2. strict validation quarantines bad tasks before any claim"
new_grant
mk_task MYC-20261025-010 codex "x" '. + {requires_approval:false}'
[[ $(st MYC-20261025-010) == *QUARANTINE*five-field* ]] && ok "extra field (self-permission) quarantined" || bad "extra field: $(st MYC-20261025-010)"
for v in '{"task_id":"MYC-20261025-011","task_id":"MYC-20261025-011","assigned_agent":"codex","instructions":"x","status":"pending","result_location":"R"}' \
         '{"task_id":"MYC-20261025-011","assigned_agent":"codex","instructions":{"ignored":1},"instructions":"x","status":"pending","result_location":"R"}' \
         '{"task_id":"MYC-20261025-011","assigned_agent":"codex","instructions":"x","instructions":["y"],"status":"pending","result_location":"R"}' \
         '{"task_id":"MYC-20261025-011","assigned_agent":"codex","instructions":"x","status":"pending","result_location":"R","n":{"a":1,"a":{"b":2}}}'; do
  mk_task MYC-20261025-011 codex "x"
  (cd "$T/human" && git pull -q --rebase origin "$B" && sed "s|\"R\"|\"$TD/MYC-20261025-011/result.md\"|" <<<"$v" > "$TD/MYC-20261025-011/task.json" && git commit -qam dup && git push -q origin "$B") 2>/dev/null
  [[ $(st MYC-20261025-011) == *QUARANTINE*strict* ]] && ok "duplicate member quarantined: $(cut -c40-90 <<<"$v")" || bad "dup accepted: $v -> $(st MYC-20261025-011)"
  (cd "$T/human" && git rm -rq "$TD/MYC-20261025-011" && git commit -qm rm && git push -q origin "$B") 2>/dev/null
done
mk_task MYC-20261025-012 codex "x" '.' mallory
[[ $(st MYC-20261025-012) == *QUARANTINE*chris* ]] && ok "event 1 not by chris quarantined" || bad "actor: $(st MYC-20261025-012)"
mk_task MYC-20261025-013 codex "x"; human_event MYC-20261025-013 3 '{"seq":3,"status":"completed","at":"2026-10-25T10:01:00Z","actor":"x"}'
[[ $(st MYC-20261025-013) == *QUARANTINE*gap* ]] && ok "gapped history quarantined" || bad "gap: $(st MYC-20261025-013)"
mk_task MYC-20261025-014 codex "x"; human_event MYC-20261025-014 2 '{"seq":2,"status":"approved","at":"2026-10-25T10:01:00Z","actor":"chris"}'
[[ $(st MYC-20261025-014) == *QUARANTINE*not\ allowed* ]] && ok "approval transitions not accepted in Stage B" || bad "approval: $(st MYC-20261025-014)"
mk_task MYC-20261025-016 codex "x"; human_event MYC-20261025-016 2 '{"seq":2,"status":"in_progress","at":"yesterday","actor":"hubsync-gate for codex"}'
[[ $(st MYC-20261025-016) == *QUARANTINE*bad\ fields* ]] && ok "malformed event time quarantined" || bad "time: $(st MYC-20261025-016)"
mk_task MYC-20261025-015 codex "x"; allow MYC-20261025-015 codex; human_event MYC-20261025-015 2 '{"seq":2,"status":"cancelled","at":"2026-10-25T10:01:00Z","actor":"chris"}'
"$STAGEB" MYC-20261025-015 > "$T/out" 2>&1; [[ $? != 0 && $(calls) == 0 ]] && [[ $(st MYC-20261025-015) == *QUARANTINE* ]] \
  && ok "a cancel by Chris stops the task (fail closed, never run)" || { bad "cancel"; cat "$T/out"; }

echo "3. failures: fixed public codes, recorded once, everything after is held"
new_grant
mk_task MYC-20261025-020 codex "x"; mk_task MYC-20261025-021 codex "x"; allow MYC-20261025-020 codex; allow MYC-20261025-021 codex
touch "$T/ctl/codex_fail"; "$STAGEB" MYC-20261025-020 > "$T/out" 2>&1; rm -f "$T/ctl/codex_fail"
remote_cat "$TD/MYC-20261025-020/events/0003.json" | jq -e '.status == "failed" and .reason == "runner_failed"' >/dev/null && [[ $(calls) == 1 ]] \
  && ok "failed call recorded once as failed/runner_failed (no retry)" || { bad "fail record"; cat "$T/out"; }
rm -f "$MYC_STATE"; "$STAGEB" MYC-20261025-021 > "$T/out" 2>&1
grep -q "earlier Stage B task is failed" "$T/out" && [[ $(calls) == 1 && $(nev MYC-20261025-021) == 1 ]] \
  && ok "after a failure the next call is refused (from GitHub, local state deleted)" || { bad "post-failure"; cat "$T/out"; }
new_grant; mk_task MYC-20261025-022 codex "x"; allow MYC-20261025-022 codex; touch "$T/ctl/codex_secret"
"$STAGEB" MYC-20261025-022 > "$T/out" 2>&1; rm -f "$T/ctl/codex_secret"
[[ $(st MYC-20261025-022) == *" failed "* ]] && ! remote_has "$TD/MYC-20261025-022/result.md" \
  && remote_cat "$TD/MYC-20261025-022/events/0003.json" | jq -e '.reason == "result_rejected"' >/dev/null && ok "result with a credential pattern is never published" || { bad "secret"; cat "$T/out"; }
# R4: unsafe text in runner metadata (synthetic marker, never a real credential)
new_grant; mk_task MYC-20261025-023 codex "x"; allow MYC-20261025-023 codex
run=$("$GATE" claim MYC-20261025-023 2>/dev/null); "$GATE" admit "$run" >/dev/null 2>&1
jq -n '{ok:false, agent:"codex", error:("ghp_"+("A"*30)), model:("sk-"+("B"*40)), cli_version:"x\u0007y"}' > "$T/spool/$run/out/meta.json"
"$GATE" complete "$run" > "$T/r4" 2>&1
e=$(remote_cat "$TD/MYC-20261025-023/events/0003.json")
jq -e '.reason == "runner_failed" and .usage.model == null and .usage.cli_version == null' >/dev/null <<<"$e" && ! grep -qE 'ghp_|sk-' <<<"$e" \
  && ok "R4: runner error/model/version text never reaches the public receipt" || { bad "R4: $e"; cat "$T/r4"; }

echo "4. one call per admitted claim; cancellation before admission; deadlines"
# R1: two runners for one admitted run -> exactly one call; a restart after it -> none
new_grant; mk_task MYC-20261025-030 codex "x"; allow MYC-20261025-030 codex
run=$("$GATE" claim MYC-20261025-030 2>/dev/null); "$GATE" admit "$run" >/dev/null 2>&1; touch "$T/ctl/codex_sleep"
HOME=$T/myc "$AGENTX" "$run" > "$T/a1" 2>&1 & p1=$!; HOME=$T/myc "$AGENTX" "$run" > "$T/a2" 2>&1 & p2=$!; wait $p1; wait $p2; rm -f "$T/ctl/codex_sleep"
HOME=$T/myc "$AGENTX" "$run" > "$T/a3" 2>&1
[[ $(calls) == 1 ]] && grep -q "already started once" "$T/a3" && ok "R1: two concurrent runners + a restart made exactly 1 call" || bad "R1: $(calls) calls"
"$GATE" admit "$run" > "$T/out" 2>&1; grep -q "already admitted once" "$T/out" && ok "R1: a run can be admitted only once" || { bad "re-admit"; cat "$T/out"; }
"$GATE" complete "$run" >/dev/null 2>&1
mk_task MYC-20261025-031 codex "x"; allow MYC-20261025-031 codex; new_grant; allow MYC-20261025-031 codex
run=$("$GATE" claim MYC-20261025-031 2>/dev/null); HOME=$T/myc "$AGENTX" "$run" > "$T/out" 2>&1
grep -q "not admitted" "$T/out" && [[ $(calls) == 0 ]] && ok "runner refuses a claimed but not admitted run" || { bad "unadmitted"; cat "$T/out"; }
# R2: Chris cancels after the claim landed, before admission -> admission refused, no packet, no call
human_event MYC-20261025-031 3 '{"seq":3,"status":"cancelled","at":"2026-10-25T10:02:00Z","actor":"chris"}'
"$GATE" admit "$run" > "$T/out" 2>&1; r=$?
[[ $r != 0 && ! -e $T/spool/$run/job.json && ! -e $T/spool/$run/admitted && $(calls) == 0 ]] && grep -q "NOT admitted" "$T/out" \
  && ok "R2: cancellation after claim stops admission (no packet, no call)" || { bad "R2"; cat "$T/out"; }
# R2 through the orchestrator: a git shim lands the cancellation right after the claim push
new_grant; mk_task MYC-20261025-032 codex "x"; allow MYC-20261025-032 codex
cat > "$T/stub/git" <<GITWRAP
#!/usr/bin/env bash
/usr/bin/git "\$@"; rc=\$?
if [[ \$rc == 0 && \${1:-} == -C && \${2:-} == "$T/hs/repo" && \${3:-} == push && ! -f $T/cancel-once ]]; then
  touch $T/cancel-once
  ( cd $T/human && /usr/bin/git pull -q --rebase origin $B && printf '{"seq":3,"status":"cancelled","at":"2026-10-25T10:03:00Z","actor":"chris"}\n' > $TD/MYC-20261025-032/events/0003.json \
    && /usr/bin/git add -A && /usr/bin/git commit -qm cancel && /usr/bin/git push -q origin $B ) >/dev/null 2>&1
fi
exit \$rc
GITWRAP
chmod +x "$T/stub/git"; "$STAGEB" MYC-20261025-032 > "$T/out" 2>&1; rm -f "$T/stub/git"
[[ $(calls) == 0 ]] && grep -q "NO model call" "$T/out" && ok "R2: orchestrator makes no call when a cancel lands right after the claim" || { bad "R2 orchestrator"; cat "$T/out"; }
# R3: window from the first GitHub claim, unaffected by local state loss
new_grant; mk_task MYC-20261025-033 codex "x"; mk_task MYC-20261025-034 codex "x"; allow MYC-20261025-033 codex; allow MYC-20261025-034 codex
"$STAGEB" MYC-20261025-033 >/dev/null 2>&1; sleep 2; rm -f "$MYC_STATE"
MYC_WINDOW_S=31 "$STAGEB" MYC-20261025-034 > "$T/out" 2>&1
grep -q "window has passed" "$T/out" && [[ $(calls) == 1 && $(nev MYC-20261025-034) == 1 ]] && ok "R3: elapsed window held after local state loss" || { bad "R3"; cat "$T/out"; }
# lease expiry
new_grant; mk_task MYC-20261025-035 codex "x"; allow MYC-20261025-035 codex
run=$(MYC_LEASE_MIN=0 "$GATE" claim MYC-20261025-035 2>/dev/null); sleep 1
"$GATE" admit "$run" > "$T/out" 2>&1; grep -q "lease expired" "$T/out" && [[ ! -e $T/spool/$run/admitted ]] && ok "expired lease is never admitted" || { bad "lease admit"; cat "$T/out"; }
"$GATE" expire MYC-20261025-035 >/dev/null 2>&1; remote_cat "$TD/MYC-20261025-035/events/0003.json" | jq -e '.reason == "outcome_uncertain"' >/dev/null && ok "expire records failed/outcome_uncertain" || bad "expire"
"$GATE" complete "$run" > "$T/out" 2>&1; grep -q "already recorded" "$T/out" && ok "late completion after expiry changes nothing" || { bad "late"; cat "$T/out"; }
# R6: a TERM-ignoring CLI is killed within the per-call cap
new_grant; mk_task MYC-20261025-036 codex "x"; allow MYC-20261025-036 codex
run=$("$GATE" claim MYC-20261025-036 2>/dev/null); "$GATE" admit "$run" >/dev/null 2>&1; touch "$T/ctl/codex_ignore_term"
s0=$(date +%s%N); MYC_CALL_TIMEOUT=2 HOME=$T/myc "$AGENTX" "$run" >/dev/null 2>&1; el=$(( ($(date +%s%N) - s0) / 1000000 )); rm -f "$T/ctl/codex_ignore_term"
[[ $el -le 2600 ]] && jq -e '.ok == false' "$T/spool/$run/out/meta.json" >/dev/null && ok "R6: TERM-ignoring CLI killed inside the cap (${el} ms for a 2 s cap)" || bad "R6: ${el} ms"
"$GATE" complete "$run" >/dev/null 2>&1
# R3 follow-up: publication is bounded by the absolute grant end
new_grant; mk_task MYC-20261025-039 codex "x"; allow MYC-20261025-039 codex
run=$("$GATE" claim MYC-20261025-039 2>/dev/null); "$GATE" admit "$run" >/dev/null 2>&1; HOME=$T/myc "$AGENTX" "$run" >/dev/null 2>&1
jq --argjson d $(( $(date -u +%s) - 40 )) '.deadline_epoch = $d' "$T/spool/$run/job.json" > "$T/j" && mv "$T/j" "$T/spool/$run/job.json"
"$GATE" complete "$run" >/dev/null 2>&1
remote_cat "$TD/MYC-20261025-039/events/0003.json" | jq -e '.status == "failed" and .reason == "deadline_passed"' >/dev/null && ! remote_has "$TD/MYC-20261025-039/result.md" \
  && ok "R3: a result arriving after the grant end is not published (deadline_passed)" || bad "R3 publish bound"
new_grant; mk_task MYC-20261025-041 codex "x"; allow MYC-20261025-041 codex
run=$("$GATE" claim MYC-20261025-041 2>/dev/null); "$GATE" admit "$run" >/dev/null 2>&1; HOME=$T/myc "$AGENTX" "$run" >/dev/null 2>&1
jq --argjson d $(( $(date -u +%s) - 30 + 12 )) '.deadline_epoch = $d' "$T/spool/$run/job.json" > "$T/j" && mv "$T/j" "$T/spool/$run/job.json"
printf '#!/usr/bin/env bash\n[[ ${3:-} == push ]] && sleep 20\nexec /usr/bin/git "$@"\n' > "$T/stub/git"; chmod +x "$T/stub/git"
"$GATE" complete "$run" > "$T/out" 2>&1; r=$?; rm -f "$T/stub/git"
[[ $r != 0 ]] && grep -q "outcome UNCERTAIN" "$T/out" && [[ $(st MYC-20261025-041) == *" in_progress "* ]] \
  && ok "R3: a push that cannot finish before the grant end stops as UNCERTAIN (held, no retry)" || { bad "R3 push bound"; cat "$T/out"; }
# crash mid-call and symlink output
new_grant; mk_task MYC-20261025-037 codex "x"; allow MYC-20261025-037 codex
printf '#!/usr/bin/env bash\n[[ $1 == --preflight ]] && exit 0\nmkdir "$MYC_SPOOL/$1/out/started"; exit 9\n' > "$T/agent-crash"; chmod +x "$T/agent-crash"
MYC_AGENT=$T/agent-crash "$STAGEB" MYC-20261025-037 >/dev/null 2>&1
remote_cat "$TD/MYC-20261025-037/events/0003.json" | jq -e '.status == "failed" and .reason == "outcome_uncertain"' >/dev/null && ok "crash after start recorded as outcome_uncertain, held" || bad "uncertain"
new_grant; mk_task MYC-20261025-038 codex "x"; allow MYC-20261025-038 codex; echo "PRIVATE KEY MATERIAL" > "$T/hs/secret"
printf '#!/usr/bin/env bash\n[[ $1 == --preflight ]] && exit 0\nO=$MYC_SPOOL/$1/out; mkdir "$O/started"; ln -s %q "$O/result.md"; echo "{\\"ok\\":true,\\"agent\\":\\"codex\\",\\"seconds\\":1}" > "$O/meta.json"\n' "$T/hs/secret" > "$T/agent-link"; chmod +x "$T/agent-link"
MYC_AGENT=$T/agent-link "$STAGEB" MYC-20261025-038 >/dev/null 2>&1
remote_cat "$TD/MYC-20261025-038/events/0003.json" | jq -e '.reason == "result_rejected"' >/dev/null && ! remote_has "$TD/MYC-20261025-038/result.md" && ! git --git-dir="$T/remote.git" log -p "$B" | grep -q "PRIVATE KEY MATERIAL" && ok "symlinked result.md rejected; private file never published" || bad "symlink"

echo "4b. v5: sign-in pre-flight before the claim (25 Oct Stage B lesson)"
new_grant; mk_task MYC-20261025-050 claude "x"; allow MYC-20261025-050 claude; touch "$T/ctl/claude_auth_fail"
"$STAGEB" MYC-20261025-050 > "$T/out" 2>&1; rm -f "$T/ctl/claude_auth_fail"
grep -q "pre-flight failed. NO claim" "$T/out" && [[ $(nev MYC-20261025-050) == 1 && $(calls) == 0 ]] \
  && ok "failed sign-in pre-flight: no claim, no call, task still pending" || { bad "preflight"; cat "$T/out"; }
rm -f "$T/ctl/claude_auth_calls"; touch "$T/ctl/claude_auth_fail_second"
"$STAGEB" MYC-20261025-050 > "$T/out" 2>&1; rm -f "$T/ctl/claude_auth_fail_second"
remote_cat "$TD/MYC-20261025-050/events/0003.json" | jq -e '.status == "failed" and .reason == "failed_before_call"' >/dev/null && [[ $(calls) == 0 ]] \
  && ok "sign-in lost between pre-flight and run: failed_before_call, no model call" || { bad "failed_before_call"; cat "$T/out"; }
new_grant; mk_task MYC-20261025-051 claude "x"; allow MYC-20261025-051 claude; touch "$T/ctl/claude_auth_slow"
MYC_CHECK_TIMEOUT=10 "$STAGEB" MYC-20261025-051 > "$T/out" 2>&1; rm -f "$T/ctl/claude_auth_slow"
[[ $(st MYC-20261025-051) == *" completed "* && $(calls) == 1 ]] && ok "a slow sign-in check (3 s) inside the cap completes normally" || { bad "slow auth"; cat "$T/out"; }

echo "4c. v5.1: a terminal on stdin never reaches the CLI (25 Oct rc 124 lesson)"
if command -v script >/dev/null 2>&1; then
  new_grant; mk_task MYC-20261025-052 claude "x"; allow MYC-20261025-052 claude; touch "$T/ctl/claude_tty_strict"
  script -qec "$STAGEB MYC-20261025-052" /dev/null < /dev/null > "$T/out" 2>&1; rm -f "$T/ctl/claude_tty_strict"
  [[ $(st MYC-20261025-052) == *" completed "* && $(calls) == 1 ]] && ok "run from an interactive terminal: checks see no terminal, one call, completed" || { bad "tty"; cat "$T/out"; }
else echo "  SKIP no 'script' command"; fi

echo "5. concurrent writer: a racing claim is rejected, never forced"
new_grant; mk_task MYC-20261025-040 codex "x"; allow MYC-20261025-040 codex
git clone -q --branch "$B" "$T/remote.git" "$T/rival" 2>/dev/null
cat > "$T/hs/repo/.git/hooks/pre-push" <<EOF
#!/usr/bin/env bash
cd "$T/rival" && git pull -q --rebase origin "$B" && echo '{"seq":2,"status":"in_progress","at":"2026-10-25T10:04:00Z","actor":"rival"}' > "$TD/MYC-20261025-040/events/0002.json" && git add -A && git commit -qm rival && git push -q origin "$B"
rm -f "$T/hs/repo/.git/hooks/pre-push"
EOF
chmod +x "$T/hs/repo/.git/hooks/pre-push"; before=$(git --git-dir="$T/remote.git" rev-parse "$B")
"$GATE" claim MYC-20261025-040 > "$T/out" 2>&1; r=$?
[[ $r != 0 ]] && grep -q "push rejected" "$T/out" && [[ -z $(ls "$T/spool" | grep 040) ]] && git --git-dir="$T/remote.git" merge-base --is-ancestor "$before" "$B" \
  && ok "losing claim rejected, nothing written locally, history only moved forward" || { bad "race"; cat "$T/out"; }
[[ $(st MYC-20261025-040) == *QUARANTINE* ]] && ok "the rival's invalid claim quarantines the task (fail closed)" || bad "rival state: $(st MYC-20261025-040)"

echo "6. hub watcher unaffected"
if [[ -x $D/../hubsync/hubsync ]]; then
  HUBSYNC_HOME=$T/hs HUBSYNC_REMOTE=$T/remote.git HUBSYNC_BRANCH=$B "$D/../hubsync/hubsync" poll > "$T/out" 2>&1 \
    && ! grep -q "pushed" "$T/out" && ok "hubsync poll on the shared clone still works and pushes nothing" || { bad "hubsync"; cat "$T/out"; }
fi

echo; echo "stage B tests: $pass passed, $failn failed"; [[ $failn == 0 ]]
