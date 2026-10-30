#!/usr/bin/env bash
# READ-ONLY CLI/host inventory. No model, login, credentials, network, service changes or installation.
# Run as the EXISTING myc account via the existing host route; writes only a new /tmp report directory.
set -euo pipefail
umask 077
if [[ $(id -un) != myc ]]; then echo 'REFUSED: run as existing myc account; do not create/change accounts' >&2; exit 2; fi
HERE=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
CODEX_BIN=${CODEX_BIN:-$(command -v codex || true)}
CLAUDE_BIN=${CLAUDE_BIN:-$(command -v claude || true)}
[[ -n "$CODEX_BIN" && -x "$CODEX_BIN" && -n "$CLAUDE_BIN" && -x "$CLAUDE_BIN" ]] || { echo 'REFUSED: existing CLIs not found; no install or login attempted' >&2; exit 2; }
OUT=$(mktemp -d /tmp/myc-p0-preflight.XXXXXX)
echo "Evidence directory: $OUT"
date -u +'%Y-%m-%dT%H:%M:%SZ' > "$OUT/observed-at.txt"
id -un > "$OUT/account.txt"
"$CODEX_BIN" --version > "$OUT/codex-version.txt" 2>&1
"$CODEX_BIN" app-server --help > "$OUT/codex-app-server-help.txt" 2>&1
"$CODEX_BIN" app-server generate-json-schema --experimental --out "$OUT/schema" > "$OUT/schema-generation.log" 2>&1
node "$HERE/codex-protocol-check.mjs" "$OUT/schema/codex_app_server_protocol.schemas.json" > "$OUT/codex-protocol.json"
"$CLAUDE_BIN" --version > "$OUT/claude-version.txt" 2>&1
"$CLAUDE_BIN" --help > "$OUT/claude-help.txt" 2>&1
for flag in --input-format --output-format --replay-user-messages --restricted --strict-mcp-config --allowedTools --tools --setting-sources --session-id; do
  if ! rg -F -q -- "$flag" "$OUT/claude-help.txt"; then echo "REFUSED: Claude help does not advertise $flag; do not remove isolation flags to proceed" >&2; exit 2; fi
done
rg '^(MemTotal|MemAvailable|SwapFree):' /proc/meminfo > "$OUT/memory.txt"
stat -fc %T /sys/fs/cgroup > "$OUT/cgroup-filesystem.txt"
getent passwd mycexp > "$OUT/test-account.txt" || true
command -v systemd-run > "$OUT/systemd-run-path.txt" || true
command -v setpriv > "$OUT/setpriv-path.txt" || true
printf '%s\n' 'INVENTORY ONLY. CLI help/schema compatibility is not a live, sandbox, billing or authentication proof.'
cat "$OUT/codex-version.txt" "$OUT/claude-version.txt" "$OUT/codex-protocol.json" "$OUT/memory.txt"
echo "Retain $OUT. No authentication material was read/exported. Share sanitized inventory files through the existing hub."
