#!/usr/bin/env bash
# Offline tests for real-task decisions: myc-gate decision requests + `decide`, the myc-decide wrapper, and the
# notifier reading the real tasks path. LOCAL bare repo, fake runner output, fake curl. No network, no model, no root.
#   bash test-decisions.sh
set -uo pipefail
for c in git jq flock iconv dd timeout awk script; do command -v $c >/dev/null || { echo "decision tests: need $c"; exit 1; }; done
D=$(cd "$(dirname "$0")" && pwd); GATE=$D/myc-gate; DECIDE=$D/myc-decide; MN=$D/../notify/mycnotify
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
pass=0; failn=0
ok()  { echo "  PASS $*"; pass=$((pass + 1)); }
bad() { echo "  FAIL $*"; failn=$((failn + 1)); }
B=findpitches-v3/greenfield; TD=greenfield/mycelium/tasks
export GIT_AUTHOR_NAME=chris GIT_AUTHOR_EMAIL=c@x GIT_COMMITTER_NAME=chris GIT_COMMITTER_EMAIL=c@x
git init -q --bare "$T/remote.git"; git clone -q "$T/remote.git" "$T/human" 2>/dev/null
(cd "$T/human" && git checkout -q -b "$B" && mkdir -p team && echo hub > team/README.md && git add -A && git commit -qm init && git push -q origin "$B") 2>/dev/null
mkdir -p "$T/hs" "$T/spool"; git clone -q --branch "$B" "$T/remote.git" "$T/hs/repo" 2>/dev/null
mkdir -p "$T/decisions"; chmod 0755 "$T/decisions"
export MYC_HOME=$T/hs MYC_SPOOL=$T/spool MYC_ALLOW=$T/allowed MYC_MAX_CALLS=50 MYC_WINDOW_S=100000 MYC_TEST=1 \
  MYC_AS_HUBSYNC="env HOME=$T/hs" MYC_GATE=$GATE MYC_DECISIONS=$T/decisions
VIA=fpd-prod:sudo:ct_admin
NOTE_ENV=(env MYCNOTIFY_TEST=1 MYCNOTIFY_TEST_CURL=/bin/false MYCNOTIFY_TEST_CRED=/nonexistent MYCNOTIFY_TEST_DECISIONS="$T/decisions"
  MYCNOTIFY_HOME="$T/mn" MYCNOTIFY_REMOTE="$T/remote.git" MYCNOTIFY_TASKS="greenfield/mycelium/tasks")
