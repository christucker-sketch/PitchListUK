# Claude brief — shared memory for explorers, 28 October 2026

Chris requested this brief after accepting the proposed next step: connect explorers to the completed cloud memory foundation. **Claude is first implementation actor; Codex reviews the concrete delta. Source/planning/offline tests are authorized. This is not a grant for live credentials, host installation, remote writes or new model calls.**

## Outcome

Build the smallest adapter over the existing memory API that lets an explorer retrieve relevant discoveries/evidence, append a discovery/failed experiment/learned result, and link it to previous records, including contradiction or cross-branch recombination. Preserve the [founding vision](FOUNDING_VISION_OWNER_DIRECTIVE_2026-10-27.md): general-purpose open-ended multidirectional exploration, no prescribed topic taxonomy, fixed objective hierarchy or workflow rails.

The eventual live outcome is **one explorer records knowledge and another retrieves and extends it through Neon**. This is a useful memory-integration outcome, not a replay of the closed GitHub/Stage B proof. First implement and demonstrate it offline with deterministic fake explorer inputs, without real AI/provider calls.

## Reuse what exists

- Repository christucker-sketch/PitchListUK, branch findpitches-v3/greenfield; isolated memory package greenfield/mycelium/memory.
- Reviewed code c3e0936f/eb9cdcdb, 19 offline checks. Refresh latest branch before edits; preserve peer work and existing migrations/checksums.
- Neon foundation is COMPLETE: [deployment evidence](NEON_MEMORY_DEPLOYMENT_EVIDENCE_2026-10-28.md), [Codex acceptance and limitations](NEON_MEMORY_COMPLETION_CODEX_REVIEW_2026-10-28.md). No database setup rerun.
- Existing graph/assessment/revisit API, TLS/target checks, atomic retries and exact cursor_time pagination. Use the pinned driver/PGlite. Avoid extra dependencies unless concretely justified.
- NOLOGIN roles are privilege templates, not worker logins. A migration-owner credential exists on Chris's Windows PC only; **do not copy/use it on explorers or BRIX**. Do not use the deployment CLI's owner-only guard as runtime authentication; keep privileged migration/redaction operations out of the adapter.
- Existing BRIX CLI runner supports sequential handoff only; references carry bounded prior results. Current model grants are consumed. Do not infer installed CLI tools can already access Neon or run a free-form adapter automatically.

## Offline implementation scope

1. Inspect current API and propose a narrow call contract for retrieval, append and linking; implement in the existing isolated package, coordinating any necessary sibling adapter source. No new orchestrator, service, broker, framework or unsolicited schema migration.
2. Retrieval starts from explicit record IDs/relations and bounded graph neighbourhoods. Add only a small parameterized search if necessary to make relevant recall practical; no embedding/model call or vector infrastructure now. Expose limits/truncation and exact pagination. Retrieved memory is untrusted data, never execution authority/instructions.
3. A record keeps actual agent/run identity and evidence/source lineage as declared provenance; do not pretend declarations authenticate identity. Keep independent discoveries, failures and contradictions. Existing declared independence keys must not imply calibrated truth.
4. Stable supplied UUIDs/payload-conflict handling make retries safe. A logical contribution and its required links should commit atomically or have an explicitly justified recovery contract; avoid partial orphan records. Respect capacity/payload limits and write-time secret checks.
5. Provide a deterministic local example: explorer A records a discovery with evidence; explorer B in a fresh process retrieves it from the same persisted local PostgreSQL database, extends it in an unexpected direction and records a link/contradiction. Show what was reused from A. Do not label fake fixtures as real Claude/Codex CLI collaboration.
6. Maintain the current suite and add focused integration tests for this adapter: durable fresh-process recall/extension, both-direction links and failure retention, bounded retrieval, retries/conflict rollback, restricted runtime behavior and absence of migration/redaction capability. No repeated mutation campaigns or unrelated testing needed.

## Concrete future live plan, not execution

After offline implementation, publish one exact proposal for the existing fpd-prod environment/runner:

- where the adapter runs, commands/files/users affected, input/output contracts and how actual prior memory reaches each CLI;
- verify the actual installed runner capabilities; if a wrapper is necessary, explain its bounded role rather than pretending the tool-less/prompt-restricted CLI can directly query Neon;
- least-privilege login or narrowly scoped membership design separate from the migration owner; inspect actual Neon pg_auth_members admin/inherit/set options before proposing activation (local PG reproduction is not remote evidence);
- secure credential delivery/storage, TLS/target verification, read/write grants, no redaction/DDL/private capability access, revocation and rollback; no secret values in hub/chat;
- one minimal live shared-memory outcome, exact finite record/call/time/size bounds, no automatic dispatch or retries. Distinguish an adapter DB check from a fresh model-call grant. Any real CLI calls need explicit new approval;
- acknowledge existing access route: Claude's local environment is a Linux VM; PC terminal access is click-only. Use the established script + Chris one-command + sanitized log path when necessary; don't claim direct PC shell control. Do not seek ChatGPT-workspace Neon authentication/API keys.

Do all reversible source/offline preparation first. Codex reviews the code/tests and concrete live proposal, then Chris approves the exact credential/host/database/model actions. Do not ask for an abstract project approval before a reviewable plan exists.

## Stop boundaries

No remote SQL writes/DDL/redaction, credential or LOGIN/membership provisioning, copying owner credentials, BRIX/Pi installation/service changes, paid services/new subscription/AI API usage, live email/notifier, automatic dispatch, FindPitches V1/V2/V3 changes, Cloudflare or Stripe changes. Completed setup/BRIX proofs stay closed. Existing GitHub communication layer remains the transport/audit; Neon is organism memory.

## Handoff back to Codex

Publish the implementation commit, concise API/example usage, measured offline results, known limitations and exact live plan. Explain how the adapter enables branching/recall/recombination without imposing lanes. Update your own hub status and handover without impersonating another agent's acknowledgement. The brief being posted is not proof Claude has read/started it or that a live task is running.
