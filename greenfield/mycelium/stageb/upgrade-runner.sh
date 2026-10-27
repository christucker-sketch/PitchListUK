#!/usr/bin/env bash
# Checked upgrade of the Stage B runner on fpd-prod to v6 (PROPOSAL; only after Codex review and Chris's go-ahead):
#   sudo bash upgrade-runner.sh check      read-only: assert every hash and state below; changes nothing
#   sudo bash upgrade-runner.sh install    replace myc-agent (v5 -> v6) and myc-stageb (v5 -> v5.1), from this folder
#   sudo bash upgrade-runner.sh rollback   restore the backed-up v5 myc-agent and myc-stageb
# v6 myc-agent = reviewed v5.1 (stdin detached from every CLI) + decision output. myc-stageb v5.1 is the reviewed,
# unchanged v5.1 file (its two `</dev/null` lines); both are deployed deliberately, see the proposal. myc-gate,
# myc-decide, mycnotify, hubsync, timers, keys and notify.conf are asserted unchanged and never touched. No model or
# CLI call is made (post-checks only exercise argument validation). On any failure after the swap the previous files
# and the receipt are restored and verified; otherwise it says INCOMPLETE RECOVERY. The log is kept.
set -euo pipefail
umask 077
AGENT_OLD=3eac7dbbe92a791ed65d79a3ac3225f63cb5ee48a9f97ccb1bc475620a283bbc     # installed v5 myc-agent (receipt)
AGENT_NEW=ec7c248f4696060aa7ecbbc9136cb4b71731bab27820ec1174e63b5f5a07e1f4
STAGEB_OLD=ee1b9bea1d8bc9a14e58f709e4d5a46fad427eeedadf694f21fec8c8c2d46dd6    # installed v5 myc-stageb (receipt)
STAGEB_NEW=c636582c4e8c3e41e2aa5fadbff9922b2af188754d41b25407ea6c392f26248a    # reviewed v5.1 myc-stageb (unchanged)
GATE=a74add4e121c9e67bfa7d23dac1fe3fed1cc2e29a6440eecc3b8e8fa8e5480f7          # installed 27 Oct, must stay
DECIDE=7e361a4d60b68a809b00709be22ac910a0fdb443f9092c333c621d37f0ff3dd3
MN=b65180299e8e5984eb9642a37c78bf973eac75c78d6d014f37bc8a260336fab8
HUBSYNC_SHA=12a14b4ad8d14b4eb7de3e38e4ce1d00e839aa2354fb11ee6d22bf6e1f0e609d
BIN=/usr/local/bin R=/var/lib/myc-stageb/install-receipt SLOCK=/var/lib/myc-stageb/lock UP=/var/lib/myc-stageb/upgrade-runner
OWN=(-o root -g root) WAIT=60
AS_MYC=(runuser -u myc -- env -i HOME=/home/myc PATH=/usr/local/bin:/usr/bin:/bin)
AS_HUBSYNC=(runuser -u hubsync -- env -i HOME=/var/lib/hubsync LANG=C.UTF-8 PATH=/usr/local/bin:/usr/bin:/bin)
if [[ ${UPGRADE_TEST:-0} == 1 ]]; then   # offline test harness only
  AGENT_OLD=$T_AGENT_OLD AGENT_NEW=$T_AGENT_NEW STAGEB_OLD=$T_STAGEB_OLD STAGEB_NEW=$T_STAGEB_NEW GATE=$T_GATE DECIDE=$T_DECIDE MN=$T_MN
  HUBSYNC_SHA=$T_HS BIN=$T_BIN R=$T_R SLOCK=$T_SLOCK UP=$T_UP OWN=() WAIT=2 AS_MYC=(env) AS_HUBSYNC=(env)
fi
MODE=${1:-}; SRC=$(cd "$(dirname "$0")" && pwd)
say()  { echo "upgrade-runner: $*"; }
stop() { say "STOP: $*"; exit 1; }
sha()  { sha256sum "$1" | cut -d' ' -f1; }
want() { [[ -f $1 && ! -L $1 && $(sha "$1") == "$2" ]] || stop "$1 is $( [[ -f $1 ]] && sha "$1" || echo missing), expected $2"; }
inrec() { grep -qE "^cmd ${1}[[:space:]]+${2}\$" "$R"; }   # install-stageb writes sha256sum's two-space format

