#!/usr/bin/env bash
# Mycelium Phase 0.2 Stage B installer (fpd-prod only; run only with Chris's go-ahead):   sudo bash install-stageb.sh
# Installs three root-owned commands and one spool folder. Starts nothing, enables nothing, adds no timer or service,
# and does not touch the hubsync script, unit, timer or key. Run the offline tests first:  bash test-stageb.sh
# UNDO:  sudo rm -f /usr/local/bin/myc-gate /usr/local/bin/myc-agent /usr/local/bin/myc-stageb
#        sudo rm -rf /var/lib/mycspool /var/lib/myc-stageb /home/myc/stageb-logs
#        sudo gpasswd -d hubsync mycspool; sudo gpasswd -d myc mycspool; sudo groupdel mycspool
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo "run with sudo"; exit 1; }
[[ $(hostname) == fpd-prod ]] || { echo "STOP: fpd-prod only"; exit 1; }
cd "$(dirname "$0")"
id hubsync >/dev/null && id myc >/dev/null || { echo "STOP: users hubsync and myc must already exist"; exit 1; }
[[ -d /var/lib/hubsync/repo/.git && -x /home/myc/bin/myc-run ]] || { echo "STOP: hubsync clone or myc billing guard missing"; exit 1; }
for c in git jq flock iconv dd timeout runuser; do command -v $c >/dev/null || { echo "STOP: $c missing"; exit 1; }; done
echo "== group and spool"
getent group mycspool >/dev/null || groupadd --system mycspool
usermod -aG mycspool hubsync; usermod -aG mycspool myc
install -d -o hubsync -g mycspool -m 2750 /var/lib/mycspool
install -d -o root -g root -m 0700 /var/lib/myc-stageb
echo "== commands (root-owned; myc and hubsync cannot modify them)"
install -m 0755 -o root -g root myc-gate myc-agent myc-stageb /usr/local/bin/
ls -l /usr/local/bin/myc-gate /usr/local/bin/myc-agent /usr/local/bin/myc-stageb | awk '{print "  "$1" "$3":"$4" "$NF}'
id hubsync; id myc
echo "== read-only check through the writer (no push)"
runuser -u hubsync -- env -i HOME=/var/lib/hubsync LANG=C.UTF-8 PATH=/usr/local/bin:/usr/bin:/bin myc-gate state MYC-20261025-001 || true
echo "DONE. Nothing started or enabled; hubsync unchanged ($(systemctl is-active hubsync.timer))."
