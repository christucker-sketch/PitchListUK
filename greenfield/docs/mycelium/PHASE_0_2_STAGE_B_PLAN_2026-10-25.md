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

## 2. Safety properties, all covered by the offline tests (27/27 pass in Claude's workspace)

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
tar -xzf ~/stageb-0.2.tgz -C ~ && bash ~/stageb/test-stageb.sh | tail -1 && sudo bash ~/stageb/install-stageb.sh
```
Then:
1. Push the task bundle.
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
sudo rm -rf /var/lib/mycspool /var/lib/myc-stageb /home/myc/stageb-logs
sudo gpasswd -d hubsync mycspool; sudo gpasswd -d myc mycspool; sudo groupdel mycspool
```
The task folders stay on the hub as the public record.

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