[[ $MODE == check || $MODE == install || $MODE == rollback ]] || { echo "usage: sudo bash upgrade-runner.sh check|install|rollback"; exit 2; }
if [[ ${UPGRADE_TEST:-0} != 1 ]]; then
  [[ $EUID -eq 0 ]] || stop "run with sudo"; [[ $(hostname) == fpd-prod ]] || stop "fpd-prod only"
fi
want "$BIN/hubsync" "$HUBSYNC_SHA"; want "$BIN/myc-gate" "$GATE"; want "$BIN/myc-decide" "$DECIDE"; want "$BIN/mycnotify" "$MN"
[[ -f $R ]] || stop "no Stage B install receipt at $R"
inrec "$GATE" myc-gate && inrec "$DECIDE" myc-decide || stop "receipt does not record the installed myc-gate / myc-decide"
case $MODE in
  check|install)
    want "$SRC/myc-agent" "$AGENT_NEW"; want "$SRC/myc-stageb" "$STAGEB_NEW"
    want "$BIN/myc-agent" "$AGENT_OLD"; want "$BIN/myc-stageb" "$STAGEB_OLD"
    inrec "$AGENT_OLD" myc-agent && inrec "$STAGEB_OLD" myc-stageb || stop "receipt does not record the installed v5 myc-agent / myc-stageb" ;;
  rollback)
    want "$BIN/myc-agent" "$AGENT_NEW"; want "$BIN/myc-stageb" "$STAGEB_NEW"
    want "$UP/myc-agent" "$AGENT_OLD"; want "$UP/myc-stageb" "$STAGEB_OLD"; [[ -f $UP/install-receipt ]] || stop "no receipt backup in $UP" ;;
esac
say "hashes as expected for $MODE; myc-gate, myc-decide, mycnotify and hubsync as installed"
[[ $MODE != check ]] || { say "check only: nothing changed"; exit 0; }

install -d -m 700 "$UP"; LOG=$UP/$MODE-$(date -u +%Y%m%dT%H%M%SZ).log
exec > >(tee -a "$LOG") 2>&1
say "$MODE started $(date -u +%FT%TZ); log $LOG"
exec 7>>"$SLOCK"; flock -w "$WAIT" 7 || stop "a Stage B run holds its lock"
say "Stage B lock held (no run can start during the swap)"

CHANGED=0 RESTORE_BAD=""
restore() {  # put back exactly what was there before this run; succeeds only if EVERY item is verified back
  local bad=""
  install -m 755 "${OWN[@]}" "$PREV/myc-agent" "$BIN/myc-agent" || bad+=" myc-agent(install)"
  install -m 755 "${OWN[@]}" "$PREV/myc-stageb" "$BIN/myc-stageb" || bad+=" myc-stageb(install)"
  cp -p "$PREV/install-receipt" "$R" || bad+=" receipt(copy)"
  [[ -f $BIN/myc-agent && $(sha "$BIN/myc-agent") == "$(sha "$PREV/myc-agent")" ]] || bad+=" myc-agent(verify)"
  [[ -f $BIN/myc-stageb && $(sha "$BIN/myc-stageb") == "$(sha "$PREV/myc-stageb")" ]] || bad+=" myc-stageb(verify)"
  cmp -s "$PREV/install-receipt" "$R" || bad+=" receipt(verify)"
  RESTORE_BAD=$bad; [[ -z $bad ]]
}
on_exit() {
  local rc=$?; [[ $rc != 0 ]] || return 0; trap - EXIT; set +e
  say "FAILED (rc $rc); evidence kept in $LOG"
  if [[ $CHANGED == 1 ]]; then
    if restore; then say "previous files and receipt restored and verified (myc-agent, myc-stageb, receipt)"
    else say "INCOMPLETE RECOVERY:${RESTORE_BAD}. Previous copies are kept in $PREV; restore those by hand before anything else"; fi
  fi
  exit "$rc"
}
trap on_exit EXIT

