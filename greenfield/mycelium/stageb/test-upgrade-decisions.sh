#!/usr/bin/env bash
# Offline tests for upgrade-decisions.sh: fake systemctl and stand-in commands in temp paths; no root, no host.
#   bash test-upgrade-decisions.sh
set -uo pipefail
D=$(cd "$(dirname "$0")" && pwd); T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
pass=0; failn=0
ok()  { echo "  PASS $*"; pass=$((pass + 1)); }
bad() { echo "  FAIL $*"; failn=$((failn + 1)); }
sha() { sha256sum "$1" | cut -d' ' -f1; }
mkdir -p "$T/kit" "$T/old"; cp "$D/upgrade-decisions.sh" "$T/kit/"
printf '#!/bin/sh\necho "MYC-20261025-003 completed seq=3 (old)"\n' > "$T/old/myc-gate"
printf '#!/bin/sh\necho "MYC-20261025-003 completed seq=3 (new)"\n' > "$T/kit/myc-gate"
printf '#!/bin/sh\necho "MYC-20261025-003 QUARANTINE: broken (bad new)"\n' > "$T/bad-gate"
printf '#!/bin/sh\necho decide\n' > "$T/kit/myc-decide"
printf '#!/bin/sh\necho {\\"mode\\":\\"dry-run\\",\\"result\\":\\"ok\\",\\"quarantined\\":[],\\"hub_commit\\":\\"old\\"}\n' > "$T/old/mycnotify"
printf '#!/bin/sh\necho {\\"mode\\":\\"dry-run\\",\\"result\\":\\"ok\\",\\"quarantined\\":[],\\"hub_commit\\":\\"new\\"}\n' > "$T/kit/mycnotify"
printf '#!/bin/sh\necho hubsync rev3\n' > "$T/hubsync"
cat > "$T/systemctl" <<'S'
#!/usr/bin/env bash
case "$1" in
  is-active) cat "$F/timer" ;;
  start) [[ -f $F/poll_fail ]] && { echo failed > "$F/result"; exit 1; }; echo success > "$F/result" ;;
  show) cat "$F/result" ;;
