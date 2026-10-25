# Mycelium Phase 0.2 Stage B: Claude's implementation and host plan (25 October 2026, revision v4)

**Status update (Codex, 25 October 2026, 09:14 GMT):** v4 source review PASS (56/56 offline checks); **Chris approved the reviewed installation** in chat after `fd341c81`. [Approval/access handover](../../../team/HANDOVERS.md#2026-10-25t0914050000--codex--claude--chris-installation-approval-recorded-cloud-cannot-reach-home-lan-host). **No repeat installation approval needed.** Codex cloud cannot resolve `fpd-prod.Home`, including outside sandbox; execution/evidence pending via the existing manual PC/home-LAN workflow. No remote command/install/model call by Codex. Actual task creation still requires Chris's creation or explicit approval; native billing/auth/allowance prerequisites and remaining stages retain their limits.
- **Answers:** [Chris's Stage B authorisation](PHASE_0_2_STAGE_B_AUTHORIZATION_2026-10-25.md), the [joint contract](PHASE_0_2_TASK_CONTRACT_REVIEW_2026-10-24.md), and [Codex's review R1–R7](PHASE_0_2_STAGE_B_CODEX_REVIEW_2026-10-25.md) of v1 (`8d56af1`).
- **Code:** [`greenfield/mycelium/stageb/`](../../mycelium/stageb/).

**v1 → v2 in one line:** a new **admission** step re-reads GitHub at the last moment before any model call. The Stage B budget now comes from **GitHub history**, not local state. Each run gets one atomic start slot. Public receipts carry fixed codes only. Duplicate JSON members are caught on the token stream. Calls are hard-killed at the cap. The host commands propagate failures.

## 1. What runs, and as whom

| Piece | Runs as | Does | Never |
| --- | --- | --- | --- |
| `myc-gate` | `hubsync`: its clone, deploy key and lock, so it never overlaps a 5-minute poll | `grant` / `claim` / **`admit`** / `complete` / `expire`; strict history validation; the single writer, plain push only | calls a model; pushes anything but new `events/NNNN.json` / `result.md` under `greenfield/mycelium/tasks/`; forces; retries a rejected push; publishes free text |
| `myc-agent` | `myc` (the AI user; no Git, no GitHub credential) | runs only an **admitted** run; takes the run's one-time start slot atomically; makes **one** CLI call through the `myc-run` guard, hard-killed at the cap; writes `result.md` + `meta.json` | retries; resumes; overwrites another runner's output; touches Git |
| `myc-stageb` | root, started by Chris with `sudo` | for **one** task, in order: grant → claim → **admit** → call → record. A stage-wide lock stops two runs at once. | runs without `MYC_BILLING_CONFIRMED=yes`; calls a model if admission fails |

**hubsync is untouched:** its script, unit, timer, sandbox and key are unchanged. The only account change is adding `hubsync` and `myc` to group `mycspool`. The spool `/var/lib/mycspool` is outside hubsync's clone. No model call ever happens inside hubsync's polling oneshot or while its lock is held.

## 2. Codex's findings and the v2 fixes

| # | Finding | Fix in v2 | Test (both suites pass) |
| --- | --- | --- | --- |
| R1 | Two runners for one claim could both call | **`admit`** (as hubsync) does an atomic `mkdir admitted`, once per run ever, in a folder `myc` cannot write. The runner refuses unless the run is admitted, then takes the start slot with an atomic `mkdir out/started`. The loser of a race, or a restart, exits **without touching anything** (it never overwrites meta or result). | two concurrent runners + a restart = **1 call**; re-admit refused; un-admitted run refused |
| R2 | A cancel landing just after the claim did not stop the call | `claim` no longer writes a job. **`admit` is the dispatch boundary:** a fresh fetch and the full history are re-validated. The claim must be the **live last event**, with lease live, grant open, descriptor still allowlisted and pinned references unchanged. Only then is the job packet written. A cancel (or any later event) quarantines the task, so admission is refused and no call is made. **Remaining unavoidable race:** a cancel that lands *after* admission cannot stop a call already in flight (at most 180 s); its result is then discarded at `complete`, because the history is quarantined. | a cancel between claim and admit, and a git shim landing the cancel right after the claim push: **0 calls** |
| R3 | Deleting local state reset the 30-minute window | `myc-gate grant` derives the budget **only from GitHub history** of the allowlisted tasks: number of claims (≤ 2), time of the **first claim** (window start), and any failed / uncertain / quarantined / still-running task (**hold**). Checked at grant, claim and admit. The admitted deadline is min(lease, window end − 30 s publishing margin). The runner caps its call at the remaining time, and `complete` records `deadline_passed` if exceeded. The local state file is now just a log. | window held after local state deleted; cap and hold after state deleted |
| R4 | Runner error text reached the public failure receipt | Public `reason` is a **fixed code** (`result_accepted`, `runner_failed`, `outcome_uncertain`, `not_admitted_no_call`, `lease_expired`, `deadline_passed`, `result_rejected`, `stage_b_manual_claim`). Free-text errors stay in the private log. Usage is rebuilt from an allowlist: the agent comes from the claim record, numbers are range-checked, model/version must match strict patterns, and any field that looks like a credential is dropped. A final credential-pattern check runs on the whole staged diff before any commit. | synthetic `ghp_…` error, `sk-…` model and a control-byte version are all kept out |
| R5 | Duplicate keys with different shapes were accepted | Duplicate members are detected **on the JSON token stream before normalisation**: a member path seen again after it was completed counts as a duplicate, at any depth, whatever the value shapes. Events also need ISO-8601 UTC `at`, string `reason`, object `usage`, the actor `hubsync-gate` for completed/failed, and a claim `run_id` of the form `<task_id>-r…`. | container→scalar, scalar→container, nested and identical-scalar duplicates; malformed time |
| R6 | A CLI ignoring TERM outlived the cap | `timeout -k`: TERM at cap−10 s, **KILL at the cap**, to the whole process group. Short caps scale (70% / 20%). Auth and version checks are capped at 20 s. The call cap is min(180 s, time left in the grant). | a TERM-ignoring fake CLI is killed in 1.9 s for a 2 s cap |
| R7 | `test | tail && install` ran the installer even if tests failed | The host commands below have **no pipes before `&&`**. Each step's own exit status gates the next. The archive hash is checked first, then the file checksums, then both test suites, then the install. The installer prints the before-state. | demonstrated by structure: every gate is a plain `&&` chain |

**v4 (Codex's v3 review: the publication phases shared one allowance):**
- `complete` passes the immutable **absolute publication end** to the writer.
- `commit_push` re-reads the clock **after local preparation and right before the push**. If under 5 s remain, nothing is pushed (confirmed) and the task is held.
- It re-reads the clock again **after the push and before the confirming fetch**. If under 3 s remain, the result is **published but unconfirmed** and held.
- Each phase's hard kill (TERM at t−2 s, KILL at t) lands **inside** the time it was given.
- **After confirmation the clock is checked once more.** If the absolute end has passed, the result is reported as **published late, held**, never as success.
- Uncertain or late outcomes are held and never retried automatically. The messages keep "nothing pushed (confirmed)", "may or may not have landed (uncertain)" and "published but unconfirmed / late" distinct.
- Codex's `test-review-publication.sh` (control + 2 timing cases) now passes **3/3** (was 1/3). It is part of the pinned manifest and of the host test chain.
- All suites: Claude 44/44, regressions 7/7, deadlines 2/2, publication 3/3.

**v3 (Codex's v2 re-review, R3/R7 follow-ups):**
- **Absolute deadline.** `admit` now computes the deadline only from durable facts: **first claim on GitHub + window − publishing margin**, capped by the lease. It re-reads the clock **immediately before** the atomic admission (at least 20 s must remain). Time spent checking references can no longer stretch the grant, and a window that expires during those checks refuses admission. Codex's `test-review-deadlines.sh` now passes **2/2** (was 0/2).
- **Publication bounded by the grant end.** A result is published only while time remains before the absolute grant end. Its push and its confirming fetch get only that remaining time (capped at 120 s / 60 s). If time runs out first, the result is not published and a `deadline_passed` receipt is written. If the push or fetch times out, the gate stops with **"outcome UNCERTAIN; held"**: nothing is retried automatically, and a later manual `complete` reconciles it. A failure *receipt* written after the grant end is bookkeeping, not test activity, and is bounded at 60 s. **Accordingly, I do not claim a hard 30-minute wall-clock limit for publication network waits.** The grant end bounds every model call and every result publication; only a receipt can follow it.
- **Install is fresh-only, with a narrow rollback.** `install-stageb.sh` verifies `SHA256SUMS`, then **refuses before changing anything** if any managed path or the `mycspool` group already exists. It writes a root-only install receipt. The new `uninstall-stageb.sh` undoes only what the receipt lists:
  - it removes the commands only if unchanged since install;
  - it **moves** the spool, the local state and the private CLI logs into `/root/stageb-evidence-<time>/` and never deletes them;
  - it removes the allowlist and the group it created.

  It refuses while a Stage B run holds the lock. This was verified in a disposable simulation in Claude's workspace (not on the BRIX): fresh install ok; second install refused with no change; rollback kept a modified command and the evidence.
- Claude's suite **44/44** (new: result after the grant end not published; a push that cannot finish before the grant end stops as UNCERTAIN). Codex regressions **7/7**, deadline regressions **2/2**.

**Codex's regression file:** I adapted `test-review-regressions.sh` for the v2 interface. Scenarios D, E and F now get a fresh grant, since the budget is deliberately durable across scenarios, and D/F gain the new `claim → admit` step. The edits are marked in the file, and the intent of every check is unchanged. **It now passes 7/7;** Claude's suite passes **42/42**. Codex, please confirm the adaptation keeps your intent.

## 3. Codex 0.164.0 retries: still open, not guessed

I accept Codex's source reading. The built-in `openai` provider keeps its defaults: 4 request retries and 5 stream reconnects. A `-c model_providers.openai.*` override is not shown to take effect, so I do **not** use one. v2 adds nothing that pretends otherwise.

**What v2 does guarantee:**
- exactly one Codex process per admitted run;
- a hard kill at the cap;
- no resume (`--ephemeral`);
- subscription-only authentication (ChatGPT login status, no API key in `auth.json`, `forced_login_method="chatgpt"`).

**What it cannot guarantee:** that Codex's internal transport retries of that one request never happen.

**Decision for Chris before any native call** (Codex's position too):
- (a) accept that, for this one read-only Codex call, the CLI's built-in retry of the *same request* on a transport error is allowed; or
- (b) run Stage B with the Codex task's CLI call replaced by a different approved arrangement; or
- (c) stop at this point.

**Chris's decision (25 Oct, given to Claude in chat): option (a).** For this one read-only Codex call, the Codex CLI's built-in retry of the *same request* on a transport error is accepted. The decision does not cover a second Codex call, another task, or any later stage. Every other limit stands: one admitted run, one process, hard kill at the cap, subscription only, £0.

Claude Code is configured with `CLAUDE_CODE_MAX_RETRIES=0` and `CLAUDE_CODE_NONSTREAMING_TIMEOUT_RETRIES=0`, and no fallback model. Those are documented variables. As Codex notes, their effect is documented rather than proved in a test with fake CLIs.

## 4. The two tasks (Chris creates or authorises them; not on the hub yet)

`MYC-20261025-001` (Codex):
```
Read-only review of the hub watcher shell script. List at most 3 concrete risks, each with the line it refers to and a one-line suggested fix. Do not modify anything.
ref: greenfield/mycelium/hubsync/hubsync
```

`MYC-20261025-002` (Claude), which can be claimed only once 001 is completed:
```
Read the Codex review in the reference. For each risk, say AGREE or DISAGREE with a one-line reason, then add at most one risk it missed. Read-only.
ref: greenfield/mycelium/tasks/MYC-20261025-001/result.md
```

Each is a `task.json` (exactly the five fields, `status: pending`) plus `events/0001.json` (`pending`, actor `chris`) in one commit. Claude prepares them as a separate bundle at go-ahead, and **Chris pushing it is his authorisation.**

## 5. Exact host commands (only after Codex's re-review and Chris's go-ahead; the §3 decision is made: (a))

**Pinned archive:** `stageb-0.5.tgz` sha256 `d35f98a9aefaa5ad92b70db18af9977def0f157556b3de5fa4328c9933687004`.

**File checksums** (also in `stageb/SHA256SUMS`, inside the archive, re-checked by the installer):
```
b8381493a38cc6648751149e4d96d8194179276ef9ba753e916a8c584308abfa  myc-gate
14027469c640eea30abbea808c43e0b90fba68c1b2e1a61cfb7b428747635ec2  myc-agent
c600ea9f4552581c1573d60a793f160fd2de34d3922f868678a81401368fdb5e  myc-stageb
ef171d15f7bcad3ff437157d56b60d57aa30025c5f49a9ea0a26fc665916f1e8  install-stageb.sh
f39a65dcb8259fe75097886363de9bba64f060561699d0358a40272bad2b6513  uninstall-stageb.sh
dc987872f0102f902e314e4cb11474d1f3489e1f14828a629939fec5b6c98867  test-stageb.sh
adb3b216d16b275fb796e2c15ee623c1c5bc44b337be06884e01b5dfe3fbab6c  test-review-regressions.sh
3f6869356947b93faecb72d1de88644d282cbf4a71c675ba60a429f29561b38f  test-review-deadlines.sh
5dccdbf48d061bec95a181a4b1118f295a4bf5e3c6eef1799af95b9e4b2e0e64  test-review-publication.sh
```

**On the PC:**
```
powershell -ExecutionPolicy Bypass -File C:\Users\ChrisT\claude-sync.ps1
scp C:\Users\ChrisT\stageb-0.5.tgz ct_admin@fpd-prod.Home:~/
```

**On `fpd-prod`:** every step must succeed for the next to run. There are no pipes before `&&`.
```
cd ~ && echo "d35f98a9aefaa5ad92b70db18af9977def0f157556b3de5fa4328c9933687004  stageb-0.5.tgz" | sha256sum -c - && tar -xzf stageb-0.5.tgz && cd stageb && sha256sum -c SHA256SUMS && bash test-stageb.sh && bash test-review-deadlines.sh && bash test-review-publication.sh && sudo bash install-stageb.sh
```
- The installer prints the before-state, then installs three root-owned commands, group `mycspool`, `/var/lib/mycspool`, `/var/lib/myc-stageb` and an empty `/etc/myc-stageb/allowed`.
- It **starts and enables nothing**.
- Codex's regression file needs python3 for its stub edits. If python3 is on the host, also run `bash test-review-regressions.sh` before the install.

**Then:**
1. Push the task bundle.
2. Pin the two tasks with the two exact lines Claude supplies from the pushed commit:
```
printf '%s\n' 'MYC-20261025-001 codex <blob>' 'MYC-20261025-002 claude <blob>' | sudo tee /etc/myc-stageb/allowed
```
3. Check that Claude usage credits are OFF and no Codex credits or API key are in use. Record the allowance pages.
4. Run the two tasks, one at a time:
```
sudo MYC_BILLING_CONFIRMED=yes myc-stageb MYC-20261025-001
sudo MYC_BILLING_CONFIRMED=yes myc-stageb MYC-20261025-002
```

**Undo** (narrow; only what the install receipt lists; evidence kept):
```
sudo bash ~/stageb/uninstall-stageb.sh
```
This moves the spool, the local state and the private logs into `/root/stageb-evidence-<time>/`, and removes the commands (only if unchanged), the allowlist and the group the install created. It refuses while a Stage B run is active. Task folders stay on the hub as the public record. hubsync and the `myc` sign-ins are never touched.

## 6. Report after the run

- both outcomes;
- the task, event and result hashes;
- the calls used (at most 2), with time and usage;
- the allowance readings before and after;
- confirmation of no production change (Pi, V3, J1900) and no unexpected paths;
- limits;
- the next step.

Contract acknowledgement (unchanged): the code follows the joint contract. That means five fields, status folded from history, fail-closed handling of bad history, committed claims, a hold on uncertain calls, and a single writer.

## 7. Host installation evidence (Chris, fpd-prod, 25 Oct; approved install of v4 / `stageb-0.5.tgz`)

| Step | Result |
| --- | --- |
| Archive | `stageb-0.5.tgz: OK` (sha256 `d35f98a9…7004`) |
| File manifest | all 9 entries OK |
| Offline suites **on the host** | Claude 44/44 · Codex regressions 7/7 · deadlines 2/2 · publication 3/3 (56/56) |
| Fresh-install check | every managed path and the `mycspool` group **absent** before install; `hubsync.timer` active |
| Installed | `/usr/local/bin/myc-gate`, `myc-agent`, `myc-stageb`: `-rwxr-xr-x root:root`; group `mycspool` (gid 989) with members `hubsync` (102) and `myc` (1001); spool, state and empty allowlist; receipt `/var/lib/myc-stageb/install-receipt` |
| Install receipt | `installed_at=2026-10-25T09:21:03Z`; the three command hashes in the receipt equal the pinned manifest (`myc-gate b8381493…`, `myc-agent 14027469…`, `myc-stageb c600ea9f…`) |
| Read-only writer check | `MYC-20261025-001 ABSENT seq=0` (no task exists yet; nothing pushed) |
| Unchanged | nothing started or enabled; `hubsync.timer` active; hubsync script, unit and key untouched; no model call |

**Next, under the existing grant:** Chris creates or explicitly authorises the two tasks (§4). Then the allowlist is pinned, the billing and allowance readings are taken, and the two manual runs follow.

