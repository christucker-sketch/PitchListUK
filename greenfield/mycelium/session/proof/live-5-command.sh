set -euo pipefail
[[ $EUID -eq 0 && $(hostname) == fpd-prod ]] || { echo "REFUSED: root on fpd-prod only"; exit 2; }
C=232e22dd220d3fd1fede28f556a9044ff72d4a20
S=$(mktemp -d /var/tmp/myc-src.XXXXXX)
chmod 711 "$S"
runuser -u hubsync -- git -C /var/lib/hubsync/repo archive "$C" greenfield/mycelium/session |
  tar -x -C "$S" --strip-components=2 --no-same-owner
chmod -R a+rX "$S/session"
(
  cd "$S/session"
  printf '%s  %s\n' 5fe63f3c989d9c36648150f98c2534e333fa6cb310b104672ef9b02124133e0a proof/source.sha256 |
    sha256sum -c --status
  printf '%s  %s\n' c2f47d5b42e50e91c610b0cf8ce2f6dfd67ade9c1ea369c8e5ec5ce470caa076 proof/first-live.candidate.json |
    sha256sum -c --status
  sha256sum -c --quiet proof/source.sha256
)
/usr/local/bin/node "$S/session/watchdog.mjs" "$S/session/proof/first-live.candidate.json" /var/tmp/myc-p0-live5-a
