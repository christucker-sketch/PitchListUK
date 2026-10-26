# Stage C — approval notification plan (Claude, 25 Oct 2026, revision 2). For Codex to check the three corrections

**Revision 2** answers the [Codex review](STAGE_C_CODEX_REVIEW_2026-10-25.md) (26/26 reproduced; FAIL on R1–R3; local-ledger deviation accepted for the single-host pilot):

- **R1, pinned live:** Stage C live admits **only** the one decision named by `PIN=` in the root-only config. Without a PIN, live is refused. Any other outstanding decision is counted as "not pinned" and never sent. Once the pinned decision has a ledger record, repeated manual runs send nothing. The first live check keeps the **timer off** (see §5).
- **R2, attempt cap:** every HTTP attempt, retries included, is appended (with `sync`) to `ledger/attempts-<London day>.log` **before** the request. The daily cap counts those lines. The 3-attempt and uncertain-never-resend rules are unchanged.
- **R3, full descriptor:** `instructions` must be a non-empty string of at most 4096 UTF-8 bytes, and `result_location` must equal `<notify-test path>/<id>/result.md`. Otherwise the task is quarantined.
- **Tests:** offline **30/30** on revision 2. The same suite against `9c2cb968` fails the R1/R2/R3 cases.

Answers the [Stage C handoff](STAGE_C_APPROVAL_NOTIFICATION_HANDOFF_2026-10-25.md). The source and offline tests exist and are **not installed**:

- [`greenfield/mycelium/notify/`](../../mycelium/notify/): `mycnotify`, units, install/uninstall scripts, `test-mycnotify.sh`, `SHA256SUMS`.
- No host change, no credential, no email, no model call.
- HubSync and Stage B are not touched.

## 1. Source, trigger, key, ledger

- **Read path:** the hub repo is public, so `mycnotify` keeps its own **bare clone fetched anonymously over HTTPS**. It needs no GitHub credential and never writes to GitHub. It reads Git objects only (no work tree, so no symlink exposure).
- **Tasks:** `greenfield/mycelium/notify-test/tasks/<id>/`, the same five-field `task.json` plus `events/NNNN.json` as Stage B.
  - **This is deliberately not Stage B's `tasks/`.** `myc-gate` does not allow `awaiting_approval`, so it would quarantine such a task and treat it as "held", blocking Stage B grants.
  - Pointing at the real path later needs writer support for `awaiting_approval` and a separate approval.
- **Fold:** strict and read-only.
  - `task.json` must have exactly the five fields, with the id matching its folder. Events must be contiguous from 0001, small regular files, with the fields `seq/status/at/actor/reason`. Event 1 must be `pending` by `chris`.
  - Transitions follow the agreed contract table.
  - Anything else, including an `awaiting_approval` event with an empty summary, makes the task **quarantined**: no notice, and it is listed in status.
- **Trigger:** the folded state is `awaiting_approval`, meaning the latest event is that transition.
- **Decision key:** `<task_id>-<seq>-<event blob[:12]>`. The record also stores the full descriptor and event blobs. A new decision revision (approved → in_progress → awaiting_approval) gets a new key and one more notice.
- **Ledger:** one local file per key in `/var/lib/mycnotify/ledger/`, written via temp file, `sync` and rename. The CLAIM is written **before** the HTTP request. States:

| Outcome | Classified from | Resend? |
|---|---|---|
| `accepted` | HTTP 200 with `succeeded==1, failed==0` | never |
| `retry` | curl 6/7 (no connection: request not sent), HTTP 429 (honours `Retry-After`, capped at 1 h) | up to **3 attempts**, 30 s then 120 s (in practice the next 5-minute run) |
| `permanent` | HTTP 200 refusal, other 4xx, retries exhausted | never |
| `permanent` + **global HOLD** | HTTP 400/401/403, or missing/malformed key | nothing sends until `mycnotify release` |
| `uncertain` | timeout, 5xx, lost response, or a claim found with no outcome (crash or reboot mid-send) | **never** (no exactly-once claim) |
| `baseline` | outstanding when `mycnotify baseline` ran | never |

- **State loss:** a **totally** missing ledger blocks live sending until `baseline`, which deliberately suppresses everything currently outstanding (possibly a missed notice).
  - **Not covered:** partial ledger deletion, or restoring an old ledger copy, could resend. Don't do either; use `baseline` after a total loss.
  - This is not a general exactly-once guarantee.
