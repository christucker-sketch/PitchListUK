> **SCOPE 1 DONE — 29 OCT 2026 (Claude):** [receipt](../greenfield/docs/mycelium/STAGE_ONE_SETUP_RECEIPT_2026-10-29.md).
> - myc-gate v3 installed.
> - Bridge installed at `13503084`.
> - `mycelium_bridge_fpd_r2` verified least-privilege (boundary + WHOAMI OK).
> - Seed `b2339ae1…` written; snapshot `b9f19aa5…` sealed; batch `stage-one-proof-1` PREPARED.
> - The first login was closed by the fail-closed path; zero model calls.
>
> The two digest-pinned proof descriptors (`MYC-20261029-001` claude, `-002` codex) are committed here. **Next: Codex** reviews revision 2b, the receipts and the descriptors at this commit (Y). **Then Chris** approves scope 2 (two calls).

> **EXECUTION CHECKPOINT — 29 OCT 2026 (Claude): scope 1 STOPPED safely at the PC create step; revision 2b needs Codex review and Chris's re-approval.**
> - **What happened:** the live create at `d2d28c06` refused its own login. Neon's PostgreSQL 16+ automatic creator grant (`neondb_owner` ADMIN-only on the new role) was rejected by an over-strict check.
> - **Safe state:** the fail-closed path closed `mycelium_bridge_fpd` (verified NOLOGIN, expired, no membership) and removed the PC copy.
> - **BRIX state:** the gate is presumably upgraded to v3 and the bridge setup presumably done at `d2d28c06` (credential for the old name). Both await Chris's Block 1 output.
> - **Fix (revision 2b):** accept exactly that creator grant; new login `mycelium_bridge_fpd_r2`; teardown removes an empty store.
>
> **Next: Codex** reviews 2b; **then Chris** re-approves scope 1 at the new commit, plus the recovery steps in the handover. Zero model calls so far.

> **OWNER APPROVED — 29 OCT2026: Stage One installation/setup scope1 at `d2d28c06547dcd137b398f0155df46b86b4137a8`.** Chris replied “approved” to the exact final request, including combined-identity and BRIX-only recovery limits. [Grant/handoff](HANDOVERS.md), [signed-off scope](../greenfield/docs/mycelium/STAGE_ONE_FINAL_CODEX_SIGNOFF_2026-10-29.md). **Next actor Claude:** existing Chris-command/log route for checked gate upgrade, isolated persistent install/login, boundary/privilege checks, one seed question and sealed snapshot. **Zero model calls.** No repeated scope approval; no unrelated service/schema/paid changes. Publish receipts, then digest-bound tasks for review and separate scope2 proof approval. Execution pending; this supersedes older next-actor lines below.

> **FINAL CODEX ENGINEERING SIGN-OFF — 29 OCT2026: PASS**, candidate `d2d28c06547dcd137b398f0155df46b86b4137a8`. [Exact scope/evidence](../greenfield/docs/mycelium/STAGE_ONE_FINAL_CODEX_SIGNOFF_2026-10-29.md). **Next actor Chris:** installation/setup scope1 approval, including combined-identity and BRIX-only recovery exceptions. Then Claude executes approved existing script/log route. No model calls in setup; later two-call proof at digest-bound commitY needs separate approval. No live execution confirmed or authorised by this sign-off alone. Older next-actor lines below are historical.

> **LATEST ENGINEERING CHECKPOINT — 29 OCT 2026 (Claude, revision 2a):** Codex `ae32a110` found the architecture suitable and R2–R5 addressed. Revision 2a closes the last R1 path: a missing or malformed `-ValidUntil` now removes the expected copy, with no database write. Owner tests 25/25. **Next actor: Codex**, final confirmation; **then Chris**, approval 1 (install scope, including the two stated limits). Nothing has been executed.

> **LATEST CODEX ASSESSMENT — 29 OCT2026:** revision2 `bd8aeded` is **architecturally suitable for the bounded proof**, with [one small cleanup fix remaining](../greenfield/docs/mycelium/STAGE_ONE_REV2_CODEX_REVIEW_2026-10-29.md). Independent10StageOne+43host checksPASS; R2–R5 addressed. **Next Claude:** move missing-expiry validation inside PC expected-copy cleanup and add regression, update hash/pin. No redesign. Then final Codex confirmation and concrete owner installation approval; proof remains separate. No live action authorised here.

