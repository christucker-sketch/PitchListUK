#!/usr/bin/env bash
# Offline control-flow tests for mycelium-bridge-owner.ps1 under PowerShell 7 (pwsh), with a fake git and a fake node that
# simulates the bridge role (absent / ours:<grant> / closed:<grant> / foreign). No database, no network.
#   bash stage-one/test-bridge-owner.sh      (PWSH=/path/to/pwsh; SKIPPED if none is available)
set -uo pipefail
PWSH=${PWSH:-$(command -v pwsh || true)}
[[ -n $PWSH && -x $PWSH ]] || { echo "bridge owner tests: SKIPPED (no pwsh available; set PWSH=...)"; exit 0; }
D=$(cd "$(dirname "$0")" && pwd); S=$D/mycelium-bridge-owner.ps1
T=$(mktemp -d); trap 'chmod -R u+w "$T" 2>/dev/null; rm -rf "$T"' EXIT
pass=0; failn=0
ok()  { echo "  PASS $*"; pass=$((pass + 1)); }
bad() { echo "  FAIL $*"; failn=$((failn + 1)); }
C=0123456789abcdef0123456789abcdef01234567 U=2026-12-31T23:59:59Z
mkdir -p "$T/bin"
cat > "$T/bin/git" <<'EOF'
#!/usr/bin/env bash
echo "git $*" >> "$CTL/git"
case "$1" in
  branch) [[ -f $CTL/wrong_branch ]] && echo main || echo findpitches-v3/greenfield ;;
  pull) [[ -f $CTL/pull_fail ]] && exit 1; touch "$CTL/pulled"; echo "Already up to date." ;;
  cat-file) [[ -f $CTL/commit_missing && ! -f $CTL/pulled ]] && exit 1; exit 0 ;;
  diff) [[ -f $CTL/dirty ]] && exit 1; exit 0 ;;
  ls-files) [[ -f $CTL/untracked ]] && echo greenfield/mycelium/memory/scripts/evil.mjs; exit 0 ;;
esac
EOF
cat > "$T/bin/node" <<'EOF'
#!/usr/bin/env bash
shift 2; mode=$1; a1=${2:-}; a2=${3:-}; a3=${4:-}; st=$(cat "$CTL/role" 2>/dev/null || echo absent)
echo "$mode $a1 $a2 $a3 flag=${MYCELIUM_REMOTE_WRITES_APPROVED:-}" >> "$CTL/calls"
case $mode in
  verify-absent) [[ $st == absent ]] && exit 0; exit 1 ;;
  create-login)  [[ $MYCELIUM_REMOTE_WRITES_APPROVED == yes ]] || exit 1; [[ -f $CTL/create_noeffect ]] && exit 1
                 [[ $st == absent ]] || exit 1; echo "ours:$a2" > "$CTL/role"; [[ -f $CTL/create_uncertain ]] && exit 1; exit 0 ;;
  rotate-login)  [[ $MYCELIUM_REMOTE_WRITES_APPROVED == yes ]] || exit 1; [[ -f $CTL/rotate_fail ]] && exit 1; [[ $st == "ours:$a2" ]] && { echo rotated >> "$CTL/rot"; exit 0; }; exit 1 ;;
  verify-login)  [[ $st == "ours:$a1" ]] && exit 0; exit 1 ;;
  owned)         case $st in absent) echo "OWNERSHIP: absent" ;; "ours:$a1"|"closed:$a1") echo "OWNERSHIP: ours" ;; *) echo "OWNERSHIP: foreign" ;; esac ;;
  disable-login) [[ $MYCELIUM_REMOTE_WRITES_APPROVED == yes ]] || exit 1
                 case $st in absent) exit 0 ;; "ours:$a1"|"closed:$a1") echo "closed:$a1" > "$CTL/role"; exit 0 ;; *) exit 1 ;; esac ;;
  verify-closed) case $st in absent|"closed:$a1") exit 0 ;; *) exit 1 ;; esac ;;
  *) exit 1 ;;
