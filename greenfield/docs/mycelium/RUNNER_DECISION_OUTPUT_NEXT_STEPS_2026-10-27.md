# Next delivery — runner decision output (27 October 2026)

Authority: Chris in this Codex session: **“ok check in the hub and lets plan next steps. I want this moving now.”** Active objective remains working Mycelium agent synchronisation. This starts bounded source/offline engineering now; no extra project approval is required for it.

## Starting point and precise gap

Latest hub inspected: `35c70422`; real-task approval installation recorded in `26cc6694`. Installed myc-gate accepts bounded decision.md, myc-decide records a root-confirmed owner decision, and mycnotify reads real tasks with the shared validator. Notification remains dry-run with timer off. Stage B collaboration and Stage C pinned-mail proof are complete; no rerun.

Current repository myc-agent still copies every successful CLI response to result.md. It never writes decision.md. Repository runner/orchestrator include reviewed v5.1 input detachment, but fpd-prod still has v5. Keep that distinction explicit when producing a release candidate.

## Deliver now — Claude owns source; Codex reviews

**Claude: implement the minimum runner output change and offline verification in one reviewable commit.** Publish code, pinned hashes, concise evidence and checked upgrade/rollback proposal together; do not add another framework or a plan-only review round.

1. Define an explicit, bounded distinction between ordinary result and decision request in the model's final answer. Choose and document one unambiguous output contract, not a free-text keyword heuristic. Treat provider transport JSON separately from the task's output envelope. Preserve the existing five-field task descriptor. Keep legacy result tasks working; if opt-in is necessary, make its authority explicit in the existing root-controlled admission/job path.
2. Runner emits **exactly one** regular output file: result.md or decision.md. Never both. For a decision, apply the existing writer contract: input <=1024 bytes; flattened nonempty plain UTF-8 summary <=400 bytes; no disallowed control bytes or credential-like material. The writer remains the final publication validator; untrusted model output cannot record approval or execute work.
3. Keep one-time admission/start, subscription-only billing guard, hard call/publication deadlines, no automatic retries and input detachment. Review the minimum v5-to-v5.1 dependency needed for the touched runner/orchestrator; do not silently deploy the parked bundle or change unrelated runtime files.
4. Reuse existing myc-gate, myc-decide, notifier and fixtures. No new service, scheduler, agent framework, credentials or task schema unless a concrete incompatibility is demonstrated.

## Offline acceptance — complete before host approval

Use temporary local bare Git, fake Codex/Claude CLIs, fake curl and the existing pseudo-terminal owner-wrapper fixture. No real CLI model/auth test, external network, SMTP2GO request or paid API.

| Case | Required outcome |
| --- | --- |
| Ordinary final answer, both providers | Existing result publication remains valid |
| Explicit decision output, both providers | Only decision.md; gate publishes awaiting_approval bound to the claim/run |
| Notification selection | Exact request selected; dry-run/fake transport only; existing pin/deduplication unchanged |
| Owner records approve or reject | Root-record fixture matches the published decision; absent/forged/mismatched records quarantine |
| Approval and rejection resting state | No claim, resume, second model call or automatic execution |
| Invalid/ambiguous output | Empty, oversized, malformed, mixed result+decision, control/credential-like, symlink and transport-error cases fail closed |
| Replays/failures | Repeated complete/notification/decision processing cannot duplicate a result, mail or call; uncertainty remains held |
| Regression | Existing affected runner/Stage B, decision, notifier and validator-parity checks pass; maintain hashes |

Do not repeat unrelated HubSync suites without a change or concrete concern. State exactly what ran; do not claim a host/provider audit from local fixtures.

## Owner decisions after review — prepare, do not execute

**First:** Codex checks the patch once, reruns affected offline suites and publishes PASS/FAIL plus concrete correction if needed.

**Then:** present Chris with one pinned host upgrade proposal and exact commands, preserving current installed myc-gate/mycnotify/myc-decide and receipts. Preconditions must use actual installed v5 runner/orchestrator hashes and real receipt formatting. Supply check/install/rollback, verified backups, relevant locks, post-checks and truthful incomplete-recovery reporting. No model call in installer/post-checks, no notification timer or live mode change.

Host deployment requires Chris's explicit approval of that concrete reviewed candidate. Existing infrastructure-install approvals do not authorize a new runner deployment.

**Only if a real proof is later needed:** separately propose one named read-only task, exact agent/descriptor/reference pins, maximum one call, explicit wall-clock/no-retry/£0 guard, and a separately pinned notification if email is desired. Do not create/run a task, replenish the consumed Stage B grant or send another email under this plan. Offline integration comes first; no additional model proof is authorized now.

## Handoff and stop condition

Claude publishes the implementation + evidence + upgrade candidate; Codex reviews the delta. One short current status each: relevant commit, result/blocker, exact next actor/action, approval needed. Source/offline work proceeds; stop for owner approval only when there is a concrete host candidate or a genuinely new gated action.

No UK discovery, production/Pi/J1900 changes, key changes, automatic resume, Stage D or new architectural exercise.
