#!/usr/bin/env bash
# Tests for fpd-set-source-key (runs unprivileged against a temp dir via FPD_ETC).
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; S="$HERE/../pi/bin/fpd-set-source-key"
T=$(mktemp -d); export FPD_ETC=$T; pass=0; fail=0
ok() { if eval "$2"; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL: $1"; fi; }
printf 'abcdef0123456789abcdef0123456789\n' | bash "$S" openagenda >/dev/null 2>&1
ok "stores openagenda" 'grep -qx "OPENAGENDA_KEY=abcdef0123456789abcdef0123456789" $T/source-keys.env'
ok "mode 600" '[[ $(stat -c %a $T/source-keys.env) == 600 ]]'
printf 'DATATOURISME_KEY=11112222-3333-4444-5555-666677778888\n' | bash "$S" datatourisme >/dev/null 2>&1
ok "keeps both keys" '[[ $(wc -l < $T/source-keys.env) -eq 2 ]] && grep -q "^DATATOURISME_KEY=11112222-3333-4444-5555-666677778888$" $T/source-keys.env'
printf 'ffffffffffffffffffffffffffffffff\n' | bash "$S" openagenda >/dev/null 2>&1
ok "replaces, not duplicates" '[[ $(grep -c "^OPENAGENDA_KEY=" $T/source-keys.env) -eq 1 ]] && grep -q "=ffff" $T/source-keys.env'
out=$(printf 'SERPER_API_KEY=abcdefabcdefabcdefabcdef\n' | bash "$S" openagenda 2>&1); rc=$?
ok "refuses other credentials" '[[ $rc -ne 0 && $out == *refused* ]]'
out=$(printf 'short\n' | bash "$S" openagenda 2>&1); rc=$?
ok "refuses junk" '[[ $rc -ne 0 ]]'
out=$(printf 'has space in it 1234567890\n' | bash "$S" openagenda 2>&1)
ok "never echoes key" '[[ $(bash "$S" --list) != *ffff* && $out != *1234567890* ]]'
ok "list" '[[ $(bash "$S" --list) == *"OPENAGENDA_KEY: set"* ]]'
rm -rf "$T"; echo "source-key tests: $pass passed, $fail failed"; [[ $fail -eq 0 ]]
