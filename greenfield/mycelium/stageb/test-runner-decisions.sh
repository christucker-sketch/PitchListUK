#!/usr/bin/env bash
# End-to-end offline tests for runner decision output (v6): real myc-stageb -> myc-gate -> myc-agent -> notifier ->
# myc-decide, with FAKE codex/claude CLIs, a LOCAL bare repo, fake curl and a pseudo-terminal for the owner wrapper.
# No network, no GitHub, no model, no email, no root.   bash test-runner-decisions.sh
set -uo pipefail
for c in git jq flock iconv dd timeout awk script; do command -v $c >/dev/null || { echo "runner decision tests: need $c"; exit 1; }; done
D=$(cd "$(dirname "$0")" && pwd); GATE=$D/myc-gate; STAGEB=$D/myc-stageb; AGENTX=$D/myc-agent; DECIDE=$D/myc-decide; MN=$D/../notify/mycnotify
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
pass=0; failn=0
ok()  { echo "  PASS $*"; pass=$((pass + 1)); }
bad() { echo "  FAIL $*"; failn=$((failn + 1)); }
B=findpitches-v3/greenfield; TD=greenfield/mycelium/tasks; MARK='MYCELIUM-DECISION-REQUEST v1'
export GIT_AUTHOR_NAME=chris GIT_AUTHOR_EMAIL=c@x GIT_COMMITTER_NAME=chris GIT_COMMITTER_EMAIL=c@x
git init -q --bare "$T/remote.git"; git clone -q "$T/remote.git" "$T/human" 2>/dev/null
(cd "$T/human" && git checkout -q -b "$B" && mkdir -p team && echo hub > team/README.md && git add -A && git commit -qm init && git push -q origin "$B") 2>/dev/null
mkdir -p "$T/hs" "$T/spool" "$T/myc/bin" "$T/stub" "$T/ctl" "$T/decisions" "$T/cred"; chmod 0755 "$T/decisions"
git clone -q --branch "$B" "$T/remote.git" "$T/hs/repo" 2>/dev/null
printf '#!/usr/bin/env bash\nexec "$@"\n' > "$T/myc/bin/myc-run"
# fake CLIs: same command shapes as the real ones; the final answer text comes from $CTL/answer
cat > "$T/stub/codex" <<'EOF'
#!/usr/bin/env bash
[[ $1 == login ]] && { echo "Logged in using ChatGPT"; exit 0; }
[[ $1 == --version ]] && { echo "codex-cli 0.164.0"; exit 0; }
echo call >> "$CTL/calls"; cat > /dev/null
[[ -f $CTL/transport_fail ]] && { echo "boom" >&2; exit 1; }
out=""; prev=""; for a in "$@"; do [[ $prev == -o ]] && out=$a; prev=$a; done
cat "$CTL/answer" > "$out"
echo '{"type":"turn.completed","usage":{"input_tokens":100,"cached_input_tokens":0,"output_tokens":20}}'
EOF
cat > "$T/stub/claude" <<'EOF'
#!/usr/bin/env bash
[[ $1 == auth ]] && { echo '{"loggedIn":true,"authMethod":"claude.ai","apiProvider":"firstParty"}'; exit 0; }
[[ $1 == --version ]] && { echo "2.1.308 (Claude Code)"; exit 0; }
echo call >> "$CTL/calls"; cat > /dev/null
[[ -f $CTL/transport_fail ]] && { jq -n '{type:"result", is_error:true, result:"API error"}'; exit 0; }
jq -n --rawfile r "$CTL/answer" '{type:"result", is_error:false, result:$r, usage:{input_tokens:5, output_tokens:20, cache_read_input_tokens:0}, modelUsage:{"claude-sonnet-5-5":{}}, total_cost_usd:0.01}'
EOF
cat > "$T/curl" <<'EOF'
#!/usr/bin/env bash
cat > /dev/null; out="" body=""
while [[ $# -gt 0 ]]; do case $1 in -o) out=$2; shift ;; -D) : > "$2"; shift ;; --data-binary) body=${2#@}; shift ;; esac; shift; done
cp "$body" "$CTL/mail_last"; echo x >> "$CTL/mails"
echo '{"data":{"succeeded":1,"failed":0,"email_id":"E-1"}}' > "$out"; printf 200
EOF
chmod +x "$T/myc/bin/myc-run" "$T/stub/"* "$T/curl"
printf 'api-TESTKEY0123456789\n' > "$T/cred/smtp2go-key"
export PATH="$T/stub:$PATH" CTL=$T/ctl MYC_HOME=$T/hs MYC_SPOOL=$T/spool MYC_STATE=$T/state/state.json MYC_TEST=1 \
  MYC_AS_HUBSYNC="env HOME=$T/hs" MYC_AS_MYC="env HOME=$T/myc" MYC_GATE=$GATE MYC_AGENT=$AGENTX MYC_DECISIONS=$T/decisions \
  MYC_GUARD=$T/myc/bin/myc-run MYC_BILLING_CONFIRMED=yes MYC_ALLOW=$T/allowed MYC_MAX_CALLS=50 MYC_WINDOW_S=100000
NOTE=(env MYCNOTIFY_TEST=1 MYCNOTIFY_TEST_CURL="$T/curl" MYCNOTIFY_TEST_CRED="$T/cred" MYCNOTIFY_TEST_DECISIONS="$T/decisions"
  MYCNOTIFY_HOME="$T/mn" MYCNOTIFY_REMOTE="$T/remote.git" MYCNOTIFY_TASKS="$TD")
mk_task() {  # id agent
  (cd "$T/human" && git pull -q --rebase origin "$B" && mkdir -p "$TD/$1/events" \
   && jq -n --arg t "$1" --arg a "$2" --arg rl "$TD/$1/result.md" '{task_id:$t, assigned_agent:$a, instructions:"Read-only test task.", status:"pending", result_location:$rl}' > "$TD/$1/task.json" \
   && jq -n '{seq:1, status:"pending", at:"2026-10-27T09:00:00Z", actor:"chris", reason:"created by Chris"}' > "$TD/$1/events/0001.json" \
   && git add -A && git commit -qm "chris: task $1" && git push -q origin "$B") 2>/dev/null
}
grant1() { echo "$1 $2 $(git --git-dir="$T/remote.git" rev-parse "$B:$TD/$1/task.json")" > "$T/allowed"; rm -f "$MYC_STATE"; }   # a fresh grant for this task only
answer() { printf '%s' "$1" > "$T/ctl/answer"; }
runtask() { grant1 "$1" "$2"; "$STAGEB" "$1" > "$T/out" 2>&1; }
st() { "$GATE" state "$1" 2>/dev/null; }
keyof() { st "$1" | sed -n 's/^  decision key: //p'; }
calls() { [[ -f $T/ctl/calls ]] && wc -l < "$T/ctl/calls" | tr -d ' ' || echo 0; }
mails() { [[ -f $T/ctl/mails ]] && wc -l < "$T/ctl/mails" | tr -d ' ' || echo 0; }
ev() { git --git-dir="$T/remote.git" show "$B:$TD/$1/events/$(printf %04d "$2").json"; }
runid() { ev "$1" 2 | jq -r .run_id; }
outfiles() { (cd "$T/spool/$(runid "$1")/out" && ls -A | grep -v -e '^meta.json$' -e '^started$' | tr '\n' ' '); }
has() { git --git-dir="$T/remote.git" cat-file -e "$B:$1" 2>/dev/null; }

echo "1. ordinary answers still publish results (both providers)"
for a in codex claude; do
  id=MYC-20261027-00$([[ $a == codex ]] && echo 1 || echo 2); mk_task "$id" "$a"; answer $'# Review\n1. one risk\nAll fine.'
  runtask "$id" "$a"
  [[ $(st "$id") == "$id completed seq=3"* && $(outfiles "$id") == "result.md " ]] && has "$TD/$id/result.md" \
    && [[ $(git --git-dir="$T/remote.git" show "$B:$TD/$id/result.md") == $'# Review\n1. one risk\nAll fine.' ]] \
    && ok "$a: ordinary answer -> result.md only -> completed (legacy path unchanged)" || { bad "$a result"; cat "$T/out"; }
done

echo "2. the exact two-line envelope becomes a decision request (both providers)"
for a in codex claude; do
  id=MYC-20261027-01$([[ $a == codex ]] && echo 1 || echo 2); mk_task "$id" "$a"
  answer $'\n'"$MARK"$'\r\nPublish the 12 new Kent listings today?\n\n'; c0=$(calls); runtask "$id" "$a"
  [[ $(st "$id") == "$id awaiting_approval seq=3"* && $(outfiles "$id") == "decision.md " && $(calls) == $((c0 + 1)) ]] && ! has "$TD/$id/result.md" \
    && ev "$id" 3 | jq -e --arg r "$(runid "$id")" '.actor == "hubsync-gate" and .run_id == $r and .reason == "Publish the 12 new Kent listings today?"' >/dev/null \
    && ok "$a: envelope -> decision.md only -> awaiting_approval bound to its run (one call)" || { bad "$a decision"; cat "$T/out"; st "$id"; }
done

echo "3. notification: exactly that decision, dry run, then one pinned fake send, no duplicate"
k=$(keyof MYC-20261027-011)
o=$("${NOTE[@]}" "$MN" decisions 2>&1)
grep -qx "$k  ledger=none" <<<"$o" && grep -qx "$(keyof MYC-20261027-012)  ledger=none" <<<"$o" && ! grep -q quarantined <<<"$o" \
  && ok "notifier lists both requests with the gate's keys; nothing quarantined" || { bad "notifier list"; echo "$o"; }
printf 'SENDER=notify@findpitches.com\nRECIPIENT=chris@example.invalid\nMODE=dry-run\nPIN=\n' > "$T/cred/notify.conf"
"${NOTE[@]}" "$MN" poll >/dev/null 2>&1; [[ $(mails) == 0 && -f $T/mn/dryrun/$k.json ]] && ok "dry run: would-notify recorded, no send" || bad "dry run"
"${NOTE[@]}" "$MN" baseline >/dev/null 2>&1; rm -f "$T/mn/ledger/$k.json"   # outstanding before the pin: only $k is re-admitted
printf 'SENDER=notify@findpitches.com\nRECIPIENT=chris@example.invalid\nMODE=live\nPIN=%s\n' "$k" > "$T/cred/notify.conf"
"${NOTE[@]}" "$MN" poll >/dev/null 2>&1; "${NOTE[@]}" "$MN" poll >/dev/null 2>&1
[[ $(mails) == 1 ]] && jq -e --arg k "$k" '.text_body | contains("sudo myc-decide " + $k + " approve") and contains("does NOT approve")' "$T/ctl/mail_last" >/dev/null \
  && ok "pinned: exactly one notice naming the decide command; rerun sends nothing" || { bad "pinned send ($(mails))"; cat "$T/mn/status.json"; }

echo "4. the owner records approve (codex task) and reject (claude task); resting states only"
c0=$(calls)
printf 'MYC-20261027-011\n' | SUDO_USER=ct_admin script -qec "$DECIDE $k approve 'go ahead'" /dev/null > "$T/o" 2>&1
[[ $(st MYC-20261027-011) == "MYC-20261027-011 approved seq=4"* ]] && jq -e '.status == "approved" and .reason == "go ahead"' "$T/decisions/$k.json" >/dev/null \
  && ok "approve: owner record written, matching decision published and validated" || { bad "approve"; cat "$T/o"; }
k2=$(keyof MYC-20261027-012)
printf 'MYC-20261027-012\n' | SUDO_USER=ct_admin script -qec "$DECIDE $k2 reject" /dev/null > "$T/o" 2>&1
[[ $(st MYC-20261027-012) == "MYC-20261027-012 rejected seq=4"* ]] && ok "reject: recorded, terminal" || { bad "reject"; cat "$T/o"; }
runtask MYC-20261027-011 codex; r1=$?; runtask MYC-20261027-012 claude; r2=$?
[[ $r1 != 0 && $r2 != 0 && $(calls) == "$c0" ]] && grep -q 'only a pending task can be claimed' "$T/out" \
  && ok "approved/rejected tasks: no claim, no resume, no second model call" || { bad "resting"; cat "$T/out"; }
o=$("${NOTE[@]}" "$MN" decisions 2>&1); [[ -z $o ]] && ok "notifier: nothing outstanding after the decisions" || { bad "after decide"; echo "$o"; }

echo "5. forged or missing owner records never count"
mk_task MYC-20261027-021 codex; answer "$MARK"$'\nForge test?'; runtask MYC-20261027-021 codex; k3=$(keyof MYC-20261027-021)
"$GATE" decide "$k3" >/dev/null 2>"$T/e"; grep -q 'no owner record' "$T/e" && [[ $(st MYC-20261027-021) == *awaiting_approval* ]] && ok "decide without an owner record: refused" || bad "no record"
pe=$(git --git-dir="$T/remote.git" rev-parse "$B:$TD/MYC-20261027-021/events/0003.json"); db=$(git --git-dir="$T/remote.git" rev-parse "$B:$TD/MYC-20261027-021/task.json")
(cd "$T/human" && git pull -q --rebase origin "$B" && jq -nc --arg pe "$pe" --arg db "$db" '{seq:4,status:"approved",at:"2026-10-27T09:10:00Z",actor:"chris",reason:"ok",prev_event:$pe,descriptor_blob:$db,decided_via:"fpd-prod:sudo:ct_admin"}' \
  > "$TD/MYC-20261027-021/events/0004.json" && git add -A && git commit -qm forged && git push -q origin "$B") 2>/dev/null
[[ $(st MYC-20261027-021) == *"QUARANTINE: decision event 4 is not confirmed by an owner record"* ]] && "${NOTE[@]}" "$MN" decisions 2>&1 | grep -q 'MYC-20261027-021.*owner record' \
  && ok "approval pushed through the repo without an owner record: quarantined by writer and notifier" || { bad "forgery"; st MYC-20261027-021; }

echo "6. malformed or ambiguous answers fail closed (no output file published)"
i=30
for case in empty_summary extra_line other_version marker_in_result marker_twice; do
  i=$((i + 1)); id=MYC-20261027-0$i; mk_task "$id" codex
  case $case in
    empty_summary)    answer "$MARK"$'\n   \n' ;;
    extra_line)       answer "$MARK"$'\nQuestion?\nAnd some notes.' ;;
    other_version)    answer $'MYCELIUM-DECISION-REQUEST v2\nQuestion?' ;;
    marker_in_result) answer $'# Review\nAll fine.\n'"$MARK"$'\nQuestion?' ;;
    marker_twice)     answer "$MARK"$'\n'"$MARK" ;;
  esac
  runtask "$id" codex
  ev "$id" 3 | jq -e '.status == "failed" and .reason == "runner_failed"' >/dev/null && [[ -z $(outfiles "$id") ]] && ! has "$TD/$id/result.md" \
    && ok "$case -> failed (runner_failed), no result.md or decision.md" || { bad "$case -> $(ev "$id" 3 | jq -c '{status,reason}') files: $(outfiles "$id")"; }
