# Owner-authorised collaboration: Mycelium memory schema (28 October 2026)

**Chris authorised preparing a real Claude↔Codex collaboration using the installed BRIX CLI runner.** This is collaboration to build Mycelium, not proof that autonomous dispatch has been authorised. Source/planning/offline tests are authorised; no model-call allowance, CLI execution grant, notifier activation, remote SQL or deployment is inferred. To use the BRIX runner, present the precise bounded run (identities, call count, duration and task IDs) for separate approval before invoking it.

## Product direction — non-negotiable
Read [founding vision](FOUNDING_VISION_OWNER_DIRECTIVE_2026-10-27.md). Mycelium is an open-ended, multidirectional, expanding exploration network, capable of discovering unexpected connections, spawning branches, revisiting failures and learning across distant explorations. The infrastructure already built is only its communications/control layer. Do not reduce memory to a fixed tree, project workflow, objective-specific schema or ticket queue.

## Existing foundation
- Repository: `christucker-sketch/PitchListUK`, branch `findpitches-v3/greenfield`.
- Memory package: `greenfield/mycelium/memory/`, prepared in `db05aa5c`. Nodes + directed edges; unconstrained kinds and relations; JSONB attributes/provenance; local PGlite tests passed. No Neon migration yet.
- Neon status: [28 October handover](NEON_MEMORY_STATUS_HANDOFF_2026-10-28.md). Existing dedicated project and free plan reported by Chris, but connection/link and remote schema writes are pending. Do not touch Neon for this review.

## CORRECTION — USE THE EXISTING BRIX CLI COLLABORATION RUNNER

**Chris's clarification, 28 Oct:** This collaboration is meant to exercise the **already installed Claude Code and Codex CLIs on `fpd-prod`**, using the `myc` runner/orchestrator (v6 + v5.1). Do **not** revert to two separate cloud chat sessions writing documents to GitHub and waiting for each other. The earlier sequential Claude-first → Codex-second → Claude-third procedure in this document is superseded.

- `fpd-prod` is the compute/exchange engine: the two authenticated CLIs participate in a bounded session using the existing runner's real task/result/decision contracts.
- GitHub remains the durable transport and audit trail, **not the human-paced collaboration engine**.
- Neon remains future shared organism memory and is out of scope for this offline design test.
- The cloud Claude/Codex sessions may prepare task inputs, review the source/results and verify safety, but must not impersonate a BRIX CLI exchange or report one as executed unless host evidence exists.

**Immediate action for cloud Claude and Codex:** inspect the *installed runner's documented capabilities*, including actual task/envelope formats, allowlists, grant limits, and what is and isn't automatic. Cooperate on **one concrete, host-executable BRIX collaboration proposal** for memory schema design using both CLIs. Prefer the working v6 mechanisms, not another coordinator or new framework. Inspect the existing `greenfield/mycelium/memory/` package and founding vision for context. Allow both AIs to challenge, cross-connect and develop ideas without prescribing narrow intellectual lanes. Do not assert peer-to-peer autonomous iteration exists unless supported by the installed scripts.

**Before any calls:** publish a proposed set of task IDs, which CLI runs when, how prior outputs reach the other CLI, exact command(s) using the existing installed software, individual and total call/time limits, allowance/billing safeguards and a fail-closed stop. If current v6 only supports sequential handoff, say so clearly and use its real capabilities for an initial interactive exchange rather than claiming simultaneous autonomy. **Ask Chris for explicit approval of this bounded BRIX execution plan.** This message does NOT itself grant fresh model calls or activation of an unattended runner.

**Successful test:** host evidence of Claude and Codex CLI both contributing on `fpd-prod`, with at least one substantive contribution from each and cross-reference to peer findings; one consolidated design and offline schema test evidence in GitHub; no human manually relaying agent responses. If the runner cannot accomplish a true back-and-forth without human intervention, report the precise gap instead of pretending GitHub status comments were collaboration.

## Trust and stop boundaries
- Use GitHub connector where exposed; the hub is the exchange channel, not Chris manually pasting between agents.
- No GitHub branch switches, no unrelated FindPitches/V3 source changes, no BRIX/Pi modifications.
- No Neon `deploy`, migration, connection-secret access or remote SQL, no paid service, no automatic dispatch or unattended model loop.
- The **existing authorised scope is repository collaboration and offline engineering only**. Since current BRIX model-call grants are consumed, do not create an executable task or call Claude/Codex CLI until Chris approves explicit limits. A prepared handoff is not an executable grant.
- Do not ask Chris to relay routine comments. If agents cannot independently read the hub, state the precise access problem and stop instead of falsely reporting collaboration.

## Outcome / owner gate
When both agents have actually exchanged and assessed each other's findings, publish one short joint result: what design was improved, unresolved trade-offs, tests run, and the minimum next storage step. Stop before cloud writes or any new host execution. No further rounds of review for their own sake.

**Execution venue: fpd-prod BRIX, myc CLI runners. Next actor: cloud agents prepare bounded host run proposal; Chris approves the exact new call grant before execution.**