ncommits() { git --git-dir="$T/remote.git" rev-list --count "$B"; }
mk_task() {  # id
  (cd "$T/human" && git pull -q --rebase origin "$B" && mkdir -p "$TD/$1/events" \
   && jq -n --arg t "$1" --arg rl "$TD/$1/result.md" '{task_id:$t, assigned_agent:"claude", instructions:"Read-only test task.", status:"pending", result_location:$rl}' > "$TD/$1/task.json" \
   && jq -n '{seq:1, status:"pending", at:"2026-10-26T10:00:00Z", actor:"chris", reason:"created by Chris"}' > "$TD/$1/events/0001.json" \
   && git add -A && git commit -qm "chris: task $1" && git push -q origin "$B") 2>/dev/null
}
desc_blob() { git --git-dir="$T/remote.git" rev-parse "$B:$TD/$1/task.json"; }
claim() { echo "$1 claude $(desc_blob "$1")" > "$MYC_ALLOW"; "$GATE" claim "$1" 2>>"$T/err"; }
finish() {  # run [decision-text] [result-text]   (absent arg = file not written)
  local o=$T/spool/$1/out
  jq -n '{ok:true, agent:"claude", called:true, seconds:3}' > "$o/meta.json"
  [[ $# -lt 2 || $2 == "-" ]] || printf '%s' "$2" > "$o/decision.md"
  [[ $# -lt 3 ]] || printf '%s' "$3" > "$o/result.md"
  "$GATE" complete "$1" > "$T/out" 2>&1
}
state() { "$GATE" state "$1" 2>/dev/null; }
keyof() { state "$1" | sed -n 's/^  decision key: //p'; }
lastev() { git --git-dir="$T/remote.git" show "$B:$(git --git-dir="$T/remote.git" ls-tree --name-only "$B" -- "$TD/$1/events/" | tail -1)"; }
rec() {  # key status reason  -> owner record as myc-decide would write it (root-owned on the host; 0644 here)
  local t=${1%-*-*} s pe db; s=$(state "$t"); pe=$(sed -n 's/^  awaiting event: //p' <<<"$s"); db=$(sed -n 's/^  descriptor: //p' <<<"$s")
  jq -nc --arg k "$1" --arg s "$2" --arg r "$3" --arg v "$VIA" --arg pe "$pe" --arg db "$db" \
    '{key:$k, status:$s, reason:$r, decided_via:$v, prev_event:$pe, descriptor_blob:$db, recorded_at:"2026-10-26T10:10:00Z"}' > "$T/decisions/$1.json"
  chmod 0644 "$T/decisions/$1.json"
}
mnq() { "${NOTE_ENV[@]}" "$MN" decisions 2>&1; }
hpush() { (cd "$T/human" && git pull -q --rebase origin "$B" && mkdir -p "$(dirname "$1")" && printf '%s\n' "$2" > "$1" && git add -A && git commit -qm "hand: $1" && git push -q origin "$B") 2>/dev/null; }

echo "1. a runner's decision request ends the run in awaiting_approval (no result.md)"
mk_task MYC-20261026-101; r=$(claim MYC-20261026-101)
finish "$r" $'Approve publishing the\ttest listing?\nIt is safe.'
s=$(state MYC-20261026-101); k=$(keyof MYC-20261026-101)
[[ $s == "MYC-20261026-101 awaiting_approval seq=3"* ]] && [[ $k =~ ^MYC-20261026-101-0003-[0-9a-f]{12}$ ]] \
  && lastev MYC-20261026-101 | jq -e --arg r "$r" '.actor == "hubsync-gate" and .run_id == $r and .reason == "Approve publishing the test listing? It is safe."' >/dev/null \
  && ! git --git-dir="$T/remote.git" cat-file -e "$B:$TD/MYC-20261026-101/result.md" 2>/dev/null \
  && ok "awaiting_approval with flattened summary, decision key shown, no result.md" || { bad "decision request"; cat "$T/out"; echo "$s"; }
c=$(ncommits); "$GATE" complete "$r" >/dev/null 2>&1; [[ $(ncommits) == "$c" ]] && ok "re-running complete records nothing more" || bad "complete not idempotent"

echo "2. the notifier sees exactly that decision on the real tasks path"
o=$(mnq); [[ $o == "$k  ledger=none" ]] && ok "notifier key == decision key; nothing quarantined" || { bad "notifier view"; echo "$o"; }

echo "3. an outstanding decision holds the Stage B grant"
! "$GATE" grant >/dev/null 2>"$T/g" && grep -q 'MYC-20261026-101:awaiting_approval' "$T/g" && ok "grant held while Chris decides" || { bad "grant"; cat "$T/g"; }

echo "4. decide publishes nothing without a trustworthy owner record that states exactly this decision"
c=$(ncommits); b12=${k##*-}
"$GATE" decide "$k" >/dev/null 2>"$T/e1"
rec "$k" approved "ok"; chmod 0664 "$T/decisions/$k.json"; "$GATE" decide "$k" >/dev/null 2>"$T/e2"; chmod 0644 "$T/decisions/$k.json"
chmod 0775 "$T/decisions"; "$GATE" decide "$k" >/dev/null 2>"$T/e3"; chmod 0755 "$T/decisions"
jq '.prev_event = "0000000000000000000000000000000000000000"' "$T/decisions/$k.json" > x && mv x "$T/decisions/$k.json"; chmod 0644 "$T/decisions/$k.json"; "$GATE" decide "$k" >/dev/null 2>"$T/e4"
rec "$k" maybe "ok"; "$GATE" decide "$k" >/dev/null 2>"$T/e5"
rec "$k" approved "ok"
"$GATE" decide "MYC-20261026-101-0003-000000000000" >/dev/null 2>"$T/e6"
cp "$T/decisions/$k.json" "$T/decisions/MYC-20261026-101-0002-$b12.json"; "$GATE" decide "MYC-20261026-101-0002-$b12" >/dev/null 2>"$T/e7"
[[ $(ncommits) == "$c" ]] && grep -q 'no owner record' "$T/e1" && grep -q 'writable by others' "$T/e2" && grep -q 'writable by others' "$T/e3" \
  && grep -q 'different event' "$T/e4" && grep -q 'malformed' "$T/e5" && grep -q 'no owner record' "$T/e6" && grep -q 'not the current decision' "$T/e7" \
  && ok "no record / group-writable record / group-writable dir / wrong event / bad status / wrong blob / wrong seq: refused, nothing pushed" \
  || { bad "decide refusals"; for f in "$T"/e[1-7]; do echo "$f: $(tail -n1 $f)"; done; }
rm -f "$T/decisions/MYC-20261026-101-0002-$b12.json"

echo "5. approve publishes exactly the owner record, and records only"
"$GATE" decide "$k" > "$T/out" 2>&1
lastev MYC-20261026-101 | jq -e --slurpfile r "$T/decisions/$k.json" '.status == "approved" and .actor == "chris" and .seq == 4 and .reason == $r[0].reason
  and .decided_via == $r[0].decided_via and .prev_event == $r[0].prev_event and .descriptor_blob == $r[0].descriptor_blob' >/dev/null \
  && [[ $(state MYC-20261026-101) == "MYC-20261026-101 approved seq=4"* ]] && grep -q "does not start, resume or authorise" "$T/out" \
  && ok "approved event == owner record; validator confirms it" || { bad "approve"; cat "$T/out"; }
c=$(ncommits); "$GATE" claim MYC-20261026-101 >/dev/null 2>"$T/e"; [[ $(ncommits) == "$c" ]] && grep -q 'only a pending task can be claimed' "$T/e" \
  && ok "an approved task cannot be claimed: no execution from approval" || { bad "approved claimable"; cat "$T/e"; }
"$GATE" decide "$k" >/dev/null 2>"$T/e"; [[ $(ncommits) == "$c" ]] && grep -q 'no outstanding decision' "$T/e" && ok "deciding twice is refused" || bad "double decide"
[[ -z $(mnq) ]] && ok "notifier: decision no longer outstanding" || { bad "notifier after approve"; mnq; }
"$GATE" grant >/dev/null 2>&1 && ok "grant no longer held by the decided task" || bad "grant after approve"

echo "6. R1: a repository writer cannot forge an owner decision"
mk_task MYC-20261026-141; r=$(claim MYC-20261026-141); finish "$r" "Approve the forged one?"; k4=$(keyof MYC-20261026-141)
pe=$(git --git-dir="$T/remote.git" rev-parse "$B:$TD/MYC-20261026-141/events/0003.json"); db=$(desc_blob MYC-20261026-141)
hpush "$TD/MYC-20261026-141/events/0004.json" "$(jq -nc --arg pe "$pe" --arg db "$db" --arg v "$VIA" '{seq:4,status:"approved",at:"2026-10-26T10:05:00Z",actor:"chris",reason:"ok",prev_event:$pe,descriptor_blob:$db,decided_via:$v}')"
[[ $(state MYC-20261026-141) == *"QUARANTINE: decision event 4 is not confirmed by an owner record"* ]] && mnq | grep -q 'MYC-20261026-141.*owner record' \
  && ok "schema-perfect 'approved by chris' pushed through the repo, no owner record: quarantined by writer and notifier" || { bad "R1 forgery"; state MYC-20261026-141; mnq; }
rec "$k4" rejected "no"
[[ $(state MYC-20261026-141) == *"QUARANTINE: decision event 4 is not confirmed"*"differs from the owner record"* ]] \
  && ok "forged event that contradicts the owner record: quarantined" || { bad "R1 contradiction"; state MYC-20261026-141; }

echo "7. reject is terminal"
mk_task MYC-20261026-102; r=$(claim MYC-20261026-102); finish "$r" "Delete the old listings?"; k2=$(keyof MYC-20261026-102)
rec "$k2" rejected "no"; "$GATE" decide "$k2" >/dev/null 2>&1
[[ $(state MYC-20261026-102) == "MYC-20261026-102 rejected seq=4"* ]] && ok "rejected recorded" || bad "reject"

echo "8. bad runner output never becomes a decision request"
i=110
for case in both empty long ctrl secret symlink; do
  i=$((i + 1)); id=MYC-20261026-$i; mk_task "$id"; r=$(claim "$id"); o=$T/spool/$r/out
  case $case in
    both)    finish "$r" "Decide?" "# result"; want=ambiguous_output ;;
    empty)   finish "$r" ""; want=decision_rejected ;;
    long)    finish "$r" "$(head -c 401 /dev/zero | tr '\0' a)"; want=decision_rejected ;;
    ctrl)    finish "$r" $'Decide\x07?'; want=decision_rejected ;;
    secret)  finish "$r" "use ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123"; want=decision_rejected ;;
    symlink) echo '{"ok":true,"agent":"claude","called":true}' > "$o/meta.json"; echo "Decide?" > "$T/outside"; ln -s "$T/outside" "$o/decision.md"
             "$GATE" complete "$r" > "$T/out" 2>&1; want=decision_rejected ;;
  esac
  lastev "$id" | jq -e --arg w "$want" '.status == "failed" and .reason == $w' >/dev/null || { bad "$case -> $(lastev "$id" | jq -c '{status,reason}')"; continue; }
  ok "$case -> failed ($want)"
