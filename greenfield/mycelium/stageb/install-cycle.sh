#!/usr/bin/env bash
# Checked install of the Stage Two collaboration-cycle hook on fpd-prod (PROPOSAL; only after Codex review and Chris's
# approval of the exact cycle scope):
#   sudo bash install-cycle.sh check      read-only: assert every hash and state below; changes nothing
#   sudo bash install-cycle.sh install    myc-stageb v5.1 -> v5.2 (optional MYC_POST hook), add myc-post, create system
#                                         user mycexp (no home, no shell), /var/lib/mycelium-workbench; then the sandbox
#                                         SELFTEST must pass, otherwise everything is rolled back
#   sudo bash install-cycle.sh rollback   restore v5.1, remove myc-post and the mycexp user (workbench evidence is kept)
#   sudo bash install-cycle.sh selftest   re-run the sandbox selftest only
# myc-gate, myc-agent, myc-decide, mycnotify, hubsync, timers, keys and notify.conf are asserted unchanged and never
# touched. With MYC_POST unset, v5.2 behaves exactly as v5.1. No model or CLI call.
set -euo pipefail
umask 077
SB_OLD=c636582c4e8c3e41e2aa5fadbff9922b2af188754d41b25407ea6c392f26248a    # installed v5.1
SB_NEW=7445ad75f10f722676c0c6da580346f000857485615da33004fe851ead4b1f82    # reviewed v5.2
POST=74e73ec0a7a52035ec9afc72c6ae5e19d5df25e47294ee99ecbd436c5774db56     # reviewed myc-post
GATE=bca72724623b69439d2876eb4dd9aa3bb11e8b16f75a09f6238dab7e9d962dc1      # installed v3, must stay
AGENT=d173813b3400e736831f141de3993335c17c5baa0092b80667ec06a3ab2b25c6     # installed v6, must stay
DECIDE=7e361a4d60b68a809b00709be22ac910a0fdb443f9092c333c621d37f0ff3dd3
MN=b65180299e8e5984eb9642a37c78bf973eac75c78d6d014f37bc8a260336fab8
HUBSYNC_SHA=12a14b4ad8d14b4eb7de3e38e4ce1d00e839aa2354fb11ee6d22bf6e1f0e609d
BIN=/usr/local/bin R=/var/lib/myc-stageb/install-receipt SLOCK=/var/lib/myc-stageb/lock UP=/var/lib/myc-stageb/install-cycle
WBR=/var/lib/mycelium-workbench U=mycexp OWN=(-o root -g root) WAIT=60 TEST=0
if [[ ${CYCLE_TEST:-0} == 1 ]]; then   # offline test harness only
  TEST=1 SB_OLD=$T_SB_OLD SB_NEW=$T_SB_NEW POST=$T_POST GATE=$T_GATE AGENT=$T_AGENT DECIDE=$T_DECIDE MN=$T_MN HUBSYNC_SHA=$T_HS
  BIN=$T_BIN R=$T_R SLOCK=$T_SLOCK UP=$T_UP WBR=$T_WBR OWN=() WAIT=2
fi
MODE=${1:-}; SRC=$(cd "$(dirname "$0")" && pwd)
say()  { echo "install-cycle: $*"; }
stop() { say "STOP: $*"; exit 1; }
sha()  { sha256sum "$1" | cut -d' ' -f1; }
want() { [[ -f $1 && ! -L $1 && $(sha "$1") == "$2" ]] || stop "$1 is $( [[ -f $1 ]] && sha "$1" || echo missing), expected $2"; }
inrec() { grep -qE "^cmd ${1}[[:space:]]+${2}\$" "$R"; }
uexists() { if [[ $TEST == 1 ]]; then [[ -e $T_USERS/$U ]]; else getent passwd "$U" >/dev/null || getent group "$U" >/dev/null; fi; }
selftest() { local d; d=$(mktemp -d "$WBR/.selftest.XXXXXX"); chmod 0755 "$d"
  if MYC_TEST=$TEST "$BIN/myc-post" --selftest "$d"; then rm -rf "$d"; return 0; else rm -rf "$d"; return 1; fi; }

[[ $MODE =~ ^(check|install|rollback|selftest)$ ]] || { echo "usage: sudo bash install-cycle.sh check|install|rollback|selftest"; exit 2; }
if [[ $TEST != 1 ]]; then [[ $EUID -eq 0 ]] || stop "run with sudo"; [[ $(hostname) == fpd-prod ]] || stop "fpd-prod only"
  command -v systemd-run >/dev/null || stop "systemd-run missing"; [[ -x /usr/local/bin/node ]] || stop "/usr/local/bin/node missing"; fi
