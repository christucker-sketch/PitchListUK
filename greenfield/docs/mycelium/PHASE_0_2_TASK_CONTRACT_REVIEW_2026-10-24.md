# Mycelium Phase 0.2 — consolidated task contract review

**24 October 2026. DRAFT: Codex's independent review incorporating [Claude's proposal](PHASE_0_2_CLAUDE_CONTRACT_REVIEW_2026-10-24.md). Claude's acknowledgement of the amendments is pending; not yet JOINT.**

Authority: [Chris/Quinn's Phase0.2 order](PHASE_0_2_TASK_CONTRACT_AND_NOTIFICATIONS_2026-10-24.md). **Contract/notification design only.** Keep running HubSync unchanged. No new services, task dispatch, model calls, emails, installation or spend. This is the one proposed contract; the earlier source contribution remains review evidence.

## 1. Evidence and recommendation

Adopt Claude's JSON, append-only lifecycle events, one BRIX Git writer and **only Chris creates tasks** in0.2. Agents propose follow-ups in results, not new tasks. GitHub is authoritative for task/result/approval records; BRIX state is replaceable. This supersedes a paid PostgreSQL coordinator as the next step, not the later graph research.

Codex inspected the actual watcher, unit, hardening drop-in and tests. **Existing local offline tests:18passed/0failed**; three committed synthetic result blobs match their current tasks. Host-reported23.5h/252polls/0errors/one planned hardened-window push and power-cut recovery are meaningful transport evidence, not a new observation by Codex. The23Oct manual three-call native-CLI proof is separate: it proves output relay, not an unattended trigger or sustainable subscription capacity. Owner-side£0 billing/allowance confirmation is still required.

Current HubSync is deliberately synthetic: `team/sync-test/`, `to:hubsync`, no model invocation. T-0003/T-0005 addressed to Codex are negative controls, not real assignments. **Nothing in this review expands its path allowlist or changes the timer.**

## 2. Five-field contract and paths

Use Claude's layout:

```text
greenfield/mycelium/tasks/<task_id>/task.json
greenfield/mycelium/tasks/<task_id>/events/0001.json
greenfield/mycelium/tasks/<task_id>/events/0002.json ...
greenfield/mycelium/tasks/<task_id>/result.md
```

Illustrative descriptor only; **do not enqueue this example**:

```json
{
  "task_id": "MYC-20261024-001",
  "assigned_agent": "codex",
  "instructions": "Read-only: review the pinned HubSync source supplied by the controller; report at most three concrete risks with line references. No tools or changes.",
  "status": "pending",
  "result_location": "greenfield/mycelium/tasks/MYC-20261024-001/result.md"
}
```

**Exactly these five keys.** Claude's example omitted `status` and added `schema`, `created_by`, `requires_approval`; remove those additions for v1. The documented namespace fixes the version. A task cannot grant itself permission with `requires_approval:false`. Provenance/authority and execution limits belong to authenticated controller records and separately approved policy.

Minimal logical-view schema, shown here for review rather than installed in a watcher:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["task_id", "assigned_agent", "instructions", "status", "result_location"],
  "properties": {
    "task_id": {"type": "string", "pattern": "^MYC-[0-9]{8}-[0-9]{3}$"},
    "assigned_agent": {"enum": ["claude", "codex"]},
    "instructions": {"type": "string", "minLength": 1, "maxLength": 4096},
    "status": {"enum": ["pending", "in_progress", "awaiting_approval", "approved", "completed", "failed", "rejected", "cancelled"]},
    "result_location": {"type": "string", "pattern": "^greenfield/mycelium/tasks/MYC-[0-9]{8}-[0-9]{3}/result\\.md$"}
  }
}
```

The byte limit, duplicate-key rejection, exact ID/path equality, actor authority and history validation below are additional checks; JSON Schema string length alone cannot enforce them.

Preserve the immutable descriptor with initial `status:pending`. **Current status is the same five-field logical view with `status` folded from the contiguous, validated event history.** Never dispatch from the descriptor's initial status alone. Creation atomically includes descriptor + pending event0001. This retains Claude's append-only design without omitting the required logical field. If an always-current physical `task.json` is preferred, agree that alternative before implementation; do not support two interpretations.

Validation: UTF-8 JSON object, no duplicate keys/comments/coercion/unknown fields; `task_id` matches `^MYC-[0-9]{8}-[0-9]{3}$` and directory; assignee exactly `claude` or `codex`; instructions≤4096UTF-8bytes; file≤8192bytes; descriptor status exactly`pending`, projected status in the agreed vocabulary; result path exactly constructed above, not an arbitrary URL. Reject NUL/control bytes except ordinary text whitespace. **jq alone does not reject duplicate object keys**: the future parser must explicitly enforce that before projecting fields.

Read only tracked regular Git blobs, not symlinks, directories, submodules or filesystem paths escaping the task root. No arbitrary fetch URL, shell template, `eval`, `bash -c`, repo hook or instructions from a task become controller code. Controller preloads bounded, approved references at a pinned commit; native CLIs receive data through a fixed argument vector/stdin in an isolated workspace. Public hub content contains no credentials, recipients, customer data or private source material.

## 3. Lifecycle, ownership and committed claims

Each numbered event records sequence, target status, UTC time, authenticated actor reference and bounded reason. Execution events additionally bind the original descriptor Git blob, predecessor event, unique run/claim, lease deadline and accepted output digest when applicable. These are controller-owned **receipt metadata**, not more author-required task fields. `actor` text alone supplies no authentication.

| Transition | Authority and condition |
|---|---|
| none→pending | Chris creates descriptor + event0001 together. |
| pending→in_progress | Assigned runner requests a claim; the writer validates explicit stage grant and atomically commits the next event. No inference starts before remote acceptance is confirmed. |
| in_progress→awaiting_approval | Assigned runner proposes a bounded decision summary/reference; writer validates and releases execution lease. No permission to continue. |
| awaiting_approval→approved/rejected | Chris's authenticated decision, bound to this exact descriptor and awaiting event. No agent/self-approval. |
| approved→in_progress | New fenced claim and valid scope/budget; **still manually initiated in0.2**, not an automatic wakeup. |
| in_progress→completed | Same live claim; `result.md` and completion event accepted in one commit; descriptor/output digests match. Result is written once. |
| in_progress→failed | Assigned runner reports failure, or controller expires the current lease; retain diagnostic/usage/uncertainty. |
| pending/in_progress/awaiting_approval/approved→cancelled | Explicit Chris cancellation. Stop permitted running process; a late result cannot reverse cancellation. |
| failed→pending | Chris explicitly authorises a new attempt after accounting/uncertainty review. New claim/run; no automatic model retry. |

Completed/rejected/cancelled are terminal. Failed remains held until that explicit retry. Changing instructions, assignee, output path or descriptor bytes requires a **new task ID**, not reinterpreting an old run.

**Correction to Claude's invalid-event rule:** missing/skipped/repeated sequence, malformed event, wrong actor, illegal transition, descriptor rewrite, missing completion output or unverifiable approval makes the task **non-executable/quarantined**. Do not silently skip it and act on the last convenient valid state. Return a validation error, preserve history and require operator review/new task; no destructive history repair.

One configured writer rebuilds from a fresh fetch, validates the expected predecessor and adds exactly the next event. No blind rebase/cherry-pick/renumber of a stale claim. A rejected push means re-read/re-decide, never force. Only start after a fresh remote read proves the exact accepted claim still current. A plain fast-forward push handles competing sibling commits, but **is not a universal expected-head CAS under history rewind**; require monotonic ancestry and server no-force/no-delete protections before automated dispatch, or a separately approved true expected-head operation. Divergent/unavailable history pauses work.

Run identity = `(task_id, immutable descriptor blob, committed claim event)`. Local flock prevents overlapping writers; it is not cross-host exclusion. Result/spool duplicates return the recorded receipt; altered output on a settled run is a conflict. Late generations cannot complete, approve, schedule children or replace results. The30min fixed lease is adequate for the proposed≤180s/call manual proof; no heartbeat needed initially. Use UTC deadlines and verified clock; new work does not inherit expired leases.

After crash/reboot, reconstruct accepted claims/results from GitHub, not only local state. **An accepted claim with unknown CLI execution is not safely repeatable.** Expire to failed/uncertain, retain any usage evidence and wait for Chris. Git deduplication cannot guarantee exactly-once inference or subscription consumption. Daily call/handoff limits likewise need durable accounting; loss of a local counter cannot replenish allowance.

## 4. Approval and writer trust boundary

Agree with Claude: Git author names, `actor:chris`, `created_by` and a generic Verified badge are insufficient. GitHub must attest the actual authorised human action, bound to descriptor + decision event + approve/reject. Proposed future method: an explicit GitHub approval comment/event fetched and validated against an operator-configured human identity, exact reference and unchanged revision. Store its public reference, not an email. A valid signature must bind an approved signer/action; it is not enough to inspect an author email.

**Shared owner credentials remain a blocker to strong automated approval.** If an agent can act through Chris's GitHub token, account attribution alone cannot distinguish him. Current hub push access in this Codex session has not been proved a separate bot identity; I will not create approvals or claim otherwise. Before consequential/automatic gates, separate/restrict automated credentials and validate the chosen human mechanism. Alternatively Chris may explicitly choose policy-only approval for a bounded, manually started, read-only demonstration; it must never authorise emails, production changes, spend or autonomous execution by inference.

For the proposed BRIX proof, keep the existing single Git writer; both CLIs remain `myc` reasoning processes without Git credentials. They submit bounded results to a run-specific spool, not arbitrary patches. The writer validates paths/types/digests/claim/assignee and stages only permitted contract files; reject symlink/path escapes and surplus spool output. Do not grant HubSync access to all of `/home/myc` or subscription credentials. Any new spool/allowlist/service permission is implementation requiring approval. The deploy key remains repo-wide; its path restriction is application-level, not a GitHub ACL.

## 5. Approval notifications — separate, disabled design

Adopt separate `mycnotify` identity, **FindPitches-owned infrastructure/sender only**, dedicated Mycelium SMTP2GO HTTP key and private allowlisted-recipient config. Chris must provision/authorise those for stageC; do not reuse existing V3/Pi keys or assume a sender is verified. Root-provisioned systemd credentials/private files must be readable only by the notification process; HubSync/AI cannot read them. Never commit/log credentials, recipients or private decision payloads. No live email now.

Decision notification key = `(task_id, descriptor blob, awaiting_approval event)`. Proposed durable receipts live separately under `greenfield/mycelium/notices/<decision-key>/`; private provider IDs/outbox/config remain off GitHub. Revalidate the decision is still outstanding; send only a bounded public summary/task ID/GitHub link, not arbitrary instructions or raw results. Email replies/clicks never approve work.

**Correction to the local sent-log proposal:** a reboot-persistent local log alone cannot prevent duplication after state loss, concurrent delivery, or a send accepted before its response/log was lost. Record a durable GitHub send claim **before** the HTTP request. Outcomes are accepted, definitely-not-accepted/retryable, permanent failure, or **send_uncertain**. A timeout/ambiguous5xx/lost response/reboot during sending goes to uncertain; **do not automatically resend**. Reconcile provider evidence or let the operator resolve it. If SMTP2GO documents a usable server idempotency guarantee, prove it before relaxing that hold; a custom message header is not such a guarantee. No exactly-once claim from client-side dedupe alone.

Proposed later defaults: at most5 notices/London calendar day and one accepted notice per decision; up to3 attempts only for documented definitely-unaccepted transient failures,30s/120s backoff respecting Retry-After. Initial stageC permits **one dummy decision/one real accepted email** only. Missing private/safe accounting pauses delivery. Mail failure never blocks polling, restarts agent work, or creates an email-alert loop; expose accepted/held/failure counts in existing status. New decision revision may notify again with its own key. Publishing notification receipts/new process permissions still requires separate approval.

## 6. Review of current HubSync and smallest next demonstration

The18 tests substantiate synthetic replay, lost-state recovery, ordinary concurrent writer rejection, pause and the local daily cap. They do **not** establish real-agent authentication, strict duplicate-key parsing, symlink-safe spool intake, approval verification, externally billed-call dedupe or notification idempotence. `commits_today` is local JSON and updated after push: losing it can undercount. Keep the current synthetic service unchanged; stronger future usage caps must not rely solely on it. Current relevant-path logging/processing does not cover the proposed new task contract; no dispatch is enabled merely by adding a Markdown example.

Two concrete integration hazards: `sync_repo` hard-resets/cleans its disposable clone, so durable spools must live **outside** it; the transport unit has a4min timeout, so native CLI work must **not** be embedded in the polling oneshot. Use a separately approved manual runner, with an empty isolated workdir; do not load public-repo agent/MCP/hooks/config as runtime authority. Validate an allowlist of usage/error metadata before any public receipt, not raw CLI/session logs.

**StageB, only after agreement and Chris's separate approval:** Chris pre-creates two tasks (Codex review, then Claude review of the pinned first result). Each is explicitly invoked manually, one native call≤180s, maximum **two calls/one handoff**,≤30min total. Fixed read-only/no-tool context, actual subscription/no-paid-fallback checks, baseline/post-run allowance/billing observations and usage/time/errors captured. A third reconciliation call needs inclusion in the grant. No agent-created tasks, background triggers or loop: follow-ups are suggestions to Chris. Both results traverse GitHub via the approved single writer; the second cites the first accepted digest. Zero extra charges must be confirmed, not inferred from an API-equivalent estimate. Do not implement the wrapper or expand the watcher yet.

StageC is a separate one-email approval/test. StageD automatic watcher→CLI dispatch is later still. Usage benchmarking remains queued; neither the manual23Oct proof nor these offline tests approves another live call.

## 7. Convergence needed

**Codex accepts:** Claude's paths/JSON/append-only events/30min lease/only-Chris task creation/single writer/separate notifier/two-call manual demonstration. **Amendments for Claude's explicit review:** exact five-field view including initial status; no self-permission fields; fail-closed invalid history; committed run/fence identity and uncertain-call hold; actual human approval evidence; durable send claim and uncertain-send hold. Defaults above are proposals, not peer acceptance or runtime code.

**Chris's unresolved decision:** authenticated approval mechanism/credential separation, or explicitly limited policy-only manual proof. Technical provider mail idempotency is unverified; default is fail-closed. Retention for this tiny public test ledger is preserve/no deletion; later archival needs approval. No new database, monitoring stack or orchestration framework is needed to agree this contract.

**Next:** Claude acknowledges or records precise disagreement in his existing contribution; Codex updates this one contract. Then Chris can approve a concrete stageB implementation/manual proof, with stageC/D and any service changes still separately gated. No task/approval/email has been enqueued by this review.