- **One instance only:** `flock`, and the install is hostname-guarded to fpd-prod.
- **Deviation for Codex to accept or reject.** The contract review asked for a durable *GitHub* send claim. Stage C keeps the claim local because:
  - the only Git writer is HubSync, and this handoff forbids changing it;
  - a write credential for `mycnotify` would create a second writer with a repo-wide deploy key.

  The local write-ahead claim, uncertain-never-resend rule, single instance and fail-closed baseline give the same no-duplicate property on one host. Public receipts can come later through the writer, with separate approval.

## 2. Service and isolation (fpd-prod)

- **User:** system user `mycnotify`, with no login shell, **no supplementary groups** (not `mycspool`) and home `/var/lib/mycnotify` (mode 700). It cannot read hubsync's home, key or clone, the Stage B spool, or the `myc` user's sign-ins.
- **Units:** `mycnotify.service` (oneshot) and `mycnotify.timer` (`*:2/5`, offset from hubsync). The service runs under `ProtectSystem=strict` with writes allowed only to `/var/lib/mycnotify`, plus `NoNewPrivileges`, an empty capability set, `SystemCallFilter=@system-service`, IP/Unix sockets only, `MemoryMax=128M` and `CPUQuota=25%`.
- **Installer:**
  - stops if the HubSync script is not the installed rev 3 (`12a14b4a…`);
  - verifies the HubSync timer state and script hash are unchanged afterwards;
  - never edits HubSync or the Stage B allowlist.

## 3. SMTP2GO, credentials and sender

- **API call:** HTTPS `POST /v3/email/send`. The API key reaches curl on **stdin** (the pattern already proven in `fpd-alert-check`). It never appears in argv, logs, the body or Git; the tests assert this.
- **Credentials:** root-owned files `/etc/mycnotify/{smtp2go-key,notify.conf}` (mode 0600), passed in only through systemd `LoadCredential`.
  - `notify.conf` holds `SENDER=`, `RECIPIENT=` (exactly one address), `MODE=` and `PIN=` (the one decision key admitted for live).
  - The sender must match `@findpitches.com`, or live mode is refused. The `findpitches.com` domain is already verified in SMTP2GO.
  - Chris creates a **new, dedicated Mycelium API key** in the FindPitches SMTP2GO account (not the V3 Worker or Pi key). If the dashboard offers per-key permissions, allow email sending only.
  - Nothing from Managed Technology is used.
- **Mode:** anything other than `MODE=live` is a **dry run**, which never calls the mail API.

## 4. Notice content (plain text only)

- **Subject:** `[FindPitches Mycelium] Approval needed: <task_id>`.
- **Body:**
  - task id and assigned agent;
  - decision event number;
  - summary: the event's `reason`, with control characters removed, flattened to one line and capped at 400 characters (it is already public on the hub);
  - the GitHub review link;
  - the notice key;
  - the line: **"Replying to this email does NOT approve or reject anything. A decision only counts when it is recorded through the separately approved GitHub mechanism."**

No instructions, results or secrets.

## 5. Dry-run evidence and the later live check

**Offline suite (`bash greenfield/mycelium/notify/test-mycnotify.sh`): 30/30 (revision 2; revision 1 had 26)**, using a local bare repo, a fake curl, a fake clock and no network. It covers:

- dry run never mails;
- live refused before baseline;
- baseline suppresses outstanding decisions;
- exactly one notice with the required content;
- key only on stdin;
- no duplicates across polls;
- no notice for pending, in_progress, completed, failed, cancelled or rejected;
- quarantine of bad JSON, illegal transitions, extra fields, numbering gaps and empty summaries;
- a new revision notifies once;
- connection failure: retry, backoff, then permanent after 3;
- timeout and 503: uncertain, never resent;
- 429 honours Retry-After;
- 401 sets a global hold until release;
- an interrupted claim becomes uncertain;
- one send per run, plus the daily cap;
- summary sanitising;
- non-FindPitches sender refused;
- PAUSE;
- a lost ledger blocks until baseline, and baseline never resends.

`shellcheck -S warning` is clean.

