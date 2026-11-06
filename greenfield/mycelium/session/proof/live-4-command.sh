set -euo pipefail
[[ $EUID -eq 0 && $(hostname) == fpd-prod ]] || { echo "REFUSED: root on fpd-prod only"; exit 2; }
C=d2ae54fc3b301d9159e6d252c7a626686cfc796e
S=$(mktemp -d /var/tmp/myc-src.XXXXXX)
chmod 711 "$S"
runuser -u hubsync -- git -C /var/lib/hubsync/repo archive "$C" greenfield/mycelium/session |
  tar -x -C "$S" --strip-components=2 --no-same-owner
chmod -R a+rX "$S/session"
(
  cd "$S/session"
  printf '%s  %s\n' a02652395fb4471221fa0174d686d75b5e014026d6bc2c683e7a04f0f0e6daeb proof/source.sha256 |
    sha256sum -c --status
  printf '%s  %s\n' b7996653cd3d1b4dc9cd6260cf2943971f67f29cdac664d000fcb9f7b4a3dd8e proof/first-live.candidate.json |
    sha256sum -c --status
  sha256sum -c --quiet proof/source.sha256
)
/usr/local/bin/node "$S/session/watchdog.mjs" "$S/session/proof/first-live.candidate.json" /var/tmp/myc-p0-live4-a
