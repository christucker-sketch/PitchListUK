#!/usr/bin/env bash
# Offline tests for mycnotify: LOCAL bare repo, FAKE curl, fake clock. No network, no GitHub, no email, no root.
#   bash test-mycnotify.sh
set -uo pipefail
command -v git >/dev/null && command -v jq >/dev/null && command -v flock >/dev/null || { echo "need git, jq, flock"; exit 1; }
MN=$(cd "$(dirname "$0")" && pwd)/mycnotify
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
pass=0; failn=0
ok()  { echo "  PASS $*"; pass=$((pass + 1)); }
bad() { echo "  FAIL $*"; failn=$((failn + 1)); }
B=findpitches-v3/greenfield TD=greenfield/mycelium/notify-test/tasks KEY=api-TESTKEY0123456789
mkdir -p "$T/decisions"; chmod 0755 "$T/decisions"
export MYCNOTIFY_TEST=1 MYCNOTIFY_HOME=$T/home MYCNOTIFY_REMOTE=$T/remote.git MYCNOTIFY_BRANCH=$B MYCNOTIFY_TASKS=$TD MYCNOTIFY_TEST_DECISIONS=$T/decisions
export MYCNOTIFY_MAX_DAY=50 MYCNOTIFY_TEST_CURL=$T/curl MYCNOTIFY_TEST_CRED=$T/cred MYCNOTIFY_TEST_NOW=1793000000 FT=$T
export GIT_AUTHOR_NAME=human GIT_AUTHOR_EMAIL=h@x GIT_COMMITTER_NAME=human GIT_COMMITTER_EMAIL=h@x

# fake curl: behaviour from $FT/mode; logs argv and stdin; never touches the network
cat > "$T/curl" <<'EOF'
#!/usr/bin/env bash
echo "$*" >> "$FT/argv"; cat > "$FT/stdin_last"; cat "$FT/stdin_last" >> "$FT/stdin_all"
out="" hdr="" body=""
while [[ $# -gt 0 ]]; do case $1 in -o) out=$2; shift ;; -D) hdr=$2; shift ;; --data-binary) body=${2#@}; shift ;; esac; shift; done
cp "$body" "$FT/body_last"; echo x >> "$FT/calls"; : > "$hdr"
case $(cat "$FT/mode") in
  ok)       echo '{"data":{"succeeded":1,"failed":0,"email_id":"E-1"}}' > "$out"; printf 200 ;;
  refused)  echo '{"data":{"succeeded":0,"failed":1,"failures":["sender not allowed"]}}' > "$out"; printf 200 ;;
  connfail) printf 000; exit 7 ;;
  timeout)  printf 000; exit 28 ;;
  5xx)      echo '{}' > "$out"; printf 503 ;;
  429)      printf 'Retry-After: 300\r\n' > "$hdr"; echo '{}' > "$out"; printf 429 ;;
  401)      echo '{}' > "$out"; printf 401 ;;
esac
EOF
chmod +x "$T/curl"
mkdir -p "$T/cred"; printf '%s\n' "$KEY" > "$T/cred/smtp2go-key"
conf() {  # mode [pin] [sender]
  printf 'SENDER=%s\nRECIPIENT=chris@example.invalid\nMODE=%s\nPIN=%s\n' "${3:-notify@findpitches.com}" "$1" "${2:-}" > "$T/cred/notify.conf"
}
mode() { echo "$1" > "$T/mode"; }
calls() { [[ -f $T/calls ]] && wc -l < "$T/calls" || echo 0; }
run() { "$MN" poll > "$T/out" 2>&1; echo $?; }
st() { jq -r ".$1" "$T/home/status.json"; }
rec() { jq -r ".state" "$T/home/ledger/$1"*.json 2>/dev/null | head -1; }

