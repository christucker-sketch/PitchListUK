# MYCELIUM — STAGE TWO: THE BRAIN
## Owner directive: collaborative research, architecture and engineering
**30 October 2026 | OWNER AUTHORISED AS MISSION DIRECTION | Execution grants remain separate**

**Initial host:** `fpd-prod` BRIX. **Agent development team:** Claude (lead coordination), Codex (equal independent engineering/research collaborator), Quinn (owner-facing review). **Development control plane:** the **existing, proven BRIX Claude Code / Codex CLI collaboration runner**, GitHub hub and BRIX-native Neon bridge. **Durable shared knowledge:** existing Neon `mycelium_memory`. **First commercial mission:** FindPitches. **Owner:** Chris.

This Stage Two directive supplements, and does not replace, [the founding vision](FOUNDING_VISION_OWNER_DIRECTIVE_2026-10-27.md) and [owner mission directive](OWNER_MISSION_DIRECTIVE_2026-10-29.md). Stage One completion and independent acceptance: `defbf4006f`, `832667143`. The successful, approved two-call Stage One grant is **consumed and archived**; it does **not** authorise new calls.

## 1 — What to build
Design, build, experimentally test and progressively improve a **continuously operating, adaptive, multidirectional exploration engine**. It must use accumulated knowledge to generate and pursue new questions; develop multiple branches; link and challenge discoveries; retain evidence, uncertainty and failures; revisit old paths; and learn to allocate attention better as results accrue. It is not a fixed workflow, a queue of AI-written tasks, a crawler, or the collaboration runner itself.

**The organism is never “done”.** Individual investigations may finish, but its evolving exploration network, decisions and remembered state persist across sessions and restarts. Running 24/7 does **not** mean unrestricted model calls; resource-paused, waiting, idle, degraded and blocked are legitimate, visible states, not termination.

## 2 — Intellectual freedom; do not recreate failed “lanes”
The previous centrally prescribed lanes model failed. No fixed research taxonomy or set of permissible discovery routes. A finding may spawn many unanticipated branches, branches may cross, contradict and recombine, and failed avenues can be revisited when evidence changes. Mycelium autonomously generates, links, ranks, suspends and revives investigations within its approved permissions; it should preserve diversity instead of following only familiar successful methods.

A scheduler, queue or worker may implement execution, **but must not define what the organism is allowed to wonder about**. FindPitches is the initial **purpose**, not a set of predefined paths. Do not narrow curiosity through process design.

## 3 — Commercial grounding: FindPitches first
First real-world mission: sustainably expand and maintain a **large, international repository of genuinely available, actionable vendor pitches** for markets, festivals, fairs, venues, street-food programmes and other trader opportunities, ultimately valuable to paying FindPitches customers.

Explore organiser/venue/council/event/location/application relationships, unexpected discovery routes, recurring programmes and reopenings. Separate these claims: an event exists; a vendor programme exists; applications are currently open; capacity is available; a particular trader is eligible; a real application route exists. Primary dated evidence where possible, source provenance, uncertainty and revisit triggers are mandatory. Historic events or a live form alone do not prove a currently available pitch.

Compare incremental *verified actionable* opportunities, uniqueness, accuracy, freshness, coverage, false-positive rate and per-opportunity compute/storage expenditure against existing FindPitches discovery processes. More candidates or knowledge nodes is not business success. Revenue, willingness to pay and sustainable operating economics remain to be demonstrated.

**Keep core brain domain-independent**, with replaceable FindPitches research/validation/output adapters. Mycelium itself may one day be a product; do not prebuild unrelated science missions, a universal SaaS platform, billing or speculative APIs. During initial execution, investigations must remain relevant to FindPitches unless owner broadens scope. No production FindPitches mutation, publication, outreach, pricing or customer-facing changes without distinct approval.

## 4 — Critical: develop it using the ALREADY BUILT BRIX collaboration system
Stage One has independently proved real BRIX-based Claude → Codex collaboration using live Neon recall, pinned references, validation, linked append-only ingestion and fresh-process verification **without Windows involvement**.

**Use that system to conduct the design/build**, not manual relays or a fresh AI orchestration framework. Preserve existing runner, task claims/results, pinned approval/usage gates, BRIX bridge, GitHub hub and Neon memory. Review designs through genuine Claude/Codex collaboration: alternatives, strong critique, experimental failure cases, implementation revisions, unresolved disagreements and cross-session knowledge reuse.

