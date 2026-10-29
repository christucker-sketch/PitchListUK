#!/usr/bin/env bash
# Offline tests for upgrade-gate.sh: stand-in commands and temp paths; no root, no host, no CLI/model.   bash test-upgrade-gate.sh
set -uo pipefail
D=$(cd "$(dirname "$0")" && pwd); T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
pass=0; failn=0
ok()  { echo "  PASS $*"; pass=$((pass + 1)); }
bad() { echo "  FAIL $*"; failn=$((failn + 1)); }
sha() { sha256sum "$1" | cut -d' ' -f1; }
mkdir -p "$T/kit" "$T/old" "$T/fixed"; cp "$D/upgrade-gate.sh" "$T/kit/"
gate() { printf '#!/bin/sh\n# %s\ncase $1 in state) echo "MYC-20261025-003 completed seq=3";; %s) echo "usage: myc-gate ..." >&2; exit 2;; esac\n' "$1" "${2:-*}"; }
gate v2 > "$T/old/myc-gate"; gate v3 > "$T/kit/myc-gate"; gate "v3 broken" nothing > "$T/bad-gate"
for c in myc-agent myc-stageb myc-decide mycnotify hubsync; do printf '#!/bin/sh\necho %s\n' "$c" > "$T/fixed/$c"; done
chmod +x "$T"/old/* "$T"/kit/* "$T"/fixed/* "$T/bad-gate"
export UPGRADE_TEST=1 T_GATE_OLD=$(sha "$T/old/myc-gate") T_GATE_NEW=$(sha "$T/kit/myc-gate") T_AGENT=$(sha "$T/fixed/myc-agent") \
  T_STAGEB=$(sha "$T/fixed/myc-stageb") T_DECIDE=$(sha "$T/fixed/myc-decide") T_MN=$(sha "$T/fixed/mycnotify") T_HS=$(sha "$T/fixed/hubsync") \
  T_BIN=$T/bin T_R=$T/state/install-receipt T_SLOCK=$T/state/lock T_HLOCK=$T/state/hlock T_UP=$T/state/upgrade-gate
reset() {
  rm -rf "$T/bin" "$T/state"; mkdir -p "$T/bin" "$T/state"; cp -p "$T"/old/* "$T"/fixed/* "$T/bin/"; : > "$T/state/lock"; : > "$T/state/hlock"
  { echo "installed_at=x"; (cd "$T/bin" && sha256sum myc-agent myc-stageb myc-gate myc-decide) | sed 's/^/cmd /'; } > "$T_R"
}
run() { bash "$T/kit/upgrade-gate.sh" "$1" > "$T/out" 2>&1; echo $?; }
snap() { (cd "$T/bin" && sha256sum *; cat "$T_R") | sha256sum; }

reset; s0=$(snap)
[[ $(run check) == 0 && $(snap) == "$s0" ]] && grep -q "check only: nothing changed" "$T/out" && ok "check passes and changes nothing" || { bad check; cat "$T/out"; }
[[ $(run rollback) != 0 && $(snap) == "$s0" ]] && ok "rollback refused before any install (nothing changed)" || bad "early rollback"
[[ $(run install) == 0 && $(sha "$T/bin/myc-gate") == "$T_GATE_NEW" ]] && grep -q "^cmd $T_GATE_NEW  myc-gate$" "$T_R" && [[ $(grep -c 'myc-gate$' "$T_R") == 1 ]] \
  && ok "install: v3 in place, receipt records it once" || { bad install; cat "$T/out"; }
for c in myc-agent myc-stageb myc-decide mycnotify hubsync; do cmp -s "$T/bin/$c" "$T/fixed/$c" || bad "$c changed"; done; ok "every other command byte-identical"
[[ $(run install) != 0 ]] && grep -q "expected $T_GATE_OLD" "$T/out" && ok "a second install is refused (installed gate is not v2)" || bad "reinstall"
[[ $(run rollback) == 0 && $(sha "$T/bin/myc-gate") == "$T_GATE_OLD" ]] && grep -q "^cmd $T_GATE_OLD  myc-gate$" "$T_R" && ok "rollback restores v2 and the receipt" || { bad rollback; cat "$T/out"; }
reset; printf '#!/bin/sh\necho changed\n' > "$T/bin/myc-agent"; s0=$(snap)
[[ $(run install) != 0 && $(snap) == "$s0" ]] && ok "refuses when myc-agent is not the installed v6 (nothing changed)" || bad "agent guard"
reset; cp "$T/bad-gate" "$T/kit/myc-gate"; export T_GATE_NEW=$(sha "$T/bad-gate"); s0=$(snap)
[[ $(run install) != 0 && $(snap) == "$s0" ]] && grep -q "restored and verified" "$T/out" && ok "a v3 that fails its post-check is rolled back automatically" || { bad "auto-restore"; cat "$T/out"; }
gate v3 > "$T/kit/myc-gate"; export T_GATE_NEW=$(sha "$T/kit/myc-gate")
reset; s0=$(snap); ( exec 9>>"$T/state/hlock"; flock 9; sleep 4 ) & sleep 0.5
[[ $(run install) != 0 && $(snap) == "$s0" ]] && grep -q "hub watcher / gate holds its lock" "$T/out" && ok "waits for, then refuses on, a held hub lock (nothing changed)" || { bad "hub lock"; cat "$T/out"; }
wait
echo; echo "upgrade-gate tests: $pass passed, $failn failed"; [[ $failn == 0 ]]