> **LATEST ENGINEERING CHECKPOINT — 29 OCT 2026 (Claude, revision 2; supersedes the checkpoints below):** Codex's source review `95a13b2b` found five defects (R1–R5). All are fixed in the [Stage One proposal, revision 2](../greenfield/docs/mycelium/STAGE_ONE_FINAL_PROPOSAL_2026-10-29.md) §2a:
> - the PC copy is fail-closed;
> - an interrupted run reconciles database-only;
> - every contribution is prepared before any write;
> - verification is field-exact;
> - limit, expiry and membership are enforced on every process.
>
> Tests: rehearsal 43/43, owner 22/22, Stage One 10/10; all suites green. **Next actor: Codex**, to re-review. **Then Chris**, two approvals. Nothing has been executed.

> **LATEST CODEX REVIEW — 29 OCT 2026:** Claude reply `24d3a89e` source/rehearsal reviewed: **CHANGES REQUIRED**, [R1–R5](../greenfield/docs/mycelium/STAGE_ONE_REPLY_CODEX_REVIEW_2026-10-29.md). Independently71 supplied checksPASS; additional failure probes found cleanup, recovery, validation, verification and runtime-guard gaps. **Next Claude:** targeted offline fixes/tests and updated pins; Codex rechecks before concrete owner live approval. No live scope expanded. This supersedes older next-actor lines below.

> **LATEST ENGINEERING CHECKPOINT — 29 OCT 2026 (Claude, supersedes the Codex checkpoint below):** [Stage One final proposal](../greenfield/docs/mycelium/STAGE_ONE_FINAL_PROPOSAL_2026-10-29.md) answers Codex review `84069505` with an offline patch. It replaces Git snapshot publication with a digest-pinned local `memref` (`myc-gate` v3, +33 lines; agent, push contract and fold unchanged). It adds one expiring bridge login, pinned-batch ingestion with exact-batch recovery, and a complete privilege check. All suites are green offline; the host rehearsal passed 35/35. **Next actor: Codex**, to review the source and the rehearsal. **Then Chris**, two approvals (§5). No live call, credential, host or Neon change has been made. Stage Two has not started.

> **LATEST ENGINEERING CHECKPOINT — 29 OCT 2026:** Codex independent Stage One review **CHANGES REQUIRED**, plan at `3b1ab586ac`. [Review](../greenfield/docs/mycelium/STAGE_ONE_CODEX_ENGINEERING_REVIEW_2026-10-29.md). **Next actor Claude:** revise proposal/source offline: pinned local memory attachment alternative, capability separation, verified task/result binding, exact-batch ingestion recovery, complete permission checks. Bridge tests4/4 plus failure reproductions independently run. No new live calls, credentials, host/Neon mutations authorised; obtain approval only after reviewed concrete patch. This checkpoint supersedes older next-actor lines below.

# CURRENT EXECUTION ORDER — Mycelium memory

> **CURRENT OWNER DIRECTION — 29 OCT 2026 (SUPERSEDES OLDER “NEXT ACTOR” LINES):** [Full Mycelium mission directive](../greenfield/docs/mycelium/OWNER_MISSION_DIRECTIVE_2026-10-29.md), committed `f5327fe45d`. **Claude is next actor:** inspect the completed L2 bridge (`1c98e06c`) and existing least-privilege Neon route; prepare a concise, reviewed **Stage One: BRIX-native Neon snapshot + ingestion** plan for owner approval. Do **not** reimplement runner/bridge or assume old trial credentials active. **Stage Two, after separately approved successful proof:** Claude and Codex jointly design and experimentally develop the portable Mycelium brain, initially hosted on `fpd-prod`; FindPitches is its first commercial mission (verified, available vendor pitches, eventual revenue), not a hard-coded limitation on core intelligence. No new calls, credentials, host/service changes, unattended autonomy or production mutations authorised by this directive alone. Historical queue entries below are context, not current instructions.

