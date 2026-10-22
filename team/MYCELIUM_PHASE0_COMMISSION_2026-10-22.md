# MYCELIUM — PHASE 0 DESIGN COMMISSION ONLY
**Authorised by Chris, 22 October 2026. STATUS: DESIGN / REVIEW, NOT IMPLEMENTATION.**

## Authority and precedence
This is ONE bounded architecture commission. Existing production growth/incident priorities remain governed by [CURRENT_EXECUTION_ORDER.md](CURRENT_EXECUTION_ORDER.md). **Today's active Pi import/source-check freshness stall and CJS renewal/retention must not be abandoned for this design.** No amendments to live queue solely to pretend Phase 0 is delivery. This order governs *only* Mycelium design. If an agent's production responsibilities conflict, deliver a brief blocker and resume design after operational safety work. Existing product/V1/V2 protection remains absolute.

## Goal / testable hypothesis
Design a self-expanding, multilingual, global event/exhibitor discovery network that branches from initial and independent geographic/topic seeds, follows legitimate public event-organiser-venue-application relationships, learns from measured outcomes, prioritises high-yield paths and prunes unrewarding ones. Publication stays with existing V3 provenance/date/identity/trader-route verification. **Primary KPI: attributable, genuinely new verified customer READY events retained at 24h and 7d per £ and worker-hour, net of withdrawals.** No claim of infinite crawling or automatic customer eligibility. Do not create V4 or redesign customer billing.

## Mandatory engineering principles
- Multiple exploration strategies in parallel; autonomous *new* seed/strategy hypotheses in addition to link-following; geographic/language/source-family diversity; explicit exploration budget so early winners do not monopolise resources.
- Every branch has parent hypothesis, evidence, reason, access policy, status, resource budget, outcome and reopen-on-new-evidence condition. Preserve dedupe by event edition and immutable source provenance. Unverified leads never become published flags/READY.
- Respect robots, site terms, permissions, rate limits, privacy; no bypass of barriers, no mass high-load crawling, no credential sharing, no paid APIs without grant.
- Storage-first: benchmark **managed PostgreSQL + object storage** as default candidate, not irreversible selection. Specify entities/edges, evidence hashes/object refs, task/lease state, indexes, partitions, TTLs, duplicate compression, backup/restore, isolation and concurrency. Compare realistic growth/cost at 100k, 1m and 10m leads/edges with explicit assumed record sizes and retention; separate raw fetch logs from durable knowledge. Existing live D1/R2/customer data NOT migrated. Explain when dedicated graph DB is warranted and where Postgres may fail.
- Automated Claude/Codex collaboration requires **actual configured unattended runtimes**, not passive Markdown reading. Design event-driven handoffs, task claims/lease expiry, idempotent retries, dedupe, dead letters, heartbeat, dependency limits, approval gates, spending caps, and stop switch. Explicitly document which agent runtime/credential/cost prerequisite is NOT currently proven. Neither agent can claim autonomous running until an executed end-to-end test proves it.
- Use existing Pi/BRIX as candidates only, benchmark resource limits; don't place sole authoritative database on home hardware; Hal not a processing worker.

## Strict tasks and ownership
**Codex = design integrator and single-document owner.** Within design scope ONLY: inspect existing V3 verification/export APIs, current source storage and cost evidence; propose PostgreSQL/object-store/graph schema and query/workload/storage benchmarks; design durable coordinator state machine and safe ingest/READY interface; draft measured baseline and acceptance harness. Create the single deliverable `docs/mycelium/PHASE_0_ARCHITECTURE_REVIEW.md`, with numbered open decisions and explicit unsolved risks. You must solicit/use Claude's source/producer input before marking it JOINT. No production deploy, schema migration, new provider accounts or runtime enablement.

**Claude = discovery/worker design contributor.** Within design scope ONLY: inspect actual `producer/` and Pi operational constraints, propose several independent globally extensible source discovery strategies, multilingual seed generation, branching and relationship extraction, bounded worker protocol and sampling method; define how source proof/false-positive feedback feeds branch scoring. Submit a concise `docs/mycelium/CLAUDE_DISCOVERY_DESIGN.md` to Codex with interface assumptions, experiments, memory limits and risks. Explain that current Pi shell is unavailable to Claude; use existing measurements or mark gaps, do NOT request Chris's hands-on Pi work for Phase 0. **Do not begin a worker implementation kit.**

**Codex + Claude = converge, do not compete.** Specify one common schema/protocol with explicit owner for each interface. Exchange architecture comments through ONE small joint design issue/PR or these two exact documents, with cross-links. Both agents must acknowledge the other's reviewed contribution and record concrete conflicts/unresolved questions. Codex publishes consolidated review marked DRAFT, then AWAITING CHRIS APPROVAL; Claude reviews it. Neither is authorised to implement Phase 1 by this order.

**Chris = product authority** for architectural approval, expenditure, managed database provider, credentials, BRIX installs, production exposure and phase progression. **ChatGPT = coordination/review**; not an autonomous background controller.

## Mandatory deliverable sections — one concise joint review, no report sprawl
1. One-page executive recommendation and **reuse vs build** inventory.
2. End-to-end architecture diagram: explorer -> bounded evidence intake -> graph -> branch scoring/queue -> V3 verifier; independent seeds and feedback loop.
3. Contract: entities/events/editions/organisers/venues/forms, parent edges, immutable proof hashes, dedupe, crawler job/handoff schema, versioning/idempotency.
4. PostgreSQL/object-store design with benchmark method, 100k/1m/10m scenarios, growth estimates, retention/backup/restore, operational/cost tradeoffs and alternative.
5. Independent Claude/Codex invocation design: real available runtimes, permissions, triggers, lease/dead-letter/failure replay, spend controls, audit and proof that a cross-agent round trip could run unattended.
6. Selection mechanism with exploration-exploitation, delayed reward and anti-overfit; branch pruning/reopening and policy gates.
7. One **bounded shadow-mode** experiment using existing V3 as control, covering UK plus a limited non-English sample; fair request/computation budgets, 24h/7d verified outcome attribution, source-family diversity, stop criteria.
8. Phase 0A storage benchmark and Phase 0B automated two-way handoff **implementation plans only** (do not execute).
9. Explicit approval-gated milestones, risks, assumptions, questions for Chris, and what is deliberately NOT being built yet.

## Prohibitions / anti-side-quest rules
- **NO CODE, commits to runtime/producer, infrastructure provisioning, database purchase/migration, API keys, cron/GitHub Actions, external web crawling, Pi/BRIX install, model-spend or cloud deployment** under this Phase 0 authorisation. Only read-only inspection and the two named design documents (plus minimal status/links) may be committed.
- No product UX, mapping, free/paywall, SEO, subscriptions, France repair programme, storage migration, refactor, new monitoring stack or unrelated fixes as design scope. Safety incident handled under existing queue, separately.
- No separate parallel architectures, third-party dependency adoption without cost/security tradeoff, vague 'autonomy' without runtime proof plan, or unbounded TODO explosion.
- If stuck, record one crisp blocker, owner and decision needed; don't secretly solve it by broadening scope.
- Acknowledge in each agent's status. **A hub commit is an order, not proof of receipt/execution.**
- The review concludes **STOP AND REQUEST CHRIS APPROVAL** before any implementation.

## Acceptance for this commission
Exactly one consolidated review and one scoped Claude contribution, cross-reviewed; all nine sections present, measurable evaluation and cost assumptions, clear unknowns, no live changes. Chris can approve, revise or reject. A magnificent system is not the deliverable yet: an actionable, constrained engineering design is.
