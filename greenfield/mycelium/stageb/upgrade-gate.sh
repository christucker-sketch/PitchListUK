#!/usr/bin/env bash
# Checked upgrade of myc-gate on fpd-prod, v2 -> v3 (Stage One digest-pinned local memory references). PROPOSAL; only after
# Codex review and Chris's approval of the Stage One scope:
#   sudo bash upgrade-gate.sh check      read-only: assert every hash and state below; changes nothing
#   sudo bash upgrade-gate.sh install    replace /usr/local/bin/myc-gate with the reviewed v3 from this folder
#   sudo bash upgrade-gate.sh rollback   restore the backed-up v2 myc-gate
# v3 adds ONLY the `memref: sha256:<digest>` reference form (claim + admit); the push contract, the shared fold block
# (mycnotify parity), myc-agent, myc-stageb, myc-decide, hubsync, timers, keys and notify.conf are asserted unchanged and
# never touched. No model or CLI call. On any failure after the swap, the previous file and receipt are restored and
# verified; otherwise it says INCOMPLETE RECOVERY. The log is kept.
set -euo pipefail
umask 077
GATE_OLD=a74add4e121c9e67bfa7d23dac1fe3fed1cc2e29a6440eecc3b8e8fa8e5480f7    # installed v2 (27 Oct receipt)
GATE_NEW=bca72724623b69439d2876eb4dd9aa3bb11e8b16f75a09f6238dab7e9d962dc1    # reviewed v3
AGENT=d173813b3400e736831f141de3993335c17c5baa0092b80667ec06a3ab2b25c6       # installed v6, must stay
STAGEB=c636582c4e8c3e41e2aa5fadbff9922b2af188754d41b25407ea6c392f26248a      # installed v5.1, must stay
DECIDE=7e361a4d60b68a809b00709be22ac910a0fdb443f9092c333c621d37f0ff3dd3
MN=b65180299e8e5984eb9642a37c78bf973eac75c78d6d014f37bc8a260336fab8
HUBSYNC_SHA=12a14b4ad8d14b4eb7de3e38e4ce1d00e839aa2354fb11ee6d22bf6e1f0e609d
BIN=/usr/local/bin R=/var/lib/myc-stageb/install-receipt SLOCK=/var/lib/myc-stageb/lock UP=/var/lib/myc-stageb/upgrade-gate
HLOCK=/var/lib/hubsync/lock OWN=(-o root -g root) WAIT=60
AS_HUBSYNC=(runuser -u hubsync -- env -i HOME=/var/lib/hubsync LANG=C.UTF-8 PATH=/usr/local/bin:/usr/bin:/bin)
if [[ ${UPGRADE_TEST:-0} == 1 ]]; then   # offline test harness only
  GATE_OLD=$T_GATE_OLD GATE_NEW=$T_GATE_NEW AGENT=$T_AGENT STAGEB=$T_STAGEB DECIDE=$T_DECIDE MN=$T_MN HUBSYNC_SHA=$T_HS
  BIN=$T_BIN R=$T_R SLOCK=$T_SLOCK UP=$T_UP HLOCK=$T_HLOCK OWN=() WAIT=2 AS_HUBSYNC=(env)
fi
MODE=${1:-}; SRC=$(cd "$(dirname "$0")" && pwd)
say()  { echo "upgrade-gate: $*"; }
stop() { say "STOP: $*"; exit 1; }
sha()  { sha256sum "$1" | cut -d' ' -f1; }
want() { [[ -f $1 && ! -L $1 && $(sha "$1") == "$2" ]] || stop "$1 is $( [[ -f $1 ]] && sha "$1" || echo missing), expected $2"; }
inrec() { grep -qE "^cmd ${1}[[:space:]]+${2}\$" "$R"; }

[[ $MODE == check || $MODE == install || $MODE == rollback ]] || { echo "usage: sudo bash upgrade-gate.sh check|install|rollback"; exit 2; }
if [[ ${UPGRADE_TEST:-0} != 1 ]]; then
  [[ $EUID -eq 0 ]] || stop "run with sudo"; [[ $(hostname) == fpd-prod ]] || stop "fpd-prod only"
fi
want "$BIN/hubsync" "$HUBSYNC_SHA"; want "$BIN/myc-agent" "$AGENT"; want "$BIN/myc-stageb" "$STAGEB"; want "$BIN/myc-decide" "$DECIDE"; want "$BIN/mycnotify" "$MN"
[[ -f $R ]] || stop "no Stage B install receipt at $R"
inrec "$AGENT" myc-agent && inrec "$STAGEB" myc-stageb && inrec "$DECIDE" myc-decide || stop "receipt does not record the installed myc-agent / myc-stageb / myc-decide"
case $MODE in
  check|install) want "$SRC/myc-gate" "$GATE_NEW"; want "$BIN/myc-gate" "$GATE_OLD"; inrec "$GATE_OLD" myc-gate || stop "receipt does not record the installed v2 myc-gate" ;;
  rollback) want "$BIN/myc-gate" "$GATE_NEW"; want "$UP/myc-gate" "$GATE_OLD"; [[ -f $UP/install-receipt ]] || stop "no receipt backup in $UP" ;;
