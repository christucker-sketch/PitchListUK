set -euo pipefail
[[ $EUID -eq 0 && $(hostname) == fpd-prod ]] || { echo "REFUSED: root on fpd-prod only"; exit 2; }
C=2a2cb41ff036a7b14d86c6e6146a5b515f21d00e
S=$(mktemp -d /var/tmp/myc-src.XXXXXX)
chmod 711 "$S"
runuser -u hubsync -- git -C /var/lib/hubsync/repo archive "$C" greenfield/mycelium/session |
  tar -x -C "$S" --strip-components=2 --no-same-owner
chmod -R a+rX "$S/session"
(
  cd "$S/session"
  printf '%s  %s\n' ae11d003f092f03bd211802ccead66e3e4df2d89695fffc16ce0dfa6c3a96322 proof/source.sha256 |
    sha256sum -c --status
  printf '%s  %s\n' 9d27529ca03f4f3282cc73583040ef6cd1d608c3274bcfe95fd8a0e52c794a53 proof/first-live.candidate.json |
    sha256sum -c --status
  sha256sum -c --quiet proof/source.sha256
)
/usr/local/bin/node "$S/session/watchdog.mjs" "$S/session/proof/first-live.candidate.json" /var/tmp/myc-p0-live3-a
