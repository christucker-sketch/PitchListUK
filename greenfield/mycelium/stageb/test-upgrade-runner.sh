#!/usr/bin/env bash
# Offline tests for upgrade-runner.sh: stand-in commands and temp paths; no root, no host, no CLI/model.
#   bash test-upgrade-runner.sh
set -uo pipefail
D=$(cd "$(dirname "$0")" && pwd); T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
pass=0; failn=0
ok()  { echo "  PASS $*"; pass=$((pass + 1)); }
bad() { echo "  FAIL $*"; failn=$((failn + 1)); }
sha() { sha256sum "$1" | cut -d' ' -f1; }
mkdir -p "$T/kit" "$T/old" "$T/fixed"; cp "$D/upgrade-runner.sh" "$T/kit/"
# stand-ins: argument validation behaves like the real commands; nothing else
printf '#!/bin/sh\n# v5 agent\necho "myc-agent: bad run id" >&2; exit 2\n' > "$T/old/myc-agent"
printf '#!/bin/sh\n# v6 agent\necho "myc-agent: bad run id" >&2; exit 2\n' > "$T/kit/myc-agent"
printf '#!/bin/sh\n# v6 agent broken\necho accepted; exit 0\n' > "$T/bad-agent"
printf '#!/bin/sh\n# v5 stageb\necho "bad task id"; exit 2\n' > "$T/old/myc-stageb"
printf '#!/bin/sh\n# v5.1 stageb\necho "bad task id"; exit 2\n' > "$T/kit/myc-stageb"
printf '#!/bin/sh\necho "MYC-20261025-003 completed seq=3"\n' > "$T/fixed/myc-gate"
printf '#!/bin/sh\necho decide\n' > "$T/fixed/myc-decide"; printf '#!/bin/sh\necho notify\n' > "$T/fixed/mycnotify"; printf '#!/bin/sh\necho hubsync\n' > "$T/fixed/hubsync"
chmod +x "$T"/old/* "$T"/kit/* "$T"/fixed/* "$T/bad-agent"
export UPGRADE_TEST=1 T_AGENT_OLD=$(sha "$T/old/myc-agent") T_AGENT_NEW=$(sha "$T/kit/myc-agent") T_STAGEB_OLD=$(sha "$T/old/myc-stageb") \
  T_STAGEB_NEW=$(sha "$T/kit/myc-stageb") T_GATE=$(sha "$T/fixed/myc-gate") T_DECIDE=$(sha "$T/fixed/myc-decide") T_MN=$(sha "$T/fixed/mycnotify") \
  T_HS=$(sha "$T/fixed/hubsync") T_BIN=$T/bin T_R=$T/state/install-receipt T_SLOCK=$T/state/lock T_UP=$T/state/upgrade-runner F=$T/f
reset() {
  rm -rf "$T/bin" "$T/state" "$T/f"; mkdir -p "$T/bin" "$T/state" "$T/f"
  cp -p "$T"/old/* "$T"/fixed/* "$T/bin/"; : > "$T/state/lock"
  # exactly what install-stageb.sh + upgrade-decisions.sh leave: sha256sum format, two spaces
  { echo "installed_at=x"; (cd "$T/bin" && sha256sum myc-agent myc-stageb) | sed 's/^/cmd /'; echo "decisions_upgraded_at=x"
    (cd "$T/bin" && sha256sum myc-gate myc-decide) | sed 's/^/cmd /'; } > "$T_R"
}
run() { bash "$T/kit/upgrade-runner.sh" "$1" > "$T/out" 2>&1; echo $?; }
U=$T/kit/upgrade-runner.sh

echo "0. fixture receipt uses the real two-space format"; reset
grep -qx "cmd $T_AGENT_OLD  myc-agent" "$T_R" && grep -qx "cmd $T_GATE  myc-gate" "$T_R" && ok "real format" || bad "fixture"
echo "1. check is read-only"; reset; r=$(run check)
[[ $r == 0 && $(sha "$T/bin/myc-agent") == "$T_AGENT_OLD" && ! -e $T/state/upgrade-runner ]] && ok "asserted, nothing changed" || { bad check; cat "$T/out"; }
echo "2. refusals before anything changes"
reset; echo x >> "$T/kit/myc-agent"; r=$(run install); printf '#!/bin/sh\n# v6 agent\necho "myc-agent: bad run id" >&2; exit 2\n' > "$T/kit/myc-agent"
[[ $r != 0 && $(sha "$T/bin/myc-agent") == "$T_AGENT_OLD" && ! -e $T/state/upgrade-runner ]] && ok "unexpected bundle file refused" || bad "bundle"
reset; echo x >> "$T/bin/myc-agent"; r=$(run install); [[ $r != 0 && ! -e $T/state/upgrade-runner ]] && ok "unexpected installed myc-agent refused" || bad "installed agent"
reset; echo x >> "$T/bin/myc-gate"; r=$(run install); [[ $r != 0 ]] && grep -q myc-gate "$T/out" && ok "changed myc-gate refused (must stay as installed)" || bad "gate drift"
reset; sed -i '/myc-decide$/d' "$T_R"; r=$(run install); [[ $r != 0 ]] && grep -q 'myc-decide' "$T/out" && ok "receipt without myc-decide refused" || bad "receipt decide"
reset; sed -i '/myc-stageb$/d' "$T_R"; r=$(run install); [[ $r != 0 ]] && grep -q 'v5 myc-agent / myc-stageb' "$T/out" && ok "receipt without v5 myc-stageb refused" || bad "receipt stageb"
reset; ( flock 9; sleep 5 ) 9>>"$T/state/lock" & sleep 0.5; r=$(run install); wait
[[ $r != 0 && $(sha "$T/bin/myc-agent") == "$T_AGENT_OLD" ]] && grep -q 'Stage B run holds' "$T/out" && ok "Stage B lock busy: nothing replaced" || { bad lock; cat "$T/out"; }
echo "3. install"; reset; r=$(run install)
[[ $r == 0 && $(sha "$T/bin/myc-agent") == "$T_AGENT_NEW" && $(sha "$T/bin/myc-stageb") == "$T_STAGEB_NEW" ]] \
  && grep -qx "cmd $T_AGENT_NEW  myc-agent" "$T_R" && grep -qx "cmd $T_STAGEB_NEW  myc-stageb" "$T_R" && grep -qx "cmd $T_GATE  myc-gate" "$T_R" \
  && grep -qx "cmd $T_DECIDE  myc-decide" "$T_R" && ! grep -q "$T_AGENT_OLD" "$T_R" && grep -q 'DONE: install complete' "$T/out" && grep -q 'no CLI or model call' "$T/out" \
  && ok "replaced and verified; receipt: new agent/stageb, myc-gate/myc-decide kept; post-checks without CLI/model" || { bad install; cat "$T/out"; }
echo "4. rollback (after 3)"; r=$(run rollback)
[[ $r == 0 && $(sha "$T/bin/myc-agent") == "$T_AGENT_OLD" && $(sha "$T/bin/myc-stageb") == "$T_STAGEB_OLD" ]] && grep -qx "cmd $T_AGENT_OLD  myc-agent" "$T_R" \
  && ok "v5 files and receipt back" || { bad rollback; cat "$T/out"; }
echo "5. failing post-check restores; restore failures are reported, never claimed"
reset; cp "$T/kit/myc-agent" "$T/good"; cp "$T/bad-agent" "$T/kit/myc-agent"; T_AGENT_NEW=$(sha "$T/bad-agent") bash "$U" install > "$T/out" 2>&1; r=$?; cp "$T/good" "$T/kit/myc-agent"
[[ $r != 0 && $(sha "$T/bin/myc-agent") == "$T_AGENT_OLD" ]] && grep -qx "cmd $T_AGENT_OLD  myc-agent" "$T_R" && grep -q 'restored and verified' "$T/out" \
  && ok "agent accepting a bad run id -> restored" || { bad "post-check restore"; cat "$T/out"; }
mkdir -p "$T/fakebin"
printf '#!/usr/bin/env bash\nif [[ -f %s/f/install_fail && "${@: -1}" == "%s/bin/myc-stageb" && "${@: -2:1}" == */prev-*/myc-stageb ]]; then exit 1; fi\nexec /usr/bin/install "$@"\n' "$T" "$T" > "$T/fakebin/install"
printf '#!/usr/bin/env bash\nif [[ -f %s/f/cp_fail && "${@: -2:1}" == */prev-*/install-receipt ]]; then exit 1; fi\nexec /bin/cp "$@"\n' "$T" > "$T/fakebin/cp"
chmod +x "$T/fakebin/"*
for f in install_fail cp_fail; do
  reset; cp "$T/bad-agent" "$T/kit/myc-agent"; touch "$T/f/$f"
  T_AGENT_NEW=$(sha "$T/bad-agent") PATH="$T/fakebin:$PATH" bash "$U" install > "$T/out" 2>&1; r=$?; cp "$T/good" "$T/kit/myc-agent"
  [[ $r != 0 ]] && grep -q 'INCOMPLETE RECOVERY' "$T/out" && ! grep -q 'restored and verified' "$T/out" && ok "$f during restore -> INCOMPLETE RECOVERY, no false claim" || { bad "$f"; cat "$T/out"; }
done
echo; echo "upgrade-runner tests: $pass passed, $failn failed"; [[ $failn == 0 ]]
