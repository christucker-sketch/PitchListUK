# MYCELIUM — OWNER MISSION DIRECTIVE
**29 October 2026 | Owner-approved direction | Execution remains approval-gated**

**Initial commercial mission:** FindPitches. **Development lead:** Claude. **Equal design/engineering collaborator:** Codex. **Initial brain host:** `fpd-prod` BRIX. **Memory:** existing Neon PostgreSQL `mycelium_memory`. **Coordination:** established GitHub hub and installed BRIX collaboration runner.

## 1. Founding intent
The [founding vision](FOUNDING_VISION_OWNER_DIRECTIVE_2026-10-27.md) remains authoritative: Mycelium is intended as an open-ended, branching, adaptive exploratory intelligence network. It should derive promising investigations from accumulated discoveries; challenge, combine and revisit hypotheses; preserve failures, evidence, uncertainty and disagreements; and improve its research choices through experience.

Do **not** substitute a task scheduler, collaboration platform, central ticket queue or fixed search pipeline for the organism. The existing runner, approval gates, handovers and memory bridge are the infrastructure used to **build** the organism; they are not its brain.

The ambition is general-purpose capability, but deployment authority and near-term research subject matter are narrower.

## 2. Business purpose: FindPitches first
The first application must make FindPitches commercially stronger: build and maintain a large, international, accurate, **currently actionable** repository of vendor pitches and trading opportunities ultimately suitable for paid customer access. Relevant opportunities include markets, street-food pitches, festivals, fairs, events, venue programmes and recurring or public-sector vendor opportunities.

Investigate through organiser, event, venue, council, location, date and application-route relationships; find non-obvious leads existing discovery methods miss; validate authoritative sources, eligibility, contact/application routes, availability and deadlines; deduplicate; revisit reopened or changed opportunities. Respect uncertainty and do not present an event as a vendor opportunity without evidence.

Measure **incremental verified and actionable opportunities**, breadth and freshness, false positives, duplicates, completeness, discovery cost per usable opportunity, and ultimately customer willingness to pay and revenue relative to operating cost. Raw candidate counts, graph size and call counts are not success.

Initial exploration and any live web research must stay relevant to FindPitches. Cancer cures, quantum research and other unrelated subjects are not in scope without fresh owner permission.

**FindPitches is the first mission, not permanent hard-coded brain architecture.** Mycelium's reasoning, memory and exploration mechanisms must be domain-independent; opportunity-specific validation, tools, outputs and integration should be replaceable domain adapters. Mycelium might later be a product itself, but do not prebuild a speculative SaaS platform, public API or billing system.

Existing FindPitches infrastructure must first be assessed, then extended or integrated only through separately approved, non-disruptive interfaces. Do not publish listings, touch production records, contact organisers/customers, buy services or change pricing without distinct authorisation.

## 3. Established baseline — do not rebuild
On `findpitches-v3/greenfield`, refer to:
- Founding vision named above.
- Live L2 proof commit `1c98e06cb9095a2b7e05e8cdb19924d2e14be5c9` and `SHARED_MEMORY_ADAPTER_DELIVERY_2026-10-28.md`.
- `greenfield/mycelium/memory/`: migrations, integrity and redaction controls, explorer adapter, bridge, tests, grants and current database documentation.
- Existing `fpd-prod` Claude Code/Codex CLI installations, pinned bounded runner, task claims/results and GitHub handovers.

The L2 proof showed two real BRIX CLI calls (005, 006) consuming a live Neon-derived snapshot, with Claude challenging an earlier claim, Codex refining Claude, and both validated contributions added to Neon with 2 nodes, 7 edges and 1 assessment. This is real success, but bounded and sequential. It is not an autonomous engine. Prior live synthetic explorer trials also validated separate-process persistence. Do not rerun successful proofs simply to recreate evidence.

## 4. Where the brain lives
**Initial implementation target: `fpd-prod` (Gigabyte BRIX).** Build a lightweight, portable *engine* there. Claude and Codex are external reasoning capabilities it can invoke under approved rules; neither CLI is itself the brain. Neon is durable shared knowledge, not the brain. GitHub is the development/coordination hub, not its thought process.

The engine should eventually decide what deserves investigation, create branches, evaluate and challenge evidence, revisit old hypotheses, connect unrelated knowledge, select reasoning tools and allocate finite resources. Keep the executable engine separable from models, storage and commercial domain adapters.

Persist durable operational state (pending investigations, claims, state transitions and recovery metadata) safely; critically evaluate whether it belongs in a suitable isolated portion of the existing Neon arrangement. Do not invent another database without a clear need and owner approval.

The design must survive loss of `fpd-prod`: it should restart elsewhere from durable state without duplicate writes or lost history. The second BRIX or Pi may be useful later; neither is a mandatory initial dependency. Hal is outside this project; do not place workloads there. No new paid services, Kubernetes, distributed cluster or cloud compute without a demonstrated requirement and explicit approval.

Claude and Codex may challenge this *initial* deployment recommendation in their design; changing it requires owner review of cost, risk and consequences.

## 5. Stage One — make the BRIX own its Neon memory bridge
**This is the immediate engineering priority, before brain execution.**

The L2 bridge used Chris's Windows PC for Neon snapshot and ingestion. Move these operations to `fpd-prod` so the installed CLIs can retrieve and persist shared memory directly without Windows in the operational path.