for f in hubsync:$HUBSYNC_SHA myc-gate:$GATE myc-agent:$AGENT myc-decide:$DECIDE mycnotify:$MN; do want "$BIN/${f%%:*}" "${f#*:}"; done
[[ -f $R ]] || stop "no Stage B install receipt at $R"
inrec "$GATE" myc-gate && inrec "$AGENT" myc-agent || stop "receipt does not record the installed myc-gate / myc-agent"
case $MODE in
  selftest) want "$BIN/myc-post" "$POST"; selftest && exit 0 || stop "sandbox selftest failed" ;;
  check|install)
    want "$SRC/myc-stageb" "$SB_NEW"; want "$SRC/myc-post" "$POST"; want "$BIN/myc-stageb" "$SB_OLD"; inrec "$SB_OLD" myc-stageb || stop "receipt does not record v5.1 myc-stageb"
    [[ -e $BIN/myc-post ]] && stop "$BIN/myc-post already exists"; uexists && stop "user/group $U already exists; it will not be adopted"
    [[ -e $WBR ]] && stop "$WBR already exists; it will not be adopted" ;;
  rollback) want "$BIN/myc-stageb" "$SB_NEW"; want "$UP/myc-stageb" "$SB_OLD"; [[ -f $UP/install-receipt ]] || stop "no receipt backup in $UP" ;;
esac
say "hashes as expected for $MODE; myc-gate, myc-agent, myc-decide, mycnotify and hubsync as installed"
[[ $MODE != check ]] || { say "check only: nothing changed"; exit 0; }

install -d -m 700 "$UP"; LOG=$UP/$MODE-$(date -u +%Y%m%dT%H%M%SZ).log
exec > >(tee -a "$LOG") 2>&1
exec 7>>"$SLOCK"; flock -w "$WAIT" 7 || stop "a Stage B run holds its lock"
say "$MODE started $(date -u +%FT%TZ); Stage B lock held; log $LOG"
CHANGED=0
undo() {  # back to exactly the v5.1 state; reports anything it could not verify
  local bad=""
  install -m 755 "${OWN[@]}" "$UP/myc-stageb" "$BIN/myc-stageb" || bad+=" stageb"; [[ $(sha "$BIN/myc-stageb") == "$SB_OLD" ]] || bad+=" stageb(verify)"
  rm -f "$BIN/myc-post"; [[ -e $BIN/myc-post ]] && bad+=" myc-post"
  cp -p "$UP/install-receipt" "$R" || bad+=" receipt"
  if grep -qx "user $U" "$UP/created" 2>/dev/null; then if [[ $TEST == 1 ]]; then rm -f "$T_USERS/$U"; else userdel "$U" || bad+=" userdel"; fi; fi
  [[ -z $bad ]] && say "restored v5.1 state (myc-stageb, no myc-post, no $U); $WBR kept as evidence" || say "INCOMPLETE RECOVERY:$bad; inspect $UP"
  [[ -z $bad ]]
}
on_exit() { local rc=$?; [[ $rc != 0 ]] || return 0; trap - EXIT; set +e; say "FAILED (rc $rc); log kept"; [[ $CHANGED == 1 ]] && undo; exit "$rc"; }
trap on_exit EXIT
if [[ $MODE == install ]]; then
  cp -p "$BIN/myc-stageb" "$UP/myc-stageb"; cp -p "$R" "$UP/install-receipt"; want "$UP/myc-stageb" "$SB_OLD"; : > "$UP/created"
  CHANGED=1
  install -m 755 "${OWN[@]}" "$SRC/myc-stageb" "$BIN/myc-stageb"; want "$BIN/myc-stageb" "$SB_NEW"
  install -m 755 "${OWN[@]}" "$SRC/myc-post" "$BIN/myc-post"; want "$BIN/myc-post" "$POST"
  if [[ $TEST == 1 ]]; then : > "$T_USERS/$U"; else useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin --user-group "$U"; fi
  echo "user $U" >> "$UP/created"
  install -d -m 0755 "${OWN[@]}" "$WBR"
  { grep -v -e '^cmd .* myc-stageb$' "$R"; echo "cycle_installed_at=$(date -u +%FT%TZ)"; printf 'cmd %s  %s\n' "$SB_NEW" myc-stageb "$POST" myc-post; } > "$R.new"
  chmod 600 "$R.new"; mv "$R.new" "$R"
  bash -n "$BIN/myc-stageb" && bash -n "$BIN/myc-post" || stop "syntax check failed"
  o=$("$BIN/myc-stageb" not-a-task 2>&1) && stop "myc-stageb accepted a bad task id" || true; [[ $o == *"bad task id"* ]] || stop "myc-stageb post-check: $o"
  selftest || stop "sandbox selftest failed: the hook would not be isolated, so it is not installed"
  flock -u 7; trap - EXIT
  say "DONE: myc-stageb v5.2 ($(sha "$BIN/myc-stageb" | cut -c1-12)), myc-post, user $U, $WBR; sandbox selftest OK. Log: $LOG"
else
  CHANGED=1; undo || stop "rollback incomplete"; flock -u 7; trap - EXIT; say "DONE: rollback complete"
fi