esac
EOF
chmod +x "$T/bin/"*
W=$T/w PW=$T/w/pw/mycelium-bridge.pw EX=$T/w/mycelium-bridge.pw.expected
fresh() { chmod -R u+w "$W" 2>/dev/null; rm -rf "$W"; mkdir -p "$W/repo/greenfield/mycelium/memory" "$W/ctl" "$W/pw"; touch "$W/repo/greenfield/mycelium/memory/.env.local"
  export MYC_OWNER_TEST_ROOT=$W CTL=$W/ctl PATH="$T/bin:$PATH"; unset MYCELIUM_REMOTE_WRITES_APPROVED; }
own() { local m=$1; shift; "$PWSH" -NoProfile -File "$S" -Mode "$m" -Commit "$C" "$@" > "$T/out" 2>&1; }
role() { cat "$W/ctl/role" 2>/dev/null || echo absent; }
pwcopy() { echo 'Qx7_vR2k-Lm9pT4wZb8nYc3dHf6gJs1aEu5oKi0q' > "$PW"; }
grant() { grep -o '^grant=.*' "$W/mycelium-bridge-grant.txt" 2>/dev/null | cut -d= -f2; }
sent() { grep -qE '^(create|rotate)-login' "$W/ctl/calls" 2>/dev/null; }
noflag() { ! grep -v -e create-login -e rotate-login -e disable-login "$W/ctl/calls" 2>/dev/null | grep -q 'flag=yes'; }
created() { fresh; own before; pwcopy; own create -ValidUntil $U; }

echo "1. before: runs BEFORE the transfer; refuses anything already at the destination"
fresh; own before; [[ $? == 0 && -f $EX ]] && grep -q 'BEFORE OK (create)' "$T/out" && ok "free name: BEFORE OK, one copy now expected" || { bad before; cat "$T/out"; }
fresh; pwcopy; own before; [[ $? != 0 && -f $PW && ! -f $EX ]] && grep -q 'unexpected copy is never used or touched' "$T/out" && ok "a copy already there is refused and left untouched" || bad "before existing copy"
fresh; ln -s /nonexistent/x "$PW"; own before; [[ $? != 0 && -L $PW ]] && ok "a (dangling) link at the destination is refused, untouched" || bad "before link"
fresh; own before; own before; [[ $? != 0 ]] && grep -q 'already expected' "$T/out" && ok "a second before is refused" || bad "double before"
fresh; echo foreign > "$W/ctl/role"; own before; [[ $? != 0 && ! -f $EX ]] && ok "existing role: STOP, nothing expected" || bad "before role"
echo "2. create"
fresh; pwcopy; own create -ValidUntil $U; [[ $? != 0 && -f $PW ]] && ! sent && grep -q 'never touched' "$T/out" && ok "no before: an unexpected copy is refused and NOT touched" || bad "unexpected copy"
fresh; own before; pwcopy; own create; [[ $? != 0 && -f $PW ]] && grep -q 'ValidUntil is required' "$T/out" && ok "create needs -ValidUntil (checked before anything else)" || bad "no validuntil"
created; rc=$?; g=$(grant)
[[ $rc == 0 && $(role) == "ours:$g" && ! -e $PW && ! -e $EX ]] && grep -q 'copy verifiably removed' "$T/out" && grep -q "create-login .* $g $U flag=yes" "$W/ctl/calls" && noflag \
  && ok "CREATE OK only with the login verified AND the copy verifiably removed; write flag only on the write" || { bad create; cat "$T/out"; }