- Inspect the exact current runner, bridge, restricted explorer roles, Neon grants, credentials, provisioning and trial closure records before choosing a route. A past restricted trial account (including `mycelium_explorer_fpd_r5`) is **not** automatically a reusable credential; verify status/ownership, rotation and least privilege. Do not assume it is active.
- Use an authenticated, dedicated restricted database principal. **Never place `neondb_owner`, migration-owner or redaction privileges on BRIX or inside agent contexts.** Avoid password material in task text, GitHub, console receipts or model prompts.
- Preserve read-only recall, untrusted-data fencing, strict validated append-only ingestion, declared provenance, relationships, deterministic IDs, retry/idempotency guards, and explicit credential and model-output isolation. Restrict SQL operations by capability and privilege.
- Reuse the existing bridge and bounded task execution. Avoid new transport/control systems, sidecars or schedulers.
- Host configuration, new role/password creation/rotation, access-rule changes and live tests need an exact reviewed proposal and separate owner approval. Do not disrupt unrelated BRIX/Pi/FindPitches services.

**Stage One success proof:** On BRIX, with only least-privilege credentials and *no Windows participation*, Claude and Codex consume real Neon memory, exchange substantive findings, validate and append linked contributions, and a fresh process retrieves the new nodes and edges. Show role restrictions, idempotent retries, usage receipts, stop/cleanup evidence and that no owner credentials or uncontrolled changes were used. This is a **bounded, separately authorised** experiment, not a licence for an unattended loop.

**First deliverable now:** a short practical Stage One plan, with inspected reality, minimal diff, threat/privilege model, test criteria, recovery/stop procedure and the precise approval needed. Don't substitute a 40-page report for a working plan.

## 6. Stage Two — collaborative design of the brain
**After Stage One proof and a new owner-approved execution allowance:** use the *working* BRIX/Neon collaboration system for Claude and Codex to jointly design, challenge, prototype and test Mycelium's own exploration engine. Both agents must participate substantively, not Claude writing a complete answer and Codex rubber-stamping it.

Design should investigate mechanisms for:
- Spontaneously proposing promising, surprising or contradictory investigations from the knowledge graph.
- Multidirectional branching, cross-branch recombination and non-obvious relationship discovery.
- Differentiating evidence, hypotheses, model conjecture, provenance and uncertain or conflicting conclusions.
- Revisit/recovery triggers for old branches, failures, stale findings and changed circumstances.
- Selecting research/model capabilities, deciding what deserves attention, and avoiding repeated low-yield cycles.
- Learning from measured outcomes, preserving dissenting architectures and hypotheses when evidence is insufficient.
- Domain adapters for an initial FindPitches objective without hard-coding street-food logic into the brain.
- Bounded autonomy and safe recovery that do not mistake a sequential queue for emergent exploration.

Treat this as an open-ended **research and implementation programme**, not a fixed 12-turn answer or premature consensus. Record competing hypotheses, critiques, evidence, failed experiments, prototypes and revisions as linked memory, and use remembered knowledge across multiple sessions. The agents may propose their own investigations but cannot silently execute unapproved calls or external actions.

Deliver concrete, falsifiable mechanisms and a smallest meaningful working prototype. Compare knowledge-enabled, exploratory decisions with sensible baselines; look for genuine new useful directions, correction of mistakes, reuse of previous knowledge, fewer wasted searches and eventually independently verified FindPitches opportunities. A persuasive diagram or AI self-report is not evidence of learning.

## 7. Governance: no artificial intellectual cap, yes execution limits
There is **no fixed lifetime number of collaboration iterations**. A short batch or checkpoint does not force completion, consensus or deletion of unresolved alternatives.

Every *actual* execution window must nevertheless have separately owner-approved calls/usage budget, duration, scope, credentials, stop conditions, logs and recovery. Preserve existing grant boundaries and do not renew or expand them automatically. Design/planning may continue without live host mutation; an open-ended mission is not permission for unlimited expense or unattended agent/model execution.

Do not change FindPitches V1/V2/V3, Cloudflare, Stripe, existing BRIX/Pi services, Hal, email, credentials, billing or production data without explicit separate authority. No customer publication, contact, purchases or outreach.

## 8. Roles, coordination and immediate direction
**Claude:** lead practical coordination, synthesis and Stage One planning. **Codex:** genuine independent engineering/design collaborator, critic and tester, with recorded disagreements; not only a reviewer. **Chris:** approval authority. **GitHub:** durable handover and approvals; **Neon:** shared knowledge graph. Preserve the historical documentation, not overwrite the original founding vision.

**Now:** Claude reads this directive and current hub, reviews the existing L2/Neon state and prepares the Stage One BRIX-native access plan. Coordinate with Codex using existing approved communication paths. If a model call or host mutation would be needed to do that, request a bounded grant before doing it. Record proposed Stage Two collaboration and its initial execution-window approval request, but **do not start Stage Two runs yet**.

**Owner intent:** Build a potentially general-purpose exploration engine, keep its first deployment focused on expanding a saleable, accurate and fresh FindPitches opportunity database, and seek commercial self-sustainability. First establish BRIX-native memory; next let the agents collaborate to build and validate the brain. The brain initially lives on BRIX, but its knowledge and recovery must not depend on that one machine.
