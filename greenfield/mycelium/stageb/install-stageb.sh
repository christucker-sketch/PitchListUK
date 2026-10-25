#!/usr/bin/env bash
# Mycelium Phase 0.2 Stage B installer (fpd-prod only; run only with Chris's go-ahead):   sudo bash install-stageb.sh
# FRESH INSTALL ONLY: it refuses, before changing anything, if any path or the group it manages already exists or the
# users are already members. It then creates exactly: 3 root-owned commands, group mycspool (+ hubsync, myc as
# members), /var/lib/mycspool, /var/lib/myc-stageb, /etc/myc-stageb (empty allowlist), and writes an install receipt.
# Starts nothing, enables nothing; does not touch the hubsync script, unit, timer or key.
# Narrow rollback (only what this install created; evidence kept):  sudo bash uninstall-stageb.sh
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo "run with sudo"; exit 1; }
[[ $(hostname) == "${MYC_EXPECT_HOST:-fpd-prod}" ]] || { echo "STOP: fpd-prod only"; exit 1; }
cd "$(dirname "$0")"
sha256sum -c --quiet SHA256SUMS || { echo "STOP: bundle files do not match SHA256SUMS"; exit 1; }
id hubsync >/dev/null && id myc >/dev/null || { echo "STOP: users hubsync and myc must already exist"; exit 1; }
[[ -d /var/lib/hubsync/repo/.git && -x /home/myc/bin/myc-run ]] || { echo "STOP: hubsync clone or myc billing guard missing"; exit 1; }
for c in git jq flock iconv dd timeout runuser awk; do command -v $c >/dev/null || { echo "STOP: $c missing"; exit 1; }; done
echo "== before (nothing below may already exist)"
pre=0
for p in /usr/local/bin/myc-gate /usr/local/bin/myc-agent /usr/local/bin/myc-stageb /var/lib/mycspool /var/lib/myc-stageb /etc/myc-stageb /home/myc/stageb-logs; do
  if [[ -e $p || -L $p ]]; then echo "  EXISTS: $p"; pre=1; else echo "  absent: $p"; fi
done
if getent group mycspool >/dev/null; then echo "  EXISTS: group mycspool"; pre=1; else echo "  absent: group mycspool"; fi
echo "  hubsync.timer: $(systemctl is-active hubsync.timer)"
[[ $pre == 0 ]] || { echo "STOP: not a fresh install; nothing was changed. Ask Claude/Codex before going further."; exit 1; }
echo "== install"
groupadd --system mycspool
usermod -aG mycspool hubsync; usermod -aG mycspool myc
install -d -o hubsync -g mycspool -m 2750 /var/lib/mycspool
install -d -o root -g root -m 0700 /var/lib/myc-stageb
install -d -o root -g root -m 0755 /etc/myc-stageb
install -m 0644 -o root -g root /dev/null /etc/myc-stageb/allowed
install -m 0755 -o root -g root myc-gate myc-agent myc-stageb /usr/local/bin/
{ echo "installed_at=$(date -u +%FT%TZ)"; echo "group=mycspool created; members_added=hubsync,myc"
  echo "dirs=/var/lib/mycspool /var/lib/myc-stageb /etc/myc-stageb"
  (cd /usr/local/bin && sha256sum myc-gate myc-agent myc-stageb) | sed 's/^/cmd /'; } > /var/lib/myc-stageb/install-receipt
chmod 0600 /var/lib/myc-stageb/install-receipt
ls -l /usr/local/bin/myc-gate /usr/local/bin/myc-agent /usr/local/bin/myc-stageb | awk '{print "  "$1" "$3":"$4" "$NF}'
id hubsync; id myc
echo "== read-only check through the writer (no push)"
runuser -u hubsync -- env -i HOME=/var/lib/hubsync LANG=C.UTF-8 PATH=/usr/local/bin:/usr/bin:/bin myc-gate state MYC-20261025-001 || true
echo "DONE. Receipt: /var/lib/myc-stageb/install-receipt. Nothing started or enabled; hubsync.timer $(systemctl is-active hubsync.timer)."
