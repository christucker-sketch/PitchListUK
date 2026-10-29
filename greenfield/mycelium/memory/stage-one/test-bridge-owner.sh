#!/usr/bin/env bash
# Offline control-flow tests for mycelium-bridge-owner.ps1 under PowerShell 7 (pwsh), with a fake git and a fake node that
# simulates the bridge role (absent / ours:<grant> / closed:<grant> / foreign). No database, no network.
#   bash stage-one/test-bridge-owner.sh      (PWSH=/path/to/pwsh; SKIPPED if none is available)
set -uo pipefail
PWSH=${PWSH:-$(command -v pwsh || true)}
[[ -n $PWSH && -x $PWSH ]] || { echo "bridge owner tests: SKIPPED (no pwsh available; set PWSH=...)"; exit 0; }
D=$(cd "$(dirname "$0")" && pwd); S=$D/mycelium-bridge-owner.ps1
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
pass=0; failn=0
ok()  { echo "  PASS $*"; pass=$((pass + 1)); }
bad() { echo "  FAIL $*"; failn=$((failn + 1)); }
C=0123456789abcdef0123456789abcdef01234567 U=2026-12-31T23:59:59Z
mkdir -p "$T/bin"
cat > "$T/bin/git" <<'EOF'
#!/usr/bin/env bash
case "$1" in branch) echo findpitches-v3/greenfield ;; pull) echo "Already up to date." ;; cat-file|diff) exit 0 ;; esac
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
fresh() { rm -rf "$T/w"; mkdir -p "$T/w/repo/greenfield/mycelium/memory" "$T/w/ctl"; touch "$T/w/repo/greenfield/mycelium/memory/.env.local"
  export MYC_OWNER_TEST_ROOT=$T/w CTL=$T/w/ctl PATH="$T/bin:$PATH"; unset MYCELIUM_REMOTE_WRITES_APPROVED; }
own() { local m=$1; shift; "$PWSH" -NoProfile -File "$S" -Mode "$m" -Commit "$C" "$@" > "$T/out" 2>&1; }
role() { cat "$T/w/ctl/role" 2>/dev/null || echo absent; }
pwcopy() { echo 'Qx7_vR2k-Lm9pT4wZb8nYc3dHf6gJs1aEu5oKi0q' > "$T/w/mycelium-bridge.pw"; }
grant() { grep -o '^grant=.*' "$T/w/mycelium-bridge-grant.txt" 2>/dev/null | cut -d= -f2; }
noflag() { ! grep -q 'flag=yes' <(grep -v -e create-login -e rotate-login -e disable-login "$T/w/ctl/calls" 2>/dev/null); }

echo "1. before"
fresh; own before; [[ $? == 0 ]] && grep -q 'BEFORE OK' "$T/out" && ok "free name: BEFORE OK" || { bad before; cat "$T/out"; }
fresh; echo foreign > "$T/w/ctl/role"; own before; [[ $? != 0 && $(role) == foreign ]] && ok "existing role: STOP, unchanged" || bad "before existing"
echo "2. create"
fresh; own create; [[ $? != 0 ]] && grep -q 'ValidUntil is required' "$T/out" && ok "create needs -ValidUntil" || bad "no validuntil"
fresh; own create -ValidUntil $U; [[ $? != 0 && $(role) == absent ]] && grep -q 'no password copy' "$T/out" && ok "no PC copy: STOP, nothing created" || bad "no copy"
fresh; pwcopy; own create -ValidUntil $U; rc=$?; g=$(grant)
[[ $rc == 0 && $(role) == "ours:$g" && ! -e $T/w/mycelium-bridge.pw ]] && grep -q 'CREATE OK' "$T/out" && grep -q "create-login .* $g $U flag=yes" "$T/w/ctl/calls" && noflag \
  && ok "CREATE OK: bound to a new grant, expiry passed, copy wiped, write flag only on the write" || { bad create; cat "$T/out"; }
pwcopy; own create -ValidUntil $U; [[ $? != 0 && $(grant) == "$g" ]] && grep -q 'one-time' "$T/out" && ok "a second create is refused" || bad "re-create"
fresh; pwcopy; touch "$T/w/ctl/create_noeffect"; own create -ValidUntil $U
[[ $? != 0 && $(role) == absent && ! -e $T/w/mycelium-bridge.pw ]] && ls "$T/w" | grep -q 'grant.txt.nothing-created' && ok "no effect: receipt retired, copy wiped" || bad "noeffect"
fresh; pwcopy; touch "$T/w/ctl/create_uncertain"; own create -ValidUntil $U
[[ $? != 0 && $(role) == closed:* && ! -e $T/w/mycelium-bridge.pw ]] && grep -q 'closed instead' "$T/out" && ok "uncertain create: this grant's login closed instead (verified)" || { bad uncertain; cat "$T/out"; }
echo "3. rotate"
fresh; pwcopy; own rotate -ValidUntil $U; [[ $? != 0 ]] && grep -q 'no grant receipt' "$T/out" && ok "rotate without a receipt: STOP" || bad "rotate norec"
fresh; pwcopy; own create -ValidUntil $U; g=$(grant); pwcopy; own rotate -ValidUntil 2026-12-01T00:00:00Z
[[ $? == 0 && ! -e $T/w/mycelium-bridge.pw && -s $T/w/ctl/rot ]] && grep -q '^rotated=' "$T/w/mycelium-bridge-grant.txt" && ok "ROTATE OK: ours only, copy wiped, receipt updated" || { bad rotate; cat "$T/out"; }
pwcopy; touch "$T/w/ctl/rotate_fail"; own rotate -ValidUntil $U; [[ $? != 0 && ! -e $T/w/mycelium-bridge.pw ]] && grep -q 'not verified' "$T/out" && ok "failed rotation: STOP, copy still wiped" || bad "rotate fail"
echo "4. close"
own close; [[ $? == 0 && $(role) == "closed:$g" ]] && ls "$T/w" | grep -q 'grant.txt.closed-' && ok "close: NOLOGIN + revoke verified; receipt retired" || { bad close; cat "$T/out"; }
fresh; own close; [[ $? == 0 ]] && grep -q 'nothing changed' "$T/out" && ok "close without a receipt changes nothing" || bad "close norec"
fresh; printf 'grant=6f1c2b8e-3d4a-4e5f-9a0b-1c2d3e4f5a6b\n' > "$T/w/mycelium-bridge-grant.txt"; echo foreign > "$T/w/ctl/role"; own close
[[ $? != 0 && $(role) == foreign ]] && grep -q 'NOT verified' "$T/out" && ok "a foreign role is never changed" || bad "close foreign"
echo; echo "bridge owner tests: $pass passed, $failn failed"; [[ $failn == 0 ]]