git init -q --bare "$T/remote.git"; git clone -q "$T/remote.git" "$T/human" 2>/dev/null
cd "$T/human"; git checkout -q -b "$B"; echo hub > README.md; git add -A; git commit -qm init; git push -q origin "$B"
push() { git add -A -- . ':!*/.run' && git commit -qm "human: $1" && git push -q origin "$B"; }
mk() {  # id agent  -> descriptor + event 1 (pending by chris)
  mkdir -p "$TD/$1/events"
  jq -n --arg id "$1" --arg a "${2:-claude}" '{task_id:$id, assigned_agent:$a, instructions:"test", status:"pending",
    result_location:("greenfield/mycelium/notify-test/tasks/" + $id + "/result.md")}' > "$TD/$1/task.json"
  ev "$1" pending chris "created"
}
ev() {  # id status actor reason  -- every event is written exactly as myc-gate / myc-decide write it
  local n pe db x='{}' k; n=$(( $(ls "$TD/$1/events" | wc -l) + 1 ))
  pe=$([[ $n -gt 1 ]] && git hash-object "$TD/$1/events/$(printf %04d $((n - 1))).json" || true); db=$(git hash-object "$TD/$1/task.json")
  case $2 in
    in_progress) echo "$1-r$(date +%s)-$(printf %08x $((RANDOM * 100 + n)))" > "$TD/$1/.run"
                 x=$(jq -nc --arg pe "$pe" --arg db "$db" --arg r "$(cat "$TD/$1/.run")" --arg a "hubsync-gate for $(jq -r .assigned_agent "$TD/$1/task.json")" \
                     '{actor:$a, prev_event:$pe, descriptor_blob:$db, run_id:$r, lease_until:"2026-10-25T20:00:00Z"}') ;;
    awaiting_approval) x=$(jq -nc --arg pe "$pe" --arg r "$(cat "$TD/$1/.run" 2>/dev/null)" '{actor:"hubsync-gate", prev_event:$pe, run_id:$r}') ;;
    approved|rejected) x=$(jq -nc --arg pe "$pe" --arg db "$db" '{actor:"chris", prev_event:$pe, descriptor_blob:$db, decided_via:"fpd-prod:sudo:ct_admin"}')
                       k="$1-$(printf %04d $((n - 1)))-${pe:0:12}"   # the owner record myc-decide would have written as root
                       jq -nc --arg k "$k" --arg s "$2" --arg r "$4" --arg pe "$pe" --arg db "$db" \
                         '{key:$k, status:$s, reason:$r, decided_via:"fpd-prod:sudo:ct_admin", prev_event:$pe, descriptor_blob:$db, recorded_at:"x"}' > "$T/decisions/$k.json" ;;
  esac
  jq -n --argjson n "$n" --arg s "$2" --arg a "$3" --arg r "$4" --argjson x "$x" '{seq:$n, status:$s, at:"2026-10-25T19:00:00Z", actor:$a, reason:$r} + $x' \
    > "$TD/$1/events/$(printf %04d "$n").json"
}
awaiting() { mk "$1"; ev "$1" in_progress hubsync-gate claim; ev "$1" awaiting_approval hubsync-gate "${2-Approve publishing the test listing?}"; }
keyof() {  # key of the task's latest event, as mycnotify computes it
  local n; n=$(ls "$TD/$1/events" | wc -l)
  echo "$1-$(printf %04d "$n")-$(git rev-parse "HEAD:$TD/$1/events/$(printf %04d "$n").json" | cut -c1-12)"
}
live() { conf live "$(keyof "$1")"; }   # live, pinned to this task's current decision

echo "1. dry run (default): candidates logged, curl never called"
awaiting MYC-20261025-901; push t901; conf dry-run; mode ok
r=$(run); [[ $r == 0 && $(calls) == 0 && $(st mode) == dry-run && -f $T/home/dryrun/$(keyof MYC-20261025-901).json ]] \
  && ok "dry run records 'would notify', no mail call" || { bad "dry run"; cat "$T/out"; }

