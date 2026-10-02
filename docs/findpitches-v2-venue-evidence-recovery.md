# FindPitches v2 — venue evidence hardening and recovery preview

Stacked draft PR #1872 on #1871, tracking #1869. Audit reference: isolated v2 D1 read-only snapshot from 2026-09-29 20:34 BST: 352 US code-visible opportunities, 31 human-verified venues, 321 unresolved (304 semantic insufficiency, 7 nonreproducible evidence, 10 fetch failures).

## Scope of this draft

- Shared conservative `assessVenueEvidence()` and `classifyVenueEvidence()`, used in *both* named-field extraction and customer projection. An explicit event-venue label and exact source excerpt are needed. Generic `Location:` alone without event context, contact addresses, UI phrases, policy language and booth allocation text fail closed.
- `planUsVenueRecovery(privateAuditInventory, {reviewedIds,limit})` consumes the private read-only inventory already implemented under #1871. It returns at most 500 IDs and source URLs per call as a **preview**, with reason codes for stored evidence. It does not fetch, query Serper, mutate D1 or promote anything. The supplied `reviewedIds` are only for the corresponding audited candidate revisions; a later revision needs fresh verification.
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


## Bounded known-source runner (manually triggered and read-only)

\`runUsVenueRecoveryPreview(queue,{fetchProvider,limit,maxPagesPerRecord,onRecord})\` is now a separate offline operator runner. It fetches only canonical, application and location-evidence URLs already recorded by the existing pipeline; no Serper. Default 12 records per batch, maximum 25, and at most three source pages per record. Fetch failures and unsafe redirects are reason-coded and do not abort the whole preview. It invokes the shared conservative extractor and returns \`possible_event_venue_needs_independent_review\` or \`venue_not_proven\`; **never automatically verifies, writes D1, promotes or assigns a place GEOID**.

Use the existing network fetch provider with DNS/IP egress blocking, redirect restrictions, per-host rate limits, request timeouts and download-size limits. The runner rejects literal private IP hosts, local suffixes, malformed URLs, credential-bearing URLs, custom ports and cross-host redirects, but URL string checks cannot replace the provider's DNS-rebinding and redirect protections. Its operator callback is for private result storage; it is not wired to any production endpoint or cron.

To execute the 321-row recovery safely, a trusted operator must take a fresh private v2 D1 audit inventory, confirm that the 31 September-reviewed rows have unchanged candidate revisions (otherwise reinspect), build the unresolved queue, run bounded batches using the restricted fetch provider, and review source/venue/freshness and suspected duplicates before any promotion decision. The isolated v2 D1 preview has now run successfully; see the dated execution record below. Actual venue review and D1 write-back remain gated.

## Execution and independent review, 29 September 2026

Read-only preview [run 36626948286](https://github.com/christucker-sketch/PitchListUK/actions/runs/36626948286) fetched known source URLs for the **10** remaining strictly text-matched US cases; **7** returned potential venue evidence, **3** did not. Three records encountered fetch failures (some pages exceeded the 400 KB cap). A further manual comparison of those seven found **six** IDs already in the 31-item September historical venue review. They are not six new venue discoveries. Previous 68 "strong" stored-text candidates were an overcount caused by policy/UI fragments; this was reproduced from the previous operator artifact and corrected with regression tests. The strict pass now has only 10 stored-text matches among 352 code-visible opportunities, but **strict extraction recall has not been measured against all valid sources**, so 342 weak matches do not equal 342 invalid records.

One newly surfaced record, `fpv2_cc259ee1485c162d7f029ee5`, was independently corroborated from the **St. Clair Shores municipal vendor page and event calendar**, with a separate Marketspread listing. They agree on Blossom Heath Park, 24800 Jefferson Ave, St. Clair Shores, MI, for the 2026-10-11 Pumpkin Patch at the Market. Its scoped Census place is GEOID `2670760` (St. Clair Shores city), in the uploaded 2025 Gazetteer index. This additional manual venue review is stored separately in `platform/findpitches-v2/quality/us-venue-review-2026-09-29-followup.json`; it does not automatically update the previous 31-item audit, customer projections or publication. The new source validation does **not** establish that its stored candidate revision still matches the current v2 D1 revision; check before any operational promotion.

Known operator limitations: the 31 original historical reviews have no candidate-revision stamps; URL size limits and failed fetches should be separately retried or investigated; a current valid venue can coexist with stale event/deadline information (for example the previously flagged 2022 Albuquerque source). Keep true customer-ready counts distinct from source-backed and semantically verified venue counts. Do not interpret zero strict stored-text matches as zero city coverage.