Updated **28 October 2026**. Authority: Chris's [owner reset directive](../greenfield/docs/mycelium/OWNER_DIRECTIVE_AGENT_RESET_2026-10-25.md), published in `1d7708f3`, and his standing permission for routine hub/source/test work. This is the single live queue; older briefs and historical task headers are reference material.


> **FOUNDING PRODUCT VISION (owner, 27 Oct 2026):** [Mycelium's non-negotiable multidirectional growth principle](../greenfield/docs/mycelium/FOUNDING_VISION_OWNER_DIRECTIVE_2026-10-27.md). The existing task/approval system is only the communications/control layer used by the AIs to build Mycelium, NOT Mycelium itself. Future design must support open-ended branching, probing all promising and unexpected routes, learning, recombination and potentially exponential exploration within resource/safety bounds. Do not reinterpret this vision as prescribed objectives, narrow lanes or a sequential task scheduler. This is a vision clarification, not permission to enable new execution.

> **LATEST OUTCOME — 28 Oct: MYCELIUM NEON MEMORY SETUP COMPLETE.** Approved 001–003 migrations, two NOLOGIN role templates/grants and two-node/one-edge fresh-process persistence proof reported PASS in `884fc0ab`, accepted by Codex. [Completion review](../greenfield/docs/mycelium/NEON_MEMORY_COMPLETION_CODEX_REVIEW_2026-10-28.md). Ledger/hashes/grants match; Neon Auth inventory preserved; write flag removed. No setup work or repeat test pending. Roles remain NOLOGIN; app/BRIX memory integration is future work, not enabled. Existing four-call BRIX collaboration remains complete/grant closed.

> **Codex checkpoint — superseded:** workspace-authentication investigation is closed as a task path. Windows login is sufficient for the planned execution; remote workspace auth is not an engineering blocker. The R1–R4 code fixes and redaction implementation are delivered offline; no Neon SQL has run.

> **NEXT ACTOR — CLAUDE: revised Neon-compatible trial APPROVED.** Chris explicitly approved revision4 at7a49e5781436fce0d9105d0bc4a90898eee35c21. [Grant/pins](HANDOVERS.md), [mandatory concrete PC private-copy gate](../greenfield/docs/mycelium/SHARED_MEMORY_REV4_NEON_ROUTE_CODEX_REVIEW_2026-10-28.md). One SSH/TLS password-copy attempt, exact14rows/6process/300s/zero-model limits, verified PC deletion before hostrun, mandatory scoped owner/host closure. Node already installed; no repeat exact-route/project/Node approval. No live execution confirmed yet, no retries or other scope expansion; Codex reviews receipts next.

## Active objective

**Build the actual Mycelium organism, starting with cloud-backed shared memory**, while retaining the now-proven BRIX CLI collaboration system as its development communications/control layer. The founding vision is open-ended multidirectional exploration, not a sequential task queue. Next concrete engineering: Codex's Neon connection, schema review and read-only migration preparation. Do not switch to unrelated FindPitches growth or communications-layer reinvention.

The bounded manual Codex→GitHub→Claude exchange is already functionally verified. That is a completed proof, not the whole agent-sync system and not permission for an unattended loop. Chris reports unchanged before/after usage; record it as his observation, not a provider billing audit. The original Stage B grant remains consumed. The separately approved MYC-20261027-001 proof below is also complete and consumed; no further call is authorized.

## One live queue — 27 October 2026

**HubSync rev 3 installed/closed. Stage C pinned notification proof complete**, per [host evidence](../greenfield/docs/mycelium/STAGE_C_APPROVAL_NOTIFICATION_PLAN_2026-10-25.md#single-pinned-live-test-passed-26-oct-2026-fpd-prod-run-by-chris-approved-in-0a68eb01) in `b3bc99a7`. Chris separately approved the live test in his Claude session (recorded in `0a68eb01`). Recorded outcome: one received email, two reruns with no send, one attempt log entry, empty hold; returned to dry-run, PIN empty, notification timer inactive. Dummy `MYC-20261026-901` cancelled. Codex checked the durable task/event evidence and recorded host report through GitHub; no direct host or provider audit is claimed. No repeat proof or email is needed.

| State | Owner | Work | Exact next outcome |
|---|---|---|---|
| **COMPLETE / INSTALLED** | Claude / Codex / Chris | Real-task approvals | Host installation recorded in `26cc6694`: check/install passed, hashes pinned, task003 still completed, notifier dry-run clean/no quarantine, timer off, HubSync active. No decision, email or model call. [Evidence](../greenfield/docs/mycelium/REAL_TASK_APPROVAL_PROPOSAL_2026-10-26.md#host-attempt-2-installed-27-oct-2026-0845z-fpd-prod-run-by-chris-approved-codex-pass-on-c91b318a). Do not reinstall or repeat closed proofs. |
| **COMPLETE — GRANT CONSUMED** | Claude / Chris; Codex validation | [Real decision-chain proof](../greenfield/docs/mycelium/REAL_DECISION_CHAIN_PROOF_2026-10-27.md) | MYC-20261027-001 rests approved. Git bindings checked; host evidence records one 3s call, one email/attempt, Chris owner decision, no resume; safe idle restored and proof allowlist archived. No repeat. |
| **NEXT OWNER DIRECTION** | Chris | Next useful agent-sync outcome | Proof is closed; no work in flight. No further model/email, timer enablement, resume or Stage D authorized. Choose the next bounded outcome before another execution. |
| **COMPLETE / INSTALLED** | Claude / Codex / Chris | Runner v6 + reviewed v5.1 orchestrator | Recorded installed in a67433ca with pinned hashes and non-model checks. No reinstall needed. |
| **COMPLETE — SAFE IDLE** | Claude / Codex / Chris | Stage C dry-run install + one pinned live notice | Source `f7b18376` reviewed 30/30 offline; installed; one live proof recorded. Leave MODE=dry-run, PIN empty, timer off. No ongoing live use authorized. |
| **COMPLETE / INSTALLED** | Claude / Codex / Chris | HubSync rev 3 | Leave working watcher running. |
| FUNCTIONAL PROOF COMPLETE | Codex / Claude | Stage B tasks 001/003 | No replay or additional model calls. |
| COMPLETE / INSTALLED | Claude / Codex / Chris | v5.1 terminal-input fix | Installed deliberately with runner v6; no separate release pending. |
| CLOSED | Both | Stage D autonomous AI dispatch | Not authorized. |
| DEFERRED | Respective owners | UK producer growth, Pi/J1900, DHCP and unrelated infrastructure | Existing deployed services continue; no new work in these lanes. |

## Working rules for this phase

- Codex owns this execution register; Claude owns the current HubSync source bundle. Claim/coordinate overlapping edits and preserve peer work. Do not impersonate another agent or infer acknowledgement.
- Read current sections and relevant recent diffs, not entire old conversations/journals. [Fresh Claude brief](CLAUDE_RESTART_BRIEF.md) follows this queue; checkpoint private/uncommitted work before changing chats.
- Agent-sync source/test fixes are authorized reversible preparation. New host commands require a reviewed concrete plan and the retained explicit go-ahead. Do not request that go-ahead on a failing or incomplete plan.
- Routine authorised hub reads/writes and offline engineering need no repeated project approval. Actual client/sandbox controls still apply; do not bypass them or conflate them with a new project gate. Codex's observed GitHub prompt mechanism is recorded in [own status](agents/CODEX.md).
- Genuine service incidents may be triaged under existing authority and reported separately; that does not restart deferred growth engineering.
- Existing five-minute HubSync remains a non-AI watcher. Do not enable automated AI dispatch, email/Stage C/D or new paid services under the consumed manual proof.
- Preserve original task/source evidence and identity. V2/PitchList and existing approved FindPitches customer service remain protected. No production cutover/publication changes, infrastructure deletion, paid acquisition or protected-branch merge.
- Latest93941d00 is already on GitHub. Do not repeat stale PC cleanup/push instructions for that commit. Windows local line-ending claims have not been verified by Codex.

**Current outcome:** installed decision chain demonstrated end to end; proof accepted and closed, grant consumed. Notification remains dry-run/PIN empty/timer off; no resume. **Next:** Chris chooses the next useful agent-sync outcome. No new live action or additional proof is implied.