# Mycelium Phase 0.2: Claude's contract proposal and review (24 October 2026)

**Status:** PROPOSAL for Codex review and Chris's decision. Design only: no code, no new processes, no AI dispatch, no email. This answers [the Phase 0.2 request](PHASE_0_2_TASK_CONTRACT_AND_NOTIFICATIONS_2026-10-24.md), and builds on the working [hubsync](PHASE_0_1_HUBSYNC_PROPOSAL_2026-10-23.md), which passed 23.5 h unattended.

## 1. Fit with hubsync, and the main design choice

hubsync already shows the pattern that works. The **repository decides what is done**: idempotence comes from file contents, not local state. **One writer pushes, with plain compare-and-swap pushes**, and stops on persistent conflict. The proposal keeps both properties:

- **Append-only files, never edits.** A task is one immutable request file plus numbered event files. Nobody edits a file someone else wrote, so concurrent writers cannot overwrite each other. The only possible collision is two writers creating the *same* file name. GitHub's fast-forward rule makes that an atomic "first writer wins", and the loser re-reads and re-decides. This is exactly how hubsync already handles races (tested).
- **Agents on the BRIX never touch Git.** The `myc` CLIs read a task snapshot and write their result to a local spool. hubsync validates it and is the **only BRIX process that commits**. That keeps the Phase 0.1 rule, "one Git writer validates and commits", and the AI user never holds a GitHub credential.

## 2. Paths and format (JSON, parsed strictly with jq)

```
greenfield/mycelium/tasks/<task_id>/
  task.json            # the request: written once, never modified
  events/0001.json     # lifecycle events, numbered; 0001 is always "pending"
  events/0002.json ...
  result.md            # written by the assigned agent, in the same commit as its "completed" event
```

**`task.json`** holds the five required logical fields. The fifth, `status`, is derived from the events (below), which is what makes updates conflict-safe. Two optional safety fields are added:

```json
{
  "schema": "mycelium-task-v1",
  "task_id": "MYC-20261024-001",
  "assigned_agent": "codex",
  "instructions": "Read-only review: read greenfield/mycelium/hubsync/hubsync and list at most 3 concrete risks, each with the line it refers to. Do not modify anything.",
  "result_location": "greenfield/mycelium/tasks/MYC-20261024-001/result.md",
  "created_by": "chris",
  "requires_approval": false
}
```

**`events/NNNN.json`:**

```json
{ "seq": 2, "status": "in_progress", "actor": "codex", "at": "2026-10-24T16:05:00Z", "note": "claimed", "lease_until": "2026-10-24T16:35:00Z" }
```

**Status** = the `status` of the highest-numbered *valid* event.

**Rules:**
- `task_id` matches `^MYC-\d{8}-\d{3}$` and is the directory name. Creating an existing id is a collision, and the loser picks the next number.
- `assigned_agent` is `claude` or `codex`.
- `instructions` is at most 4 KB of plain text, with references as repository paths.
- `result_location` must sit inside the task's own directory.
- `seq` equals the file number, contiguous from 1.
- **Everything in the hub is public:** no secrets, recipients, customer data or private source material in any of these files.

## 3. Status vocabulary and allowed transitions

| From | To | Only by | Condition |
| --- | --- | --- | --- |
| (none) | `pending` | Chris (Phase 0.2: **only Chris creates tasks**) | `task.json` and `events/0001.json` in one commit |
| `pending` | `in_progress` | the `assigned_agent` | the claim; `lease_until` at most 30 min ahead |
| `in_progress` | `awaiting_approval` | the assigned agent | `note` = the decision needed, plus a reference |
| `awaiting_approval` | `approved` / `rejected` | **Chris only** (see §5) | |
| `approved` | `in_progress` | the assigned agent | the work continues |
| `in_progress` | `completed` | the assigned agent | `result_location` present in the **same commit** |
| `in_progress` | `failed` | the assigned agent, or hubsync on an expired lease | `note` gives the reason |
| `pending` / `in_progress` / `awaiting_approval` | `cancelled` | Chris only | |
| `failed` | `pending` | Chris only | an explicit retry |

- **Terminal states:** `completed`, `rejected` and `cancelled`; `failed` too, unless Chris retries.
- **An event that breaks these rules is treated as not having happened.** That covers the wrong actor, a skipped `seq`, an illegal transition, a missing result or a malformed file. hubsync logs it as `invalid_event` and no one acts on it.
- **No agent can approve its own gate,** because `approved` and `rejected` are valid only from Chris, subject to the authenticity caveat in §5.

## 4. Claiming, idempotency, restarts and loops

- **Atomic claim:**
  1. An agent may act only when the current status requires its action and it last read `seq = n`.
  2. It writes `events/<n+1>.json`.
  3. If someone else wrote `<n+1>` first, the push is rejected. After a fresh fetch the agent sees the new state and re-decides, usually doing nothing.
  4. Two claims cannot both succeed.
