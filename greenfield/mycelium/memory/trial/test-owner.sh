#!/usr/bin/env bash
# Offline control-flow tests for mycelium-explorer-owner.ps1 under PowerShell 7 (pwsh), with a fake git and a fake node that
# simulates the database role states (absent / ours:<attempt> / closed:<attempt> / foreign). No database, no network.
#   bash trial/test-owner.sh            (PWSH=/path/to/pwsh to choose the binary; SKIPPED if none is available)
set -uo pipefail
PWSH=${PWSH:-$(command -v pwsh || true)}
[[ -n $PWSH && -x $PWSH ]] || { echo "owner script tests: SKIPPED (no pwsh available; set PWSH=...)"; exit 0; }
D=$(cd "$(dirname "$0")" && pwd); S=$D/mycelium-explorer-owner.ps1
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
pass=0; failn=0
ok()  { echo "  PASS $*"; pass=$((pass + 1)); }
bad() { echo "  FAIL $*"; failn=$((failn + 1)); }
C=0123456789abcdef0123456789abcdef01234567
mkdir -p "$T/bin"
cat > "$T/bin/git" <<'EOF'
#!/usr/bin/env bash
case "$1" in branch) echo findpitches-v3/greenfield ;; pull) echo "Already up to date." ;; cat-file|diff) exit 0 ;; esac
EOF
cat > "$T/bin/node" <<'EOF'
#!/usr/bin/env bash
# fake explorer-provision.mjs: args are --env-file=.env.local <script> <mode> [a1] [a2]; role state lives in $CTL/role
shift 2; mode=$1; a1=${2:-}; a2=${3:-}; st=$(cat "$CTL/role" 2>/dev/null || echo absent)
echo "$mode $a1 $a2" >> "$CTL/calls"
case $mode in
  verify-absent) [[ -f $CTL/unreachable ]] && exit 1; [[ $st == absent ]] && { echo "VERIFIED: absent"; exit 0; }; echo "exists"; exit 1 ;;
  create-login)  [[ $MYCELIUM_REMOTE_WRITES_APPROVED == yes ]] || exit 1
                 [[ -f $CTL/create_noeffect ]] && exit 1
                 [[ $st == absent ]] || { echo "already exists"; exit 1; }
                 echo "ours:$a2" > "$CTL/role"; [[ -f $CTL/create_uncertain ]] && exit 1; echo created; exit 0 ;;
  verify-login)  [[ -f $CTL/login_wrong ]] && exit 1; [[ $st == "ours:$a1" ]] && exit 0; exit 1 ;;
  owned)         [[ -f $CTL/unreachable_owned ]] && exit 1
                 case $st in absent) echo "OWNERSHIP: absent" ;; "ours:$a1"|"closed:$a1") echo "OWNERSHIP: ours" ;; *) echo "OWNERSHIP: foreign" ;; esac ;;
  disable-login) [[ $MYCELIUM_REMOTE_WRITES_APPROVED == yes ]] || exit 1
                 case $st in absent) exit 0 ;; "ours:$a1"|"closed:$a1") echo "closed:$a1" > "$CTL/role"; exit 0 ;; *) echo "not created by this trial"; exit 1 ;; esac ;;
  verify-closed) case $st in absent|"closed:$a1") exit 0 ;; *) exit 1 ;; esac ;;
  *) exit 1 ;;
esac
EOF
chmod +x "$T/bin/"*
fresh() {
  rm -rf "$T/w"; mkdir -p "$T/w/repo/greenfield/mycelium/memory" "$T/w/ctl"; touch "$T/w/repo/greenfield/mycelium/memory/.env.local"
  export MYC_OWNER_TEST_ROOT=$T/w CTL=$T/w/ctl PATH="$T/bin:$PATH"; unset MYCELIUM_REMOTE_WRITES_APPROVED
}
own() { "$PWSH" -NoProfile -File "$S" -Mode "$1" -Commit "$C" > "$T/out" 2>&1; }
role() { cat "$T/w/ctl/role" 2>/dev/null || echo absent; }
pwcopy() { echo 'Qx7_vR2k-Lm9pT4wZb8nYc3dHf6gJs1aEu5oKi0q' > "$T/w/mycelium-explorer.pw"; }
receipt() { local f; for f in "$T/w"/mycelium-explorer-attempt*; do [[ -e $f ]] && printf '%s ' "${f##*/}"; done; }

echo "1. before: refuses an existing role and an unfinished receipt; read-only"
fresh; own before; [[ $? == 0 ]] && grep -q 'BEFORE OK' "$T/out" && [[ $(role) == absent ]] && ok "free name: BEFORE OK, nothing changed" || { bad before; cat "$T/out"; }
fresh; echo foreign > "$T/w/ctl/role"; own before; [[ $? != 0 && $(role) == foreign ]] && grep -q 'will not use or change it' "$T/out" && ok "pre-existing role: STOP, unchanged" || { bad "before foreign"; cat "$T/out"; }

