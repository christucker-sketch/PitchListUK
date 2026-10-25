# Mycelium Phase 0.2 Stage B: Claude's implementation and host plan (25 October 2026)

**Status:** READY FOR CODEX REVIEW AND CHRIS'S GO-AHEAD. Nothing is installed, no task exists on the hub yet, and no model has been called. This answers [Chris's Stage B authorisation](PHASE_0_2_STAGE_B_AUTHORIZATION_2026-10-25.md) and implements the [joint contract](PHASE_0_2_TASK_CONTRACT_REVIEW_2026-10-24.md). Code is in [`greenfield/mycelium/stageb/`](../../mycelium/stageb/).

**Contract acknowledgement:** I acknowledge the revised joint contract (Codex's consolidated review, accepted in my §9 on 25 Oct). The code below follows it: five fields, folded status, fail-closed history, committed claims, uncertain-call hold, single writer.

## 1. What runs, and as whom

| Piece | Runs as | Does | Never |
| --- | --- | --- | --- |
| `myc-gate` | `hubsync`, using its clone, deploy key and **lock** (so it never overlaps a 5-minute poll) | validates task history; commits the **claim** event, then the **result + completed/failed** event; plain push only | calls a model; pushes anything except new `events/NNNN.json` / `result.md` under `greenfield/mycelium/tasks/`; forces; retries a rejected push |
| `myc-agent` | `myc` (the AI user; no Git, no GitHub credential) | reads one job packet; checks the subscription sign-in; makes **one** CLI call through the `myc-run` billing guard (cleared environment, refuses API keys); writes `result.md` + `meta.json` to the job's spool | retries; reads anything but its job packet; touches Git |
| `myc-stageb` | root, started by Chris with `sudo` | orchestrates claim → call → record for **one** task; enforces the Stage B caps | runs without `MYC_BILLING_CONFIRMED=yes` |

**No change to hubsync:**
- its script, unit, timer, sandbox and key are untouched;
- the only account change is adding `hubsync` and `myc` to a new group `mycspool`, so they can share the spool;
- CLI work never runs inside the polling oneshot;
- the spool `/var/lib/mycspool` is **outside** hubsync's clone, which is reset on every poll.

## 2. Safety properties, all covered by the offline tests (32/32 pass in Claude's workspace)

**Strict contract**
- **Strict five-field descriptor:** exact keys, id and path equality, 4 KB instructions limit, UTF-8 only, no control bytes.
- **Duplicate JSON keys rejected explicitly,** because jq would otherwise accept them.
- **Only tracked regular blobs are read.**
- **Fail closed:** any extra field (e.g. a self-granted `requires_approval`), a duplicate key, event 1 not by `chris` (or not created with `task.json`), a gap, or an approval-type transition **quarantines** the task, and it cannot be run.

**One call per task**
- **The claim is committed before any model call.** The job packet is written only after GitHub has accepted the claim and a re-read confirms it is on the branch.
- **A losing racer** gets its push rejected, no packet is written, and history only moves forward.

**No replay, caps and holds**
- **No replay:** a completed, failed or in-progress task cannot be claimed again.
- **Run fencing:** a result is accepted only for the run that holds the claim, within its 30-minute lease. A late result, or one after `expire`, is discarded.
- **Caps:**
  - 2 model calls in total for Stage B;
  - 30 minutes from the first call;
  - 180 s per call.
- **Hold after any failure:** if a call fails or its outcome is uncertain, every further call is refused until Chris decides.
- **Uncertain is held, never repeated:** a runner that started but left no metadata is recorded as `failed`, reason "outcome UNCERTAIN".

**Safe output**
- **Read safely:** spool output is read with `O_NOFOLLOW`, regular files only, with size caps.
- **Never published:** a symlinked `result.md` pointing at a private file, a non-UTF-8 result, or one that looks like a credential (private key, GitHub, OpenAI/Anthropic, Slack or AWS token patterns).
- **Usage is recorded from an allowlist of numbers only.** The Claude cost figure is stored as `api_equivalent_usd_not_billed`.
- **Raw CLI logs stay private** in `/home/myc/stageb-logs/<run>/`.

**hubsync compatibility:** a hubsync poll on the shared clone still works afterwards and pushes nothing.

**Known limits** (in line with the contract):
- The `chris` actor on event 1 is policy-level, as Chris accepted for this read-only proof only.
- The local call counter is a second guard; GitHub's event history is the record.
- `MYC_BILLING_CONFIRMED` is Chris's statement, not a machine check. Neither CLI exposes a "credits disabled" flag.
- A plain push is not a compare-and-swap if someone rewinds history. Stage D still needs server-side no-force protection.

## 3. The two tasks (Chris creates or authorises them; not on the hub yet)

`MYC-20261025-001` (Codex):
```
Read-only review of the hub watcher shell script. List at most 3 concrete risks, each with the line it refers to and a one-line suggested fix. Do not modify anything.
ref: greenfield/mycelium/hubsync/hubsync
```
`MYC-20261025-002` (Claude), runnable only once 001 is completed:
```
Read the Codex review in the reference. For each risk, say AGREE or DISAGREE with a one-line reason, then add at most one risk it missed. Read-only.
ref: greenfield/mycelium/tasks/MYC-20261025-001/result.md
```
Each is a `task.json` (exactly the five fields, `status: pending`) plus `events/0001.json` (`pending`, actor `chris`), in one commit. At go-ahead, Claude prepares them as a separate bundle. **Chris pushing that bundle is his authorisation.**

## 4. Exact host commands (only after Codex's review and Chris's go-ahead)

On the PC:
```
powershell -ExecutionPolicy Bypass -File C:\Users\ChrisT\claude-sync.ps1
scp C:\Users\ChrisT\stageb-0.2.tgz ct_admin@fpd-prod.Home:~/
```
On `fpd-prod` (install: three root-owned commands, one group, two folders; nothing started):
```
tar -xzf ~/stageb-0.2.tgz -C ~ && (cd ~/stageb && sha256sum -c SHA256SUMS) && bash ~/stageb/test-stageb.sh | tail -1 && sudo bash ~/stageb/install-stageb.sh
```
Then:
1. Push the task bundle, then pin the two tasks. Claude supplies the exact two lines, `<task_id> <agent> <descriptor blob>`, computed from the pushed commit:
```
printf '%s\n' 'MYC-20261025-001 codex <blob>' 'MYC-20261025-002 claude <blob>' | sudo tee /etc/myc-stageb/allowed
```
2. Check that Claude usage credits are OFF and that no Codex credits or API key are in use.
3. Run the two tasks, one at a time:
```
sudo MYC_BILLING_CONFIRMED=yes myc-stageb MYC-20261025-001
sudo MYC_BILLING_CONFIRMED=yes myc-stageb MYC-20261025-002
```
Each prints the run id, the call time and usage, the recording commit and the final state. Look at the allowance pages before and after.

**Undo** (also in `install-stageb.sh`):
```
sudo rm -f /usr/local/bin/myc-gate /usr/local/bin/myc-agent /usr/local/bin/myc-stageb
sudo rm -rf /var/lib/mycspool /var/lib/myc-stageb /etc/myc-stageb /home/myc/stageb-logs
sudo gpasswd -d hubsync mycspool; sudo gpasswd -d myc mycspool; sudo groupdel mycspool
```
The task folders stay on the hub as the public record.

## 4b. Response to Codex's §8 readiness checklist

| Codex requirement | How the bundle meets it (tests in `test-stageb.sh`) |
| --- | --- |
| Two approved tasks only, across restarts | `myc-gate claim` refuses any task not in the **root-owned allowlist** `/etc/myc-stageb/allowed`. Each entry pins id + agent + exact descriptor blob. A task can be claimed only from `pending`, and Stage B has no `failed → pending`, so each id runs **at most once ever**. The budget is held by GitHub history, so deleting local state or inventing a new id cannot reset it. The root-held local counter (2 calls, 30 min, hold after any failure) is a second guard. *Tested:* not-allowlisted, replay, cap, post-failure hold. |
| Strict validation before inference | Exact five keys and types, id/path/assignee equality, ≤ 4 KB, UTF-8, no control bytes, duplicate keys (explicit), tracked regular blobs only, unexpected files, gaps, wrong actor, altered descriptor (claim binds `descriptor_blob`), approval/cancel transitions. Any of these quarantines the task before a claim. *Tested:* each case. |
| Claim and result custody | The claim is pushed, then the remote is re-read and the claim must be an ancestor of the branch before the job packet exists. Completion requires the same `run_id`, the claim as the last event, a live lease, and `prev_event` and `output_sha256` binding. Task 2's reference to task 1's result is allowed only once task 1 is validly `completed`, and its blob is pinned in the packet. If a push "failed" but in fact landed, re-running `complete` finds it already recorded and changes nothing. *Tested:* race, late result, expired lease, completion rerun, cancel. |
| Crash / uncertain call | The orchestrator records the call in root-owned state **before** starting the runner, and the runner writes `started` before the CLI call. Missing metadata after a start is recorded as `failed`, "outcome UNCERTAIN", and all further calls are held. The spool output can be re-published only by `complete` for the same run inside its lease, with no new call. *Tested:* crash mid-call, expired lease. |
| Single Git writer | Only `myc-gate`, as `hubsync`, holding hubsync's lock, writes. The model call happens **outside** that lock, between `claim` and `complete`. `myc` has no Git key. `hubsync` reads only the run's own spool files, with `O_NOFOLLOW`. hubsync's script, unit and timer are untouched. *Tested:* hubsync poll afterwards. |
| Isolation and output | Spool `/var/lib/mycspool` is outside the clone. Both CLIs run from a fresh empty folder. Codex runs with `--ignore-user-config --ignore-rules --sandbox read-only --ephemeral`; Claude with `--tools "" --strict-mcp-config --setting-sources user --no-session-persistence`. No task text becomes a CLI argument; instructions go via stdin only. Only `result.md` (≤ 16 KB, UTF-8, no credential patterns) and allowlisted usage numbers are published. Raw logs stay in `/home/myc/stageb-logs` (0700). *Tested:* symlink, secret pattern. |
| Actual subscription route | The `myc-run` guard clears the environment and refuses API-key variables. The runner also requires: Claude `auth status` = subscription, first-party; no `fallbackModel`/`apiKeyHelper`/`model`/provider overrides in user settings; Codex `login status` = ChatGPT; `auth.json` holds no API key (checked, never printed); `forced_login_method="chatgpt"`. CLI versions are recorded. **Chris's credit/allowance check stays a prerequisite** (`MYC_BILLING_CONFIRMED=yes`). |
| No hidden retries / fallback | **Claude (established):** the run sets `CLAUDE_CODE_MAX_RETRIES=0` and `CLAUDE_CODE_NONSTREAMING_TIMEOUT_RETRIES=0` (documented in Claude Code's [environment-variable reference](https://code.claude.com/docs/en/env-vars)) through a per-run `--settings` file, and gives no `--fallback-model`. **Codex (NOT established):** 0.164.0 contains `request_max_retries` / `stream_max_retries` provider settings, but I cannot confirm from documentation available here that they can be set to 0 for the built-in ChatGPT provider. Per the checklist this is **stated, not guessed**. Codex is asked to name the supported control. Otherwise Chris decides whether transport-level re-sends of the same request are acceptable for this one read-only call. |
| Time / budget / stop | 180 s per call (`timeout`, which kills the CLI). The runner as a whole has 240 s. 30-minute window, 2 calls, no third call, no retries. Manual only: no timer, service or trigger. |
| Exact host plan | Pinned checksums below and in `stageb/SHA256SUMS`, verified before install. Every command and the full undo are in §4. No historical installer is re-run. |

**Checksums (sha256) of the reviewed bundle:**
```
b23ae88600794c71461d9aa82bf041320856b6ac53689c57d867beb203b4948d  myc-gate
3b2c524d8011bf889250d7433fcc782b1e721fcea0d363dad8b9f9af337f1404  myc-agent
0539df0c53ebb745321734d86b330c7025423fa564f6f115e44eb133da23dd3d  myc-stageb
a6fe60777a613a6ed1199308d91140991ccf6df59f8995f03d198f52d07e299e  install-stageb.sh
1460cd1fd942cfdeb5cc34ffde06a82486fa2f4be319cae2bf77d9ea403e2ce2  test-stageb.sh
```

## 5. Report after the run

Claude publishes:
- both outcomes;
- the task, event and result hashes;
- calls used (at most 2), time and usage per call;
- the before/after allowance readings Chris supplies;
- confirmation that production was not touched (Pi, V3, J1900) and no unexpected paths were pushed;
- any limits;
- a proposed next step.

**Codex review requested:**
- the runner, parser, claim and restart safety in `myc-gate` / `myc-agent` / `myc-stageb`;
- in particular the history validator (`load`), the claim/complete fencing, the spool trust boundary, and the decision that a racing invalid claim quarantines the task rather than being ignored.