**Later single live check (each step needs Chris's explicit go-ahead; none is requested by this plan). The timer stays OFF throughout:**

1. **Install, dry run:** `sudo bash install-mycnotify.sh` from a folder holding the reviewed files. It verifies `SHA256SUMS` and HubSync rev 3, does one dry-run poll and leaves the timer **off**.
2. **Preflight (Chris):**
   - create the dedicated Mycelium key in the FindPitches SMTP2GO account;
   - confirm the account's included quota has headroom for one email at no extra cost;
   - put the key and `SENDER=notify@findpitches.com` (or another verified `@findpitches.com` address) plus `RECIPIENT=` into the two root files with `sudo nano`, keeping `MODE=dry-run` and `PIN=` empty.
3. **Baseline:** `sudo runuser -u mycnotify -- env -i MYCNOTIFY_HOME=/var/lib/mycnotify PATH=/usr/local/bin:/usr/bin:/bin mycnotify baseline`
4. **Dummy decision:** push one reviewed dummy task, `greenfield/mycelium/notify-test/tasks/MYC-2026MMDD-9NN/`: event 1 `pending` by `chris`, event 2 `in_progress`, event 3 `awaiting_approval` with the summary "Stage C live test: no action needed".
5. **Pin it:** run `... mycnotify decisions` (same `runuser` prefix) and copy that task's key into `PIN=`, then set `MODE=live`.
6. **One run:** `sudo systemctl start mycnotify.service`.
7. **Accept only if:**
   - exactly one email arrives;
   - `mycnotify decisions` shows the pinned key with `ledger=accepted`;
   - **two more** `sudo systemctl start mycnotify.service` runs send nothing;
   - `mycnotify status` shows no hold and the attempt log has exactly one line.
8. **Clean up (same session):** set `MODE=dry-run` and empty `PIN=`, run `mycnotify status`, and push a `cancelled` event by `chris` for the dummy task.
   - Turning the timer on, or live use beyond this one pinned decision, is a separate later approval (and unpinned live would need a reviewed code change).

## 6. Disable, rollback, limits, logs, cost

- **Ways to stop it, smallest first:**
  - `MODE=dry-run` (stops sending);
  - `touch /var/lib/mycnotify/PAUSE` (stops runs doing anything);
  - `sudo systemctl disable --now mycnotify.timer`;
  - `sudo bash uninstall-mycnotify.sh` (removes everything and shreds the key file), then delete the key in SMTP2GO.

  None of these touches HubSync or Stage B.
- **Limits:** pinned decision only; one send per run; **5 HTTP attempts per London day** (retries included, counted before each request); 3 attempts per decision. A mail failure never blocks hub polling, never sends an alert email (no loop) and never restarts agent work.
- **Logs:** journald, `status.json` (counts by state, hold, quarantined tasks, unpinned count, hub commit) and the attempt logs. Never the key or recipient. The provider email id is kept only in the local ledger.
- **Cost:** £0 incremental. It uses the existing FindPitches SMTP2GO account, and Chris confirms quota headroom before the live check; no new paid service.

## Acceptance checklist for Codex (check of revision 2)

- [ ] R1: live is refused without a PIN; only the pinned key is admitted; repeated runs send nothing else; the timer stays off for the live check.
- [ ] R2: the attempt log is written before every request; the cap counts attempts, retries included, per London day (tested across midnight).
- [ ] R3: full descriptor validated; the negative cases quarantine.
- [ ] State-loss wording corrected (total loss only; partial loss or an old restore is not covered).
- [ ] Offline suite 30/30 reproduces; `SHA256SUMS` match.

## Host installation, dry run only (26 Oct 2026, fpd-prod, run by Chris; approved, Codex PASS on `f7b18376`)

Files copied with `scp` from `C:\Users\ChrisT\mycnotify-stagec` (LF, written from the Git blobs of `f7b18376`). `sha256sum -c --strict SHA256SUMS` passed for all six files, on the host and again inside the installer.

- **Installer:** HubSync timer active before; `mycnotify` user created; script and units installed (timer not enabled); root-only placeholders created; one dry-run poll.
- **Poll status:** `result: ok`, `mode: dry-run`, message "dry run (RECIPIENT must be exactly one address)" (expected: placeholders are empty), `initialized: no`, empty ledger, no quarantined tasks, hub commit `dd34e9ed`. **Zero mail attempts:** dry run never calls the mail API.
- **HubSync unchanged** (timer active, script rev 3). **`mycnotify.timer`: `disabled` / `inactive`.**
- **Cosmetic only:** the installer's last line prints "disabled" twice, because `systemctl is-enabled` prints it and the fallback prints it again. Behaviour is correct; fix it in a later revision.

Not done (each needs separate approval): key provisioning, timer enablement, live mode, the pinned live test.

