#!/usr/bin/env bash
# Developer side: package the engine into fpd-app.tgz next to this script (run from anywhere).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; ROOT="$(cd "$HERE/../.." && pwd)"
STAGE=$(mktemp -d); mkdir -p "$STAGE/app"
cp -r "$ROOT/fpd" "$ROOT/tests" "$ROOT/requirements.txt" "$ROOT/README.md" "$ROOT/DESIGN.md" "$ROOT/INTEGRATION_READY.md" "$ROOT/.env.example" "$STAGE/app/"
cp "$ROOT/integration_export/README.md" "$STAGE/app/EXPORT_CONTRACT.md"
find "$STAGE" -name __pycache__ -prune -exec rm -rf {} + ; find "$STAGE" -name '*.pyc' -delete
tar -C "$STAGE" --owner=0 --group=0 -czf "$HERE/fpd-app.tgz" app
rm -rf "$STAGE"
(cd "$HERE" && find . -type f ! -name SHA256SUMS ! -name '*.md' -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS)
echo "built $HERE/fpd-app.tgz ($(du -h "$HERE/fpd-app.tgz" | cut -f1))"