echo "2. live refusals: no PIN, then no baseline"
conf live; r=$(run)
[[ $r != 0 && $(calls) == 0 ]] && grep -q 'PIN=' "$T/home/status.json" && ok "live without a PIN is refused" || { bad "unpinned live"; cat "$T/out"; }
live MYC-20261025-901; r=$(run)
[[ $r != 0 && $(calls) == 0 ]] && grep -q 'baseline' "$T/home/status.json" && ok "no send until the ledger is initialised" || { bad "live before baseline"; cat "$T/out"; }

echo "3. baseline suppresses decisions already outstanding (even if pinned)"
"$MN" baseline > "$T/out" 2>&1; r=$(run)
[[ $(calls) == 0 && $(rec MYC-20261025-901) == baseline ]] && ok "901 baselined, not mailed" || { bad "baseline"; cat "$T/out"; }

echo "4. the pinned decision -> exactly one email with the required content"
awaiting MYC-20261025-902; push t902; live MYC-20261025-902; r=$(run)
b=$T/body_last
[[ $r == 0 && $(calls) == 1 && $(rec MYC-20261025-902) == accepted ]] && jq -e '.to == ["chris@example.invalid"] and .sender == "notify@findpitches.com"
  and (.subject | contains("MYC-20261025-902")) and (.text_body | contains("does NOT approve")) and (.text_body | contains("/notify-test/tasks/MYC-20261025-902"))
  and (.text_body | contains("Approve publishing the test listing?")) and (.text_body | contains("sudo myc-decide MYC-20261025-902-0003-"))' "$b" >/dev/null && ok "one accepted notice: task id, summary, review link, 'reply is NOT approval'" || { bad "first notice"; cat "$T/out"; }
! grep -q "$KEY" "$T/argv" "$b" && grep -q "$KEY" "$T/stdin_last" && ok "API key only on curl stdin: never in argv or body" || bad "key exposure"

echo "5. R1: one-notice gate: repeated manual runs send nothing else, even with other decisions outstanding"
awaiting MYC-20261025-903; awaiting MYC-20261025-904; push others; run >/dev/null; run >/dev/null; run >/dev/null
[[ $(calls) == 1 && -z $(rec MYC-20261025-903) && -z $(rec MYC-20261025-904) ]] && grep -q 'not pinned 3' "$T/home/status.json" \
  && ok "unpinned decisions never admitted; pinned one never repeated" || { bad "pin gate ($(calls))"; cat "$T/out"; }

echo "6. unrelated states never notify; a pinned decision that is no longer outstanding does not send"
mk MYC-20261025-905; ev MYC-20261025-905 in_progress g claim; ev MYC-20261025-905 completed g done
mk MYC-20261025-906; ev MYC-20261025-906 in_progress g claim; ev MYC-20261025-906 failed g err
mk MYC-20261025-907; ev MYC-20261025-907 cancelled chris stop
awaiting MYC-20261025-908; push a908; live MYC-20261025-908; ev MYC-20261025-908 rejected chris no
push unrelated; run >/dev/null
[[ $(calls) == 1 ]] && grep -q 'pinned decision is not outstanding' "$T/home/status.json" && ok "completed/failed/cancelled none; pinned-but-rejected not sent" || { bad "unrelated states"; cat "$T/out"; }

