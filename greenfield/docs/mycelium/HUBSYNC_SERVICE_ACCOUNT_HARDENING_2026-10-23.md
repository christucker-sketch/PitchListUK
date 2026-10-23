# Mycelium Phase 0.1 — hubsync least-privilege service account (23 October 2026)

**To Claude — requested by Chris. Priority: before completing the 24-hour unattended reliability test.**
**Scope:** fpd-prod (J3455) only. No changes to fpd-standby, AI CLI executions, or production task routing.

## Goal
The five-minute GitHub watcher already passed its initial unattended synthetic-task test. Ensure it runs as a dedicated, unprivileged service identity, preferably `hubsync` rather than root or the `myc` CLI account. Preserve working GitHub sync and restrict write authority to the test results path at the application level.

## First: inspect and report
Run read-only inspection before touching permissions or files:
```bash
systemctl cat hubsync.service hubsync.timer
systemctl show hubsync.service -p User -p Group -p DynamicUser -p WorkingDirectory -p ExecStart
systemctl list-timers --all hubsync.timer
id hubsync 2>/dev/null || true
id myc 2>/dev/null || true
sudo journalctl -u hubsync.service -n 50 --no-pager
```
Inspect the executable/script, repository checkout, state, SSH config/deploy key, environment files and ownership; **never print private keys, secrets or credential values into the hub**. Confirm who really runs the watcher. If it is already running unprivileged, avoid unnecessary migration.

## Migration proposal and implementation (Chris approval required for any change)
1. Pause `hubsync.timer` cleanly; record prechange status, permissions and rollback instructions. Do not touch unrelated services.
2. If needed, create a dedicated system account with no interactive login, e.g. `sudo useradd --system --home-dir /var/lib/hubsync --create-home --shell /usr/sbin/nologin hubsync` (adapt to actual host layout; avoid creation if account exists).
3. Provision only watcher-specific checkout/state directories and its repository-scoped deploy key for that account. Keep SSH private key mode 0600, `.ssh` mode 0700, correct ownership and strict host-key verification. No access to `myc` credentials or other production secrets.
4. Set `User=hubsync` and `Group=hubsync` in the systemd service (or suitable drop-in); consider `NoNewPrivileges=true`, `ProtectSystem=strict`, `ProtectHome=true`, and explicitly allowed writable paths **after** testing compatibility. Ensure service does not require sudo.
5. Verify effective identity and a manual synthetic read/write round-trip, with idempotent second poll, negative `to: codex` case, safe Git conflict handling, and no self-loop. Keep writes to `team/sync-test/results/`; note that a GitHub deploy key with write access is **repo-wide**, not path-scoped—application restrictions alone are not a GitHub security boundary. Do not claim otherwise.
6. Only after successful verification, reenable the five-minute timer; restart the 24-hour observation period. Log timestamp, commit IDs, service identity, outcomes and rollback. Stop and report any failures rather than silently reverting to root.

**Nonnegotiable:** No Claude/Codex invocations or AI usage from the watcher, no paid API fallback, no force-push, no production task modifications. Report exact commands you intend to use and any assumptions to Chris before making system changes. Publish evidence (sanitised) back to this hub.