esac
S
chmod +x "$T"/old/* "$T"/kit/* "$T/bad-gate" "$T/hubsync" "$T/systemctl"
export UPGRADE_TEST=1 T_GATE_OLD=$(sha "$T/old/myc-gate") T_GATE_NEW=$(sha "$T/kit/myc-gate") T_DECIDE_NEW=$(sha "$T/kit/myc-decide") \
  T_MN_OLD=$(sha "$T/old/mycnotify") T_MN_NEW=$(sha "$T/kit/mycnotify") T_HS=$(sha "$T/hubsync") \
  T_BIN=$T/bin T_R=$T/state/install-receipt T_SLOCK=$T/state/lock T_HLOCK=$T/hs.lock T_MLOCK=$T/mn.lock T_CONF=$T/notify.conf \
  T_UP=$T/state/upgrade-decisions T_SYSTEMCTL=$T/systemctl F=$T/f
reset() {
  rm -rf "$T/bin" "$T/state" "$T/f"; mkdir -p "$T/bin" "$T/state" "$T/f"
  cp -p "$T/old/myc-gate" "$T/old/mycnotify" "$T/hubsync" "$T/bin/"; : > "$T/hs.lock"; : > "$T/mn.lock"; : > "$T/state/lock"
  printf 'installed_at=x\ncmd %s myc-gate\ncmd aaaa myc-agent\ncmd bbbb myc-stageb\n' "$T_GATE_OLD" > "$T_R"
  printf 'SENDER=x@findpitches.com\nRECIPIENT=y@z\nMODE=dry-run\nPIN=\n' > "$T/notify.conf"; echo inactive > "$T/f/timer"; echo success > "$T/f/result"
}
run() { bash "$T/kit/upgrade-decisions.sh" "$1" > "$T/out" 2>&1; echo $?; }
U=$T/kit/upgrade-decisions.sh

echo "1. check is read-only"; reset; r=$(run check)
[[ $r == 0 && $(sha "$T/bin/myc-gate") == "$T_GATE_OLD" && ! -e $T/state/upgrade-decisions && ! -e $T/bin/myc-decide ]] && ok "asserted, nothing changed" || { bad check; cat "$T/out"; }

echo "2. refusals before anything changes"
reset; echo x >> "$T/kit/myc-decide"; r=$(run install); printf '#!/bin/sh\necho decide\n' > "$T/kit/myc-decide"
[[ $r != 0 && $(sha "$T/bin/myc-gate") == "$T_GATE_OLD" && ! -e $T/state/upgrade-decisions ]] && ok "unexpected bundle file refused" || bad "bundle hash"
reset; echo x >> "$T/bin/myc-gate"; r=$(run install); [[ $r != 0 && ! -e $T/state/upgrade-decisions ]] && ok "unexpected installed myc-gate refused" || bad "installed hash"
reset; sed -i 's/MODE=dry-run/MODE=live/' "$T/notify.conf"; r=$(run install); [[ $r != 0 ]] && grep -q 'MODE=live' "$T/out" && ok "notifier in live mode refused" || bad "live refused"
reset; echo active > "$T/f/timer"; r=$(run install); [[ $r != 0 ]] && grep -q 'timer is active' "$T/out" && ok "notifier timer active refused" || bad "timer refused"
reset; sed -i '/myc-gate/d' "$T_R"; r=$(run install); [[ $r != 0 ]] && grep -q receipt "$T/out" && ok "receipt without myc-gate refused" || bad "receipt"
reset; ( flock 9; sleep 5 ) 9>>"$T/state/lock" & sleep 0.5; r=$(run install); wait
[[ $r != 0 && $(sha "$T/bin/myc-gate") == "$T_GATE_OLD" && ! -e $T/bin/myc-decide ]] && grep -q 'Stage B run holds' "$T/out" && ok "Stage B lock busy: nothing replaced" || { bad "lock"; cat "$T/out"; }

echo "3. install"; reset; r=$(run install)
[[ $r == 0 && $(sha "$T/bin/myc-gate") == "$T_GATE_NEW" && $(sha "$T/bin/mycnotify") == "$T_MN_NEW" && $(sha "$T/bin/myc-decide") == "$T_DECIDE_NEW" ]] \
  && grep -qx "cmd $T_GATE_NEW myc-gate" "$T_R" && grep -qx "cmd $T_DECIDE_NEW myc-decide" "$T_R" && grep -qx 'cmd aaaa myc-agent' "$T_R" \
  && ! grep -q "$T_GATE_OLD" "$T_R" && grep -q 'DONE: install complete' "$T/out" && ls "$T"/state/upgrade-decisions/install-*.log >/dev/null \
  && ok "replaced and verified; receipt has new myc-gate + myc-decide, v5 myc-agent/myc-stageb lines kept; log kept" || { bad install; cat "$T/out"; }

echo "4. rollback (after 3)"; r=$(run rollback)
[[ $r == 0 && $(sha "$T/bin/myc-gate") == "$T_GATE_OLD" && $(sha "$T/bin/mycnotify") == "$T_MN_OLD" && ! -e $T/bin/myc-decide ]] && grep -qx "cmd $T_GATE_OLD myc-gate" "$T_R" \
  && ! grep -q myc-decide "$T_R" && ok "old files and receipt back; myc-decide removed" || { bad rollback; cat "$T/out"; }

echo "5. a failing post-check after the swap restores everything"
reset; cp "$T/kit/myc-gate" "$T/good-gate"; cp "$T/bad-gate" "$T/kit/myc-gate"; T_GATE_NEW=$(sha "$T/bad-gate") bash "$U" install > "$T/out" 2>&1; r=$?; cp "$T/good-gate" "$T/kit/myc-gate"
[[ $r != 0 && $(sha "$T/bin/myc-gate") == "$T_GATE_OLD" && $(sha "$T/bin/mycnotify") == "$T_MN_OLD" && ! -e $T/bin/myc-decide ]] && grep -qx "cmd $T_GATE_OLD myc-gate" "$T_R" \
  && grep -q 'restored and verified' "$T/out" && ok "validator post-check failed -> previous files and receipt restored" || { bad "post-check restore"; cat "$T/out"; }
reset; touch "$T/f/poll_fail"; r=$(run install)
[[ $r != 0 && $(sha "$T/bin/myc-gate") == "$T_GATE_OLD" && ! -e $T/bin/myc-decide ]] && grep -q 'restored and verified' "$T/out" && ok "notifier dry-run poll failed -> restored" || { bad "poll restore"; cat "$T/out"; }

echo "6. R3: restoration failures are reported, never claimed as restored"
mkdir -p "$T/fakebin"
printf '#!/usr/bin/env bash\nif [[ -f %s/f/rm_fail && "${@: -1}" == "%s/bin/myc-decide" ]]; then exit 1; fi\nexec /bin/rm "$@"\n' "$T" "$T" > "$T/fakebin/rm"
printf '#!/usr/bin/env bash\nif [[ -f %s/f/install_fail && "${@: -1}" == "%s/bin/mycnotify" && "${@: -2:1}" == */prev-*/mycnotify ]]; then exit 1; fi\nexec /usr/bin/install "$@"\n' "$T" "$T" > "$T/fakebin/install"
printf '#!/usr/bin/env bash\nif [[ -f %s/f/cp_fail && "${@: -2:1}" == */prev-*/install-receipt ]]; then exit 1; fi\nexec /bin/cp "$@"\n' "$T" > "$T/fakebin/cp"
chmod +x "$T/fakebin/"*
for f in rm_fail install_fail cp_fail; do
  reset; touch "$T/f/poll_fail" "$T/f/$f"; PATH="$T/fakebin:$PATH" bash "$U" install > "$T/out" 2>&1; r=$?
  if [[ $r != 0 ]] && grep -q 'INCOMPLETE RECOVERY' "$T/out" && ! grep -q 'restored and verified' "$T/out"; then ok "$f during restore -> non-zero, INCOMPLETE RECOVERY, no false claim"
  else bad "$f -> rc $r"; cat "$T/out"; fi
done
reset; touch "$T/f/poll_fail" "$T/f/rm_fail"; PATH="$T/fakebin:$PATH" bash "$U" install > "$T/out" 2>&1
grep -q 'myc-decide(remove)' "$T/out" && grep -q 'myc-decide(still present)' "$T/out" && [[ -e $T/bin/myc-decide ]] && ok "names exactly what was not restored (myc-decide still present)" || { bad "detail"; cat "$T/out"; }

echo; echo "upgrade-decisions tests: $pass passed, $failn failed"; [[ $failn == 0 ]]
