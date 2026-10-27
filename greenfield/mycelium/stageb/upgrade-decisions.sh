#!/usr/bin/env bash
# Checked upgrade for real-task decisions on fpd-prod (PROPOSAL; only after Codex review and Chris's go-ahead):
#   sudo bash upgrade-decisions.sh check      read-only: assert every hash and state below; changes nothing
#   sudo bash upgrade-decisions.sh install    replace myc-gate and mycnotify, add myc-decide (from this folder)
#   sudo bash upgrade-decisions.sh rollback   restore the backed-up myc-gate and mycnotify, remove myc-decide
# Does NOT install v5.1 (myc-agent / myc-stageb are untouched), start a model, enable a timer, provision a key, change
# notify.conf or send mail. hubsync's script and timer are untouched (only its shared writer lock is held during the
# swap, so neither a poll nor myc-gate can run mid-swap). Every step is checked; on any failure after the swap the
# previous files and receipt are restored and verified; the log is kept.
set -euo pipefail
umask 077
GATE_OLD=a55383f1280c511af6b1b98b348c94ffe90f46921bf7ee3c0cef8228a47086ab      # installed Stage B v5 myc-gate
GATE_NEW=a74add4e121c9e67bfa7d23dac1fe3fed1cc2e29a6440eecc3b8e8fa8e5480f7
DECIDE_NEW=7e361a4d60b68a809b00709be22ac910a0fdb443f9092c333c621d37f0ff3dd3
MN_OLD=b18edfaaaa8d0359ee2eeb9d084cd6f489f83c26b9c40cb8b7ffa1dc50d546fe        # installed Stage C mycnotify (f7b18376)
MN_NEW=b65180299e8e5984eb9642a37c78bf973eac75c78d6d014f37bc8a260336fab8
HUBSYNC_SHA=12a14b4ad8d14b4eb7de3e38e4ce1d00e839aa2354fb11ee6d22bf6e1f0e609d   # installed hubsync rev 3
BIN=/usr/local/bin R=/var/lib/myc-stageb/install-receipt SLOCK=/var/lib/myc-stageb/lock HLOCK=/var/lib/hubsync/lock
MLOCK=/var/lib/mycnotify/lock CONF=/etc/mycnotify/notify.conf UP=/var/lib/myc-stageb/upgrade-decisions
SYSTEMCTL=systemctl OWN=(-o root -g root) WAIT=60
AS_HUBSYNC=(runuser -u hubsync -- env -i HOME=/var/lib/hubsync LANG=C.UTF-8 PATH=/usr/local/bin:/usr/bin:/bin)
AS_MN=(runuser -u mycnotify -- env -i MYCNOTIFY_HOME=/var/lib/mycnotify PATH=/usr/local/bin:/usr/bin:/bin)
if [[ ${UPGRADE_TEST:-0} == 1 ]]; then   # offline test harness only
  GATE_OLD=$T_GATE_OLD GATE_NEW=$T_GATE_NEW DECIDE_NEW=$T_DECIDE_NEW MN_OLD=$T_MN_OLD MN_NEW=$T_MN_NEW HUBSYNC_SHA=$T_HS
  BIN=$T_BIN R=$T_R SLOCK=$T_SLOCK HLOCK=$T_HLOCK MLOCK=$T_MLOCK CONF=$T_CONF UP=$T_UP SYSTEMCTL=$T_SYSTEMCTL OWN=() WAIT=2
  AS_HUBSYNC=(env) AS_MN=(env)
fi
MODE=${1:-}; SRC=$(cd "$(dirname "$0")" && pwd)
say()  { echo "upgrade-decisions: $*"; }
stop() { say "STOP: $*"; exit 1; }
sha()  { sha256sum "$1" | cut -d' ' -f1; }
want() { [[ -f $1 && ! -L $1 && $(sha "$1") == "$2" ]] || stop "$1 is $( [[ -f $1 ]] && sha "$1" || echo missing), expected $2"; }

[[ $MODE == check || $MODE == install || $MODE == rollback ]] || { echo "usage: sudo bash upgrade-decisions.sh check|install|rollback"; exit 2; }
if [[ ${UPGRADE_TEST:-0} != 1 ]]; then
  [[ $EUID -eq 0 ]] || stop "run with sudo"; [[ $(hostname) == fpd-prod ]] || stop "fpd-prod only"
