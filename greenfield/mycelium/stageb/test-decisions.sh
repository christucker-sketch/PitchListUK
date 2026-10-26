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
export MYC_HOME=$T/hs MYC_SPOOL=$T/spool MYC_ALLOW=$T/allowed MYC_MAX_CALLS=50 MYC_WINDOW_S=100000 MYC_TEST=1 \
  MYC_AS_HUBSYNC="env HOME=$T/hs" MYC_GATE=$GATE
unset MYC_DECIDED_VIA
VIA=fpd-prod:sudo:ct_admin
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
NOTE_ENV=(env MYCNOTIFY_HOME="$T/mn" MYCNOTIFY_REMOTE="$T/remote.git" MYCNOTIFY_TASKS="$TD")
o=$("${NOTE_ENV[@]}" "$MN" decisions 2>&1)
[[ $o == "$k  ledger=none" ]] && ok "notifier key == decision key; nothing quarantined" || { bad "notifier view"; echo "$o"; }

echo "3. an outstanding decision holds the Stage B grant"
! "$GATE" grant >/dev/null 2>"$T/g" && grep -q 'MYC-20261026-101:awaiting_approval' "$T/g" && ok "grant held while Chris decides" || { bad "grant"; cat "$T/g"; }

echo "4. decide refuses everything except the exact current key through sudo myc-decide"
c=$(ncommits); b12=${k##*-}
"$GATE" decide "$k" approve >/dev/null 2>"$T/e1"
MYC_DECIDED_VIA=laptop:chris "$GATE" decide "$k" approve >/dev/null 2>"$T/e2"
MYC_DECIDED_VIA=$VIA "$GATE" decide "MYC-20261026-101-0003-000000000000" approve >/dev/null 2>"$T/e3"
MYC_DECIDED_VIA=$VIA "$GATE" decide "MYC-20261026-101-0002-$b12" approve >/dev/null 2>"$T/e4"
MYC_DECIDED_VIA=$VIA "$GATE" decide "$k" maybe >/dev/null 2>&1; r5=$?
MYC_DECIDED_VIA=$VIA "$GATE" decide "$k" approve $'two\nlines' >/dev/null 2>&1; r6=$?
MYC_DECIDED_VIA=$VIA "$GATE" decide "$k" approve "$(head -c 201 /dev/zero | tr '\0' a)" >/dev/null 2>&1; r7=$?
MYC_DECIDED_VIA=$VIA "$GATE" decide "$k" approve "token ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123" >/dev/null 2>&1; r8=$?
[[ $(ncommits) == "$c" && $r5 != 0 && $r6 != 0 && $r7 != 0 && $r8 != 0 ]] && grep -q "sudo myc-decide" "$T/e1" && grep -q "sudo myc-decide" "$T/e2" \
  && grep -q "not the current decision" "$T/e3" && grep -q "not the current decision" "$T/e4" \
  && ok "no via / wrong via / wrong blob / wrong seq / bad action / multi-line, long or credential-like note: refused, nothing pushed" || { bad "decide refusals"; cat "$T/e1" "$T/e2" "$T/e3" "$T/e4"; }

echo "5. approve records the decision only"
MYC_DECIDED_VIA=$VIA "$GATE" decide "$k" approve "ok to publish" > "$T/out" 2>&1
lastev MYC-20261026-101 | jq -e --arg via "$VIA" --arg db "$(desc_blob MYC-20261026-101)" '.status == "approved" and .actor == "chris" and .decided_via == $via
  and .descriptor_blob == $db and .reason == "ok to publish" and .seq == 4' >/dev/null && [[ $(state MYC-20261026-101) == "MYC-20261026-101 approved seq=4"* ]] \
  && grep -q "does not start, resume or authorise" "$T/out" && ok "approved by chris via fpd-prod sudo, bound to descriptor and awaiting event" || { bad "approve"; cat "$T/out"; }
c=$(ncommits); "$GATE" claim MYC-20261026-101 >/dev/null 2>"$T/e"; [[ $(ncommits) == "$c" ]] && grep -q 'only a pending task can be claimed' "$T/e" \
  && ok "an approved task cannot be claimed: no execution from approval" || { bad "approved claimable"; cat "$T/e"; }
MYC_DECIDED_VIA=$VIA "$GATE" decide "$k" approve >/dev/null 2>"$T/e"; [[ $(ncommits) == "$c" ]] && grep -q 'no outstanding decision' "$T/e" && ok "deciding twice is refused" || bad "double decide"
o=$("${NOTE_ENV[@]}" "$MN" decisions 2>&1); [[ -z $o ]] && ok "notifier: decision no longer outstanding" || { bad "notifier after approve"; echo "$o"; }
"$GATE" grant >/dev/null 2>&1 && ok "grant no longer held by the decided task" || bad "grant after approve"

echo "6. reject is terminal"
mk_task MYC-20261026-102; r=$(claim MYC-20261026-102); finish "$r" "Delete the old listings?"; k2=$(keyof MYC-20261026-102)
MYC_DECIDED_VIA=$VIA "$GATE" decide "$k2" reject "no" >/dev/null 2>&1
[[ $(state MYC-20261026-102) == "MYC-20261026-102 rejected seq=4"* ]] && ok "rejected recorded" || bad "reject"

echo "7. bad runner output never becomes a decision request"
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

echo "8. hand-written decision events are quarantined by the validator"
mk_task MYC-20261026-121; r=$(claim MYC-20261026-121); finish "$r" "Approve?"; pe=$(git --git-dir="$T/remote.git" rev-parse "$B:$TD/MYC-20261026-121/events/0003.json"); db=$(desc_blob MYC-20261026-121)
hpush "$TD/MYC-20261026-121/events/0004.json" "$(jq -nc --arg pe "$pe" --arg db "$db" '{seq:4,status:"approved",at:"2026-10-26T10:05:00Z",actor:"claude",reason:"self-approved",prev_event:$pe,descriptor_blob:$db,decided_via:"fpd-prod:sudo:ct_admin"}')"
[[ $(state MYC-20261026-121) == *"QUARANTINE: decision event 4 is not a valid recorded decision"* ]] && ok "approval by an agent actor: quarantined" || bad "agent approval"
mk_task MYC-20261026-122; r=$(claim MYC-20261026-122); finish "$r" "Approve?"; pe=$(git --git-dir="$T/remote.git" rev-parse "$B:$TD/MYC-20261026-122/events/0003.json"); db=$(desc_blob MYC-20261026-122)
hpush "$TD/MYC-20261026-122/events/0004.json" "$(jq -nc --arg pe "$pe" --arg db "$db" '{seq:4,status:"approved",at:"2026-10-26T10:05:00Z",actor:"chris",reason:"ok",prev_event:$pe,descriptor_blob:$db}')"
[[ $(state MYC-20261026-122) == *"QUARANTINE"* ]] && ok "approval without decided_via: quarantined" || bad "no via"
mk_task MYC-20261026-123
hpush "$TD/MYC-20261026-123/events/0002.json" '{"seq":2,"status":"approved","at":"2026-10-26T10:05:00Z","actor":"chris","reason":"ok","decided_via":"fpd-prod:sudo:ct_admin"}'
[[ $(state MYC-20261026-123) == *"QUARANTINE: transition 'pending' -> 'approved'"* ]] && ok "approval without a decision request: quarantined" || bad "pending->approved"
mk_task MYC-20261026-124; r=$(claim MYC-20261026-124); pe=$(git --git-dir="$T/remote.git" rev-parse "$B:$TD/MYC-20261026-124/events/0002.json")
hpush "$TD/MYC-20261026-124/events/0003.json" "$(jq -nc --arg pe "$pe" '{seq:3,status:"awaiting_approval",at:"2026-10-26T10:05:00Z",actor:"hubsync-gate",reason:"x",run_id:"MYC-20261026-124-r1792999999-deadbeef",prev_event:$pe}')"
[[ $(state MYC-20261026-124) == *"QUARANTINE: decision request event 3"* ]] && ok "decision request with the wrong run: quarantined" || bad "wrong run"
# the notifier only notifies: forged approvals are no longer "awaiting", so they can never produce an email; the
# structural forgeries are also quarantined there. myc-gate (above) is the authoritative validator.
o=$("${NOTE_ENV[@]}" "$MN" decisions 2>&1)
! grep -qE '^MYC-20261026-12[1-4]-[0-9]{4}-[0-9a-f]{12}  ledger=' <<<"$o" && grep -q 'MYC-20261026-123' <<<"$o" && grep -q 'MYC-20261026-124' <<<"$o" \
  && ok "notifier: none of the hand-written cases is an outstanding decision (no email possible); 123/124 quarantined there too" || { bad "notifier view of forgeries"; echo "$o"; }

echo "9. myc-decide: terminal, confirmation and sudo identity"
mk_task MYC-20261026-131; r=$(claim MYC-20261026-131); finish "$r" "Approve the wrapper test?"; k3=$(keyof MYC-20261026-131); c=$(ncommits)
SUDO_USER=ct_admin "$DECIDE" "$k3" approve < /dev/null > "$T/o1" 2>&1
grep -q 'interactive terminal' "$T/o1" && [[ $(ncommits) == "$c" ]] && ok "no terminal: refused" || { bad "tty"; cat "$T/o1"; }
printf 'nope\n' | SUDO_USER=ct_admin script -qec "$DECIDE $k3 approve" /dev/null > "$T/o2" 2>&1
grep -q 'not confirmed' "$T/o2" && [[ $(ncommits) == "$c" ]] && ok "wrong confirmation: nothing recorded" || { bad "confirm"; cat "$T/o2"; }
printf 'MYC-20261026-131\n' | env -u SUDO_USER script -qec "$DECIDE $k3 approve" /dev/null > "$T/o3" 2>&1
grep -q 'through sudo' "$T/o3" && [[ $(ncommits) == "$c" ]] && ok "not run through sudo: refused" || { bad "sudo user"; cat "$T/o3"; }
printf 'MYC-20261026-131\n' | SUDO_USER=ct_admin script -qec "$DECIDE $k3 approve 'wrapper ok'" /dev/null > "$T/o4" 2>&1
grep -q 'summary: Approve the wrapper test?' "$T/o4" && lastev MYC-20261026-131 | jq -e '.status == "approved" and .decided_via == "fpd-prod:sudo:ct_admin" and .reason == "wrapper ok"' >/dev/null \
  && ok "shows the summary, confirmed by typing the task id, recorded with the sudo identity" || { bad "wrapper approve"; cat "$T/o4"; }

echo; echo "decision tests: $pass passed, $failn failed"; [[ $failn == 0 ]]