PREV=$UP/prev-$(date -u +%Y%m%dT%H%M%SZ); install -d -m 700 "$PREV"
cp -p "$BIN/myc-agent" "$BIN/myc-stageb" "$R" "$PREV/"
cmp -s "$BIN/myc-agent" "$PREV/myc-agent" && cmp -s "$BIN/myc-stageb" "$PREV/myc-stageb" && cmp -s "$R" "$PREV/install-receipt" || stop "backup differs"
if [[ $MODE == install ]]; then
  cp -p "$BIN/myc-agent" "$UP/myc-agent"; cp -p "$BIN/myc-stageb" "$UP/myc-stageb"; cp -p "$R" "$UP/install-receipt"   # rollback source
  want "$UP/myc-agent" "$AGENT_OLD"; want "$UP/myc-stageb" "$STAGEB_OLD"
fi
say "backup verified: $PREV"

CHANGED=1
if [[ $MODE == install ]]; then
  install -m 755 "${OWN[@]}" "$SRC/myc-agent" "$BIN/myc-agent"; install -m 755 "${OWN[@]}" "$SRC/myc-stageb" "$BIN/myc-stageb"
  want "$BIN/myc-agent" "$AGENT_NEW"; want "$BIN/myc-stageb" "$STAGEB_NEW"
  { grep -v -e '^cmd .* myc-agent$' -e '^cmd .* myc-stageb$' "$R"; echo "runner_upgraded_at=$(date -u +%FT%TZ)"
    printf 'cmd %s  %s\n' "$AGENT_NEW" myc-agent "$STAGEB_NEW" myc-stageb; } > "$R.new"; chmod 600 "$R.new"; mv "$R.new" "$R"
  inrec "$AGENT_NEW" myc-agent && inrec "$STAGEB_NEW" myc-stageb && inrec "$GATE" myc-gate && inrec "$DECIDE" myc-decide || stop "receipt update incomplete"
else
  install -m 755 "${OWN[@]}" "$UP/myc-agent" "$BIN/myc-agent"; install -m 755 "${OWN[@]}" "$UP/myc-stageb" "$BIN/myc-stageb"; cp -p "$UP/install-receipt" "$R"
  want "$BIN/myc-agent" "$AGENT_OLD"; want "$BIN/myc-stageb" "$STAGEB_OLD"; cmp -s "$UP/install-receipt" "$R" || stop "receipt not restored byte-for-byte"
fi
say "files replaced and verified"
flock -u 7

# post-checks without any CLI or model call: syntax, argument validation only, and the writer still reads history
bash -n "$BIN/myc-agent" && bash -n "$BIN/myc-stageb" || stop "syntax check failed"
o=$("${AS_MYC[@]}" "$BIN/myc-agent" not-a-run 2>&1) && stop "myc-agent accepted a bad run id" || true
[[ $o == *"bad run id"* ]] || stop "myc-agent did not reject a bad run id as expected: $o"
o=$("$BIN/myc-stageb" not-a-task 2>&1) && stop "myc-stageb accepted a bad task id" || true
[[ $o == *"bad task id"* ]] || stop "myc-stageb did not reject a bad task id as expected: $o"
s=$("${AS_HUBSYNC[@]}" "$BIN/myc-gate" state MYC-20261025-003) || stop "myc-gate state failed"
[[ $s == "MYC-20261025-003 completed"* ]] || stop "unexpected state for MYC-20261025-003: $s"
want "$BIN/myc-gate" "$GATE"; want "$BIN/myc-decide" "$DECIDE"; want "$BIN/mycnotify" "$MN"; want "$BIN/hubsync" "$HUBSYNC_SHA"
say "post-checks ok (no CLI or model call): bad ids rejected; myc-gate reads history ($s); other commands unchanged"
trap - EXIT
say "DONE: $MODE complete; myc-agent $(sha "$BIN/myc-agent" | cut -c1-12), myc-stageb $(sha "$BIN/myc-stageb" | cut -c1-12). Log: $LOG"