echo "7. malformed tasks are quarantined, not mailed (R3: whole descriptor checked)"
awaiting MYC-20261025-911; echo '{"seq":4' > "$TD/MYC-20261025-911/events/0004.json"
mk MYC-20261025-912; ev MYC-20261025-912 awaiting_approval g "skipped in_progress"
awaiting MYC-20261025-913; jq '. + {extra: 1}' "$TD/MYC-20261025-913/task.json" > x && mv x "$TD/MYC-20261025-913/task.json"
awaiting MYC-20261025-914; mv "$TD/MYC-20261025-914/events/0002.json" "$TD/MYC-20261025-914/events/0005.json"
awaiting MYC-20261025-915 ""
awaiting MYC-20261025-916; jq '.instructions = 42 | .result_location = 42' "$TD/MYC-20261025-916/task.json" > x && mv x "$TD/MYC-20261025-916/task.json"
awaiting MYC-20261025-917; jq '.instructions = ""' "$TD/MYC-20261025-917/task.json" > x && mv x "$TD/MYC-20261025-917/task.json"
awaiting MYC-20261025-918; jq '.result_location = "greenfield/mycelium/tasks/MYC-20261025-918/result.md"' "$TD/MYC-20261025-918/task.json" > x && mv x "$TD/MYC-20261025-918/task.json"
awaiting MYC-20261025-919; jq --arg l "$(head -c 4100 /dev/zero | tr '\0' a)" '.instructions = $l' "$TD/MYC-20261025-919/task.json" > x && mv x "$TD/MYC-20261025-919/task.json"
push malformed; allq=yes
for i in 911 912 913 914 915 916 917 918 919; do
  conf live "MYC-20261025-$i-0003-$(git rev-parse HEAD:$TD/MYC-20261025-$i/events/0003.json 2>/dev/null | cut -c1-12)"; run >/dev/null
  jq -e --arg id "MYC-20261025-$i" '.quarantined | any(startswith($id))' "$T/home/status.json" >/dev/null || allq="no ($i)"
done
[[ $(calls) == 1 && $allq == yes ]] && ok "bad JSON, illegal transition, extra field, gap, empty summary, numeric instructions/result_location, empty instructions, wrong result path, oversize instructions: quarantined, no mail, even when pinned" || { bad "quarantine ($allq, $(calls))"; cat "$T/home/status.json"; }
awaiting MYC-20261025-920; jq '.run_id = "MYC-20261025-920-r1-deadbeef"' "$TD/MYC-20261025-920/events/0003.json" > x && mv x "$TD/MYC-20261025-920/events/0003.json"
push forged; conf live "$(keyof MYC-20261025-920)"; run >/dev/null
[[ $(calls) == 1 ]] && jq -e '.quarantined | any(startswith("MYC-20261025-920"))' "$T/home/status.json" >/dev/null \
  && ok "hand-written decision request (wrong run): quarantined, no mail even when pinned" || { bad "forged request"; cat "$T/home/status.json"; }
git rm -rq "$TD/MYC-20261025-91"* "$TD/MYC-20261025-920"; push cleanup

echo "8. resuming after approval is not implemented: such a history is quarantined, never mailed"
ev MYC-20261025-902 approved chris yes; ev MYC-20261025-902 in_progress g claim2; ev MYC-20261025-902 awaiting_approval g "Second decision"
push rev2; live MYC-20261025-902; run >/dev/null; run >/dev/null
[[ $(calls) == 1 ]] && jq -e '.quarantined | any(startswith("MYC-20261025-902"))' "$T/home/status.json" >/dev/null \
  && ok "approved -> in_progress -> awaiting: quarantined (as by the writer), no second notice" || { bad "resume quarantine"; cat "$T/home/status.json"; }
# the original 902 notice stays the only one; later call counts below are relative to this
export MYCNOTIFY_TEST_NOW

echo "9. no connection: bounded retry, then permanent"
mode connfail; awaiting MYC-20261025-921; push t921; live MYC-20261025-921; run >/dev/null; c=$(calls)
[[ $c == 2 && $(rec MYC-20261025-921) == retry ]] && ok "attempt 1 failed before sending -> retry" || bad "retry state ($c)"
run >/dev/null; [[ $(calls) == 2 ]] && ok "no retry before the backoff" || bad "early retry"
export MYCNOTIFY_TEST_NOW=$((MYCNOTIFY_TEST_NOW + 60)); run >/dev/null
export MYCNOTIFY_TEST_NOW=$((MYCNOTIFY_TEST_NOW + 200)); run >/dev/null
export MYCNOTIFY_TEST_NOW=$((MYCNOTIFY_TEST_NOW + 200)); run >/dev/null
[[ $(calls) == 4 && $(rec MYC-20261025-921) == permanent ]] && ok "3 attempts total, then permanent; no more" || { bad "retry bound ($(calls), $(rec MYC-20261025-921))"; cat "$T/out"; }

