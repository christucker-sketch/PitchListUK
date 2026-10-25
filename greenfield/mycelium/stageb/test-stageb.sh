#!/usr/bin/env bash
# Offline tests for Stage B (myc-gate / myc-agent / myc-stageb) against a LOCAL bare repo with FAKE codex/claude.
# No network, no GitHub, no model calls, no root.   bash test-stageb.sh
set -uo pipefail
for c in git jq flock iconv dd; do command -v $c >/dev/null || { echo "stage B tests: need $c"; exit 1; }; done
D=$(cd "$(dirname "$0")" && pwd)
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
pass=0; failn=0
ok()  { echo "  PASS $*"; pass=$((pass + 1)); }
bad() { echo "  FAIL $*"; failn=$((failn + 1)); }
B=findpitches-v3/greenfield; TD=greenfield/mycelium/tasks
export GIT_AUTHOR_NAME=chris GIT_AUTHOR_EMAIL=c@x GIT_COMMITTER_NAME=chris GIT_COMMITTER_EMAIL=c@x
git init -q --bare "$T/remote.git"
git clone -q "$T/remote.git" "$T/human" 2>/dev/null
(cd "$T/human" && git checkout -q -b "$B" && mkdir -p team && echo hub > team/README.md && git add -A && git commit -qm init && git push -q origin "$B")
mkdir -p "$T/hs" "$T/spool" "$T/myc/bin" "$T/stub" "$T/ctl"
git clone -q --branch "$B" "$T/remote.git" "$T/hs/repo" 2>/dev/null
# fake guard + fake CLIs (behaviour from $T/ctl)
printf '#!/usr/bin/env bash\nexec "$@"\n' > "$T/myc/bin/myc-run"
cat > "$T/stub/codex" <<'EOF'
#!/usr/bin/env bash
[[ $1 == login ]] && { echo "Logged in using ChatGPT"; exit 0; }
[[ $1 == --version ]] && { echo "codex-cli 0.164.0"; exit 0; }
[[ -f $CTL/codex_fail ]] && { echo "boom" >&2; exit 1; }
out=""; prev=""; for a in "$@"; do [[ $prev == -o ]] && out=$a; prev=$a; done
p=$(cat); printf '# Codex review\n1. risk one\n2. risk two\nsaw-instructions: %s\n' "$(grep -c 'Task' <<<"$p")" > "$out"
[[ -f $CTL/codex_secret ]] && echo "token ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123" >> "$out"
echo '{"type":"turn.completed","usage":{"input_tokens":14000,"cached_input_tokens":12000,"output_tokens":90}}'
EOF
cat > "$T/stub/claude" <<'EOF'
#!/usr/bin/env bash
[[ $1 == auth ]] && { echo '{"loggedIn":true,"authMethod":"claude.ai","apiProvider":"firstParty"}'; exit 0; }
[[ $1 == --version ]] && { echo "2.1.308 (Claude Code)"; exit 0; }
printf '%s\n' "$@" > $CTL/claude_argv
p=$(cat); ref=$(grep -A2 '^## Reference: ' <<<"$p" | sed -n 3p)
jq -n --arg r "# Claude review
agree with: $ref" '{type:"result",is_error:false,result:$r,usage:{input_tokens:5,output_tokens:200,cache_read_input_tokens:0},modelUsage:{"claude-sonnet-5-5":{}},total_cost_usd:0.01}'
EOF
chmod +x "$T/myc/bin/myc-run" "$T/stub/"*
export PATH="$T/stub:$PATH" CTL=$T/ctl MYC_HOME=$T/hs MYC_SPOOL=$T/spool MYC_STATE=$T/state/state.json MYC_TEST=1 \
  MYC_AS_HUBSYNC="env HOME=$T/hs" MYC_AS_MYC="env HOME=$T/myc" MYC_GATE=$D/myc-gate MYC_AGENT=$D/myc-agent \
  MYC_GUARD=$T/myc/bin/myc-run MYC_BILLING_CONFIRMED=yes MYC_ALLOW=$T/allowed
: > "$T/allowed"
GATE=$D/myc-gate; STAGEB=$D/myc-stageb

mk_task() {  # id agent instructions [jq-filter applied to task.json] [actor of event 1]
  (cd "$T/human" && git pull -q --rebase origin "$B" && mkdir -p "$TD/$1/events" \
   && jq -n --arg t "$1" --arg a "$2" --arg i "$3" --arg rl "$TD/$1/result.md" \
        '{task_id:$t, assigned_agent:$a, instructions:$i, status:"pending", result_location:$rl}' | jq "${4:-.}" > "$TD/$1/task.json" \
   && jq -n --arg who "${5:-chris}" '{seq:1, status:"pending", at:"2026-10-25T10:00:00Z", actor:$who, reason:"created by Chris"}' > "$TD/$1/events/0001.json" \
   && git add -A && git commit -qm "chris: task $1" && git push -q origin "$B")
}
allow() { echo "$1 $2 $(git --git-dir="$T/remote.git" rev-parse "$B:$TD/$1/task.json")" >> "$T/allowed"; }
remote_has() { git --git-dir="$T/remote.git" cat-file -e "$B:$1" 2>/dev/null; }
remote_cat() { git --git-dir="$T/remote.git" show "$B:$1"; }
st() { "$GATE" state "$1" 2>/dev/null; }
reset_caps() { rm -f "$MYC_STATE"; }

