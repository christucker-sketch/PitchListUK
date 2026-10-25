#!/usr/bin/env bash
# Checked in-place upgrade (or rollback) of the hubsync script on fpd-prod. PROPOSAL: run only after Codex's review
# and Chris's explicit go-ahead on these exact commands.
#   sudo bash upgrade-hubsync.sh check      read-only: assert hashes and print timer/service state; changes nothing
#   sudo bash upgrade-hubsync.sh install    replace the reviewed OLD script with the reviewed NEW one (from this folder)
#   sudo bash upgrade-hubsync.sh rollback   put the verified backup (OLD) back in place of NEW
# Every step is checked (set -e plus explicit tests). It never touches the unit, timer files, drop-in, key, clone,
# state or Stage B. Sequence: assert hashes -> record timer state -> stop timer -> wait until no poll is running ->
# hold the shared writer lock (the same lock hubsync poll and myc-gate take) -> back up and verify -> replace and
# verify -> release lock -> one poll through the unit -> check status -> restore the timer state recorded at the start.
# On any failure after the replacement, the previous script is put back and verified; the timer is always returned to
# its recorded state; the log is kept.
set -euo pipefail
umask 077

EXPECT_OLD=e1417ef1bc5cd44380dba1959e9385b444fd02cba23c44b2c124b0c2d6ef128e   # deployed source (34331ec1)
EXPECT_NEW=12a14b4ad8d14b4eb7de3e38e4ce1d00e839aa2354fb11ee6d22bf6e1f0e609d                                                     # reviewed new source
BIN=/usr/local/bin/hubsync
HS_HOME=/var/lib/hubsync
UP=/var/lib/hubsync-upgrade
SYSTEMCTL=systemctl
OWN=(-o root -g root)
LOCK_WAIT=120
if [[ ${HUBSYNC_UPGRADE_TEST:-0} == 1 ]]; then   # offline test harness only (fake systemctl, temp paths, no root)
  EXPECT_OLD=$T_OLD EXPECT_NEW=$T_NEW BIN=$T_BIN HS_HOME=$T_HSHOME UP=$T_UP SYSTEMCTL=$T_SYSTEMCTL OWN=() LOCK_WAIT=2
fi
LOCK=$HS_HOME/lock
SRC=$(cd "$(dirname "$0")" && pwd)/hubsync
MODE=${1:-}

say()  { echo "upgrade-hubsync: $*"; }
stop() { say "STOP: $*"; exit 1; }
sha()  { sha256sum "$1" | cut -d' ' -f1; }
assert_sha() { [[ -f $1 && ! -L $1 ]] || stop "$1 missing or a symlink"; local h; h=$(sha "$1"); [[ $h == "$2" ]] || stop "$1 sha256 $h, expected $2"; }

[[ $MODE == check || $MODE == install || $MODE == rollback ]] || { echo "usage: sudo bash upgrade-hubsync.sh check|install|rollback"; exit 2; }
if [[ ${HUBSYNC_UPGRADE_TEST:-0} != 1 ]]; then
  [[ $EUID -eq 0 ]] || stop "run with sudo"
  [[ $(hostname) == fpd-prod ]] || stop "fpd-prod only (this is $(hostname))"
fi
[[ -f $LOCK ]] || stop "shared lock $LOCK not found"

BACKUP=$UP/hubsync.$EXPECT_OLD
case $MODE in
  check|install) FROM=$EXPECT_OLD TO=$EXPECT_NEW NEWFILE=$SRC ;;
  rollback)      FROM=$EXPECT_NEW TO=$EXPECT_OLD NEWFILE=$BACKUP ;;
esac
assert_sha "$BIN" "$FROM"
assert_sha "$NEWFILE" "$TO"
TIMER_ACTIVE=$($SYSTEMCTL is-active hubsync.timer || true)
TIMER_ENABLED=$($SYSTEMCTL is-enabled hubsync.timer || true)
say "installed $BIN = $FROM (expected); replacement $NEWFILE = $TO (expected)"
say "hubsync.timer: active=$TIMER_ACTIVE enabled=$TIMER_ENABLED; hubsync.service: $($SYSTEMCTL is-active hubsync.service || true)"
[[ $MODE != check ]] || { say "check only: nothing changed"; exit 0; }

