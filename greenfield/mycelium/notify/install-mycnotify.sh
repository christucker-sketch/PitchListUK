#!/usr/bin/env bash
# Install mycnotify on fpd-prod in DRY-RUN mode (PROPOSAL; run only after Codex review and Chris's go-ahead):
#     sudo bash install-mycnotify.sh        (from the folder holding the reviewed files and SHA256SUMS)
# Creates system user mycnotify (no login, no groups), installs the script and units, creates root-only placeholder
# credentials (MODE=dry-run, empty key) if absent, runs ONE dry-run poll. Does NOT enable the timer, provision a key,
# send email, or touch hubsync / Stage B. Undo: sudo bash uninstall-mycnotify.sh
set -euo pipefail
umask 077
[[ $EUID -eq 0 ]] || { echo "STOP: run with sudo"; exit 1; }
[[ $(hostname) == fpd-prod ]] || { echo "STOP: fpd-prod only (this is $(hostname))"; exit 1; }
cd "$(dirname "$0")"
HUBSYNC_SHA=12a14b4ad8d14b4eb7de3e38e4ce1d00e839aa2354fb11ee6d22bf6e1f0e609d
say() { echo "install-mycnotify: $*"; }

say "== verify files"; sha256sum -c --strict SHA256SUMS
for c in git jq curl flock; do command -v "$c" >/dev/null || { echo "STOP: $c missing"; exit 1; }; done
hs_timer=$(systemctl is-active hubsync.timer || true); hs_sha=$(sha256sum /usr/local/bin/hubsync | cut -d' ' -f1)
[[ $hs_sha == "$HUBSYNC_SHA" ]] || { echo "STOP: /usr/local/bin/hubsync is $hs_sha, expected the installed rev 3"; exit 1; }
say "hubsync.timer before: $hs_timer"

say "== user"
id mycnotify >/dev/null 2>&1 || adduser --system --group --home /var/lib/mycnotify --shell /usr/sbin/nologin mycnotify >/dev/null
[[ $(id -nG mycnotify) == mycnotify ]] || { echo "STOP: mycnotify must have no extra groups (has: $(id -nG mycnotify))"; exit 1; }
chmod 700 /var/lib/mycnotify; chown mycnotify:mycnotify /var/lib/mycnotify

say "== script and units (timer NOT enabled)"
install -m 755 -o root -g root mycnotify /usr/local/bin/mycnotify
install -m 644 -o root -g root mycnotify.service mycnotify.timer /etc/systemd/system/
systemctl daemon-reload

say "== root-only credentials (placeholders only if absent; never overwritten)"
install -d -m 700 -o root -g root /etc/mycnotify
[[ -e /etc/mycnotify/notify.conf ]] || printf 'SENDER=\nRECIPIENT=\nMODE=dry-run\n' > /etc/mycnotify/notify.conf
[[ -e /etc/mycnotify/smtp2go-key ]] || : > /etc/mycnotify/smtp2go-key
chown root:root /etc/mycnotify/notify.conf /etc/mycnotify/smtp2go-key; chmod 600 /etc/mycnotify/notify.conf /etc/mycnotify/smtp2go-key
grep -qx 'MODE=live' /etc/mycnotify/notify.conf && { echo "STOP: notify.conf already says MODE=live; live is a separate approved step"; exit 1; }

say "== one dry-run poll"
systemctl start mycnotify.service
[[ $(systemctl show -p Result --value mycnotify.service) == success ]] || { echo "STOP: dry-run poll failed: journalctl -u mycnotify.service -n 30"; exit 1; }
runuser -u mycnotify -- env -i MYCNOTIFY_HOME=/var/lib/mycnotify PATH=/usr/local/bin:/usr/bin:/bin mycnotify status

[[ $(systemctl is-active hubsync.timer || true) == "$hs_timer" && $(sha256sum /usr/local/bin/hubsync | cut -d' ' -f1) == "$HUBSYNC_SHA" ]] \
  || { echo "STOP: hubsync state changed unexpectedly"; exit 1; }
say "hubsync unchanged (timer $hs_timer, script rev 3)"
say "DONE: installed in dry-run; mycnotify.timer is $(systemctl is-enabled mycnotify.timer 2>/dev/null || echo disabled) (not enabled). Paste this output to Claude."