fresh; own before; pwcopy; touch "$W/ctl/wrong_branch"; own create -ValidUntil $U
[[ $? != 0 && ! -e $PW ]] && ! sent && grep -q 'wrong branch (the copy was removed' "$T/out" && ok "early precheck failure (wrong branch): STOP, copy removed, nothing sent" || { bad "early fail"; cat "$T/out"; }
fresh; own before; pwcopy; touch "$W/ctl/dirty"; own create -ValidUntil $U
[[ $? != 0 && ! -e $PW ]] && ! sent && grep -q 'differs from approved' "$T/out" && ok "tracked changes in the package: STOP, copy removed, nothing sent" || bad "dirty"
fresh; own before; pwcopy; touch "$W/ctl/untracked"; own create -ValidUntil $U
[[ $? != 0 && ! -e $PW ]] && ! sent && grep -q 'untracked files' "$T/out" && ok "untracked code in the package: STOP, copy removed, nothing sent" || bad "untracked"
fresh; own before; pwcopy; if [[ $(id -u) == 0 ]]; then chattr +i "$PW"; else chmod 444 "$PW"; chmod 555 "$W/pw"; fi   # root ignores modes
own create -ValidUntil $U; rc=$?; chattr -i "$PW" 2>/dev/null; chmod 755 "$W/pw"
[[ $rc != 0 && -e $PW && -e $EX ]] && grep -q 'COULD NOT BE REMOVED' "$T/out" && ! grep -q 'CREATE OK' "$T/out" && ok "deletion denied: STOP (never success), says delete it by hand; marker kept" || { bad "delete denied"; cat "$T/out"; }
fresh; own before; pwcopy; touch "$W/ctl/create_noeffect"; own create -ValidUntil $U
[[ $? != 0 && $(role) == absent && ! -e $PW ]] && ls "$W" | grep -q 'grant.txt.nothing-created' && ok "no effect: receipt retired, copy removed" || bad "noeffect"
fresh; own before; pwcopy; touch "$W/ctl/create_uncertain"; own create -ValidUntil $U
[[ $? != 0 && $(role) == closed:* && ! -e $PW ]] && grep -q 'closed instead' "$T/out" && ok "uncertain create: this grant's login closed instead (verified); copy removed" || { bad uncertain; cat "$T/out"; }
echo "3. rotate"
created; g=$(grant); own before; [[ $? == 0 ]] && grep -q "BEFORE OK (rotate grant=$g)" "$T/out" && ok "before with a grant expects a rotation copy" || { bad "before rotate"; cat "$T/out"; }
pwcopy; own rotate -ValidUntil 2026-12-01T00:00:00Z
[[ $? == 0 && ! -e $PW && -s $W/ctl/rot ]] && grep -q '^rotated=' "$W/mycelium-bridge-grant.txt" && ok "ROTATE OK: ours only, copy removed, receipt updated" || { bad rotate; cat "$T/out"; }
own before; pwcopy; touch "$W/ctl/rotate_fail"; own rotate -ValidUntil $U; [[ $? != 0 && ! -e $PW ]] && grep -q 'not verified' "$T/out" && ok "failed rotation: STOP, copy removed" || bad "rotate fail"
rm -f "$W/ctl/rotate_fail"; own before; pwcopy; own create -ValidUntil $U; [[ $? != 0 && ! -e $PW ]] && ! grep -q 'flag=yes' <(tail -1 "$W/ctl/calls") && grep -q "not create" "$T/out" && ok "a rotation copy used for create: refused, copy removed" || { bad "purpose"; cat "$T/out"; }
echo "4. close"
touch "$W/ctl/pull_fail"; own close; [[ $? == 0 && $(role) == "closed:$g" ]] && ! grep -q 'git pull' "$W/ctl/git" 2>/dev/null && ls "$W" | grep -q 'grant.txt.closed-' \
  && ok "close works with GitHub unreachable (verified local code; no pull needed); receipt retired" || { bad close; cat "$T/out"; }
created; touch "$W/ctl/dirty"; own close; [[ $? != 0 && $(role) == ours:* ]] && ok "close refuses to run unverified local code" || bad "close dirty"
fresh; own close; [[ $? == 0 ]] && grep -q 'nothing changed' "$T/out" && ok "close without a receipt changes nothing" || bad "close norec"
fresh; printf 'grant=6f1c2b8e-3d4a-4e5f-9a0b-1c2d3e4f5a6b\n' > "$W/mycelium-bridge-grant.txt"; echo foreign > "$W/ctl/role"; own close
[[ $? != 0 && $(role) == foreign ]] && grep -q 'NOT verified' "$T/out" && ok "a foreign role is never changed" || bad "close foreign"
echo; echo "bridge owner tests: $pass passed, $failn failed"; [[ $failn == 0 ]]