echo "10. timeout, 5xx and a lost response are uncertain: never resent"
mode timeout; awaiting MYC-20261025-931; push t931; live MYC-20261025-931; run >/dev/null; c=$(calls); run >/dev/null; run >/dev/null
[[ $c == 5 && $(calls) == 5 && $(rec MYC-20261025-931) == uncertain ]] && ok "timeout -> uncertain, no resend" || bad "timeout"
mode 5xx; awaiting MYC-20261025-932; push t932; live MYC-20261025-932; run >/dev/null; run >/dev/null
[[ $(calls) == 6 && $(rec MYC-20261025-932) == uncertain ]] && ok "HTTP 503 -> uncertain, no resend" || bad "5xx"

echo "11. HTTP 429 retries after Retry-After"
mode 429; awaiting MYC-20261025-941; push t941; live MYC-20261025-941; run >/dev/null
export MYCNOTIFY_TEST_NOW=$((MYCNOTIFY_TEST_NOW + 200)); run >/dev/null; c=$(calls)
mode ok; export MYCNOTIFY_TEST_NOW=$((MYCNOTIFY_TEST_NOW + 200)); run >/dev/null
[[ $c == 7 && $(calls) == 8 && $(rec MYC-20261025-941) == accepted ]] && ok "waited 300 s as asked, then accepted" || { bad "429 ($c/$(calls))"; cat "$T/out"; }

echo "12. auth/config refusal (401) holds all sending until release"
mode 401; awaiting MYC-20261025-951; push t951; live MYC-20261025-951; run >/dev/null
mode ok; awaiting MYC-20261025-952; push t952; live MYC-20261025-952; run >/dev/null; c=$(calls)
[[ $c == 9 && $(rec MYC-20261025-951) == permanent && $(st result) == held ]] && ok "held: nothing else sent" || { bad "hold ($c)"; cat "$T/out"; }
"$MN" release >/dev/null 2>&1; run >/dev/null; [[ $(calls) == 10 && $(rec MYC-20261025-952) == accepted ]] && ok "after release, the pinned notice goes" || bad "release"

echo "13. interrupted claim (crash between claim and outcome) becomes uncertain"
awaiting MYC-20261025-961; push t961; live MYC-20261025-961; k=$(keyof MYC-20261025-961)
jq -nc --arg k "$k" '{key:$k, task_id:"MYC-20261025-961", state:"claimed", attempts:1, claim_day:"2000-01-01"}' > "$T/home/ledger/$k.json"
run >/dev/null; [[ $(calls) == 10 && $(rec MYC-20261025-961) == uncertain ]] && ok "simulated interrupted claim: uncertain, not resent" || { bad "interrupted claim"; cat "$T/out"; }

echo "14. R2: the daily cap counts every HTTP attempt, retries included, per London day"
day0=$(TZ=Europe/London date -d "@$MYCNOTIFY_TEST_NOW" +%F)
export MYCNOTIFY_TEST_NOW=$(( $(TZ=Europe/London date -d "$day0 + 2 days 23:50" +%s) ))   # a fresh London day, 10 min before midnight
mode connfail; awaiting MYC-20261025-971; push t971; live MYC-20261025-971; c0=$(calls)
MYCNOTIFY_MAX_DAY=2 "$MN" poll >/dev/null 2>&1; export MYCNOTIFY_TEST_NOW=$((MYCNOTIFY_TEST_NOW + 200))
MYCNOTIFY_MAX_DAY=2 "$MN" poll >/dev/null 2>&1; export MYCNOTIFY_TEST_NOW=$((MYCNOTIFY_TEST_NOW + 150))
MYCNOTIFY_MAX_DAY=2 "$MN" poll >/dev/null 2>&1
[[ $(( $(calls) - c0 )) == 2 && $(rec MYC-20261025-971) == retry ]] && grep -q 'deferred 1' "$T/home/status.json" \
  && ok "cap 2: two attempts (one decision retrying), third deferred" || { bad "attempt cap ($(( $(calls) - c0 )) attempts)"; cat "$T/home/status.json"; }
