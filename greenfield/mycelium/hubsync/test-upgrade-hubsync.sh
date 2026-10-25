#!/usr/bin/env bash
# Offline tests for upgrade-hubsync.sh: fake systemctl, temp paths, no root, no host, no network.   bash test-upgrade-hubsync.sh
set -uo pipefail
D=$(cd "$(dirname "$0")" && pwd)
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
pass=0; failn=0
ok()  { echo "  PASS $*"; pass=$((pass + 1)); }
bad() { echo "  FAIL $*"; failn=$((failn + 1)); }

# a self-contained copy of the upgrade script beside a stand-in "new" hubsync
mkdir -p "$T/kit"; cp "$D/upgrade-hubsync.sh" "$T/kit/"
printf '#!/bin/sh\n# old\n' > "$T/old"; printf '#!/bin/sh\n# new\n' > "$T/kit/hubsync"
export HUBSYNC_UPGRADE_TEST=1 T_OLD=$(sha256sum "$T/old" | cut -d' ' -f1) T_NEW=$(sha256sum "$T/kit/hubsync" | cut -d' ' -f1)
export T_BIN=$T/bin/hubsync T_HSHOME=$T/hs T_UP=$T/up T_SYSTEMCTL=$T/systemctl F=$T/fake
sha() { sha256sum "$1" | cut -d' ' -f1; }

# fake systemctl: unit states in $F/<unit>; "start hubsync.service" simulates one poll ($F/poll = ok|fail)
cat > "$T/systemctl" <<'EOF'
#!/usr/bin/env bash
echo "$*" >> "$F/calls"
case "$1" in
  is-active)  cat "$F/$2" 2>/dev/null || echo inactive; [[ $(cat "$F/$2" 2>/dev/null) == active ]] ;;
  is-enabled) echo enabled ;;
  stop)       echo inactive > "$F/$2" ;;
  start)      if [[ $2 == hubsync.service ]]; then
                if [[ $(cat "$F/poll") == ok ]]; then echo success > "$F/result"
                  echo '{"last_result":"ok","message":"processed hub at abc"}' > "$T_HSHOME/status.json"; echo '{"backlog":0}' > "$T_HSHOME/state.json"
                else echo exit-code > "$F/result"; exit 1; fi
              elif [[ $2 == hubsync.timer && -f $F/fail_timer_start ]]; then exit 1
              else echo active > "$F/$2"; fi ;;
  show)       cat "$F/result" ;;
esac
EOF
chmod +x "$T/systemctl"
reset() {  # installed = old, timer as given, clean upgrade dir
  rm -rf "$T/bin" "$T/up" "$F" "$T_HSHOME"; mkdir -p "$T/bin" "$F" "$T_HSHOME"
  cp "$T/old" "$T_BIN"; chmod 755 "$T_BIN"; : > "$T_HSHOME/lock"
  echo "${1:-active}" > "$F/hubsync.timer"; echo inactive > "$F/hubsync.service"; echo ok > "$F/poll"; : > "$F/calls"
}
run() { bash "$1" "$2" > "$T/out" 2>&1; echo $?; }
U=$T/kit/upgrade-hubsync.sh

echo "1. check is read-only"
reset; r=$(run "$U" check)
[[ $r == 0 && $(sha "$T_BIN") == "$T_OLD" && ! -e $T/up ]] && ! grep -qE '^(stop|start)' "$F/calls" && ok "hashes asserted, nothing changed" || { bad "check"; cat "$T/out"; }

echo "2. wrong installed or replacement hash: stop before touching anything"
reset; echo tampered >> "$T_BIN"; r=$(run "$U" install)
[[ $r != 0 ]] && grep -q 'STOP: .*sha256' "$T/out" && ! grep -q '^stop' "$F/calls" && ok "unexpected installed file refused; timer never stopped" || { bad "old hash"; cat "$T/out"; }
reset; echo tampered >> "$T/kit/hubsync"; r=$(run "$U" install); printf '#!/bin/sh\n# new\n' > "$T/kit/hubsync"
[[ $r != 0 && $(sha "$T_BIN") == "$T_OLD" ]] && ! grep -q '^stop' "$F/calls" && ok "unexpected replacement refused; nothing changed" || { bad "new hash"; cat "$T/out"; }

echo "3. install"
reset; r=$(run "$U" install)
[[ $r == 0 && $(sha "$T_BIN") == "$T_NEW" && $(sha "$T/up/hubsync.$T_OLD") == "$T_OLD" && $(cat "$F/hubsync.timer") == active ]] \
  && grep -q 'shared writer lock held' "$T/out" && ls "$T"/up/install-*.log >/dev/null 2>&1 && ok "new installed, verified backup kept, timer back to active, log kept" || { bad "install"; cat "$T/out"; }

echo "4. rollback (after 3)"
r=$(run "$U" rollback)
[[ $r == 0 && $(sha "$T_BIN") == "$T_OLD" && $(cat "$F/hubsync.timer") == active ]] && ok "old restored with the same checks; timer active" || { bad "rollback"; cat "$T/out"; }

echo "5. poll fails after the swap: previous script restored, timer restored"
reset; echo fail > "$F/poll"; r=$(run "$U" install)
[[ $r != 0 && $(sha "$T_BIN") == "$T_OLD" && $(cat "$F/hubsync.timer") == active ]] && grep -q 'previous script restored and verified' "$T/out" \
  && ok "failed post-check rolls back and keeps evidence" || { bad "poll failure"; cat "$T/out"; }

echo "6. timer that was stopped stays stopped"
reset inactive; r=$(run "$U" install)
[[ $r == 0 && $(sha "$T_BIN") == "$T_NEW" && $(cat "$F/hubsync.timer") == inactive ]] && ok "prior inactive timer state preserved" || { bad "inactive timer"; cat "$T/out"; }

echo "7. shared lock held by another writer: stop, nothing replaced, timer restored"
reset; ( flock 9; sleep 6 ) 9>>"$T_HSHOME/lock" & sleep 0.5
r=$(run "$U" install); wait
[[ $r != 0 && $(sha "$T_BIN") == "$T_OLD" && $(cat "$F/hubsync.timer") == active ]] && grep -q 'shared lock busy' "$T/out" && ok "lock busy refused safely" || { bad "lock busy"; cat "$T/out"; }

echo "8. timer refuses to restart after a good install: non-zero, no DONE, clear recovery step"
reset; touch "$F/fail_timer_start"; r=$(run "$U" install)
[[ $r != 0 && $(sha "$T_BIN") == "$T_NEW" && $(cat "$F/hubsync.timer") == inactive ]] && grep -q 'TIMER NOT RESTORED' "$T/out" \
  && grep -q 'sudo systemctl start hubsync.timer' "$T/out" && ! grep -q 'DONE' "$T/out" && ok "restoration failure propagated; verified install kept" || { bad "timer restart failure (rc $r)"; cat "$T/out"; }

echo "9. timer also refuses during the failure path: still non-zero, previous script restored, recovery step shown"
reset; echo fail > "$F/poll"; touch "$F/fail_timer_start"; r=$(run "$U" install)
[[ $r != 0 && $(sha "$T_BIN") == "$T_OLD" && $(cat "$F/hubsync.timer") == inactive ]] && grep -q 'previous script restored and verified' "$T/out" \
  && grep -q 'TIMER NOT RESTORED' "$T/out" && ! grep -q 'DONE' "$T/out" && ok "both failures reported; old script verified" || { bad "double failure (rc $r)"; cat "$T/out"; }

echo; echo "upgrade tests: $pass passed, $failn failed"; [[ $failn == 0 ]]
