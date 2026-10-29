#!/usr/bin/env bash
set -euo pipefail
D=$(cd "$(dirname "$0")/.." && pwd)
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
R=$T/root
mkdir -p "$R/var/lib/mycelium-bridge" "$R/var/lib/mycelium-memory/batches/state-probe" "$R/opt/mycelium-memory" "$R/etc/mycelium" "$T/hs"
chmod 700 "$R/var/lib/mycelium-bridge"
printf 'mycelium-bridge receipt v1\ndir %s\nfile %s\n' "$R/opt/mycelium-memory" "$R/etc/mycelium/bridge.env" > "$R/var/lib/mycelium-bridge/created"
: > "$R/etc/mycelium/bridge.env"
echo '2026-10-29T00:00:00Z CALLS_STARTED' > "$R/var/lib/mycelium-memory/batches/state-probe/receipt"
# Represents a receipt left after completed GitHub turns but before CALLS_DONE persisted.
if BRIDGE_TEST=1 T_ROOT="$R" T_REPO="$T/repo" T_BRANCH=unused T_GATE=/usr/bin/true T_STAGEB=/usr/bin/true T_HSHOME="$T/hs" T_BRIDGE=node bash "$D/stage-one/mycelium-bridge.sh" ingest state-probe > "$T/out" 2>&1; then
 echo 'UNEXPECTED recovery accepted'; exit 1
fi
grep -q 'CALLS_STARTED; ingest needs completed turns' "$T/out"
echo 'CONFIRMED: CALLS_STARTED receipt is rejected before completed GitHub turns can be reconciled'
