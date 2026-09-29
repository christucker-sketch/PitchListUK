# FindPitches v2 — venue evidence hardening and recovery preview

Stacked draft PR #1872 on #1871, tracking #1869. Audit reference: isolated v2 D1 read-only snapshot from 2026-09-29 20:34 BST: 352 US code-visible opportunities, 31 human-verified venues, 321 unresolved (304 semantic insufficiency, 7 nonreproducible evidence, 10 fetch failures).

## Scope of this draft

- Shared conservative `assessVenueEvidence()` and `classifyVenueEvidence()`, used in *both* named-field extraction and customer projection. An explicit event-venue label and exact source excerpt are needed. Generic `Location:` alone without event context, contact addresses, UI phrases, policy language and booth allocation text fail closed.
- `planUsVenueRecovery(privateAuditInventory, {reviewedIds,limit})` consumes the private read-only inventory already implemented under #1871. It returns at most 250 IDs and source URLs per call as a **preview**, with reason codes for stored evidence. It does not fetch, query Serper, mutate D1 or promote anything. The supplied `reviewedIds` are only for the corresponding audited candidate revisions; a later revision needs fresh verification.
- `inspectRefetchedVenuePages(pages)` conservatively inspects up to 5 already-fetched source pages using the same extractor. Every result explicitly requires manual venue and freshness verification, and never receives an automatic GEOID.

## Critical cutover limitation

The new projection gate **only protects new/reprocessed projections**, not the 352 previously promoted records already stored in isolated D1. Applying the strict predicate at a new promotion would change what is displayed only after a controlled re-enrichment, reinspection and reconciliation step. The current customer-opportunity table stores evidence URL but **not the excerpt needed** to retroactively prove that an event venue is real. Do **not** claim these legacy rows are repaired, hide them without an approved migration, or report 321 new/accepted opportunities from this PR.

Before real recovery:
1. Review #1868 and #1871 dependency/CI status and agree on a strict read-time legacy policy plus a bounded promotion reinspection strategy. A safety-oriented cutover must not accidentally overwrite previously sound evidence, silently blacklist good opportunities or interrupt acquisition.
2. Run the private bounded inventory snapshot from #1871 on *isolated v2 D1 only*; explicitly exclude the 31 manually checked IDs only after verifying their **current revisions** against their September audit. Export only IDs, known source URLs and reason-coded statuses to a private operator artefact, never to the public status API.
3. Refetch existing canonical/application/evidence URLs (no Serper credit needed), with per-host rate limits and terminal/retry separation; require an explicit independent event-venue/source audit and current-event/deadline check before assigning a GEOID.
4. Detect duplicate event/application records (Washta flagged) before customer promotion. Older Albuquerque 2022 source must be held for freshness review. This draft does not claim to solve either case.
5. Reconcile all outcomes: repaired, corroborated existing, rejected, fetch failure, unreproduced, duplicates and still awaiting manual review. Maintain 352/31/321 as **dated audit baseline**, not live totals.

## Deployment isolation

This PR has NO worker route, cron, Cloudflare config, D1 migration, scheduler change or production deploy. It is stacked on another draft branch deliberately. v1 remains untouched; v2 publication remains disabled.
