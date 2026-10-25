#!/usr/bin/env bash
# Narrow Stage B rollback (fpd-prod):   sudo bash uninstall-stageb.sh
# Undoes ONLY what install-stageb.sh recorded in its receipt. Evidence is kept: the spool (job packets, outputs), the
# local run log and the private CLI logs are moved into /root/stageb-evidence-<time>/ (root-only), never deleted.
# Task folders on GitHub are the public record and are not touched. hubsync and the myc sign-ins are not touched.
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo "run with sudo"; exit 1; }
R=/var/lib/myc-stageb/install-receipt
[[ -f $R ]] || { echo "STOP: no install receipt; nothing to roll back (or not installed by install-stageb.sh)"; exit 1; }
exec 8>>/var/lib/myc-stageb/lock; flock -n 8 || { echo "STOP: a Stage B run is in progress"; exit 1; }
E=/root/stageb-evidence-$(date -u +%Y%m%dT%H%M%SZ); install -d -m 0700 "$E"; cp "$R" "$E/"
echo "== commands (removed only if unchanged since install)"
while read -r tag sum name; do
  [[ $tag == cmd ]] || continue
  f=/usr/local/bin/$name
  if [[ -f $f ]] && [[ $(sha256sum "$f" | cut -c1-64) == "$sum" ]]; then rm -f "$f"; echo "  removed $f"; else echo "  KEPT $f (missing or changed since install)"; fi
done < "$R"
echo "== evidence kept in $E"
for p in /var/lib/mycspool /home/myc/stageb-logs; do [[ -e $p ]] && mv "$p" "$E/" && echo "  moved $p"; done
mv /var/lib/myc-stageb "$E/myc-stageb-state"; echo "  moved /var/lib/myc-stageb"
rm -rf /etc/myc-stageb; echo "  removed /etc/myc-stageb (allowlist)"
echo "== group created by the install"
gpasswd -d hubsync mycspool >/dev/null 2>&1 || true; gpasswd -d myc mycspool >/dev/null 2>&1 || true
groupdel mycspool && echo "  removed group mycspool and its memberships"
echo "DONE. hubsync.timer $(systemctl is-active hubsync.timer) (untouched)."