echo "1. the two-task Stage B exchange (Codex -> Claude via GitHub)"
mk_task MYC-20261025-001 codex $'Read-only review of the hub watcher. List at most 3 risks.\nref: greenfield/mycelium/hubsync/hubsync'
(cd "$T/human" && mkdir -p greenfield/mycelium/hubsync && echo '#!/bin/sh # watcher' > greenfield/mycelium/hubsync/hubsync && git add -A && git commit -qm ref && git push -q origin "$B")
mk_task MYC-20261025-002 claude $'Read the Codex review and say which risks you agree with.\nref: greenfield/mycelium/tasks/MYC-20261025-001/result.md'
allow MYC-20261025-002 claude
"$STAGEB" MYC-20261025-001 > "$T/out" 2>&1; [[ $? != 0 ]] && grep -q "not in the Stage B allowlist" "$T/out" && [[ $(jq .calls "$MYC_STATE") == 0 ]] \
  && ok "task not in Chris's pinned allowlist is refused; no call used" || { bad "allowlist"; cat "$T/out"; }
allow MYC-20261025-001 codex
[[ $(st MYC-20261025-001) == *" pending seq=1"* ]] && ok "task 1 validates as pending" || bad "task 1 state: $(st MYC-20261025-001)"
"$STAGEB" MYC-20261025-002 > "$T/out" 2>&1; [[ $? != 0 ]] && grep -q "not completed" "$T/out" && [[ $(jq .calls "$MYC_STATE") == 0 ]] \
  && ok "task 2 refused before task 1 is completed; no call used" || { bad "task 2 early"; cat "$T/out"; }
"$STAGEB" MYC-20261025-001 > "$T/out" 2>&1
[[ $(st MYC-20261025-001) == *" completed seq=3"* ]] && remote_has "$TD/MYC-20261025-001/result.md" && ok "task 1 completed via claim -> call -> record" || { bad "task 1 run"; cat "$T/out"; }
h1=$(remote_cat "$TD/MYC-20261025-001/result.md" | sha256sum | cut -c1-64)
[[ $(remote_cat "$TD/MYC-20261025-001/events/0003.json" | jq -r .output_sha256) == "$h1" ]] && ok "completion event pins the result sha256" || bad "sha"
remote_cat "$TD/MYC-20261025-001/events/0003.json" | jq -e '.usage.input_tokens == 14000 and .usage.cached_input_tokens == 12000' >/dev/null && ok "usage recorded" || bad "usage"
"$STAGEB" MYC-20261025-002 > "$T/out" 2>&1
[[ $(st MYC-20261025-002) == *" completed "* ]] && remote_cat "$TD/MYC-20261025-002/result.md" | grep -q "agree with: # Codex review" \
  && ok "task 2 (Claude) read task 1's result from GitHub, no relay" || { bad "task 2 run"; cat "$T/out"; }
remote_cat "$TD/MYC-20261025-002/events/0003.json" | jq -e '.usage.api_equivalent_usd_not_billed == 0.01' >/dev/null && ok "API-equivalent estimate labelled not billed" || bad "estimate label"
grep -qx -- '--settings' $T/ctl/claude_argv && grep -qx -- '--strict-mcp-config' $T/ctl/claude_argv && ! grep -q -- '--fallback-model' $T/ctl/claude_argv \
  && ok "Claude ran with the no-retry settings file, no MCP, no fallback model" || bad "claude flags"
remote_cat "$TD/MYC-20261025-001/events/0003.json" | jq -e '.usage.cli_version == "codex-cli 0.164.0"' >/dev/null && ok "CLI version recorded" || bad "version"
"$GATE" complete "$(remote_cat "$TD/MYC-20261025-001/events/0002.json" | jq -r .run_id)" > "$T/out" 2>&1; grep -q "already recorded" "$T/out" \
  && ok "re-running complete after success changes nothing (no second publish)" || { bad "complete rerun"; cat "$T/out"; }
