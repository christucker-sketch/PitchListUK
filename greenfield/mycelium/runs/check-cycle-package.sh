#!/usr/bin/env bash
# Offline check of a workbench cycle package (no model calls, no network, no Neon): the manifest parses under the bridge's
# own rules, the six descriptors build within the gate's limits, and the scoreboard embedded in CYCLE_BRIEF.md is exactly
# what the pinned workbench computes now.      bash runs/check-cycle-package.sh [stage-two-cycle-1]
set -euo pipefail
B=${1:-stage-two-cycle-1}; M=$(cd "$(dirname "$0")/.." && pwd); T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
node -e "import('$M/memory/scripts/bridge.mjs').then(b => { const m = b.parseManifest(JSON.parse(require('fs').readFileSync('$M/runs/$B.json'))); if (m.workbench !== true) throw new Error('not a workbench batch'); console.log('manifest OK: ' + m.tasks.length + ' turns, window ' + m.window_s + ' s'); })"
node "$M/runs/make-cycle-tasks.mjs" "$B" "$(printf '0%.0s' {1..64})" | sed 's/^/descriptor OK: /'
( cd "$M/brain/workbench" && node evaluate.mjs --seeds 6 --md "$T/board.md" >/dev/null )
awk '/^## Starting scoreboard/{f=1; next} f && /^```text$/{g=1; next} g && /^```$/{exit} g' "$M/brain/workbench/CYCLE_BRIEF.md" > "$T/brief.md"
nocpu() { sed -E 's/ \| [0-9]+±[0-9]+$//' "$1"; }   # cpu ms is measured, not deterministic; every other column must match exactly
diff -u <(nocpu "$T/brief.md") <(nocpu "$T/board.md") > "$T/diff" && echo "scoreboard OK: CYCLE_BRIEF.md matches the pinned workbench (all columns except measured cpu ms)" || { echo "scoreboard MISMATCH:"; head -40 "$T/diff"; exit 1; }
echo "brief: $(wc -c < "$M/brain/workbench/CYCLE_BRIEF.md") bytes (gate ref limit applies to git blobs; snapshot limit 32 KB is separate)"
