#!/usr/bin/env bash
# The shared task validator block must be byte-identical in myc-gate and mycnotify (so the notifier can never treat as
# a decision anything the writer would quarantine). Cross-reader verdicts on real fixtures: test-decisions.sh section 10.
#   bash test-fold-parity.sh
set -uo pipefail
D=$(cd "$(dirname "$0")" && pwd)
blk() { sed -n '/^# >>> myc-fold/,/^# <<< myc-fold/p' "$1"; }
a=$(blk "$D/myc-gate"); b=$(blk "$D/../notify/mycnotify")
if [[ -n $a && $(wc -l <<<"$a") -gt 50 && $a == "$b" ]]; then
  echo "  PASS shared validator block identical ($(wc -l <<<"$a") lines, sha256 $(sha256sum <<<"$a" | cut -c1-12))"; echo "fold parity: 1 passed, 0 failed"
else
  echo "  FAIL shared validator block differs"; diff <(echo "$a") <(echo "$b") | head -20; echo "fold parity: 0 passed, 1 failed"; exit 1
fi
