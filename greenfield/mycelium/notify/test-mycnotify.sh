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
export MYCNOTIFY_TEST=1 MYCNOTIFY_HOME=$T/home MYCNOTIFY_REMOTE=$T/remote.git MYCNOTIFY_BRANCH=$B
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
conf() { printf 'SENDER=%s\nRECIPIENT=chris@example.invalid\nMODE=%s\n' "${2:-notify@findpitches.com}" "$1" > "$T/cred/notify.conf"; }
mode() { echo "$1" > "$T/mode"; }
calls() { [[ -f $T/calls ]] && wc -l < "$T/calls" || echo 0; }
run() { "$MN" poll > "$T/out" 2>&1; echo $?; }
st() { jq -r ".$1" "$T/home/status.json"; }
rec() { jq -r ".state" "$T/home/ledger/$1"*.json 2>/dev/null | head -1; }

git init -q --bare "$T/remote.git"; git clone -q "$T/remote.git" "$T/human" 2>/dev/null
cd "$T/human"; git checkout -q -b "$B"; echo hub > README.md; git add -A; git commit -qm init; git push -q origin "$B"
push() { git add -A && git commit -qm "human: $1" && git push -q origin "$B"; }
mk() {  # id agent  -> descriptor + event 1 (pending by chris)
  mkdir -p "$TD/$1/events"
  jq -n --arg id "$1" --arg a "${2:-claude}" '{task_id:$id, assigned_agent:$a, instructions:"test", status:"pending",
    result_location:("greenfield/mycelium/notify-test/tasks/" + $id + "/result.md")}' > "$TD/$1/task.json"
  ev "$1" pending chris "created"
}
ev() {  # id status actor reason
  local n; n=$(( $(ls "$TD/$1/events" | wc -l) + 1 ))
  jq -n --argjson n "$n" --arg s "$2" --arg a "$3" --arg r "$4" '{seq:$n, status:$s, at:"2026-10-25T19:00:00Z", actor:$a, reason:$r}' \
    > "$TD/$1/events/$(printf %04d "$n").json"
}
awaiting() { mk "$1"; ev "$1" in_progress hubsync-gate claim; ev "$1" awaiting_approval hubsync-gate "${2-Approve publishing the test listing?}"; }

echo "1. dry run (default): candidates logged, curl never called"
awaiting MYC-20261025-901; push t901; conf dry-run; mode ok
r=$(run); [[ $r == 0 && $(calls) == 0 && $(st mode) == dry-run && -f $T/home/dryrun/MYC-20261025-901-0003-$(git rev-parse HEAD:$TD/MYC-20261025-901/events/0003.json | cut -c1-12).json ]] \
  && ok "dry run records 'would notify', no mail call" || { bad "dry run"; cat "$T/out"; }

echo "2. live before baseline is refused"
conf live; r=$(run)
[[ $r != 0 && $(calls) == 0 ]] && grep -q 'baseline' "$T/home/status.json" && ok "no send until the ledger is initialised" || { bad "live before baseline"; cat "$T/out"; }

echo "3. baseline suppresses decisions already outstanding"
"$MN" baseline > "$T/out" 2>&1; r=$(run)
[[ $(calls) == 0 && $(rec MYC-20261025-901) == baseline ]] && ok "901 baselined, not mailed" || { bad "baseline"; cat "$T/out"; }

echo "4. one new decision -> exactly one email with the required content"
awaiting MYC-20261025-902; push t902; r=$(run)
b=$T/body_last
[[ $r == 0 && $(calls) == 1 && $(rec MYC-20261025-902) == accepted ]] && jq -e '.to == ["chris@example.invalid"] and .sender == "notify@findpitches.com"
  and (.subject | contains("MYC-20261025-902")) and (.text_body | contains("does NOT approve")) and (.text_body | contains("/notify-test/tasks/MYC-20261025-902"))
  and (.text_body | contains("Approve publishing the test listing?"))' "$b" >/dev/null && ok "one accepted notice: task id, summary, review link, 'reply is NOT approval'" || { bad "first notice"; cat "$T/out"; }
! grep -q "$KEY" "$T/argv" "$b" && grep -q "$KEY" "$T/stdin_last" && ok "API key only on curl stdin: never in argv or body" || bad "key exposure"