done
for case in long ctrl secret; do
  i=$((i + 1)); id=MYC-20261027-0$i; mk_task "$id" claude
  case $case in
    long)   answer "$MARK"$'\n'"$(head -c 401 /dev/zero | tr '\0' a)" ;;
    ctrl)   answer "$MARK"$'\nQuestion\x07?' ;;
    secret) answer "$MARK"$'\nUse token ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123?' ;;
  esac
  runtask "$id" claude
  ev "$id" 3 | jq -e '.status == "failed" and .reason == "decision_rejected"' >/dev/null && ! has "$TD/$id/result.md" \
    && ok "$case summary -> runner wrote decision.md only; the gate (final validator) records decision_rejected" || bad "$case -> $(ev "$id" 3 | jq -c '{status,reason}')"
done
for a in codex claude; do
  i=$((i + 1)); id=MYC-20261027-0$i; mk_task "$id" "$a"; answer "$MARK"$'\nQuestion?'; touch "$T/ctl/transport_fail"; runtask "$id" "$a"; rm -f "$T/ctl/transport_fail"
  ev "$id" 3 | jq -e '.status == "failed" and .reason == "runner_failed"' >/dev/null && [[ -z $(outfiles "$id") ]] \
    && ok "$a transport error -> failed (runner_failed), nothing written" || bad "$a transport -> $(ev "$id" 3 | jq -c '{status,reason}')"
done

echo "7. replays cannot duplicate a call, a decision request or a notice"
c0=$(calls); r=$(runid MYC-20261027-011)
"$AGENTX" "$r" > "$T/o" 2>&1; grep -q 'already started once' "$T/o" && [[ $(calls) == "$c0" ]] && ok "re-running the runner on a finished run: no second call" || { bad "runner replay"; cat "$T/o"; }
n=$(git --git-dir="$T/remote.git" rev-list --count "$B")
"$GATE" complete "$(runid MYC-20261027-012)" > "$T/o" 2>&1; [[ $(git --git-dir="$T/remote.git" rev-list --count "$B") == "$n" ]] && grep -q 'already recorded' "$T/o" \
  && ok "re-running complete after a decision: nothing more published" || { bad "complete replay"; cat "$T/o"; }
m0=$(mails); "${NOTE[@]}" "$MN" poll >/dev/null 2>&1; [[ $(mails) == "$m0" ]] && ok "notifier rerun: no further mail" || bad "mail replay"

echo; echo "runner decision tests: $pass passed, $failn failed"; [[ $failn == 0 ]]
