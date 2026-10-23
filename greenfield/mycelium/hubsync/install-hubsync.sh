#!/usr/bin/env bash
# Mycelium Phase 0.1 hub watcher installer (PROPOSAL; run only after Chris approves). On fpd-prod only:
#     sudo bash install-hubsync.sh        (run from the folder holding hubsync, hubsync.service, hubsync.timer)
# Creates system user hubsync (no login, no sudo), installs the script and systemd units, creates an SSH deploy key
# and pins GitHub's host key. Does NOT enable the timer, does NOT contact the repo, makes no AI calls.
# Undo: sudo systemctl disable --now hubsync.timer; sudo rm /usr/local/bin/hubsync /etc/systemd/system/hubsync.*;
#       sudo deluser --remove-home hubsync; then delete the deploy key in GitHub.
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo "run with sudo"; exit 1; }
[[ $(hostname) == fpd-prod ]] || { echo "STOP: fpd-prod only (this is $(hostname))"; exit 1; }
cd "$(dirname "$0")"
GH_ED25519='SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU'   # GitHub's published ed25519 host key fingerprint

echo "== packages"; command -v git >/dev/null || { apt-get -qq update && apt-get -y -qq install git >/dev/null; }
command -v jq >/dev/null || apt-get -y -qq install jq >/dev/null; git --version
echo "== user"; id hubsync >/dev/null 2>&1 || adduser --system --group --home /var/lib/hubsync --shell /usr/sbin/nologin hubsync >/dev/null
chmod 700 /var/lib/hubsync; id hubsync
echo "== script and units"
install -m 755 -o root -g root hubsync /usr/local/bin/hubsync
install -m 644 -o root -g root hubsync.service hubsync.timer /etc/systemd/system/
systemctl daemon-reload
echo "== GitHub host key (pinned)"
install -d -m 700 -o hubsync -g hubsync /var/lib/hubsync/.ssh
ssh-keyscan -t ed25519 github.com 2>/dev/null > /tmp/gh.kh
[[ $(ssh-keygen -lf /tmp/gh.kh | awk '{print $2}') == "$GH_ED25519" ]] || { echo "STOP: github.com host key does not match the published fingerprint"; exit 1; }
install -m 644 -o hubsync -g hubsync /tmp/gh.kh /var/lib/hubsync/.ssh/known_hosts; rm -f /tmp/gh.kh
printf 'Host github.com\n  IdentityFile ~/.ssh/id_ed25519\n  IdentitiesOnly yes\n  StrictHostKeyChecking yes\n' > /var/lib/hubsync/.ssh/config
chown hubsync:hubsync /var/lib/hubsync/.ssh/config; chmod 600 /var/lib/hubsync/.ssh/config
echo "== deploy key"
[[ -f /var/lib/hubsync/.ssh/id_ed25519 ]] || sudo -u hubsync ssh-keygen -q -t ed25519 -N '' -C 'hubsync@fpd-prod (PitchListUK deploy key)' -f /var/lib/hubsync/.ssh/id_ed25519
echo "PUBLIC key to add in GitHub (repo Settings > Deploy keys > Add; title 'hubsync fpd-prod'; leave 'Allow write access' OFF for now):"
cat /var/lib/hubsync/.ssh/id_ed25519.pub
echo; systemctl is-enabled hubsync.timer 2>/dev/null || true
echo "DONE. Timer NOT enabled. Paste this output to Claude."
