# Mycelium Phase 0.1: hub watcher (`hubsync`). Claude's proposal, 23 October 2026

**Status:** PROPOSAL for Codex security/race review and Chris approval. Nothing is installed, no timer is on, and no BRIX write to the hub has happened. It answers [the Phase 0.1 priority](PHASE_0_1_PRIORITY_GITHUB_CRON_SYNC_2026-10-23.md). The [usage benchmark request](CLI_SUBSCRIPTION_USAGE_BENCHMARK_REQUEST_2026-10-23.md) is queued behind it, as that document directs.

**Code** (`greenfield/mycelium/hubsync/`, reviewable, not deployed):

| File | Purpose |
| --- | --- |
| `hubsync` | The watcher: one bash script, using git, jq and flock. It makes **no AI calls**. |
| `hubsync.service` / `hubsync.timer` | A oneshot, sandboxed unit. Every 5 min after the previous poll ends, so polls never overlap. **Installed disabled.** |
| `install-hubsync.sh` | Creates the user, units, deploy key and pinned GitHub host key. It does not enable the timer or contact the repo. |
| `test-hubsync.sh` | Offline tests against a local bare repo: **18/18 pass** in Claude's workspace. |

## How it works

1. **Poll (every 5 min):**
   - `git ls-remote` reads the branch tip, which is one cheap SSH round trip and not a REST API call, so no rate-limit concern.
   - If the tip equals `last_seen`, it stops there: no fetch, no work.
   - A `PAUSE` file or a held lock also stop it.
2. **On change:**
   - `fetch`, then hard-reset hubsync's **own** clone to `origin/<branch>`. That clone never holds anyone else's work.
   - Log the new commits (subject and author, capped at 20) and the changed `team/`, `greenfield/team/` and `greenfield/docs/mycelium/` paths.
3. **Synthetic tasks** (the only thing it acts on):
   - A task is `team/sync-test/tasks/T-<id>.json` with `{"id":"T-<id>","to":"hubsync",...}`. The id must match the file name; anything else is skipped and logged.
   - The answer is `team/sync-test/results/T-<id>.json`, recording the task's **git blob hash**.
   - A task counts as done when a result with the current blob exists **in the repository**. Local state is only an optimisation, so restarts, replays and a wiped state folder cannot duplicate work (tested).
   - At most 5 results per poll and 48 pushes per day.
4. **No loops:**
   - hubsync reads only `tasks/` and writes only `results/`; results never create tasks.
   - Its own push becomes `last_seen`, so the next poll is a no-op (tested).
   - A later AI-invoking stage would keep the same rule: one writer, distinct input and output paths, and per-task blob idempotence.
5. **Health:**
   - `hubsync status` shows last poll, success, push and error, consecutive errors, paused state and pushes today.
   - Logs go to journald, which is size-capped by journald, so there is no extra log rotation to maintain.
   - Three consecutive failures log an `ALERT` line. Email alerting needs a separate approval and its own SMTP2GO key; the Pi's key is never copied.
6. **Kill switches:** `sudo -u hubsync hubsync pause`, `sudo systemctl disable --now hubsync.timer`, or remove the deploy key in GitHub.

## How it avoids stale pushes (the specific question)

- **Every write starts from a fresh fetch.** The commit is built on the exact tip just fetched; there is no long-lived local branch to fall behind.
- **The push is a plain `git push origin HEAD:<branch>`, never `--force`.** GitHub accepts it only as a fast-forward of the current tip, so a stale commit is **rejected, not written over**. That plain push is the compare-and-swap.
- **On rejection:** re-fetch, re-derive pending tasks from the new tip (another writer may already have answered them), rebuild and retry. There are 3 attempts with 5 s / 15 s back-off. Then it **stops with an error** and the next poll starts clean. Tests cover the concurrent human commit (kept intact) and a persistent conflict (stops; remote history only moves forward).
- **Before any push, the diff must touch only `team/sync-test/results/`**, or it refuses. This is client-side; the deploy key itself cannot be path-restricted (below).

## Permissions and auth

- **Identity:** system user `hubsync`, with no shell, no sudo and home `/var/lib/hubsync` (0700). The unit runs with:
  - `ProtectSystem=strict`, `ProtectHome=yes`, `PrivateTmp`, `NoNewPrivileges`;
  - write access only to `/var/lib/hubsync`;
  - `MemoryMax=256M`, `CPUQuota=50%`, `Nice=10`, and a 4-minute timeout.
- **Credential:** an **SSH deploy key for this one repository**, generated on the box. The private key never leaves `/var/lib/hubsync/.ssh` (0600), and it is not in Git, logs or prompts. GitHub's host key is pinned to the published Ed25519 fingerprint `SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU`.
  - **Stage 1: read-only key.** It polls and logs only, and cannot push.
  - **Stage 2: tick "Allow write access"** for the synthetic demo only.
  - A deploy key is narrower than a personal token (one repo, no API, no other repos). But with write access it could push to **any branch** of this repo, which is why the path allowlist and no-force rules are enforced client-side.
  - **Recommended:** Chris adds or keeps a branch ruleset on `findpitches-v3/greenfield` that **blocks force pushes and deletion**, so the server refuses those even if the client were wrong.
- **No AI credentials:** the `myc` user and its Claude/Codex sign-ins are separate and untouched. hubsync cannot read them (`ProtectHome`).

## Acceptance plan (each step needs Chris's go-ahead)

1. **Install** (`sudo bash install-hubsync.sh` on `fpd-prod`). Chris adds the printed public key as a **read-only** deploy key.
2. **Read-only proof:** run `sudo systemctl start hubsync.service` by hand a few times.
   - It clones and logs hub changes.
   - `hubsync status` reports ok.
   - A second run says "no change".
3. **Write demo (key switched to write):**
   - Chris or Claude commits a synthetic `team/sync-test/tasks/T-0001.json`; one manual poll answers it.
   - A second poll adds nothing (idempotence).
   - A concurrent edit is made while a poll runs; both commits survive, with no force push.
   - The task is then edited, and it is answered once more.
4. **Unattended:** enable the timer and leave it for 24 h. Check:
   - polls every ~5 min with no-change exits;
   - one synthetic task answered within one poll;
   - no duplicate results;
   - status clean after a reboot and a network unplug.
5. **Stop.** No AI invocation is added until separately approved.

**Rollback:** disable the timer, then remove the script, the units and the `hubsync` user (`deluser --remove-home`). Delete the deploy key in GitHub. Optionally delete `team/sync-test/`.

## Honest limits and open points

- **This does not remove the manual pushes for Claude (Cowork) or ChatGPT-hosted Codex.** Those sessions cannot reach the BRIX. My bundles land on Chris's PC through the desktop bridge, and Chris runs `claude-sync.ps1`.
  - A **separate £0 quick win:** a Windows scheduled task running `claude-sync.ps1` every 5–10 minutes would push my bundles without Chris's hands. It needs Chris's approval, and it pushes bundles without his eyeballing them, which he does not do today anyway.
- **Agents are not "notified" by hubsync.** It detects and logs changes; a Cowork or ChatGPT agent still reads the hub when a session runs. Automatic agent work on the BRIX is the later, separately approved stage, using the `myc` CLIs, triggered by a real task file and with call caps.
- The task file format is minimal and synthetic. A real task schema (owner, state, acceptance, caps) should be agreed with Codex before any AI stage.
- **Codex review requested:** races between two hubsync hosts (only `fpd-prod` is planned), the trust boundary of the deploy key, and whether `ls-remote` change detection plus hard reset of the bot's own clone is acceptable.
