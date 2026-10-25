#!/usr/bin/env bash
# Mycelium Stage B in-place upgrade of the three commands (fpd-prod; only with Chris's go-ahead):  sudo bash upgrade-stageb.sh
# Replaces /usr/local/bin/myc-gate, myc-agent, myc-stageb ONLY IF (1) this bundle matches its SHA256SUMS, (2) a v4
# install receipt exists, (3) each installed command is unchanged since it was installed (hash = receipt), and
# (4) no Stage B run holds the lock. Updates the receipt so uninstall-stageb.sh still removes exactly what is installed.
# Touches nothing else: no group, spool, state, allowlist, hubsync or sign-in change; starts nothing.
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo "run with sudo"; exit 1; }
[[ $(hostname) == "${MYC_EXPECT_HOST:-fpd-prod}" ]] || { echo "STOP: fpd-prod only"; exit 1; }
cd "$(dirname "$0")"
sha256sum -c --quiet SHA256SUMS || { echo "STOP: bundle files do not match SHA256SUMS"; exit 1; }
R=/var/lib/myc-stageb/install-receipt
[[ -f $R ]] || { echo "STOP: no install receipt; not an install-stageb.sh installation"; exit 1; }
exec 8>>/var/lib/myc-stageb/lock; flock -n 8 || { echo "STOP: a Stage B run is in progress"; exit 1; }
echo "== installed commands vs receipt"
while read -r tag sum name; do
  [[ $tag == cmd ]] || continue
  f=/usr/local/bin/$name
  [[ -f $f && $(sha256sum "$f" | cut -c1-64) == "$sum" ]] || { echo "STOP: $f is missing or changed since install; nothing replaced"; exit 1; }
  echo "  unchanged: $name ${sum:0:12}"
done < "$R"
echo "== replace"
cp "$R" "$R.before-upgrade-$(date -u +%Y%m%dT%H%M%SZ)"
install -m 0755 -o root -g root myc-gate myc-agent myc-stageb /usr/local/bin/
{ grep -v '^cmd ' "$R"; echo "upgraded_at=$(date -u +%FT%TZ)"; (cd /usr/local/bin && sha256sum myc-gate myc-agent myc-stageb) | sed 's/^/cmd /'; } > "$R.new"
chmod 0600 "$R.new"; mv "$R.new" "$R"
grep '^cmd ' "$R" | sed 's/^cmd /  now: /'
echo "DONE. Nothing started or enabled; hubsync.timer $(systemctl is-active hubsync.timer)."