echo "5. repeat polls (each a fresh process) send nothing more"
run >/dev/null; run >/dev/null; [[ $(calls) == 1 ]] && ok "no duplicate across polls/restarts" || bad "duplicate"

echo "6. unrelated states never notify"
mk MYC-20261025-903; mk MYC-20261025-904; ev MYC-20261025-904 in_progress g claim
mk MYC-20261025-905; ev MYC-20261025-905 in_progress g claim; ev MYC-20261025-905 completed g done
mk MYC-20261025-906; ev MYC-20261025-906 in_progress g claim; ev MYC-20261025-906 failed g err
mk MYC-20261025-907; ev MYC-20261025-907 cancelled chris stop
awaiting MYC-20261025-908; ev MYC-20261025-908 rejected chris no
push unrelated; run >/dev/null; [[ $(calls) == 1 ]] && ok "pending/in_progress/completed/failed/cancelled/rejected: none" || { bad "unrelated states"; cat "$T/out"; }

echo "7. malformed tasks are quarantined, not mailed"
awaiting MYC-20261025-911; echo '{"seq":4' > "$TD/MYC-20261025-911/events/0004.json"
mk MYC-20261025-912; ev MYC-20261025-912 awaiting_approval g "skipped in_progress"
awaiting MYC-20261025-913; jq '. + {extra: 1}' "$TD/MYC-20261025-913/task.json" > x && mv x "$TD/MYC-20261025-913/task.json"
awaiting MYC-20261025-914; mv "$TD/MYC-20261025-914/events/0002.json" "$TD/MYC-20261025-914/events/0005.json"
awaiting MYC-20261025-915 ""
push malformed; run >/dev/null
q=$(jq -r '.quarantined | join(" ")' "$T/home/status.json")
[[ $(calls) == 1 ]] && for i in 911 912 913 914 915; do [[ $q == *"MYC-20261025-$i"* ]] || false; done && ok "bad JSON, illegal transition, extra field, gap, empty summary: quarantined, no mail" || { bad "quarantine ($q)"; cat "$T/out"; }
git rm -rq "$TD/MYC-20261025-91"*; push cleanup

echo "8. a new decision revision on the same task notifies once more"
ev MYC-20261025-902 approved chris yes; ev MYC-20261025-902 in_progress g claim2; ev MYC-20261025-902 awaiting_approval g "Second decision"
push rev2; run >/dev/null; run >/dev/null
[[ $(calls) == 2 ]] && grep -q 'Second decision' "$T/body_last" && ok "new awaiting event -> new key -> exactly one more notice" || { bad "revision"; cat "$T/out"; }

echo "9. no connection: bounded retry, then permanent"
mode connfail; awaiting MYC-20261025-921; push t921; run >/dev/null; c=$(calls)
[[ $c == 3 && $(rec MYC-20261025-921) == retry ]] && ok "attempt 1 failed before sending -> retry" || bad "retry state ($c)"
run >/dev/null; [[ $(calls) == 3 ]] && ok "no retry before the backoff" || bad "early retry"
export MYCNOTIFY_TEST_NOW=$((MYCNOTIFY_TEST_NOW + 60)); run >/dev/null
export MYCNOTIFY_TEST_NOW=$((MYCNOTIFY_TEST_NOW + 200)); run >/dev/null
export MYCNOTIFY_TEST_NOW=$((MYCNOTIFY_TEST_NOW + 200)); run >/dev/null
[[ $(calls) == 5 && $(rec MYC-20261025-921) == permanent ]] && ok "3 attempts total, then permanent; no more" || { bad "retry bound ($(calls), $(rec MYC-20261025-921))"; cat "$T/out"; }

echo "10. timeout, 5xx and a lost response are uncertain: never resent"
mode timeout; awaiting MYC-20261025-931; push t931; run >/dev/null; c=$(calls); run >/dev/null; run >/dev/null
[[ $c == 6 && $(calls) == 6 && $(rec MYC-20261025-931) == uncertain ]] && ok "timeout -> uncertain, no resend" || bad "timeout"
mode 5xx; awaiting MYC-20261025-932; push t932; run >/dev/null; run >/dev/null
[[ $(calls) == 7 && $(rec MYC-20261025-932) == uncertain ]] && ok "HTTP 503 -> uncertain, no resend" || bad "5xx"

