#!/usr/bin/env bash
# Offline tests for install-node.sh: a fake tarball with a node that prints the pinned version; no network, no root.
#   bash greenfield/mycelium/hostprep/test-install-node.sh
set -uo pipefail
D=$(cd "$(dirname "$0")" && pwd); S=$D/install-node.sh
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
pass=0; failn=0
ok()  { echo "  PASS $*"; pass=$((pass + 1)); }
bad() { echo "  FAIL $*"; failn=$((failn + 1)); }
mk_tar() {  # $1 = version the fake node prints
  rm -rf "$T/src"; mkdir -p "$T/src/node-v22.23.4-linux-x64/bin"
  printf '#!/bin/sh\necho %s\n' "$1" > "$T/src/node-v22.23.4-linux-x64/bin/node"
  printf '#!/bin/sh\necho 10.9.4\n' > "$T/src/node-v22.23.4-linux-x64/bin/npm"; cp "$T/src/node-v22.23.4-linux-x64/bin/npm" "$T/src/node-v22.23.4-linux-x64/bin/npx"
  chmod +x "$T/src/node-v22.23.4-linux-x64/bin/"*; tar -C "$T/src" -cJf "$T/node.tar.xz" node-v22.23.4-linux-x64
}
fresh() { rm -rf "$T/r"; mkdir -p "$T/r/opt" "$T/r/usr/local/bin" "$T/r/var/lib"; echo keep > "$T/r/usr/local/bin/myc-gate"
  local h; h=$(sha256sum "$T/node.tar.xz" | cut -d' ' -f1); export NODEINST_TEST=1 T_ROOT=$T/r T_URL=$T/node.tar.xz T_SHA=$h; }
run() { bash "$S" "$@" > "$T/out" 2>&1; }
snap() { (cd "$T/r" && { find . -type d -printf '%p d %m - %l\n'; find . ! -type d -printf '%p %y %m %s %l\n'; } | sort; find . -type f -exec sha256sum {} + | sort) 2>/dev/null; }
B=$T/r/usr/local/bin

mk_tar v22.23.4
echo "1. check is read-only; existing node/npm/npx, tree or receipt are refused before any change"
fresh; before=$(snap); run check; [[ $? == 0 && $(snap) == "$before" ]] && grep -q 'CHECK OK' "$T/out" && ok "clean: CHECK OK, nothing changed" || { bad check; cat "$T/out"; }
for what in node npx tree receipt dangling; do
  fresh
  case $what in node) echo x > "$B/node" ;; npx) ln -s /bin/true "$B/npx" ;; tree) mkdir "$T/r/opt/node-v22.23.4-linux-x64" ;;
    receipt) mkdir -m 700 "$T/r/var/lib/mycelium-node" ;; dangling) ln -s /nonexistent "$B/npm" ;; esac
  before=$(snap); run check; r1=$?; run install; r2=$?; run rollback; r3=$?
  [[ $r1 != 0 && $r2 != 0 && $r3 == 0 && $(snap) == "$before" ]] && ok "existing $what: check and install refuse; rollback changes nothing" || { bad "existing $what"; cat "$T/out"; }
done

echo "2. install: pinned hash enforced; exclusive links; version verified; other commands untouched"
fresh; export T_SHA=0000000000000000000000000000000000000000000000000000000000000000; run install
[[ $? != 0 && ! -e $T/r/opt/node-v22.23.4-linux-x64 && ! -e $B/node ]] && grep -q 'sha256 mismatch' "$T/out" && ok "tampered download: refused, nothing installed" || { bad "hash"; cat "$T/out"; }
run rollback; [[ ! -e $T/r/var/lib/mycelium-node ]] && ok "rollback after a refused download removes only the receipt" || bad "rollback receipt"
fresh; gate=$(sha256sum "$B/myc-gate"); run install; r=$?
[[ $r == 0 && $(readlink "$B/node") == "$T/r/opt/node-v22.23.4-linux-x64/bin/node" && -L $B/npm && -L $B/npx && $("$B/node") == v22.23.4 ]] \
  && grep -q 'INSTALL OK: node v22.23.4' "$T/out" && [[ $(sha256sum "$B/myc-gate") == "$gate" ]] && ok "installed: three links to the verified tree; node v22.23.4; other commands untouched" || { bad install; cat "$T/out"; }
[[ $(tail -n +4 "$T/r/var/lib/mycelium-node/created" | tr '\n' ';') == "dir $T/r/opt/node-v22.23.4-linux-x64;link $B/node;link $B/npm;link $B/npx;" ]] && ok "receipt records exactly the tree and three links" || { bad receipt; cat "$T/r/var/lib/mycelium-node/created"; }
before=$(snap); run install; [[ $? != 0 && $(snap) == "$before" ]] && ok "a second install refuses and changes nothing" || bad "install twice"

echo "3. rollback removes exactly what install made, and leaves replaced links alone"
rm "$B/npx"; ln -s /bin/true "$B/npx"; run rollback
[[ $? == 0 && ! -e $B/node && ! -e $B/npm && $(readlink "$B/npx") == /bin/true && ! -e $T/r/opt/node-v22.23.4-linux-x64 && -f $B/myc-gate ]] \
  && grep -q 'no longer the link' "$T/out" && ok "rollback: own links and tree removed; a link someone replaced is left alone" || { bad rollback; cat "$T/out"; }
run rollback; grep -q 'no recognised receipt' "$T/out" && ok "rollback again: nothing to do" || bad "rollback twice"

echo "4. a wrong version inside a correctly hashed archive is caught"
mk_tar v20.0.0; fresh; run install; [[ $? != 0 ]] && grep -q 'expected v22.23.4' "$T/out" && ok "unexpected node version: STOP (rollback available)" || { bad "version"; cat "$T/out"; }
run rollback; [[ ! -e $B/node && ! -e $T/r/opt/node-v22.23.4-linux-x64 ]] && ok "rollback after that STOP cleans up fully" || bad "rollback after version"

echo; echo "install-node tests: $pass passed, $failn failed"; [[ $failn == 0 ]]
