#!/usr/bin/env bash
# Provide Node.js 22 LTS on fpd-prod for the Mycelium explorer trial (PROPOSAL; separate approval required).
#   sudo bash install-node.sh check      read-only: platform, collisions, nothing changed
#   sudo bash install-node.sh install    download the official tarball, verify the PINNED sha256, extract, link
#   sudo bash install-node.sh rollback   remove exactly what install recorded (links, then the extracted tree)
# Official build only: https://nodejs.org/dist/v22.23.4/node-v22.23.4-linux-x64.tar.xz, sha256 pinned below. The pin was
# taken from SHASUMS256.txt.asc, whose clearsign signature verifies against the nodejs/release-keys keyring (Antoine du
# Hamel). No apt source, package, service, timer or user is added or changed. Installs to /opt/node-v22.23.4-linux-x64 and
# links node/npm/npx into /usr/local/bin. Every path must be absent first; each is recorded in a root-only receipt only
# after it is created exclusively; rollback acts only on recorded paths that are still exactly what install made.
set -euo pipefail
umask 022
VER=v22.23.4 SHA=1805bcd35e6815559bd2eb97db438d3fdb0eb3a5e6a977b7c1badca76337e9ce
NAME=node-$VER-linux-x64 URL=https://nodejs.org/dist/$VER/node-$VER-linux-x64.tar.xz
OPT=/opt BIN=/usr/local/bin RC=/var/lib/mycelium-node TEST=0
if [[ ${NODEINST_TEST:-0} == 1 ]]; then   # offline test harness only
  TEST=1 OPT=$T_ROOT/opt BIN=$T_ROOT/usr/local/bin RC=$T_ROOT/var/lib/mycelium-node URL=$T_URL SHA=$T_SHA
fi
DEST=$OPT/$NAME RECEIPT=$RC/created HEADER="mycelium-node receipt v1"
say()  { echo "install-node: $*"; }
stop() { say "STOP: $*"; exit 1; }
exists() { [[ -e $1 || -L $1 ]]; }
record() { printf '%s %s\n' "$1" "$2" >> "$RECEIPT"; }
recorded() { grep -qxF "$1 $2" "$RECEIPT"; }
recognise() { local me=0; [[ $TEST == 1 ]] && me=$(id -u)
  [[ -d $RC && ! -L $RC && $(stat -c '%u %a' "$RC") == "$me 700" && -f $RECEIPT && ! -L $RECEIPT && $(head -1 "$RECEIPT") == "$HEADER" ]]; }
fetch() { if [[ $TEST == 1 ]]; then cp "$URL" "$1"; else curl -fsSL --proto '=https' --tlsv1.2 -m 300 -o "$1" "$URL"; fi; }
MODE=${1:-}
[[ $MODE =~ ^(check|install|rollback)$ ]] || { echo "usage: sudo bash install-node.sh check|install|rollback"; exit 2; }
if [[ $TEST != 1 ]]; then
  [[ $EUID -eq 0 ]] || stop "run with sudo"; [[ $(hostname) == fpd-prod ]] || stop "fpd-prod only"
  [[ $(uname -m) == x86_64 ]] || stop "x86_64 only"; grep -q '^ID=debian' /etc/os-release || stop "Debian only"
fi

collisions() {
  local p; for p in "$DEST" "$BIN/node" "$BIN/npm" "$BIN/npx" "$RC"; do exists "$p" && stop "$p already exists; refusing to adopt or replace it"; done
  [[ $TEST == 1 ]] || { command -v node >/dev/null && stop "a node is already on PATH ($(command -v node)); refusing"; }
  return 0
}

case $MODE in
check)
  collisions
  [[ -d $OPT && -d $BIN ]] || stop "$OPT or $BIN missing"
  if [[ $TEST != 1 ]]; then   # both hosts the trial needs: the Node download now, the npm registry at trial setup
    for h in https://nodejs.org/dist/ https://registry.npmjs.org/; do
      c=$(curl -sS -o /dev/null -m 15 -w '%{http_code}' "$h" || true); say "HTTPS $h: ${c:-unreachable}"
      [[ $c =~ ^[23][0-9][0-9]$ ]] || stop "$h unreachable; nothing changed"
    done
  fi
  say "CHECK OK: $DEST, $BIN/node|npm|npx and $RC are absent; nothing changed" ;;

install)
  collisions
  mkdir -m 0700 "$RC" || stop "could not create $RC exclusively"
  ( set -C; printf '%s\nversion %s\nsha256 %s\n' "$HEADER" "$VER" "$SHA" > "$RECEIPT" ) || stop "receipt creation failed"
  tmp=$(mktemp -d "$RC/dl.XXXXXX"); trap 'rm -rf "$tmp"' EXIT
  fetch "$tmp/node.tar.xz" || stop "download failed; nothing installed (run rollback to remove the receipt)"
  got=$(sha256sum "$tmp/node.tar.xz" | cut -d' ' -f1)
  [[ $got == "$SHA" ]] || stop "sha256 mismatch ($got); nothing installed (run rollback to remove the receipt)"
  say "download verified: sha256 $SHA"
  mkdir "$DEST.partial.$$"; tar -xJf "$tmp/node.tar.xz" -C "$DEST.partial.$$" --strip-components=1 --no-same-owner
  [[ -x $DEST.partial.$$/bin/node ]] || { rm -rf "$DEST.partial.$$"; stop "archive layout unexpected; nothing installed"; }
  [[ $TEST == 1 ]] || chown -R root:root "$DEST.partial.$$"; chmod -R go-w "$DEST.partial.$$"
  exists "$DEST" && { rm -rf "$DEST.partial.$$"; stop "$DEST appeared during install; refusing"; }
  mv -T "$DEST.partial.$$" "$DEST"; record dir "$DEST"
  say "extracted to $DEST (root-owned, not world-writable)"
  for b in node npm npx; do
    ln -s "$DEST/bin/$b" "$BIN/$b" || stop "$BIN/$b could not be created exclusively (run rollback)"   # ln -s without -f never replaces
    record link "$BIN/$b"
  done
  rm -rf "$tmp"; trap - EXIT
  v=$("$BIN/node" --version); [[ $v == "$VER" ]] || stop "installed node reports $v, expected $VER (run rollback)"
  say "INSTALL OK: node $v, npm $("$BIN/npm" --version 2>/dev/null || echo '?') at $BIN (links to $DEST); receipt $RECEIPT" ;;

rollback)
  recognise || { say "ROLLBACK: no recognised receipt, so nothing here was installed by this script; nothing changed"; exit 0; }
  for b in node npm npx; do
    l=$BIN/$b
    recorded link "$l" || continue
    if [[ -L $l && $(readlink "$l") == "$DEST/bin/$b" ]]; then rm -f "$l"; say "removed link $l"
    elif exists "$l"; then say "$l is no longer the link this script made; left alone"; fi
  done
  if recorded dir "$DEST" && [[ -d $DEST && ! -L $DEST ]]; then rm -rf --one-file-system "$DEST"; say "removed $DEST"; fi
  rm -rf --one-file-system "$RC"
  say "ROLLBACK OK: Node $VER links and tree removed; receipt removed" ;;
esac