"$STAGEB" MYC-20261025-001 > "$T/out" 2>&1; grep -q "call cap reached" "$T/out" && ok "third call refused by the 2-call cap" || { bad "cap"; cat "$T/out"; }
reset_caps; "$STAGEB" MYC-20261025-001 > "$T/out" 2>&1; [[ $? != 0 ]] && grep -q "only a pending task can be claimed" "$T/out" && [[ $(jq .calls "$MYC_STATE") == 0 ]] \
  && ok "completed task cannot be replayed; no call used" || { bad "replay"; cat "$T/out"; }
for f in $(git --git-dir="$T/remote.git" diff --name-only "$B~4" "$B" | grep -v '^greenfield/mycelium/tasks/MYC-2026102[5]-00[12]/'); do bad "unexpected path pushed: $f"; done
ok "writer pushed only task events/results"

echo "2. strict validation quarantines bad tasks"
mk_task MYC-20261025-010 codex "x" '. + {requires_approval:false}'
[[ $(st MYC-20261025-010) == *QUARANTINE*five-field* ]] && ok "extra field (self-permission) quarantined" || bad "extra field: $(st MYC-20261025-010)"
mk_task MYC-20261025-011 codex "x"; (cd "$T/human" && printf '{"task_id":"MYC-20261025-011","task_id":"MYC-20261025-011","assigned_agent":"codex","instructions":"x","status":"pending","result_location":"%s/MYC-20261025-011/result.md"}\n' "$TD" > "$TD/MYC-20261025-011/task.json" && git commit -qam dup && git push -q origin "$B")
[[ $(st MYC-20261025-011) == *QUARANTINE*strict* ]] && ok "duplicate JSON key quarantined" || bad "dup key: $(st MYC-20261025-011)"
mk_task MYC-20261025-012 codex "x" '.' mallory
[[ $(st MYC-20261025-012) == *QUARANTINE*chris* ]] && ok "event 1 not by chris quarantined" || bad "actor: $(st MYC-20261025-012)"
mk_task MYC-20261025-013 codex "x"; (cd "$T/human" && echo '{"seq":3,"status":"completed","at":"x","actor":"x"}' > "$TD/MYC-20261025-013/events/0003.json" && git add -A && git commit -qm gap && git push -q origin "$B")
[[ $(st MYC-20261025-013) == *QUARANTINE*gap* ]] && ok "gapped history quarantined" || bad "gap: $(st MYC-20261025-013)"
mk_task MYC-20261025-014 codex "x"; (cd "$T/human" && echo '{"seq":2,"status":"approved","at":"x","actor":"chris"}' > "$TD/MYC-20261025-014/events/0002.json" && git add -A && git commit -qm appr && git push -q origin "$B")
[[ $(st MYC-20261025-014) == *QUARANTINE*not\ allowed* ]] && ok "approval transitions not accepted in Stage B" || bad "approval: $(st MYC-20261025-014)"
mk_task MYC-20261025-015 codex "x"; allow MYC-20261025-015 codex; (cd "$T/human" && echo '{"seq":2,"status":"cancelled","at":"x","actor":"chris"}' > "$TD/MYC-20261025-015/events/0002.json" && git add -A && git commit -qm cancel && git push -q origin "$B")
reset_caps; "$STAGEB" MYC-20261025-015 > "$T/out" 2>&1; [[ $? != 0 && $(jq .calls "$MYC_STATE") == 0 ]] && [[ $(st MYC-20261025-015) == *QUARANTINE* ]] \
  && ok "a cancel by Chris stops the task (fail closed, never run)" || { bad "cancel"; cat "$T/out"; }
reset_caps; "$STAGEB" MYC-20261025-010 > "$T/out" 2>&1; [[ $? != 0 && $(jq .calls "$MYC_STATE") == 0 ]] && ok "quarantined task cannot be run" || bad "run quarantined"

echo "3. failures are recorded once and stop further calls"
mk_task MYC-20261025-020 codex "x"; allow MYC-20261025-020 codex; touch "$T/ctl/codex_fail"; reset_caps
"$STAGEB" MYC-20261025-020 > "$T/out" 2>&1; rm -f "$T/ctl/codex_fail"
[[ $(st MYC-20261025-020) == *" failed "* ]] && remote_cat "$TD/MYC-20261025-020/events/0003.json" | jq -e '.reason|test("codex call failed")' >/dev/null \
  && ok "failed call recorded as failed (no retry)" || { bad "fail record"; cat "$T/out"; }
mk_task MYC-20261025-021 codex "x"; allow MYC-20261025-021 codex; "$STAGEB" MYC-20261025-021 > "$T/out" 2>&1
grep -q "earlier Stage B call failed" "$T/out" && ok "after a failure, the next call is refused until Chris decides" || { bad "post-failure"; cat "$T/out"; }
reset_caps; touch "$T/ctl/codex_secret"; "$STAGEB" MYC-20261025-021 > "$T/out" 2>&1; rm -f "$T/ctl/codex_secret"
[[ $(st MYC-20261025-021) == *" failed "* ]] && ! remote_has "$TD/MYC-20261025-021/result.md" && ok "result containing a credential pattern is not published" || { bad "secret"; cat "$T/out"; }

