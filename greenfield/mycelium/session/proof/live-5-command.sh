set -euo pipefail
[[ $EUID -eq 0 && $(hostname) == fpd-prod ]] || { echo "REFUSED: root on fpd-prod only"; exit 2; }
C=31d043fc725c72f14781252fc59de48a57103eb1
S=$(mktemp -d /var/tmp/myc-src.XXXXXX)
chmod 711 "$S"
runuser -u hubsync -- git -C /var/lib/hubsync/repo archive "$C" greenfield/mycelium/session |
  tar -x -C "$S" --strip-components=2 --no-same-owner
chmod -R a+rX "$S/session"
(
  cd "$S/session"
  printf '%s  %s\n' c9ddc096518d8a79e403bebb90168d75dedf9fd4f5e28866b207af0802fe24ab proof/source.sha256 |
    sha256sum -c --status
  printf '%s  %s\n' 5ef3939df58d955565830b7e346d2bb943f6f40e690b1cff7243ba5daaa0c7ed proof/first-live.candidate.json |
    sha256sum -c --status
  sha256sum -c --quiet proof/source.sha256
)
/usr/local/bin/node "$S/session/watchdog.mjs" "$S/session/proof/first-live.candidate.json" /var/tmp/myc-p0-live5-a