done

echo "9. hand-written events are quarantined (writer)"
mk_task MYC-20261026-121; r=$(claim MYC-20261026-121); finish "$r" "Approve?"; pe=$(git --git-dir="$T/remote.git" rev-parse "$B:$TD/MYC-20261026-121/events/0003.json"); db=$(desc_blob MYC-20261026-121)
hpush "$TD/MYC-20261026-121/events/0004.json" "$(jq -nc --arg pe "$pe" --arg db "$db" '{seq:4,status:"approved",at:"2026-10-26T10:05:00Z",actor:"claude",reason:"self-approved",prev_event:$pe,descriptor_blob:$db,decided_via:"fpd-prod:sudo:ct_admin"}')"
[[ $(state MYC-20261026-121) == *"QUARANTINE: decision event 4 is not a valid recorded decision"* ]] && ok "approval by an agent actor" || bad "agent approval"
mk_task MYC-20261026-122; r=$(claim MYC-20261026-122); finish "$r" "Approve?"; pe=$(git --git-dir="$T/remote.git" rev-parse "$B:$TD/MYC-20261026-122/events/0003.json"); db=$(desc_blob MYC-20261026-122)
hpush "$TD/MYC-20261026-122/events/0004.json" "$(jq -nc --arg pe "$pe" --arg db "$db" '{seq:4,status:"approved",at:"2026-10-26T10:05:00Z",actor:"chris",reason:"ok",prev_event:$pe,descriptor_blob:$db}')"
[[ $(state MYC-20261026-122) == *"QUARANTINE"* ]] && ok "approval without decided_via" || bad "no via"
mk_task MYC-20261026-123
hpush "$TD/MYC-20261026-123/events/0002.json" '{"seq":2,"status":"approved","at":"2026-10-26T10:05:00Z","actor":"chris","reason":"ok","decided_via":"fpd-prod:sudo:ct_admin"}'
[[ $(state MYC-20261026-123) == *"QUARANTINE: transition 'pending' -> 'approved'"* ]] && ok "approval without a decision request" || bad "pending->approved"
mk_task MYC-20261026-124; r=$(claim MYC-20261026-124); pe=$(git --git-dir="$T/remote.git" rev-parse "$B:$TD/MYC-20261026-124/events/0002.json")
hpush "$TD/MYC-20261026-124/events/0003.json" "$(jq -nc --arg pe "$pe" '{seq:3,status:"awaiting_approval",at:"2026-10-26T10:05:00Z",actor:"hubsync-gate",reason:"x",run_id:"MYC-20261026-124-r1792999999-deadbeef",prev_event:$pe}')"
[[ $(state MYC-20261026-124) == *"QUARANTINE: decision request event 3"* ]] && ok "decision request with the wrong run" || bad "wrong run"
mk_task MYC-20261026-125; r=$(claim MYC-20261026-125); finish "$r" "Short summary"; f125=$TD/MYC-20261026-125/events/0003.json
hpush "$f125" "$(git --git-dir="$T/remote.git" show "$B:$f125" | jq -c --arg l "$(head -c 401 /dev/zero | tr '\0' a)" '.reason = $l')"
[[ $(state MYC-20261026-125) == *"QUARANTINE: decision request event 3"* ]] && ok "R2: request edited to a 401-byte summary" || bad "401 summary"