The control plane and task/approval machinery are scaffolding for **building** Mycelium; they are **not** the organism's brain. Do not declare Stage Two delivered because agents exchange messages.

The design mission has **no fixed total model-turn count or artificial intellectual deadline**. Real model calls, however, require **separately approved finite execution windows** with duration, claims, budget, scope and stop/cleanup. This document approves Stage Two's objective and authorised offline design/planning; it does **not** extend old grants, authorise new paid calls, unattended execution, host changes or credential/Neon mutations.

## 5 — Where the brain lives
Target an initial **lightweight supervised long-running service on `fpd-prod`**, portable to a replacement host. Brain = software governing inquiry, attention, branching, evaluation and adaptation. Claude/Codex = reasoning tools, not the brain; Neon = durable memory, not the brain; GitHub = engineering hub, not the brain.

Keep domain adapters, reasoning providers, core exploration mechanics and durable operational state separable. Investigations, lineage, pending actions, decisions, audit events and recovery positions must survive restart. Evaluate existing Neon for state storage; do not invent a database or distributed cluster without evidence and owner approval. `fpd-standby`/Pi may later support resilience or monitoring, not initial mandatory dependencies. **Hal remains separate.**

## 6 — Intelligence mechanisms to research, not prescribed modules
Claude and Codex should investigate competing, falsifiable mechanisms for:
- Generating useful inquiries from knowledge gaps, anomalies, contradictions and unexpected relationships.
- Multidirectional branching, cross-branch association and recombination.
- Assessing sources, evidence, conjecture, provenance, uncertainty, competing hypotheses and contradiction resolution.
- Revisit triggers, recovering from dead ends, changed evidence and stale findings.
- Adaptive exploration/exploitation, diverse approaches and avoiding cyclic low-yield search.
- Choosing reasoning/research capabilities and distributing finite attention.
- Learning from results **in demonstrated future choices**, not only storing information.
- Durable continuity, safe retries, recovery and explicit explanation of significant choices.

Do not mistake impressive text, larger graphs or AI claims of learning for evidence of these capabilities.

## 7 — Intelligent memory and storage efficiency
**Remember knowledge, not the whole internet.** Neon storage is finite and shares a project with other data. Prefer compact structured facts, short relevant plain-text excerpts, source URLs, observation dates, content hashes, provenance, evidence links and revisit triggers over copied HTML, assets, images and full-page archives. Keep selective snapshots when justified by volatility or evidential need; links alone can disappear or change.

Deduplicate repeated sources across branches, distinguish enduring knowledge from time-sensitive claims and temporary artifacts, and use bounded local working storage. Preserve failures and contradicted hypotheses where informative. Consolidate redundant observations through derived summaries **without silently overwriting, losing provenance, or irreversibly deleting append-only knowledge**. Any durable deletion/compaction policy requires explicit owner approval.

Measure Neon schema usage, duplicate avoidance, bytes per useful discovery, evidential traceability, growth rate and remaining capacity; test repeated-source research for storage efficiency.

## 8 — Live Mission Control is part of the first meaningful prototype
Implement actual instrumented, near-live monitoring, not a decorative dashboard or a later add-on. Show:
- Engine state, service heartbeat, uptime, errors, pause reasons, approvals and recovery events.
- Active, waiting, blocked, finished and revisitable investigations; branch lineage, connections, decisions and audit history.
- Research effectiveness, revisits, contradictory claims, strategy changes and their measured outcomes.
- Primary BRIX CPU, RAM, disk, uptime and services; secondary BRIX/Pi where accessible.
- Neon database/project size, Mycelium attribution where possible, storage allowance, growth/runway, connections and query errors.
- Claude/Codex calls, time, tokens where available, failures, rate limits, known/estimated usage and remaining execution allowance; **do not invent subscription balance or confuse API-equivalent cost with billed cost**.
- FindPitches candidates, verified actionable opportunities, unique discoveries, freshness and cost per usable result.

Include an explorable, evidence-grounded branch network when feasible. Show data timestamps, freshness and unavailability; do not report stale telemetry as live.

**Two mandatory access paths to the same source of truth:** a secure human dashboard for Chris; a documented authenticated **read-only machine interface** from which Claude, Codex and Quinn can obtain current state through the tools/connections actually available to each. Design and test Quinn's access explicitly; never assert this integration exists before it has been proven. Avoid public unsecured ports, exposing database credentials or making the monitoring interface an administrative backdoor.

