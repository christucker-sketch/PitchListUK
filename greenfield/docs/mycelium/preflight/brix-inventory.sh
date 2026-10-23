#!/usr/bin/env bash
# Mycelium BRIX CLI preflight, Phase A (23 Oct): READ-ONLY inventory. No sudo, nothing installed, started, stopped or
# changed. Prints no environment values, tokens or secrets: for credential-related variables and folders it shows
# names/presence only. Machine/boot IDs are filtered out.
set +e
echo "===== HOST $(hostname) ====="
echo "--- system";  hostnamectl 2>&1 | grep -vE 'Machine ID|Boot ID'
echo "--- arch/kernel"; uname -m; uname -r
echo "--- os";      grep -E '^(PRETTY_NAME|VERSION_ID)=' /etc/os-release
echo "--- libc";    ldd --version 2>&1 | head -1
echo "--- cpu";     echo "$(nproc) cores: $(grep -m1 'model name' /proc/cpuinfo | cut -d: -f2 | xargs)"
echo "--- memory";  free -h
echo "--- disk";    df -h -x tmpfs -x devtmpfs -x efivarfs 2>/dev/null
echo "--- tools"
for c in node npm npx codex claude git curl; do
  p=$(command -v "$c" 2>/dev/null)
  if [ -n "$p" ]; then printf '%-7s %s  %s\n' "$c" "$p" "$("$c" --version 2>&1 | head -1 | cut -c1-60)"; else printf '%-7s MISSING\n' "$c"; fi
done
echo "--- identity"; id; echo "HOME=$HOME"
echo "--- AI credential variables in this shell (NAMES only, values never printed)"
env | cut -d= -f1 | grep -E '^(ANTHROPIC_|OPENAI_|CLAUDE_CODE_|CODEX_)' || echo "none"
echo "--- AI CLI config folders (presence only)"
for d in "$HOME/.claude" "$HOME/.codex" "$HOME/.config/anthropic"; do [ -e "$d" ] && echo "present: $d" || echo "absent:  $d"; done
echo "--- running services"; systemctl --type=service --state=running --no-pager --no-legend 2>/dev/null | awk '{print $1}'
echo "--- failed units";     systemctl --failed --no-pager --no-legend 2>/dev/null | awk '{print $2}' | grep . || echo "none"
echo "--- fpd/mycelium/worker units"; systemctl list-unit-files --no-pager --no-legend 2>/dev/null | grep -Ei 'fpd|myc|worker' || echo "none"
echo "--- load";  uptime
echo "--- temps"; sensors 2>/dev/null | grep -E 'Package|Core' | head -4
echo "===== END $(hostname) ====="
