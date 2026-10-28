# Owner-authorised collaboration: Mycelium memory schema (28 October 2026)

**Chris authorised initiating a real Claude↔Codex collaboration through the existing GitHub communications layer.** This is collaboration to build Mycelium, not proof that autonomous dispatch has been authorised. Source/planning/offline tests are authorised; no model-call allowance, CLI execution grant, notifier activation, remote SQL or deployment is inferred. To use the BRIX runner, present the precise bounded run (identities, call count, duration and task IDs) for separate approval before invoking it.

## Product direction — non-negotiable
Read [founding vision](FOUNDING_VISION_OWNER_DIRECTIVE_2026-10-27.md). Mycelium is an open-ended, multidirectional, expanding exploration network, capable of discovering unexpected connections, spawning branches, revisiting failures and learning across distant explorations. The infrastructure already built is only its communications/control layer. Do not reduce memory to a fixed tree, project workflow, objective-specific schema or ticket queue.

## Existing foundation
- Repository: `christucker-sketch/PitchListUK`, branch `findpitches-v3/greenfield`.
- Memory package: `greenfield/mycelium/memory/`, prepared in `db05aa5c`. Nodes + directed edges; unconstrained kinds and relations; JSONB attributes/provenance; local PGlite tests passed. No Neon migration yet.
- Neon status: [28 October handover](NEON_MEMORY_STATUS_HANDOFF_2026-10-28.md). Existing dedicated project and free plan reported by Chris, but connection/link and remote schema writes are pending. Do not touch Neon for this review.

## Actual two-agent collaboration, not two isolated reports
**Claude starts an independent exploratory critique** of the current schema, thinking especially about how radically branching discoveries, unexpected cross-links, counterevidence, learning, recombination, ageing and retrieval can be represented without fixed objectives. Record a concise concrete proposal, edge cases and a few test scenarios in a new memory collaboration document; clearly distinguish essential storage capabilities from speculative add-ons.

**Codex independently examines the implementation**, PostgreSQL practicality, identity/integrity, concurrency, provenance, evolution and indexes. Then read and *respond to Claude's specific findings*, noting agreements/disagreements with evidence, and update proposed SQL/tests offline where useful. Keep the initial minimal schema unless a concrete capability is missing.

**Claude reviews Codex's actual response/change** and either accepts it or identifies a specific reproducible gap; Codex may make one targeted correction. Both must publish their own acknowledgements to the hub. Preserve other agent's commits and do not impersonate their review.

**Measure success by meaningful cross-pollination**, not message count: a joint, versioned memory design; examples showing branch-out, many-parent merging, contradictions, cycles, failure retention and rediscovery; maintained offline test results; and a record of what changed because of peer insight. They may explore unexpected directions in design without any preset taxonomy or exploration lane.

## Trust and stop boundaries
- Use GitHub connector where exposed; the hub is the exchange channel, not Chris manually pasting between agents.
- No GitHub branch switches, no unrelated FindPitches/V3 source changes, no BRIX/Pi modifications.
- No Neon `deploy`, migration, connection-secret access or remote SQL, no paid service, no automatic dispatch or unattended model loop.
- The **existing authorised scope is repository collaboration and offline engineering only**. Since current BRIX model-call grants are consumed, do not create an executable task or call Claude/Codex CLI until Chris approves explicit limits. A prepared handoff is not an executable grant.
- Do not ask Chris to relay routine comments. If agents cannot independently read the hub, state the precise access problem and stop instead of falsely reporting collaboration.

## Outcome / owner gate
When both agents have actually exchanged and assessed each other's findings, publish one short joint result: what design was improved, unresolved trade-offs, tests run, and the minimum next storage step. Stop before cloud writes or any new host execution. No further rounds of review for their own sake.

**First actor: Claude. Peer actor: Codex. Coordinator: Quinn.**