echo "10. R2: the notifier reaches the same verdict as the writer on every task above"
g=$(sed -n '/^# >>> myc-fold/,/^# <<< myc-fold/p' "$GATE" | sha256sum); n=$(sed -n '/^# >>> myc-fold/,/^# <<< myc-fold/p' "$MN" | sha256sum)
[[ $g == "$n" && $(sed -n '/^# >>> myc-fold/,/^# <<< myc-fold/p' "$GATE" | wc -l) -gt 50 ]] && ok "shared validator block is byte-identical in myc-gate and mycnotify" || bad "fold block differs"
o=$(mnq); mismatch=""
for id in $(git --git-dir="$T/remote.git" ls-tree --name-only "$B" -- "$TD/" | sed "s|^$TD/||"); do
  s=$(state "$id")
  case $s in
    *QUARANTINE*)         grep -q "^  $id	" <<<"$o" || mismatch+=" $id(writer quarantine, notifier not)" ;;
    *awaiting_approval*)  grep -q "^$(keyof "$id")  ledger=" <<<"$o" || mismatch+=" $id(writer awaiting, notifier not)" ;;
    *)                    ! grep -q "$id" <<<"$o" || mismatch+=" $id(writer $(cut -d' ' -f2 <<<"$s"), notifier lists it)" ;;
  esac