fi
want "$BIN/hubsync" "$HUBSYNC_SHA"
[[ -f $R ]] || stop "no Stage B install receipt at $R"
! grep -qx 'MODE=live' "$CONF" 2>/dev/null || stop "notify.conf says MODE=live; set MODE=dry-run first"
[[ $($SYSTEMCTL is-active mycnotify.timer || true) != active ]] || stop "mycnotify.timer is active; this upgrade expects it off"
case $MODE in
  check|install)
    want "$SRC/myc-gate" "$GATE_NEW"; want "$SRC/myc-decide" "$DECIDE_NEW"; want "$SRC/mycnotify" "$MN_NEW"
    want "$BIN/myc-gate" "$GATE_OLD"; want "$BIN/mycnotify" "$MN_OLD"
    [[ ! -e $BIN/myc-decide ]] || stop "$BIN/myc-decide already exists"
    grep -qE "^cmd ${GATE_OLD}[[:space:]]+myc-gate\$" "$R" || stop "receipt does not record the installed myc-gate" ;;   # install-stageb writes sha256sum's two-space format
  rollback)
    want "$BIN/myc-gate" "$GATE_NEW"; want "$BIN/myc-decide" "$DECIDE_NEW"; want "$BIN/mycnotify" "$MN_NEW"
    want "$UP/myc-gate" "$GATE_OLD"; want "$UP/mycnotify" "$MN_OLD"; [[ -f $UP/install-receipt ]] || stop "no receipt backup in $UP" ;;
esac
say "hashes as expected for $MODE; hubsync rev 3; mycnotify dry-run with timer off"
[[ $MODE != check ]] || { say "check only: nothing changed"; exit 0; }

install -d -m 700 "$UP"; LOG=$UP/$MODE-$(date -u +%Y%m%dT%H%M%SZ).log
exec > >(tee -a "$LOG") 2>&1
say "$MODE started $(date -u +%FT%TZ); log $LOG"
exec 7>>"$SLOCK"; flock -w "$WAIT" 7 || stop "a Stage B run holds its lock"
exec 8>>"$HLOCK"; flock -w "$WAIT" 8 || stop "hubsync/myc-gate shared lock busy"
exec 9>>"$MLOCK"; flock -w "$WAIT" 9 || stop "a mycnotify run holds its lock"
say "Stage B, shared writer and mycnotify locks held"

restore() {  # put back exactly what was there before this run; succeeds only if EVERY item is verified back
  local bad=""
  install -m 755 "${OWN[@]}" "$PREV/myc-gate" "$BIN/myc-gate" || bad+=" myc-gate(install)"
  install -m 755 "${OWN[@]}" "$PREV/mycnotify" "$BIN/mycnotify" || bad+=" mycnotify(install)"
  if [[ -f $PREV/myc-decide ]]; then install -m 755 "${OWN[@]}" "$PREV/myc-decide" "$BIN/myc-decide" || bad+=" myc-decide(install)"
  else rm -f "$BIN/myc-decide" || bad+=" myc-decide(remove)"; fi
  cp -p "$PREV/install-receipt" "$R" || bad+=" receipt(copy)"
  [[ -f $BIN/myc-gate && $(sha "$BIN/myc-gate") == "$(sha "$PREV/myc-gate")" ]] || bad+=" myc-gate(verify)"
  [[ -f $BIN/mycnotify && $(sha "$BIN/mycnotify") == "$(sha "$PREV/mycnotify")" ]] || bad+=" mycnotify(verify)"
  if [[ -f $PREV/myc-decide ]]; then [[ -f $BIN/myc-decide && $(sha "$BIN/myc-decide") == "$(sha "$PREV/myc-decide")" ]] || bad+=" myc-decide(verify)"
  else [[ ! -e $BIN/myc-decide ]] || bad+=" myc-decide(still present)"; fi
  cmp -s "$PREV/install-receipt" "$R" || bad+=" receipt(verify)"
  RESTORE_BAD=$bad; [[ -z $bad ]]
}
CHANGED=0 RESTORE_BAD=""
on_exit() {
  local rc=$?; [[ $rc != 0 ]] || return 0; trap - EXIT; set +e
  say "FAILED (rc $rc); evidence kept in $LOG"
  if [[ $CHANGED == 1 ]]; then
    if restore; then say "previous files and receipt restored and verified (myc-gate, mycnotify, myc-decide, receipt)"
    else say "INCOMPLETE RECOVERY:${RESTORE_BAD}. Previous copies are kept in $PREV; restore those by hand before anything else"; fi
  fi
  exit "$rc"
}
trap on_exit EXIT