esac
say "hashes as expected for $MODE; myc-agent, myc-stageb, myc-decide, mycnotify and hubsync as installed"
[[ $MODE != check ]] || { say "check only: nothing changed"; exit 0; }

install -d -m 700 "$UP"; LOG=$UP/$MODE-$(date -u +%Y%m%dT%H%M%SZ).log
exec > >(tee -a "$LOG") 2>&1
say "$MODE started $(date -u +%FT%TZ); log $LOG"
exec 7>>"$SLOCK"; flock -w "$WAIT" 7 || stop "a Stage B run holds its lock"
exec 6>>"$HLOCK"; flock -w "$WAIT" 6 || stop "the hub watcher / gate holds its lock"
say "Stage B and hub locks held (no run, claim or poll can use myc-gate during the swap)"

CHANGED=0 RESTORE_BAD=""
restore() {
  local bad=""
  install -m 755 "${OWN[@]}" "$PREV/myc-gate" "$BIN/myc-gate" || bad+=" myc-gate(install)"
  cp -p "$PREV/install-receipt" "$R" || bad+=" receipt(copy)"
  [[ -f $BIN/myc-gate && $(sha "$BIN/myc-gate") == "$(sha "$PREV/myc-gate")" ]] || bad+=" myc-gate(verify)"
  cmp -s "$PREV/install-receipt" "$R" || bad+=" receipt(verify)"
  RESTORE_BAD=$bad; [[ -z $bad ]]
}
on_exit() {
  local rc=$?; [[ $rc != 0 ]] || return 0; trap - EXIT; set +e
  say "FAILED (rc $rc); evidence kept in $LOG"
  if [[ $CHANGED == 1 ]]; then
    if restore; then say "previous myc-gate and receipt restored and verified"
    else say "INCOMPLETE RECOVERY:${RESTORE_BAD}. Previous copies are kept in $PREV; restore those by hand before anything else"; fi
  fi
  exit "$rc"
}
trap on_exit EXIT

PREV=$UP/prev-$(date -u +%Y%m%dT%H%M%SZ); install -d -m 700 "$PREV"
cp -p "$BIN/myc-gate" "$R" "$PREV/"
cmp -s "$BIN/myc-gate" "$PREV/myc-gate" && cmp -s "$R" "$PREV/install-receipt" || stop "backup differs"
if [[ $MODE == install ]]; then
  cp -p "$BIN/myc-gate" "$UP/myc-gate"; cp -p "$R" "$UP/install-receipt"; want "$UP/myc-gate" "$GATE_OLD"   # rollback source
fi
say "backup verified: $PREV"

CHANGED=1
if [[ $MODE == install ]]; then
  install -m 755 "${OWN[@]}" "$SRC/myc-gate" "$BIN/myc-gate"; want "$BIN/myc-gate" "$GATE_NEW"
  { grep -v -e '^cmd .* myc-gate$' "$R"; echo "gate_upgraded_at=$(date -u +%FT%TZ)"; printf 'cmd %s  %s\n' "$GATE_NEW" myc-gate; } > "$R.new"
  chmod 600 "$R.new"; mv "$R.new" "$R"
  inrec "$GATE_NEW" myc-gate && inrec "$AGENT" myc-agent && inrec "$STAGEB" myc-stageb && inrec "$DECIDE" myc-decide || stop "receipt update incomplete"
else
  install -m 755 "${OWN[@]}" "$UP/myc-gate" "$BIN/myc-gate"; cp -p "$UP/install-receipt" "$R"
  want "$BIN/myc-gate" "$GATE_OLD"; cmp -s "$UP/install-receipt" "$R" || stop "receipt not restored byte-for-byte"
fi
say "myc-gate replaced and verified"
flock -u 6; flock -u 7

# post-checks without any CLI or model call: syntax, argument validation, and the writer still reads history
bash -n "$BIN/myc-gate" || stop "syntax check failed"
o=$("${AS_HUBSYNC[@]}" "$BIN/myc-gate" not-a-command 2>&1) && stop "myc-gate accepted a bad command" || true
[[ $o == *usage* ]] || stop "myc-gate did not reject a bad command as expected: $o"
s=$("${AS_HUBSYNC[@]}" "$BIN/myc-gate" state MYC-20261025-003) || stop "myc-gate state failed"
[[ $s == "MYC-20261025-003 completed"* ]] || stop "unexpected state for MYC-20261025-003: $s"
want "$BIN/myc-agent" "$AGENT"; want "$BIN/myc-stageb" "$STAGEB"; want "$BIN/myc-decide" "$DECIDE"; want "$BIN/mycnotify" "$MN"; want "$BIN/hubsync" "$HUBSYNC_SHA"
say "post-checks ok (no CLI or model call): bad command rejected; myc-gate reads history ($s); other commands unchanged"
trap - EXIT
say "DONE: $MODE complete; myc-gate $(sha "$BIN/myc-gate" | cut -c1-12). Log: $LOG"
