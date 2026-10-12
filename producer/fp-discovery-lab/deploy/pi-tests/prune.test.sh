#!/usr/bin/env bash
# Tests for deploy/pi/bin/fpd-v3-prune (regression 2026-10-12: unit failed once >20 recent checkpoints existed).
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; P="$HERE/../pi/bin/fpd-v3-prune"; pass=0; fail=0
run() { T=$(mktemp -d); mkdir -p "$T/exports" "$T/checkpoints"; "$1" "$T"; sed "s#^S=.*#S=$T#" "$P" > "$T/p.sh"; bash "$T/p.sh" >/dev/null 2>&1; rc=$?; ne=$(ls "$T/exports" | wc -l); nc=$(ls "$T/checkpoints" | wc -l); rm -rf "$T"; }
ok() { if eval "$2"; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL: $1 (rc=$rc exports=$ne checkpoints=$nc)"; fi; }
empty() { :; }
recent() { for i in $(seq 1 25); do touch "$1/checkpoints/c$i.json"; done; for i in $(seq 1 9); do touch -d "-$i min" "$1/exports/e$i.json"; done; }
old() { for i in $(seq 1 25); do touch -d "-$((40+i)) days" "$1/checkpoints/c$i.json"; done; }
run empty; ok "empty dirs succeed" '[[ $rc == 0 ]]'
run recent; ok ">20 recent checkpoints succeed, kept" '[[ $rc == 0 && $nc == 25 && $ne == 6 ]]'
run old; ok "old checkpoints pruned to newest 20" '[[ $rc == 0 && $nc == 20 ]]'
echo "prune tests: $pass passed, $fail failed"; [[ $fail == 0 ]]
