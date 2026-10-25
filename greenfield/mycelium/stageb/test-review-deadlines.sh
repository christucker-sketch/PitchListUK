#!/usr/bin/env bash
# Codex review: local temporary Git only. No host/root/network or model calls.
# A deterministic clock advance models slow pinned-reference checks at admission.
set -euo pipefail
for c in git jq flock iconv dd timeout; do command -v "$c" >/dev/null; done
D=$(cd "$(dirname "$0")" && pwd)
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
B=findpitches-v3/greenfield; TD=greenfield/mycelium/tasks
export GIT_AUTHOR_NAME=chris GIT_AUTHOR_EMAIL=c@x GIT_COMMITTER_NAME=chris GIT_COMMITTER_EMAIL=c@x
git init -q --bare "$T/remote.git"
git clone -q "$T/remote.git" "$T/human" 2>/dev/null
(
  cd "$T/human"
  git checkout -q -b "$B"
  mkdir -p greenfield/mycelium
  echo 'read-only reference' > greenfield/mycelium/review-timing.md
  git add -A; git commit -qm init; git push -q origin "$B"
)
mkdir -p "$T/hs" "$T/spool" "$T/stub" "$T/ctl"
git clone -q --branch "$B" "$T/remote.git" "$T/hs/repo" 2>/dev/null
export PATH="$T/stub:$PATH" CTL=$T/ctl MYC_HOME=$T/hs MYC_SPOOL=$T/spool MYC_ALLOW=$T/allowed
export MYC_BRANCH=$B MYC_TASKS=$TD MYC_MAX_CALLS=2 MYC_PUBLISH_MARGIN_S=30 MYC_LEASE_MIN=30
: > "$MYC_ALLOW"
GATE=$D/myc-gate
export REVIEW_REF_BLOB
REVIEW_REF_BLOB=$(git --git-dir="$T/remote.git" rev-parse "$B:greenfield/mycelium/review-timing.md")
cat > "$T/stub/git" <<'WRAP'
#!/usr/bin/env bash
/usr/bin/git "$@"; rc=$?
if [[ $rc == 0 && ${1:-} == -C && ${2:-} == "$MYC_HOME/repo" && ${3:-} == cat-file && ${4:-} == -p && ${5:-} == "$REVIEW_REF_BLOB" && -f $CTL/advance_on_ref ]]; then
  cat "$CTL/advance_on_ref" > "$CTL/clock_offset"
fi
exit "$rc"
WRAP
cat > "$T/stub/date" <<'WRAP'
#!/usr/bin/env bash
if [[ $# == 2 && $1 == -u && $2 == +%s && -f $CTL/clock_offset ]]; then
  n=$(/usr/bin/date -u +%s); read -r offset < "$CTL/clock_offset"; echo "$((n + offset))"
else exec /usr/bin/date "$@"; fi
WRAP
chmod +x "$T/stub/git" "$T/stub/date"
mk_task() {
  local id=$1
  (
    cd "$T/human"
    git pull -q --rebase origin "$B"
    mkdir -p "$TD/$id/events"
    jq -n --arg t "$id" --arg rl "$TD/$id/result.md" \
      '{task_id:$t,assigned_agent:"codex",instructions:"Review timing\nref: greenfield/mycelium/review-timing.md",status:"pending",result_location:$rl}' > "$TD/$id/task.json"
    jq -n '{seq:1,status:"pending",at:"2026-10-25T00:00:00Z",actor:"chris",reason:"created by Chris"}' > "$TD/$id/events/0001.json"
    git add -A; git commit -qm "chris: task $id"; git push -q origin "$B"
  )
  # Each independent scenario has a fresh grant, not an extra task in the previous grant.
  printf '%s codex %s\n' "$id" "$(/usr/bin/git --git-dir="$T/remote.git" rev-parse "$B:$TD/$id/task.json")" > "$MYC_ALLOW"
}
pass=0; failn=0
ok() { echo "  PASS $*"; pass=$((pass+1)); }
bad() { echo "  FAIL $*"; failn=$((failn+1)); }

mk_task MYC-20261025-108
run=$(MYC_WINDOW_S=120 "$GATE" claim MYC-20261025-108 2>"$T/claim1.log")
first=$(/usr/bin/date -u -d "$(/usr/bin/git --git-dir="$T/remote.git" show "$B:$TD/MYC-20261025-108/events/0002.json" | jq -r .at)" +%s)
echo 60 > "$CTL/advance_on_ref"
MYC_WINDOW_S=120 "$GATE" admit "$run" >"$T/admit1.log" 2>&1
dl=$(jq -er .deadline_epoch "$MYC_SPOOL/$run/job.json")
if [[ $dl -le $((first+120-30)) ]]; then
  ok 'reference validation never extends the absolute grant deadline'
else bad "reference checks extended deadline by $((dl-first-120+30)) seconds"; fi

rm -f "$CTL/clock_offset" "$CTL/advance_on_ref"
mk_task MYC-20261025-109
run=$(MYC_WINDOW_S=60 "$GATE" claim MYC-20261025-109 2>"$T/claim2.log")
echo 120 > "$CTL/advance_on_ref"
rc=0
MYC_WINDOW_S=60 "$GATE" admit "$run" >"$T/admit2.log" 2>&1 || rc=$?
if [[ $rc != 0 && ! -e $MYC_SPOOL/$run/job.json && ! -e $MYC_SPOOL/$run/admitted ]]; then
  ok 'window expiring during reference checks refuses admission'
else bad 'admitted after the grant window expired during reference checks'; fi
printf 'deadline regressions: %s passed, %s failed (no model calls)\n' "$pass" "$failn"
[[ $failn == 0 ]]
