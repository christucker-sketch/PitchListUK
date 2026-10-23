# hubsync service account: inspection report and proposed hardening (Claude, 23 October 2026)

This answers [the service-account hardening request](HUBSYNC_SERVICE_ACCOUNT_HARDENING_2026-10-23.md). Host evidence comes from Chris's read-only run on `fpd-prod` at about 15:42 London. No private key or secret was printed.

## Finding: already running as a dedicated unprivileged account, so no migration is needed

| Check | Evidence |
| --- | --- |
| Configured identity | `User=hubsync`, `Group=hubsync`, `DynamicUser=no` |
| **Effective identity** | The watcher's own journal entries carry `_UID=102`, `_GID=104` (`hubsync`), `_COMM=bash`. **It does not run as root or as `myc`.** |
| Account | `hubsync:x:102:104::/var/lib/hubsync:/usr/sbin/nologin`; groups: `hubsync` only; "User hubsync is not allowed to run sudo on fpd-prod" |
| Files | `/usr/local/bin/hubsync` root:root 755 (the watcher cannot modify its own code); `/var/lib/hubsync`, `.ssh` and `repo` hubsync 700; private key, `known_hosts`, `config` and `state.json` hubsync 600; public key 644 |
| Deploy key | ED25519, fingerprint `SHA256:jb7V7YP7g8bFEnRvY6w/hpbf9C0NKlR6qPBYhlkr4yo`, scoped to this repository. Host key pinned with `StrictHostKeyChecking yes` |
| Isolation from AI sign-ins | `/home/myc` is myc 700; `sudo -u hubsync ls /home/myc` gives **Permission denied**. The unit also sets `ProtectHome=yes` |
| Unit sandbox (current) | `NoNewPrivileges=yes`, `ProtectSystem=strict`, `ProtectHome=yes`, `PrivateTmp=yes`, `ReadWritePaths=/var/lib/hubsync`, `MemoryMax=256M`, `CPUQuota=50%` |
| Running | Timer active, 5-minute cadence. The journal shows the write demo (`91cc565c`), the timer run (`1d44f8f8`, answering T-0001 edited and T-0002), then a read-only poll of Chris's request (`d2f6705c`): "no pending synthetic tasks" |
| No `/etc/hubsync.env` | It runs on the built-in defaults |

**As required, said plainly:** the deploy key has **write access to the whole repository** (all branches and paths). Restricting pushes to `team/sync-test/results/` is an **application-level check**, not a GitHub security boundary. A branch ruleset blocking force push and deletion would add a server-side guard for those two actions only.

## Gap: systemd rates the unit "8.3 EXPOSED"

The account is right, but the unit leaves most of systemd's optional sandboxing off (capabilities, kernel and proc protections, system-call and address-family filters). **Proposed:** the drop-in [`10-hardening.conf`](../../mycelium/hubsync/10-hardening.conf). It:
- drops all capabilities;
- adds private devices and IPC and kernel/clock/hostname/cgroup protection;
- hides other processes;
- allows only the IPv4/IPv6/Unix/netlink socket families (git over SSH needs no other network type);
- applies `SystemCallFilter=@system-service`, with blocked calls returning EPERM rather than killing the process;
- sets `MemoryDenyWriteExecute`, native architecture only, and `UMask=0077`.

It does not change the account, paths, key or behaviour. The expected score is well below 8.3, to be measured, not assumed.

## Change plan (needs Chris's approval; exact commands)

1. **Pause:** `sudo systemctl stop hubsync.timer` (stays enabled, so it returns at boot). Record `hubsync status` before the change.
2. **Apply:** write the drop-in to `/etc/systemd/system/hubsync.service.d/10-hardening.conf`, then `sudo systemctl daemon-reload`. Then `systemd-analyze security hubsync.service | tail -1` to record the new score.
3. **Read-only poll:** `sudo systemctl start hubsync.service`. It must end "no change" or "processed", with 0 errors.
4. **Write round trip:** sync Claude's bundle with T-0004 (`to: hubsync`) and T-0005 (`to: codex`). Then:
   - one manual poll must answer T-0004 only, pushing only `results/`;
   - a second poll must add nothing;
   - the effective UID is re-checked from the journal.
5. **Re-enable:** `sudo systemctl start hubsync.timer`. **The 24 h observation restarts at that time.**
6. **On any failure:** stop and report. Roll back by deleting the drop-in and running `daemon-reload`, which is the known-good unit above. Never fall back to root.

No AI invocation, no force push, and no production task changes; `fpd-standby` is untouched.

## Progress (Chris approved; host evidence, 23 Oct about 15:48 London)

- **Steps 1–2:** timer stopped; drop-in installed; `daemon-reload` run. **`systemd-analyze security`: 8.3 EXPOSED → 1.5 OK.**
- **Step 3:** a read-only poll under the hardened unit succeeded (SSH `ls-remote` to GitHub works): "no change at d2f6705c", 0 errors.
- **Step 4, prepared:** T-0004 (`to: hubsync`) and T-0005 (`to: codex`) are in this commit. The next manual poll must answer T-0004 only, then a second poll must add nothing. After that the timer is re-enabled and the 24 h observation restarts.