echo "11. HTTP 429 retries after Retry-After"
mode 429; awaiting MYC-20261025-941; push t941; run >/dev/null
export MYCNOTIFY_TEST_NOW=$((MYCNOTIFY_TEST_NOW + 200)); run >/dev/null; c=$(calls)
mode ok; export MYCNOTIFY_TEST_NOW=$((MYCNOTIFY_TEST_NOW + 200)); run >/dev/null
[[ $c == 8 && $(calls) == 9 && $(rec MYC-20261025-941) == accepted ]] && ok "waited 300 s as asked, then accepted" || { bad "429 ($c/$(calls))"; cat "$T/out"; }

echo "12. auth/config refusal (401) holds all sending until release"
mode 401; awaiting MYC-20261025-951; push t951; run >/dev/null; mode ok; awaiting MYC-20261025-952; push t952; run >/dev/null; c=$(calls)
[[ $c == 10 && $(rec MYC-20261025-951) == permanent && $(st result) == held ]] && ok "held: nothing else sent" || { bad "hold ($c)"; cat "$T/out"; }
"$MN" release >/dev/null 2>&1; run >/dev/null; [[ $(calls) == 11 && $(rec MYC-20261025-952) == accepted ]] && ok "after release, the waiting notice goes" || bad "release"

echo "13. interrupted claim (crash between claim and outcome) becomes uncertain"
awaiting MYC-20261025-961; push t961
k=MYC-20261025-961-0003-$(git rev-parse HEAD:$TD/MYC-20261025-961/events/0003.json | cut -c1-12)
jq -nc --arg k "$k" '{key:$k, task_id:"MYC-20261025-961", state:"claimed", attempts:1, claim_day:"2000-01-01"}' > "$T/home/ledger/$k.json"
run >/dev/null; [[ $(calls) == 11 && $(rec MYC-20261025-961) == uncertain ]] && ok "simulated interrupted claim: uncertain, not resent" || { bad "interrupted claim"; cat "$T/out"; }

echo "14. limits: one send per run and a daily cap"
awaiting MYC-20261025-971; awaiting MYC-20261025-972; push two; run >/dev/null; c=$(calls)
[[ $c == 12 ]] && ok "two new decisions -> one send this run" || bad "per-run cap ($c)"
MYCNOTIFY_MAX_DAY=1 "$MN" poll >/dev/null 2>&1; [[ $(calls) == 12 ]] && ok "daily cap reached -> deferred" || bad "daily cap"
run >/dev/null; [[ $(calls) == 13 ]] && ok "below the cap, the deferred one goes next run" || bad "after cap"

echo "15. summary is sanitised and bounded"
awaiting MYC-20261025-981 "$(printf 'line1\nline2\t\x1b[31mred\x07%.0s' {1..1}; head -c 2000 /dev/zero | tr '\0' 'A')"; push t981; run >/dev/null
s=$(jq -r .text_body "$T/body_last" | grep '^Summary: ' | cut -c10-)
[[ ${#s} -le 400 ]] && ! LC_ALL=C grep -q $'[\x01-\x08\x0b-\x1f\x7f]' <<<"$s" && ok "no control characters, ≤400 chars" || bad "summary (${#s})"

echo "16. live refused for a non-FindPitches sender; PAUSE stops everything"
conf live notify@example.com; awaiting MYC-20261025-982; push t982; r=$(run)
[[ $r != 0 && $(calls) == 14 ]] && grep -q findpitches.com "$T/home/status.json" && ok "sender outside findpitches.com refused" || { bad "sender check"; cat "$T/out"; }
conf live; touch "$T/home/PAUSE"; run >/dev/null; [[ $(calls) == 14 ]] && ok "paused: no send" || bad "pause"; rm -f "$T/home/PAUSE"

echo "17. lost ledger: blocked until baseline; baseline never resends"
run >/dev/null; c=$(calls)   # 982 goes now
rm -rf "$T/home/ledger"; r=$(run)
[[ $r != 0 && $(calls) == "$c" ]] && ok "ledger gone -> live refused" || bad "lost ledger"
"$MN" baseline >/dev/null 2>&1; run >/dev/null; run >/dev/null
[[ $(calls) == "$c" ]] && ok "after baseline, already-mailed decisions are not mailed again (missed > duplicate)" || bad "resend after loss"

echo; echo "mycnotify tests: $pass passed, $failn failed"; [[ $failn == 0 ]]