done
[[ -z $mismatch ]] && ok "same verdict for all $(git --git-dir="$T/remote.git" ls-tree --name-only "$B" -- "$TD/" | wc -l) tasks (quarantined / awaiting / settled)" || { bad "verdicts differ:$mismatch"; echo "$o"; }

echo "11. myc-decide: terminal, confirmation, sudo identity and the owner record"
mk_task MYC-20261026-131; r=$(claim MYC-20261026-131); finish "$r" "Approve the wrapper test?"; k3=$(keyof MYC-20261026-131); c=$(ncommits)
SUDO_USER=ct_admin "$DECIDE" "$k3" approve < /dev/null > "$T/o1" 2>&1
grep -q 'interactive terminal' "$T/o1" && [[ $(ncommits) == "$c" && ! -e $T/decisions/$k3.json ]] && ok "no terminal: refused, no record" || { bad "tty"; cat "$T/o1"; }
printf 'nope\n' | SUDO_USER=ct_admin script -qec "$DECIDE $k3 approve" /dev/null > "$T/o2" 2>&1
grep -q 'not confirmed' "$T/o2" && [[ $(ncommits) == "$c" && ! -e $T/decisions/$k3.json ]] && ok "wrong confirmation: nothing recorded" || { bad "confirm"; cat "$T/o2"; }
printf 'MYC-20261026-131\n' | env -u SUDO_USER script -qec "$DECIDE $k3 approve" /dev/null > "$T/o3" 2>&1
grep -q 'through sudo' "$T/o3" && [[ ! -e $T/decisions/$k3.json ]] && ok "not run through sudo: refused" || { bad "sudo user"; cat "$T/o3"; }
printf 'MYC-20261026-131\n' | SUDO_USER=ct_admin script -qec "$DECIDE $k3 approve 'token ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123'" /dev/null > "$T/o5" 2>&1
printf 'MYC-20261026-131\n' | SUDO_USER=ct_admin script -qec "$DECIDE $k3 approve '$(head -c 201 /dev/zero | tr '\0' a)'" /dev/null > "$T/o6" 2>&1
[[ $(ncommits) == "$c" && ! -e $T/decisions/$k3.json ]] && grep -q "STOP" "$T/o6" && grep -q "credential" "$T/o5" && ok "credential-like or over-long note refused before any record is written" || { bad "note checks"; cat "$T/o5" "$T/o6"; ls "$T/decisions"; }
rm -f "$T/decisions/$k3.json"
printf 'MYC-20261026-131\n' | SUDO_USER=ct_admin script -qec "$DECIDE $k3 approve 'wrapper ok'" /dev/null > "$T/o4" 2>&1
grep -q 'summary: Approve the wrapper test?' "$T/o4" && [[ $(stat -c %a "$T/decisions/$k3.json") == 644 ]] \
  && jq -e --arg k "$k3" '.key == $k and .status == "approved" and .reason == "wrapper ok" and .decided_via == "fpd-prod:sudo:ct_admin"' "$T/decisions/$k3.json" >/dev/null \
  && lastev MYC-20261026-131 | jq -e '.status == "approved" and .decided_via == "fpd-prod:sudo:ct_admin" and .reason == "wrapper ok"' >/dev/null \
  && [[ $(state MYC-20261026-131) == "MYC-20261026-131 approved"* ]] && ok "record written (0644) first, then exactly that decision published and validated" || { bad "wrapper approve"; cat "$T/o4"; }
mk_task MYC-20261026-132; r=$(claim MYC-20261026-132); finish "$r" "Retry test?"; k5=$(keyof MYC-20261026-132)
rec "$k5" approved "approved by Chris"; c=$(ncommits)    # as if an earlier run wrote the record but its publish failed
printf 'MYC-20261026-132\n' | SUDO_USER=ct_admin script -qec "$DECIDE $k5 reject" /dev/null > "$T/o7" 2>&1
grep -q 'different decision was already recorded' "$T/o7" && [[ $(ncommits) == "$c" ]] && ok "an existing record is never changed" || { bad "record immutability"; cat "$T/o7"; }
printf 'MYC-20261026-132\n' | SUDO_USER=ct_admin script -qec "$DECIDE $k5 approve" /dev/null > "$T/o8" 2>&1
grep -q 'reusing the identical owner record' "$T/o8" && [[ $(state MYC-20261026-132) == "MYC-20261026-132 approved"* ]] && ok "identical retry reuses the record and publishes" || { bad "retry"; cat "$T/o8"; }

echo; echo "decision tests: $pass passed, $failn failed"; [[ $failn == 0 ]]
