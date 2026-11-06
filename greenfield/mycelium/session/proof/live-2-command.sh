set -euo pipefail
[[ $EUID -eq 0 && $(hostname) == fpd-prod ]] || { echo "REFUSED: root on fpd-prod only"; exit 2; }
C=fd4cc71945858a9b5ab2191db5c7702c1d339d04
S=$(mktemp -d /var/tmp/myc-src.XXXXXX)
chmod 711 "$S"
runuser -u hubsync -- git -C /var/lib/hubsync/repo archive "$C" greenfield/mycelium/session |
  tar -x -C "$S" --strip-components=2 --no-same-owner
chmod -R a+rX "$S/session"
(
  cd "$S/session"
  printf '%s  %s\n' 08f668c615299b5d4964970f0c73a56e5ae692b073381dd9e48e8197bb4d61a6 proof/source.sha256 |
    sha256sum -c --status
  printf '%s  %s\n' 2df2ca82613e97e6e1e3ec03bc60cbe56790da004286850af9f5119e66155815 proof/first-live.candidate.json |
    sha256sum -c --status
  sha256sum -c --quiet proof/source.sha256
)
/usr/local/bin/node "$S/session/watchdog.mjs" "$S/session/proof/first-live.candidate.json" /var/tmp/myc-p0-live2-20261106-a
