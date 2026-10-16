# Scoped current-proof reads — 16 October 2026

V3-029 continuation after the [bounded read-model release](findpitches-v3-proof-read-model-2026-10-16.md). Narrow market-specific API reads before transferring and mapping the international snapshot. There is no cross-request READY cache or source/identity mutation.

## Contract and preserved results

The authenticated private `GET /staging/catalogue` accepts exactly one selection: `market=GB`, `detail_id=<canonical entity ID>`, or `ids=<JSON array of up to100 canonical IDs>`. No selection means the complete snapshot. Batch IDs are deduplicated and sorted. Values are bound parameters. The existing20,000-entity limit/overflow refusal remains.

The response adds a private `scope` marker: `full`, `market`, `detail` or `ids`, with its canonical selection. An old source deployment without the marker is treated as a complete snapshot for safe rollout/rollback. Unexpected partial snapshots, mismatched market/batch content or mixed-country detail responses fail closed. No error/stale-cache fallback is added.

Market search/count/upcoming/regions and per-market SEO inventory read only the relevant country. Listing detail reads the complete target country, preserving the exact related-listing pool. Batch reads return only requested IDs. Homepage, markets, stats, combined SEO page, sitemaps, saved/alerts and scheduled inventory tracking retain global input. Public response shape/counts/sort/facets/related listings and Free/Pro redaction remain unchanged.

Both inventory and current structured-producer policy use the same selection. Query market is a filter on the retained entity, never geography proof. Selected-field/proof disagreement, current verification sequence/revision/version, LOW/channel/export/source-clock holds, quality holds/conflicts, application state/deadline, lifecycle, expiry and customer proof mapping still execute. The bounded derived heads and original immutable source evidence remain unchanged.

## Pre-release verification

Initial504/504 full V3 tests pass,0failed/skipped, including the native100-row preservation control;33focused tests and boundaries pass. New tests compare full versus scoped public search/count/regions/inventory/batch/detail responses, including identical related listings, Free redaction, current LOW/source-clock holds, expiry, malformed/private scope rejection and legacy full-source compatibility. Global routes keep global counts.

Live D1 EXCEPT comparisons, one database snapshot per comparison, have0missing/extra rows: GB162, US1,637 cached-READY rows, detail-country162 and selected batch1. These are SQL input rows before fresh eligibility/policy filtering, not customer READY totals. Original evidence/identity writes and schema migrations:0.

Fresh pre-release health at22:40:32London:1,777READY (US1,605/GB162/NZ5/AU4/CA1), core6due/0leased/dead/stale;0paid/off/manualpause, sourcepublication/projections/queue0. Public/Checkout/recovery on; native customer/subscription1each, billing operations0/pending webhooks0. Inventory changes over time are not attributed to this performance change.

API-first compatible rollout precedes the guarded customer bundle upgrade. Final public measurements, custody and deployment evidence follow after release.

## Deployed result

Final runtime code **0c0b2855** (scoping base054eb404). Source API version **6e88c171-cd60-463a-bf55-07a4c584c50e**, deployment **4b1b9593-b78d-4900-b4de-d5f8f1dd04ad**. Final customer version **b8189445-33df-42ed-b0b0-2371cba002d0**, deployment **03cf8c8d-9c7c-4576-aec9-b9da06780720**. Public browsing/sign-in/recovery stayed on. Only new Checkout closed22:50:58–22:51:51London for the guarded bundle upgrade, then restored after native/public checks. Final script ETag matches the tested closed-Checkout bundle. Billing behaviour, products/prices/trial/global Pro and existing LIVE acceptance remain unchanged/DONE; this release performs no new LIVE customer journey.

A private API-first probe caught a7–8s D1 query-plan regression before the customer upgrade. D1 pushed the entity selection into the producer receipt join, causing2.1million rows read. The final query **materializes the original bounded current-policy SELECT before filtering**. This preserves the source-clock winner and avoids repeated receipt lookups. A regression test asserts this plan and exact winners. Final live policy EXCEPT comparisons have0differences: GB246/US1620/detail246/batch0/empty0 policy rows. These are policy receipts, not opportunity counts.