## 9 — Self-awareness and graceful resource degradation
Track and forecast local hardware, disk, Neon capacity, model call/usage allowances, research productivity, failures and service status. Set configurable warning, critical and protective-stop thresholds, with a reserve for critical writes/recovery. Do **not** assume a full free-tier 1 GB is available for Mycelium alone; confirm current Neon limits and metering.

Under pressure: preferentially trim temporary artifacts, reduce waste, pause nonessential costly work, preserve knowledge/state, explain the reason prominently, alert Chris, and resume within permissions when resolved. Never silently quit, delete durable evidence, exceed budget or continuously retry a failed API.

Evaluate a lightweight **independent watchdog/alert path** for missing heartbeat, unavailable Neon and main-engine failure, preferably reusing existing infrastructure. Metrics and alarms should not require the failing database to be functional.

Simulate database near-full/unavailable, exhausted model allowance, disk pressure and crashed engine; verify alert, durable continuation, honest dashboard state and safe recovery.

## 10 — Continuous autonomy within operational limits
The engine should be able to create, connect and reprioritise branches without individual human instructions and maintain continuity between model sessions. Within a **separately owner-approved** operating envelope, it may select work and dispatch permitted bounded investigations, adapt tactics and allocate finite capacity.

**Freedom of thought is not authority to spend, contact third parties, alter production services or bypass safety.** If limits are reached, preserve progress and remain alive/observable in a paused/waiting state. No automatic enlargement of permissions, call budgets or infrastructure footprint.

## 11 — Experiments that can actually falsify the design
Start from a FindPitches-relevant seed. Test whether the engine itself generates multiple meaningful directions not listed in the seed, pursues some, acquires independent evidence, connects branches, challenges mistaken claims, revisits a path on changed evidence, and changes next choices after feedback. Demonstrate surviving restart, continuity across execution windows and exact auditability.

Compare against a plain fixed search/research workflow and, where appropriate, a version without cross-session memory. Require useful novelty and independently validated evidence; mere variations on search strings, graph growth or self-reported intelligence are insufficient.

Test storage efficiency and accurate operational telemetry from the earliest useful prototype.

## 12 — Team roles
**Claude:** implementation coordination and architectural synthesis, genuine research participation. **Codex:** equal independent engineering/research collaborator, critical evaluation, alternative hypotheses and tests, not rubber-stamp. **Quinn:** owner-facing architecture review and operational analysis only through actual available interfaces. **Chris:** final authority over access, execution, spend, deployment, production integration and changes in mission.

Maintain linked knowledge in Neon and durable engineering decisions in GitHub; preserve significant disagreements and negative results.

## 13 — Progressive engineering delivery
Do not disappear for weeks to deliver a grand theory, nor rush to code a scheduler. Develop small, observable, falsifiable prototypes informed by collaborative experiments.

The first meaningful prototype must demonstrate an exploration feedback loop, a new unprescribed branch, durable state and **working live health/resource telemetry and dashboard/API**. Later versions can extend autonomy, learning quality, cross-branch effects, recovery and FindPitches productivity.

The team chooses architectures and experimental sequencing, provided they satisfy all non-negotiable behaviour and resource boundaries. The first architecture is a hypothesis to test, not a decree.

## 14 — Initial Stage Two deliverable and approval boundary
**NOW:** Claude and Codex must use the established hub to jointly propose competing brain designs and a practical development/research programme. Specify how the existing BRIX collaboration system will carry their real interactions; the first meaningful experiments; the continuously running service and durable state; live human and machine-readable Mission Control; resource/watchdog controls; intelligent evidence storage; FindPitches validation baseline; risks and exactly what owner approval is required for the next bounded **model-call window** and host changes.

Inspect actual Stage One installation and grants. Do not overengineer a new platform or substitute lengthy documentation for testable engineering. Offline reading/code/design/tests within standing permissions are fine; **do not run CLI models, deploy/enable a new continuous service, open new network access, create credentials, mutate Neon, spend money or touch production systems** without separate, specific owner approval. Codex's independent critique must be visible before proposing a final plan.

## Owner's bottom line
**Build the brain, not more plumbing.** An adaptive organism, free to grow in unexpected directions, continuously existing and always measurable. Use the proven BRIX-based collaboration system to build it. Preserve compact, traceable memory and resource runway. Make FindPitches its first commercial proving ground and possible funding source, not the limit of its architecture. Individual tasks finish; the organism continues.
