#!/usr/bin/env bash
# bridge-launch.sh: the two approved L2 bridge turns, in order, with the INSTALLED Stage B runner (PROPOSAL;
# approved by Chris ("Send it", 28 Oct); see SHARED_MEMORY_ADAPTER_DELIVERY_2026-10-28.md section 11). It only calls the installed
# /usr/local/bin/myc-stageb (v5.1) and myc-gate; it installs nothing and changes no file outside the runner's own records.
#     sudo MYC_BILLING_CONFIRMED=yes bash bridge-launch.sh
# Turn order: 005 claude -> 006 codex. Each turn is one myc-stageb run (= at most one model
# call). A turn starts only if the previous one is `completed` on GitHub; anything else (failed, awaiting_approval,
# quarantined, in_progress, a refused claim) stops the launcher for good. The call cap (2), the 30-minute window and the
# hold-after-failure are enforced by myc-gate from GitHub history, so a rerun can never add calls beyond the two.
set -euo pipefail
ALLOW=/etc/myc-stageb/bridge-20261028.allowed
MAX_CALLS=2 WINDOW_S=1800
TASKS=(MYC-20261028-005 MYC-20261028-006)
AS_HUBSYNC="runuser -u hubsync -- env -i HOME=/var/lib/hubsync LANG=C.UTF-8 PATH=/usr/local/bin:/usr/bin:/bin MYC_ALLOW=$ALLOW MYC_MAX_CALLS=$MAX_CALLS"
STAGEB=/usr/local/bin/myc-stageb GATE=/usr/local/bin/myc-gate
if [[ ${COLLAB_TEST:-0} == 1 ]]; then   # offline test harness only
  ALLOW=$T_ALLOW AS_HUBSYNC="env MYC_ALLOW=$T_ALLOW MYC_MAX_CALLS=$MAX_CALLS $T_AS_HUBSYNC" STAGEB=$T_STAGEB GATE=$T_GATE
else
  [[ $EUID -eq 0 ]] || { echo "STOP: run with sudo"; exit 1; }
  [[ $(hostname) == fpd-prod ]] || { echo "STOP: fpd-prod only"; exit 1; }
fi
say()  { echo "bridge: $*"; }
stop() { say "STOP: $*. No further turn will run."; exit 1; }
[[ ${MYC_BILLING_CONFIRMED:-} == yes ]] || stop "first confirm Claude usage credits are OFF and no Codex credits/API key are in use, then run with MYC_BILLING_CONFIRMED=yes"
[[ -r $ALLOW && $(grep -c . "$ALLOW") == 2 ]] || stop "the allowlist $ALLOW must exist with exactly the two approved lines"
state() { $AS_HUBSYNC "$GATE" state "$1" | head -1; }
for t in "${TASKS[@]}"; do
  s=$(state "$t") || stop "could not read the state of $t"
  case $s in
    "$t completed "*) say "$t already completed; next turn"; continue ;;
    "$t pending "*)   ;;
    *)                stop "$t is not pending ($s); Chris decides" ;;
  esac
  say "turn $t: one myc-stageb run"
  MYC_ALLOW=$ALLOW MYC_AS_HUBSYNC="$AS_HUBSYNC" MYC_WINDOW_S=$WINDOW_S "$STAGEB" "$t" || stop "myc-stageb stopped on $t"
  s=$(state "$t") || stop "could not read the state of $t after its run"
  [[ $s == "$t completed "* ]] || stop "$t ended as: $s"
done
say "DONE: both turns completed; results are in greenfield/mycelium/tasks/MYC-20261028-00{5,6}/result.md on GitHub"