echo "4. uncertain outcomes, symlinks, leases"
mk_task MYC-20261025-030 codex "x"; allow MYC-20261025-030 codex; reset_caps
printf '#!/usr/bin/env bash\ntouch "$MYC_SPOOL/$1/out/started"; exit 9\n' > "$T/agent-crash"; chmod +x "$T/agent-crash"
MYC_AGENT=$T/agent-crash "$STAGEB" MYC-20261025-030 > "$T/out" 2>&1
remote_cat "$TD/MYC-20261025-030/events/0003.json" | jq -e '.status == "failed" and (.reason|test("UNCERTAIN"))' >/dev/null && ok "crash after start recorded as UNCERTAIN, not retried" || { bad "uncertain"; cat "$T/out"; }
mk_task MYC-20261025-031 codex "x"; allow MYC-20261025-031 codex; reset_caps; echo "PRIVATE KEY MATERIAL" > "$T/hs/secret"
printf '#!/usr/bin/env bash\nO=$MYC_SPOOL/$1/out; ln -s %q "$O/result.md"; echo "{\\"ok\\":true,\\"agent\\":\\"codex\\",\\"seconds\\":1}" > "$O/meta.json"\n' "$T/hs/secret" > "$T/agent-link"; chmod +x "$T/agent-link"
MYC_AGENT=$T/agent-link "$STAGEB" MYC-20261025-031 > "$T/out" 2>&1
! remote_has "$TD/MYC-20261025-031/result.md" && ! git --git-dir="$T/remote.git" log -p "$B" | grep -q "PRIVATE KEY MATERIAL" && ok "symlinked result.md rejected; private file never published" || { bad "symlink"; cat "$T/out"; }
mk_task MYC-20261025-032 codex "x"; allow MYC-20261025-032 codex; run=$(MYC_LEASE_MIN=0 "$GATE" claim MYC-20261025-032 2>/dev/null); sleep 1
"$D/myc-agent" "$run" >/dev/null 2>&1; [[ -f $T/spool/$run/out/started ]] && bad "agent started on an expired lease" || ok "agent refuses to call the model on an expired lease"
c=$("$GATE" expire MYC-20261025-032 2>/dev/null); [[ $(st MYC-20261025-032) == *" failed "* ]] && ok "expire marks failed (uncertain, held for Chris)" || bad "expire"
"$GATE" complete "$run" > "$T/out" 2>&1; grep -q "already recorded" "$T/out" && ok "late completion after expiry changes nothing" || { bad "late"; cat "$T/out"; }

echo "5. concurrent writer: a racing claim is rejected, never forced"
mk_task MYC-20261025-040 codex "x"; allow MYC-20261025-040 codex
git clone -q --branch "$B" "$T/remote.git" "$T/rival" 2>/dev/null
cat > "$T/hs/repo/.git/hooks/pre-push" <<EOF
#!/usr/bin/env bash
cd "$T/rival" && git pull -q --rebase origin "$B" && echo '{"seq":2,"status":"in_progress","at":"x","actor":"rival"}' > "$TD/MYC-20261025-040/events/0002.json" && git add -A && git commit -qm rival && git push -q origin "$B"
rm -f "$T/hs/repo/.git/hooks/pre-push"
EOF
chmod +x "$T/hs/repo/.git/hooks/pre-push"; before=$(git --git-dir="$T/remote.git" rev-parse "$B")
"$GATE" claim MYC-20261025-040 > "$T/out" 2>&1; r=$?
[[ $r != 0 ]] && grep -q "push rejected" "$T/out" && [[ -z $(ls "$T/spool" | grep 040) ]] && git --git-dir="$T/remote.git" merge-base --is-ancestor "$before" "$B" \
  && ok "losing claim rejected, no job packet written, history only moved forward" || { bad "race"; cat "$T/out"; }
[[ $(st MYC-20261025-040) == *QUARANTINE* ]] && ok "the rival's invalid claim quarantines the task (fail closed)" || bad "rival state: $(st MYC-20261025-040)"

echo "6. hub watcher unaffected"
if [[ -x $D/../hubsync/hubsync ]]; then
  HUBSYNC_HOME=$T/hs HUBSYNC_REMOTE=$T/remote.git HUBSYNC_BRANCH=$B "$D/../hubsync/hubsync" poll > "$T/out" 2>&1 \
    && ! grep -q "pushed" "$T/out" && ok "hubsync poll on the shared clone still works and pushes nothing" || { bad "hubsync"; cat "$T/out"; }
fi

echo; echo "stage B tests: $pass passed, $failn failed"; [[ $failn == 0 ]]