[[ $(wc -l < "$T/home/ledger/attempts-$(TZ=Europe/London date -d "@$((MYCNOTIFY_TEST_NOW - 400))" +%F).log") == 2 ]] && ok "attempt log keeps both lines (not overwritten)" || bad "attempt log"
export MYCNOTIFY_TEST_NOW=$((MYCNOTIFY_TEST_NOW + 300))   # now past London midnight
MYCNOTIFY_MAX_DAY=2 "$MN" poll >/dev/null 2>&1
[[ $(( $(calls) - c0 )) == 3 && $(rec MYC-20261025-971) == permanent ]] && ok "new London day: third attempt allowed, then the 3-attempt limit makes it permanent" || { bad "day boundary ($(( $(calls) - c0 )))"; cat "$T/out"; }
mode ok; awaiting MYC-20261025-972; push t972; live MYC-20261025-972
MYCNOTIFY_MAX_DAY=1 "$MN" poll >/dev/null 2>&1; [[ $(( $(calls) - c0 )) == 3 ]] && ok "cap 1 already used today -> deferred" || bad "cap 1"
run >/dev/null; [[ $(( $(calls) - c0 )) == 4 && $(rec MYC-20261025-972) == accepted ]] && ok "below the cap it goes on the next run" || bad "after cap"

echo "15. summary is sanitised and bounded"
awaiting MYC-20261025-981 "$(printf 'line1 \x1b[31mred\x07 '; head -c 350 /dev/zero | tr '\0' 'A')"; push t981; live MYC-20261025-981; run >/dev/null
s=$(jq -r .text_body "$T/body_last" | grep '^Summary: ' | cut -c10-)
[[ $(rec MYC-20261025-981) == accepted && ${#s} -le 400 ]] && ! LC_ALL=C grep -q $'[\x01-\x08\x0b-\x1f\x7f]' <<<"$s" && ok "no control characters, ≤400 chars" || bad "summary (${#s})"

echo "16. live refused for a non-FindPitches sender; PAUSE stops everything"
awaiting MYC-20261025-982; push t982; c=$(calls); conf live "$(keyof MYC-20261025-982)" notify@example.com; r=$(run)
[[ $r != 0 && $(calls) == "$c" ]] && grep -q findpitches.com "$T/home/status.json" && ok "sender outside findpitches.com refused" || { bad "sender check"; cat "$T/out"; }
live MYC-20261025-982; touch "$T/home/PAUSE"; run >/dev/null; [[ $(calls) == "$c" ]] && ok "paused: no send" || bad "pause"; rm -f "$T/home/PAUSE"

echo "17. total ledger loss: blocked until baseline; baseline suppresses rather than resends"
run >/dev/null; c=$(calls)   # 982 goes now
rm -rf "$T/home/ledger"; r=$(run)
[[ $r != 0 && $(calls) == "$c" ]] && ok "ledger gone -> live refused" || bad "lost ledger"
"$MN" baseline >/dev/null 2>&1; run >/dev/null; run >/dev/null
[[ $(calls) == "$c" ]] && ok "after baseline the pinned, already-mailed decision is not mailed again" || bad "resend after loss"

echo "18. decisions command lists keys read-only"
o=$("$MN" decisions 2>&1); [[ $o == *"$(keyof MYC-20261025-982)  ledger=baseline"* && $(calls) == "$c" ]] && ok "lists outstanding keys with ledger state; no send" || { bad "decisions"; echo "$o"; }

echo; echo "mycnotify tests: $pass passed, $failn failed"; [[ $failn == 0 ]]
