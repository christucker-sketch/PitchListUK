#!/usr/bin/env bash
# Codex review: local temporary Git + deterministic clock only; no model/root/host/network calls.
# All native timeouts except the simulated publication phases still use GNU timeout.
set -euo pipefail
for c in git jq flock iconv dd timeout; do command -v "$c" >/dev/null; done
D=$(cd "$(dirname "$0")" && pwd)
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
B=findpitches-v3/greenfield; TD=greenfield/mycelium/tasks
export GIT_AUTHOR_NAME=chris GIT_AUTHOR_EMAIL=c@x GIT_COMMITTER_NAME=chris GIT_COMMITTER_EMAIL=c@x
git init -q --bare "$T/remote.git"
git clone -q "$T/remote.git" "$T/human" 2>/dev/null
(
  cd "$T/human"; git checkout -q -b "$B"
  mkdir -p team; echo fixture > team/README.md
  git add -A; git commit -qm init; git push -q origin "$B"
)
mkdir -p "$T/hs" "$T/spool" "$T/stub" "$T/ctl"
git clone -q --branch "$B" "$T/remote.git" "$T/hs/repo" 2>/dev/null
export PATH="$T/stub:$PATH" CTL=$T/ctl MYC_HOME=$T/hs MYC_SPOOL=$T/spool MYC_ALLOW=$T/allowed
export MYC_BRANCH=$B MYC_TASKS=$TD MYC_MAX_CALLS=2 MYC_WINDOW_S=90 MYC_PUBLISH_MARGIN_S=30 MYC_LEASE_MIN=30
GATE=$D/myc-gate
cat > "$T/stub/date" <<'WRAP'
#!/usr/bin/env bash
if [[ $# == 2 && $1 == -u && $2 == +%s && -f $CTL/fake_time ]]; then cat "$CTL/fake_time"
else exec /usr/bin/date "$@"; fi
WRAP
cat > "$T/stub/git" <<'WRAP'
#!/usr/bin/env bash
if [[ -f $CTL/enabled && $* == *' commit '* && $(cat "$CTL/scenario") == commit ]]; then
  echo "$(( $(cat "$CTL/fake_time") + 16 ))" > "$CTL/fake_time"
fi
exec /usr/bin/git "$@"
WRAP
cat > "$T/stub/timeout" <<'WRAP'
#!/usr/bin/env bash
args=("$@")
# Only emulate the two final network phases. Initial sync and file reads stay real/local.
while :; do
  case ${1:-} in
    -k|-s|--kill-after|--signal) shift 2;;
    --kill-after=*|--signal=*) shift;;
    *) break;;
  esac
done
cap=${1:-}; shift || exit 1
if [[ -f $CTL/enabled && ${1:-} == git && ${4:-} == push ]]; then
  phase=push
elif [[ -f $CTL/pushed && ${1:-} == git && ${4:-} == fetch ]]; then
  phase=fetch
else exec /usr/bin/timeout "${args[@]}"; fi
printf '%s %s\n' "$phase" "$cap" >> "$CTL/phase_caps"
# Each phase consumes 16 seconds. A correct shared budget must shorten/refuse the later phase.
step=16; [[ $(cat "$CTL/scenario") == fast ]] && step=1
if awk -v cap="$cap" -v step="$step" 'BEGIN {exit !(cap < step)}'; then
  echo "$(( $(cat "$CTL/fake_time") + ${cap%.*} ))" > "$CTL/fake_time"
  exit 124
fi
echo "$(( $(cat "$CTL/fake_time") + step ))" > "$CTL/fake_time"
[[ $phase == push ]] && touch "$CTL/pushed"
exec "$@"
WRAP
chmod +x "$T/stub/"*
mk_task() {
  local id=$1
  (
    cd "$T/human"; git pull -q --rebase origin "$B"
    mkdir -p "$TD/$id/events"
    jq -n --arg t "$id" --arg rl "$TD/$id/result.md" \
      '{task_id:$t,assigned_agent:"codex",instructions:"Offline fixture",status:"pending",result_location:$rl}' > "$TD/$id/task.json"
    jq -n '{seq:1,status:"pending",at:"2026-10-25T00:00:00Z",actor:"chris",reason:"created by Chris"}' > "$TD/$id/events/0001.json"
    git add -A; git commit -qm "chris: task $id"; git push -q origin "$B"
  )
  printf '%s codex %s\n' "$id" "$(/usr/bin/git --git-dir="$T/remote.git" rev-parse "$B:$TD/$id/task.json")" > "$MYC_ALLOW"
}
pass=0; failn=0
for scenario in fast commit fetch; do
  rm -f "$CTL/enabled" "$CTL/fake_time" "$CTL/pushed" "$CTL/phase_caps"
  case $scenario in fast) id=MYC-20261025-112;; commit) id=MYC-20261025-110;; fetch) id=MYC-20261025-111;; esac
  mk_task "$id"
  run=$("$GATE" claim "$id" 2>"$T/claim.log")
  "$GATE" admit "$run" >"$T/admit.log" 2>&1
  jq -n '{ok:true,agent:"codex",seconds:1,model:"offline fixture",cli_version:"test"}' > "$MYC_SPOOL/$run/out/meta.json"
  echo '# Offline result' > "$MYC_SPOOL/$run/out/result.md"
  # Use the genuine admitted deadline, consistent with durable first-claim time + this short grant.
  # Advance to 20 seconds before that end; never modify the job packet to create an artificial deadline.
  pub_end=$(( $(jq -er .deadline_epoch "$MYC_SPOOL/$run/job.json") + MYC_PUBLISH_MARGIN_S ))
  base=$((pub_end-20))
  echo "$base" > "$CTL/fake_time"; echo "$scenario" > "$CTL/scenario"; touch "$CTL/enabled"
  rc=0; "$GATE" complete "$run" >"$T/complete.log" 2>&1 || rc=$?
  last=$(cat "$CTL/fake_time")
  if [[ $scenario == fast ]]; then
    if [[ $rc == 0 && $last -le $pub_end ]] && /usr/bin/git --git-dir="$T/remote.git" show "$B:$TD/$id/events/0003.json" | jq -e '.status == "completed"' >/dev/null; then
      echo '  PASS control: timely result accepted'; pass=$((pass+1))
    else echo '  FAIL control: timely result was not accepted'; failn=$((failn+1)); fi
  elif [[ $rc == 0 && $last -gt $pub_end ]]; then
    echo "  FAIL $scenario: success reported $((last-pub_end)) seconds beyond grant end"
    failn=$((failn+1)); cat "$CTL/phase_caps"
  else
    echo "  PASS $scenario: no late successful completion"
    pass=$((pass+1))
  fi
done
printf 'publication regressions: %s passed, %s failed (no model calls)\n' "$pass" "$failn"
[[ $failn == 0 ]]
