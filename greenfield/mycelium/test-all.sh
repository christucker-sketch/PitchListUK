#!/usr/bin/env bash
# Mycelium 0.1: every offline suite in one command (no model calls, no network, no Neon, no host changes).
#   bash greenfield/mycelium/test-all.sh            prints one line per suite and a final PASS/FAIL; exit 0 only if all pass
# Suites run one after another: some host rehearsals have timing assertions that are unreliable under parallel load.
set -uo pipefail
M=$(cd "$(dirname "$0")" && pwd); L=$(mktemp -d); trap 'rm -rf "$L"' EXIT; fails=0
suite() { local name=$1; shift; local t0=$SECONDS
  if (cd "$M" && "$@") > "$L/$name.log" 2>&1; then echo "PASS  $name  ($((SECONDS - t0)) s)"
  else echo "FAIL  $name  ($((SECONDS - t0)) s)"; tail -15 "$L/$name.log" | sed 's/^/      /'; fails=$((fails + 1)); fi; }
suite workbench          bash -c 'node --test brain/workbench/test/*.test.mjs'
suite session          bash -c 'node --test session/test/*.test.mjs'
suite e0                 node --test brain/experiments/e0-sim.test.mjs
suite cycle-package      bash runs/check-cycle-package.sh
suite memory             bash -c 'cd memory && npm run -s build && npm test'
for t in stageb runner-decisions review-regressions memref upgrade-gate post install-cycle; do suite "stageb-$t" bash "stageb/test-$t.sh"; done
suite stageb-codex-post   bash stageb/codex-test-post.sh
[[ $fails == 0 ]] && echo "MYCELIUM 0.1 OFFLINE SUITES: PASS" || echo "MYCELIUM 0.1 OFFLINE SUITES: FAIL ($fails)"; [[ $fails == 0 ]]
