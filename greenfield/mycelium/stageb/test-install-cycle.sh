#!/usr/bin/env bash
# Offline tests for install-cycle.sh: stand-in commands, temp paths; the sandbox selftest runs for real against a
# stand-in sandbox (unshare -n + setpriv nobody) when root, and must FAIL without one.   bash test-install-cycle.sh
set -uo pipefail
D=$(cd "$(dirname "$0")" && pwd); T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
pass=0; failn=0
ok()  { echo "  PASS $*"; pass=$((pass + 1)); }
bad() { echo "  FAIL $*"; failn=$((failn + 1)); }
sha() { sha256sum "$1" | cut -d' ' -f1; }
mkdir -p "$T/kit" "$T/old" "$T/fixed"; cp "$D/install-cycle.sh" "$D/myc-stageb" "$D/myc-post" "$T/kit/"
printf '#!/bin/sh\n# v5.1 stageb\necho "bad task id"; exit 2\n' > "$T/old/myc-stageb"
for c in myc-gate myc-agent myc-decide mycnotify hubsync; do printf '#!/bin/sh\necho %s\n' "$c" > "$T/fixed/$c"; done
chmod +x "$T"/old/* "$T"/fixed/*
export CYCLE_TEST=1 T_SB_OLD=$(sha "$T/old/myc-stageb") T_SB_NEW=$(sha "$T/kit/myc-stageb") T_POST=$(sha "$T/kit/myc-post") \
  T_GATE=$(sha "$T/fixed/myc-gate") T_AGENT=$(sha "$T/fixed/myc-agent") T_DECIDE=$(sha "$T/fixed/myc-decide") T_MN=$(sha "$T/fixed/mycnotify") \
  T_HS=$(sha "$T/fixed/hubsync") T_BIN=$T/bin T_R=$T/state/install-receipt T_SLOCK=$T/state/lock T_UP=$T/state/install-cycle T_WBR=$T/wb T_USERS=$T/users
mkdir -p "$T/sec/dir" "$T/ro"; echo s > "$T/sec/file"; chmod 600 "$T/sec/file"; chmod 700 "$T/sec/dir"; chmod 711 "$T"
export T_PROBE_SECRETS="$T/sec/file $T/sec/dir" T_PROBE_RO=$T/ro
reset() { rm -rf "$T/bin" "$T/state" "$T/wb" "$T/users"; mkdir -p "$T/bin" "$T/state" "$T/users"; cp -p "$T"/old/* "$T"/fixed/* "$T/bin/"; : > "$T/state/lock"
  { echo "installed_at=x"; (cd "$T/bin" && sha256sum myc-agent myc-stageb myc-gate myc-decide) | sed 's/^/cmd /'; } > "$T_R"; }
run() { bash "$T/kit/install-cycle.sh" "$1" > "$T/out" 2>&1; echo $?; }
state() { (cd "$T/bin" && sha256sum *; cat "$T_R"; ls "$T/users"; ls -d "$T/wb" 2>/dev/null) | sha256sum; }
STAND="unshare -n setpriv --reuid=65534 --regid=65534 --clear-groups"
reset; s0=$(state)
[[ $(run check) == 0 && $(state) == "$s0" ]] && grep -q "check only: nothing changed" "$T/out" && ok "check passes and changes nothing" || { bad check; cat "$T/out"; }
unset T_SANDBOX; [[ $(run install) != 0 ]] && grep -q "sandbox selftest failed" "$T/out" && grep -q "restored v5.1 state" "$T/out" && [[ $(sha "$T/bin/myc-stageb") == "$T_SB_OLD" && ! -e $T/bin/myc-post && ! -e $T/users/mycexp ]] \
  && ok "without a working sandbox the install FAILS its selftest and is rolled back (v5.1, no myc-post, no user)" || { bad "selftest rollback"; cat "$T/out"; }
if [[ $(id -u) == 0 ]] && command -v unshare >/dev/null; then
  reset; [[ $(T_SANDBOX=$STAND run install) == 0 && $(sha "$T/bin/myc-stageb") == "$T_SB_NEW" && $(sha "$T/bin/myc-post") == "$T_POST" && -e $T/users/mycexp && -d $T/wb ]] \
    && grep -q "^cmd $T_SB_NEW  myc-stageb$" "$T_R" && grep -q "^cmd $T_POST  myc-post$" "$T_R" && grep -q 'SANDBOX SELFTEST OK' "$T/out" \
    && ok "install with a sandbox: v5.2 + myc-post + user + workbench root, receipt updated, selftest OK" || { bad install; cat "$T/out"; }
  for c in myc-gate myc-agent myc-decide mycnotify hubsync; do cmp -s "$T/bin/$c" "$T/fixed/$c" || bad "$c changed"; done; ok "every other command byte-identical"
  [[ $(T_SANDBOX=$STAND run selftest) == 0 ]] && ok "selftest mode re-runs the probe" || bad "selftest mode"
  [[ $(run install) != 0 ]] && ok "a second install is refused" || bad "reinstall"
  [[ $(run rollback) == 0 && $(sha "$T/bin/myc-stageb") == "$T_SB_OLD" && ! -e $T/bin/myc-post && ! -e $T/users/mycexp && -d $T/wb ]] && grep -q "^cmd $T_SB_OLD  myc-stageb$" "$T_R" \
    && ok "rollback: v5.1 back, myc-post and user removed, workbench evidence kept" || { bad rollback; cat "$T/out"; }
else echo "  (skipped: needs root + unshare for the stand-in sandbox)"; fi
reset; printf '#!/bin/sh\necho changed\n' > "$T/bin/myc-agent"; s0=$(state)
[[ $(run install) != 0 && $(state) == "$s0" ]] && ok "refuses when myc-agent is not the installed v6 (nothing changed)" || bad "agent guard"
reset; mkdir -p "$T/wb"; s0=$(state); [[ $(run install) != 0 && $(state) == "$s0" ]] && grep -q "will not be adopted" "$T/out" && ok "refuses to adopt an existing workbench root" || bad "adopt"
echo; echo "install-cycle tests: $pass passed, $failn failed"; [[ $failn == 0 ]]