UK operator D1 duration82–108ms,71k rows read, two queries. Deployed Worker D1 duration67–86ms and source read199–367ms. Private requested-GB payload falls from an old source's2.84MB complete fallback to **161,697bytes of UK-only proof**, about94% less. Private URL wall time includes proxy/network and is not direct customer service-binding latency. D1 duration is not Worker CPU; parallel RPC sums are not critical-path time, and0ms serialization means below timer resolution.

Fresh anonymous public GET medians, three samples/path:

| UK read | Before | After |
| --- | ---: | ---: |
| Catalogue API | 1.079s | **0.530s** |
| Filter/search API | 1.126s | **0.340s** |
| Regions API | 1.086s | **0.370s** |
| Listing detail API | 1.088s | **0.608s** |

The ordinary UK API target is met in this bounded sample. There is no cross-request cache. Three samples and their nearest-rank p95 maximum are not a production SLO; authenticated provider refreshes are not measured here.

Both18-sample anonymous browser passes succeed with0script/foreign-request errors and no TLS bypass. Useful-content timings:

| View | Desktop before | Desktop after | Mobile viewport before | Mobile viewport after |
| --- | ---: | ---: | ---: | ---: |
| UK Finder | 2.283s | **1.132s** | 2.158s | **1.149s** |
| Filter interaction | 1.158s | **0.494s** | 1.662s | **0.625s** |
| Listing | 3.690s | **2.473s** | 3.568s | **2.678s** |
| Homepage | 2.205s | 2.352s | 2.998s | 2.780s |
| Country | 5.208s | 4.347s | 4.837s | 4.332s |
| Category | 4.202s | 4.375s | 4.674s | 4.869s |
| US map | 2.707s | 2.236s | 2.659s | 2.154s |

Same trusted runner/Chromium viewports and cache-disabled guard; not physical mobile hardware or field percentiles. Global and SEO-heavy reads remain substantial and were not optimized: homeAPI1.216→1.827s, markets0.994→1.413s, combinedSEO1.383→1.741s and USmap1.108→1.455s in these short live samples. No improvement is claimed for those API paths; their timing/corpus variability remains visible in the full report.

## Final verification and remaining queue

**505/505 full V3 tests pass,0failed/skipped**, including the native100-row preservation control;34focused tests and boundaries pass. Public29before,29with Checkoutclosed and29after restoration;18browser checks per phase;5native billing capability checks plus canonical product/prices/globaltrial/mail pass. Static frontend assets/design did not change. The unchanged frontend unit suite was not rerun; the release builds its owned assets.

The private profiler now supports optional `--max-d1-ms`, suitable for an explicit pre-customer-release gate. A500ms UK threshold passes; a deliberately impossible1ms threshold stops after exactly one read as expected. Missing native timing also refuses the gate. This records timings/counts/hashes only and changes no runtime flags. It does not restart acquisition.

At **22:54:40 London**, global inventory is **1,776 READY**: US1,604/GB162/NZ5/AU4/CA1/FR0. Core1due/1leased/0dead/stale; pending customer webhooks0. Paid0/off/manualpause; sourcepublication/projections/queue0. SourceDB4,089,913,344bytes. Before1,777, preflight1,778 and final1,776 were separate live snapshots; no quality gain/loss is attributed to the performance change and no withdrawal-cause audit is claimed. Same-snapshot comparisons prove input parity; original source/identity writes by this work0. No migrations/new LIVE billing objects/messages/V2/PitchList/Pi changes/protected merges. Native configurations, secrets, schedules, routes/DNS and the other7sourceWorkers are preserved. Full new historical custody audit was not repeated.

Claude's handover16abefe7 is integrated: he reports FRexportON after the clean soak, with first delivery expected next cycle. This is producer participation, not customer proof; FRREADY remains0. Codex did not change the Pi or enable another lane. Existing `/opportunities/upcoming` still returns only future-dated READY records; V3-028 not-open listings/Save remains deferred.

**V3-029 remains ACTIVE for global/SEO paths.** Next inspect SEO inventory's repeated full search/facet/map construction for count-only intent/region totals, then safe reuse of request-owned SEO data. Keep global count semantics and every live proof/identity/hold/time/Free-Pro gate. Storage48/72h due17/18October09:45London follows (no new fixed migration step here), then broader French source proof/reason codes and upcoming/Save. Billing stays DONE; paid stays off.

[Full sanitized timings, parity, release/custody and health](../operations/findpitches-v3/reports/scoped-read-performance-2026-10-16.json).
