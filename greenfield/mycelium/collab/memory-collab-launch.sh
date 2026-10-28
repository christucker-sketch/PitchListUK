#!/usr/bin/env bash
# memory-collab-launch.sh: the four approved memory-design turns, in order, with the INSTALLED Stage B runner (PROPOSAL;
# run only after Chris approves BRIX_MEMORY_COLLAB_RUN_PROPOSAL_2026-10-28.md). It only calls the installed
# /usr/local/bin/myc-stageb (v5.1) and myc-gate; it installs nothing and changes no file outside the runner's own records.
#     sudo MYC_BILLING_CONFIRMED=yes bash memory-collab-launch.sh
# Turn order: 001 claude -> 002 codex -> 003 claude -> 004 codex. Each turn is one myc-stageb run (= at most one model
# call). A turn starts only if the previous one is `completed` on GitHub; anything else (failed, awaiting_approval,
# quarantined, in_progress, a refused claim) stops the launcher for good. The call cap (4), the 60-minute window and the
# hold-after-failure are enforced by myc-gate from GitHub history, so a rerun can never add calls beyond the four.
set -euo pipefail
ALLOW=/etc/myc-stageb/collab-20261028.allowed
MAX_CALLS=4 WINDOW_S=3600
TASKS=(MYC-20261028-001 MYC-20261028-002 MYC-20261028-003 MYC-20261028-004)
AS_HUBSYNC="runuser -u hubsync -- env -i HOME=/var/lib/hubsync LANG=C.UTF-8 PATH=/usr/local/bin:/usr/bin:/bin MYC_ALLOW=$ALLOW MYC_MAX_CALLS=$MAX_CALLS"
STAGEB=/usr/local/bin/myc-stageb GATE=/usr/local/bin/myc-gate
if [[ ${COLLAB_TEST:-0} == 1 ]]; then   # offline test harness only
  ALLOW=$T_ALLOW AS_HUBSYNC="env MYC_ALLOW=$T_ALLOW MYC_MAX_CALLS=$MAX_CALLS $T_AS_HUBSYNC" STAGEB=$T_STAGEB GATE=$T_GATE
else
  [[ $EUID -eq 0 ]] || { echo "STOP: run with sudo"; exit 1; }
  [[ $(hostname) == fpd-prod ]] || { echo "STOP: fpd-prod only"; exit 1; }
fi
say()  { echo "memory-collab: $*"; }
stop() { say "STOP: $*. No further turn will run."; exit 1; }
[[ ${MYC_BILLING_CONFIRMED:-} == yes ]] || stop "first confirm Claude usage credits are OFF and no Codex credits/API key are in use, then run with MYC_BILLING_CONFIRMED=yes"
[[ -r $ALLOW && $(grep -c . "$ALLOW") == 4 ]] || stop "the allowlist $ALLOW must exist with exactly the four approved lines"
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
say "DONE: all four turns completed; results are in greenfield/mycelium/tasks/MYC-20261028-00{1..4}/result.md on GitHub"