- **Duplicate suppression:**
  - An agent's work for a task is keyed by `(task_id, seq it acted on)`. Re-running after a crash re-reads the repo and finds the work either done or still claimable.
  - hubsync's spool hand-off is keyed the same way.
- **Stale lease:** if an `in_progress` lease has expired with no newer event, hubsync appends `failed` ("lease expired"). The task then waits for Chris to retry. Nothing is auto-retried in Phase 0.2.
- **Loops:**
  - In Phase 0.2 **agents cannot create tasks**. They can only append events and results to tasks assigned to them. A follow-up an agent wants goes in its `result.md` under "Requested follow-up", and Chris turns it into a new task.
  - That makes agent↔agent loops impossible by construction.
  - Later, agent-created tasks could be allowed with `parent_task_id` and a hard depth cap of 3, by a separate decision.

## 5. Approval authenticity: an honest limit, for Chris's decision

An `approved` event says `"actor": "chris"`, but **Git cannot prove who wrote a file**. A commit's author name is free text. The hub has also, so far, been pushed under Chris's own GitHub credentials, including Claude's bundles via `claude-sync.ps1`. While any agent writes with Chris's credentials, no file-level rule can technically stop a forged approval. It becomes a policy and audit control, not a security boundary. Options:

1. **(Recommended)** Give each automated writer its own GitHub identity, so only Chris's account is left that can approve:
   - hubsync already has its own deploy key;
   - Codex's automated writes get a separate deploy key or bot account;
   - BRIX CLIs never get one (§1).

   Approvals are then valid only in commits that GitHub reports as **verified** and attributed to Chris's account, for example ones made in the GitHub web interface, which GitHub signs on his behalf. Once no agent holds Chris's credentials, no agent can produce such a commit.
2. Approvals are made only through the GitHub web interface (GitHub signs those commits) and validated by signature. That is weaker if any agent has API access as Chris.
3. Accept policy-only approval for Phase 0.2 test tasks, and do not use approvals for anything consequential until 1 is in place.

## 6. Approval emails: placement and safety

- **Keep the key away from hubsync.** hubsync, which already sees state changes, writes a small notification request to a spool directory: task id, event seq, and a one-line summary taken from the public hub. A **separate** `mycnotify` service account holds the SMTP2GO key through a root-provisioned systemd credential (0600, never in Git or logs). It sends to an allowlisted recipient set in a root-only local config, not in GitHub.
- **No duplicates:**
  - Each send is keyed by `(task_id, event seq)` in a local sent-log that survives reboots.
  - A new decision is a new event seq, so it notifies once more.
  - Bounded retries with exponential back-off, a daily cap, and permanent failure logged and visible in status. hubsync polling never waits on email.
- **Email is a prompt, never the approval.** The email links to the task in GitHub. Only an `approved` / `rejected` event in GitHub counts (§3, §5). Work stays paused until then.
- **Identity:** the sender is a FindPitches-owned address, used only once SMTP2GO has authorised it. Nothing on Managed Technology domains, accounts or equipment.

## 7. Smallest manually triggered demonstration (stage B, needs approval)

1. **Chris creates the tasks:** `MYC-20261024-001`, assigned to `codex` (the read-only review shown above). He also creates `MYC-20261024-002`, assigned to `claude`: "Read the result of MYC-…-001 and say which risks you agree with; read-only."
2. **Chris runs one command on `fpd-prod`:** `myc-task MYC-20261024-001`. It is a small wrapper:
   - it reads the task from a fresh anonymous read-only clone (the repo is public, so no credential is needed);
   - it runs Codex through the existing `myc-run` guard (read-only sandbox, one call, 180 s);
   - it writes `result.md` plus a `completed` event to hubsync's spool.
3. **hubsync's next poll** validates the event and commits the event and result.
4. **Chris runs `myc-task MYC-20261024-002`;** the Claude CLI reads result 001 from GitHub, and the same path follows.

**Total: 2 model calls, both started by Chris. Nothing automatic.** It proves GitHub-mediated hand-off between the two CLIs, the contract, validation and the single-writer path. Usage and timing are recorded per call, as in the 23 Oct test.

## 8. Unresolved points (for Codex and Chris)

1. **Approval authenticity (§5):** which option. This is the only real security question.
2. **Codex's write path:** does Codex (cloud) follow this contract directly through Git, and under which identity?
3. **This Cowork session (Claude):** it cannot reach the BRIX and pushes only through Chris's sync. It can author tasks and results by hand, but it is not an automated agent. Automated "claude" means the BRIX CLI.
4. **Lease length** (30 min proposed), and whether `in_progress` needs heartbeats at all while every run is manual.
5. **Retention:** task folders accumulate in the public repo. Should completed tasks be archived after N days?
6. **Format:** JSON is proposed (strict parsing with jq, already on the BRIX). YAML is possible but adds ambiguity.

**Claude's position:** I agree with the request's scope and the five-field core. The two additions that matter are append-only events and "only Chris creates tasks in 0.2", for conflict-safety and loop-safety. I await Codex's review before anything is built.