PREV=$UP/prev-$(date -u +%Y%m%dT%H%M%SZ); install -d -m 700 "$PREV"
cp -p "$BIN/myc-gate" "$BIN/mycnotify" "$R" "$PREV/"; [[ ! -f $BIN/myc-decide ]] || cp -p "$BIN/myc-decide" "$PREV/"
cmp -s "$BIN/myc-gate" "$PREV/myc-gate" && cmp -s "$BIN/mycnotify" "$PREV/mycnotify" || stop "backup differs"
if [[ $MODE == install ]]; then
  cp -p "$BIN/myc-gate" "$UP/myc-gate"; cp -p "$BIN/mycnotify" "$UP/mycnotify"; cp -p "$R" "$UP/install-receipt"   # rollback source
  want "$UP/myc-gate" "$GATE_OLD"; want "$UP/mycnotify" "$MN_OLD"
fi
say "backup verified: $PREV"

CHANGED=1
if [[ $MODE == install ]]; then
  install -m 755 "${OWN[@]}" "$SRC/myc-gate" "$BIN/myc-gate"; install -m 755 "${OWN[@]}" "$SRC/myc-decide" "$BIN/myc-decide"
  install -m 755 "${OWN[@]}" "$SRC/mycnotify" "$BIN/mycnotify"
  want "$BIN/myc-gate" "$GATE_NEW"; want "$BIN/myc-decide" "$DECIDE_NEW"; want "$BIN/mycnotify" "$MN_NEW"
  { grep -v -e '^cmd .* myc-gate$' -e '^cmd .* myc-decide$' "$R"; echo "decisions_upgraded_at=$(date -u +%FT%TZ)"
    printf 'cmd %s  %s\n' "$GATE_NEW" myc-gate "$DECIDE_NEW" myc-decide; } > "$R.new"; chmod 600 "$R.new"; mv "$R.new" "$R"
else
  install -m 755 "${OWN[@]}" "$UP/myc-gate" "$BIN/myc-gate"; install -m 755 "${OWN[@]}" "$UP/mycnotify" "$BIN/mycnotify"; rm -f "$BIN/myc-decide"
  cp -p "$UP/install-receipt" "$R"
  want "$BIN/myc-gate" "$GATE_OLD"; want "$BIN/mycnotify" "$MN_OLD"; [[ ! -e $BIN/myc-decide ]] || stop "myc-decide still present"
  cmp -s "$UP/install-receipt" "$R" || stop "receipt not restored byte-for-byte"
fi
say "files replaced and verified"
flock -u 7; flock -u 8; flock -u 9

# post-checks: the validator still reads the existing history; the notifier (dry run) reads the real tasks cleanly
s=$("${AS_HUBSYNC[@]}" "$BIN/myc-gate" state MYC-20261025-003) || stop "myc-gate state failed"
[[ $s == "MYC-20261025-003 completed"* ]] || stop "unexpected state for MYC-20261025-003: $s"
say "myc-gate reads existing history: $s"
$SYSTEMCTL start mycnotify.service
[[ $($SYSTEMCTL show -p Result --value mycnotify.service) == success ]] || stop "mycnotify dry-run poll failed"
st=$("${AS_MN[@]}" "$BIN/mycnotify" status) || stop "mycnotify status failed"
jq -e '.mode == "dry-run" and .result == "ok" and (.quarantined | length) == 0' <<<"$st" >/dev/null || stop "mycnotify status not clean: $st"
say "mycnotify dry-run ok; quarantined: none; hub $(jq -r .hub_commit <<<"$st")"
[[ $($SYSTEMCTL is-active mycnotify.timer || true) != active ]] || stop "mycnotify.timer became active"
want "$BIN/hubsync" "$HUBSYNC_SHA"
trap - EXIT
say "DONE: $MODE complete; myc-gate $(sha "$BIN/myc-gate" | cut -c1-12), mycnotify $(sha "$BIN/mycnotify" | cut -c1-12), myc-decide $( [[ -e $BIN/myc-decide ]] && sha "$BIN/myc-decide" | cut -c1-12 || echo absent). Log: $LOG"
