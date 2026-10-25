#!/usr/bin/env bash
# Remove mycnotify completely from fpd-prod (does not touch hubsync or Stage B):  sudo bash uninstall-mycnotify.sh
# Afterwards, delete the Mycelium API key in the SMTP2GO dashboard if one was created.
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo "STOP: run with sudo"; exit 1; }
[[ $(hostname) == fpd-prod ]] || { echo "STOP: fpd-prod only"; exit 1; }
systemctl disable --now mycnotify.timer 2>/dev/null || true
systemctl stop mycnotify.service 2>/dev/null || true
rm -f /etc/systemd/system/mycnotify.service /etc/systemd/system/mycnotify.timer /usr/local/bin/mycnotify
systemctl daemon-reload
[[ -f /etc/mycnotify/smtp2go-key ]] && shred -u /etc/mycnotify/smtp2go-key || true
rm -rf /etc/mycnotify /var/lib/mycnotify
id mycnotify >/dev/null 2>&1 && deluser --quiet mycnotify || true
echo "uninstall-mycnotify: removed; hubsync.timer is $(systemctl is-active hubsync.timer || true). Delete the SMTP2GO Mycelium key if created."