install -d -m 700 "$UP"
LOG=$UP/$MODE-$(date -u +%Y%m%dT%H%M%SZ).log
exec > >(tee -a "$LOG") 2>&1
say "$MODE started $(date -u +%FT%TZ); log $LOG"

REPLACED=0
restore_timer() {
  if [[ $TIMER_ACTIVE == active ]]; then
    $SYSTEMCTL start hubsync.timer && say "timer restored: $($SYSTEMCTL is-active hubsync.timer || true)" \
      || say "WARNING: could not restart hubsync.timer; start it by hand: sudo systemctl start hubsync.timer"
  else
    say "timer left $($SYSTEMCTL is-active hubsync.timer || true) (it was $TIMER_ACTIVE before)"
  fi
}
on_exit() {
  local rc=$?
  [[ $rc != 0 ]] || return 0
  trap - EXIT
  set +e
  say "FAILED (rc $rc); evidence kept in $LOG"
  if [[ $REPLACED == 1 ]]; then
    local prev=$UP/prev.$FROM
    if [[ -f $prev && $(sha "$prev") == "$FROM" ]] && install -m 755 "${OWN[@]}" "$prev" "$BIN" && [[ $(sha "$BIN") == "$FROM" ]]; then
      say "previous script restored and verified ($FROM)"
    else
      say "WARNING: could not restore the previous script; $BIN is $(sha "$BIN" 2>/dev/null || echo missing). Copy: $prev"
    fi
  fi
  restore_timer
  exit "$rc"
}
trap on_exit EXIT   # any failure from here on (set -e or stop) restores as described above

# 1. stop the timer, wait for any running poll to finish (TimeoutStartSec is 4 min)
$SYSTEMCTL stop hubsync.timer
for _ in $(seq 1 50); do
  state=$($SYSTEMCTL is-active hubsync.service || true)
  [[ $state == active || $state == activating ]] || break
  sleep 5
done
[[ $state != active && $state != activating ]] || stop "hubsync.service still running after 250 s"
say "timer stopped; no poll running (service: $state)"

# 2. hold the shared writer lock so neither a poll nor myc-gate can use the clone during the swap
exec 9>>"$LOCK"
flock -w "$LOCK_WAIT" 9 || stop "shared lock busy for $LOCK_WAIT s (myc-gate or a poll?)"
say "shared writer lock held"

# 3. keep a verified copy of what is installed now (the rollback source for this run)
cp -p "$BIN" "$UP/prev.$FROM"
assert_sha "$UP/prev.$FROM" "$FROM"
cmp -s "$BIN" "$UP/prev.$FROM" || stop "backup differs from installed file"
if [[ $MODE == install ]]; then
  [[ -f $BACKUP ]] || cp -p "$BIN" "$BACKUP"
  assert_sha "$BACKUP" "$EXPECT_OLD"
fi
say "backup verified: $UP/prev.$FROM"

# 4. replace and verify
REPLACED=1
install -m 755 "${OWN[@]}" "$NEWFILE" "$BIN"
assert_sha "$BIN" "$TO"
say "installed $BIN = $TO"
flock -u 9; exec 9>&-

# 5. one poll through the unit, then check its result and the status file
$SYSTEMCTL start hubsync.service
[[ $($SYSTEMCTL show -p Result --value hubsync.service) == success ]] || stop "poll unit result: $($SYSTEMCTL show -p Result --value hubsync.service)"
jq -e '.last_result == "ok"' "$HS_HOME/status.json" >/dev/null || stop "status after poll: $(jq -c '{last_result,message}' "$HS_HOME/status.json")"
say "poll ok: $(jq -r '.message' "$HS_HOME/status.json")"
if [[ $MODE == install ]]; then
  jq -e '.backlog | type == "number" and . >= 0' "$HS_HOME/state.json" >/dev/null || stop "state.json has no backlog after the poll"
  say "state backlog: $(jq '.backlog' "$HS_HOME/state.json")"
fi

trap - EXIT
restore_timer
say "DONE: $MODE complete; $BIN = $TO. Log: $LOG"