echo "2. create: happy path binds an attempt; password copy always wiped; flag always removed"
fresh; pwcopy; own create; r=$?
att=$(sed -n 's/^attempt=//p' "$T/w/mycelium-explorer-attempt.txt" 2>/dev/null)
[[ $r == 0 && -n $att && $(role) == "ours:$att" && ! -e $T/w/mycelium-explorer.pw ]] && grep -q 'CREATE OK' "$T/out" && grep -q 'write flag removed: True' "$T/out" \
  && ok "created for attempt $att; password copy wiped; write flag removed" || { bad create; cat "$T/out"; }
own create; [[ $? != 0 ]] && grep -q 'receipt already exists' "$T/out" && [[ $(role) == "ours:$att" ]] && ok "a second create refuses while the receipt exists" || bad "create twice"
own close; [[ $? == 0 && $(role) == "closed:$att" ]] && grep -q 'CLOSE OK' "$T/out" && [[ $(receipt) == *closed-* && ! -e $T/w/mycelium-explorer-attempt.txt ]] && ok "close: this attempt closed and verified; receipt archived" || { bad close; cat "$T/out"; }
own close; [[ $? == 0 ]] && grep -q 'no attempt receipt' "$T/out" && ok "close again: nothing recorded, nothing changed" || bad "close twice"

echo "3. R3c: a foreign role is never changed by create, defensive close or close"
fresh; pwcopy; echo foreign > "$T/w/ctl/role"; own create
[[ $? != 0 && $(role) == foreign && ! -e $T/w/mycelium-explorer-attempt.txt && ! -e $T/w/mycelium-explorer.pw ]] && ! grep -q '^create-login' "$T/w/ctl/calls" \
  && ok "pre-existing role: create refuses before writing (no create-login call, no receipt), password copy wiped" || { bad "create foreign"; cat "$T/out"; }
own close; [[ $? == 0 && $(role) == foreign ]] && ! grep -q '^disable-login' "$T/w/ctl/calls" && ok "close without a receipt never touches the foreign role" || { bad "close foreign"; cat "$T/out"; }
fresh; echo "attempt=11111111-2222-4333-8444-555555555555" > "$T/w/mycelium-explorer-attempt.txt"; echo foreign > "$T/w/ctl/role"; own close
[[ $? != 0 && $(role) == foreign ]] && grep -q 'closure NOT verified' "$T/out" && ok "close with a receipt for another attempt: refused, foreign role unchanged" || { bad "close other"; cat "$T/out"; }

fresh; echo 'SCRAM-SHA-256$4096:notplain' > "$T/w/mycelium-explorer.pw"; own create
[[ $? != 0 && ! -e $T/w/mycelium-explorer.pw && $(role) == absent ]] && grep -q 'password copy malformed' "$T/out" && ! grep -q '^create-login' "$T/w/ctl/calls" 2>/dev/null \
  && ok "a hash or malformed copy is refused before any write, and still wiped" || { bad "malformed copy"; cat "$T/out"; }

echo "4. failed or uncertain create is reconciled read-only, acting only on this attempt"
fresh; pwcopy; touch "$T/w/ctl/create_noeffect"; own create
[[ $? != 0 && $(role) == absent && $(receipt) == *nothing-created-* ]] && grep -q 'nothing was created' "$T/out" && ok "failed with no effect: nothing created, nothing closed" || { bad "noeffect"; cat "$T/out"; }
fresh; pwcopy; touch "$T/w/ctl/create_uncertain"; own create; att=$(ls "$T/w" | sed -n 's/^mycelium-explorer-attempt.txt.closed-.*//p'; cat "$T/w/ctl/role")
[[ $(role) == closed:* && $(receipt) == *closed-* ]] && grep -q 'was closed instead (verified)' "$T/out" && ok "uncertain create that took effect: proven ours by comment, closed and verified" || { bad "uncertain"; cat "$T/out"; }
fresh; pwcopy; touch "$T/w/ctl/login_wrong"; own create
[[ $? != 0 && $(role) == closed:* ]] && grep -q 'was closed instead' "$T/out" && ok "created but not least-privilege: closed defensively, reported as STOP" || { bad "wrong login"; cat "$T/out"; }
fresh; pwcopy; touch "$T/w/ctl/create_uncertain" "$T/w/ctl/unreachable_owned"; own create
[[ $? != 0 && -e $T/w/mycelium-explorer-attempt.txt ]] && grep -q 'outcome uncertain' "$T/out" && ok "database unreachable after create: STOP uncertain, receipt kept for a later close" || { bad "unreachable"; cat "$T/out"; }
rm -f "$T/w/ctl/unreachable_owned"; own close; [[ $? == 0 && $(role) == closed:* ]] && ok "the later close closes exactly that attempt" || { bad "later close"; cat "$T/out"; }

echo; echo "owner script tests ($("$PWSH" -NoProfile -Command '$PSVersionTable.PSVersion.ToString()')): $pass passed, $failn failed"; [[ $failn == 0 ]]
