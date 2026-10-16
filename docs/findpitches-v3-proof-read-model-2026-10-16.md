# Current-proof catalogue read model — 16 October 2026

V3-029 continuation. The [first performance release](findpitches-v3-performance-2026-10-16.md) remains the baseline. This checkpoint replaces repeated proof/selection/attribution traversal with bounded disposable summaries. Customer billing code, products, keys, traffic routing and the independent producer are outside this change.

## Safety design

`customer_proof_heads` stores one compact report per entity, tied to the actual latest immutable verification sequence. A source-verification insert updates it atomically; a newer negative report replaces the derived head and the existing readiness invalidation still runs. The original report/document is never rewritten. Guard triggers reject content that does not exactly match the retained report. Address-coordinate bindings are joined live by entity revision and verification sequence because those receipts can arrive later.

`customer_selection_heads` stores current selected fields plus the contributing record IDs (including their original multiplicity). Existing immutable facts, selection audit and authority constraints remain authoritative. Selection changes refresh the summary in the same transaction. Quality holds are joined live against those selected record IDs; they are never cached. `customer_origin_heads` stores exact source membership and earliest accepted non-diagnostic origin, refreshed atomically when a receipt is linked. Source records and links remain immutable. Both summaries reject fabrication. Missing summaries use the original expressions.

Every catalogue read still evaluates current entity/readiness revision, latest verification sequence/status/version, checked/expiry clocks, selected-fact disagreements, unresolved conflicts, current quality holds, producer source-clock/arrival/ID winner, LOW/channel/export holds, application state/deadline, lifecycle and customer proof requirements. This is not a TTL cache of READY. No search query becomes source evidence; no hold or identity rule is relaxed.

The customer snapshot uses two reads: one bounded inventory query plus current structured-producer policy. The existing 20,000-item contract is enforced with a 20,001-row overflow sentinel and an error, never silent truncation. Operator pagination remains unchanged.

## Evidence recorded before switching the API

- Migration0026: 7,365 heads for7,365 verified entities;6,771,511 compact JSON bytes. One database snapshot compares1,818 cached-READY rows with zero missing/extra proof values.
- Migration0027: 7,475 selection/origin heads for7,475 entities;5,734,829 selection JSON bytes and259,271 attribution JSON bytes. One snapshot compares1,817 cached-READY rows with zero missing/extra proof, selected-field, source-attribution and hold/conflict values.
- Existing schema definitions hash-identical after each additive migration. Original evidence and identity writes by this work:0. The physical database increments were8,589,312 and8,347,648 bytes during migration windows, including concurrent activity; these are fixed steps, not daily growth. Account for them in the scheduled storage review.
- Three remote operator traces: four→two queries,237k→102k rows read; D1 duration before1.13–1.23s, after0.35–0.53s. Operator REST wall time before2.59–3.12s, after1.39–1.53s. These are not direct service-binding timings or Worker CPU.

Private `/staging/catalogue` responses now include aggregate `Server-Timing`: source read wall time, summed D1 duration, summed D1 RPC wall time, serialization and query count. Parallel sums can exceed critical-path wall time; D1 duration is not claimed as Worker CPU. No SQL, entity IDs, customer data or source evidence is emitted in the timing header or persisted by instrumentation.

Final release, public timings and test evidence are recorded below after verification. Paid acquisition and source publication remain disabled. V2 and protected PitchList remain untouched.

## Deployed result

Code **3c85d655**. Only `findpitches-v3-api-shadow` changed: version **a29b9d03-3018-4b22-968f-d7f240d2a2fb**, deployment **fa733dd9-9449-4b56-b248-fcc0ccaf3372**, activated **20:03:21 London**. Native bindings/secrets/settings/schedules preserved. Customer production stays **c7974bb8-6e55-4587-8be2-91c3f1550d14**, with public/sign-in/Checkout/recovery on throughout; no Checkout closure or customer deployment was needed. Seven other source Workers, customer settings/schedule, routes, DNS and protected PitchList deployment are unchanged.

Fresh anonymous public GET medians, three samples/path:

| Path | Before | After |
| --- | ---: | ---: |
| Catalogue API | 2.84s | **1.23s** |
| Filter API | 3.17s | **1.43s** |
| Home API | 2.81s | **1.31s** |
| Map API | 2.99s | **1.59s** |
| Markets API | 2.20s | **1.09s** |
| Regions API | 1.85s | **1.24s** |
| Listing API | 2.19s | **1.13s** |
| Country document | 2.43s | **1.74s** |
| Category document | 2.06s | **1.18s** |
| Listing document | 2.56s | **1.72s** |

The combined SEO API measured2.14s; no new before sample for that extra endpoint is claimed. Account/billing shells remain below0.16s at measured p95; small shell differences reflect network noise, not a billing change. Three samples are not a production SLO; nearest-rank p95 is the sample maximum. All responses retain their private/no-store policy, with no cross-request proof caching.

Private Worker URL median1.89→1.15s, with the same1,784 visible entity/revision/verification tuples in all six samples and identical2,898,857-byte body size. This does not claim a byte-for-byte body hash or direct binding timing. New Worker headers report source read497–587ms and D1 query duration259–320ms. Parallel summed RPC times598–965ms are not the critical path. Serialization reported0ms is below available timer resolution, not zero CPU cost. Provider Worker CPU and full customer service-binding/transport remain unmeasured separately.

The new18-sample anonymous browser check passes, with no script/foreign-request failures or TLS bypass. Useful-content times, compared with the previous published checkpoint:

| View | Previous desktop | Current desktop | Previous mobile viewport | Current mobile viewport |
| --- | ---: | ---: | ---: | ---: |
| Homepage | 3.50s | 2.59s | 3.45s | 1.83s |
| Finder | 3.34s | 2.72s | 3.16s | 2.20s |
| Filter interaction | 2.32s | 1.34s | 2.97s | 1.12s |
| Country | 5.49s | 3.23s | 6.18s | 3.40s |
| Category | 5.39s | 4.72s | 5.91s | 3.66s |
| Listing | 4.69s | 4.14s | 5.63s | 3.70s |
| US map | 2.75s | 2.14s | 3.36s | 2.16s |

The browser reference is the earlier checkpoint, not a fresh second browser baseline. Live corpus/network vary; these are same-runner Chromium viewports, not physical mobile devices or field percentiles. Current public request baselines are newly measured. Country/category still perform server and browser catalogue work; the original frontend design is unchanged.

## Validation, health and next priority

**498/498 tests pass,0failed/skipped**, including the native100-row preservation control;34focused tests and boundary checks pass. Public29before/29after and18browser checks pass. Coverage includes source-summary corruption/stale-sequence rejection, same-transaction lifecycle refresh, immutable originals, live hold multiplicity, diagnostic origin exclusion, legacy fallbacks/backfill, late coordinates, current revision/negative proof/expiry, producer source-clock holds and bounded overflow refusal. Frontend assets/build did not change and its unchanged build suite was not rerun.

At **20:06:21 London**, **1,784 READY**: US1,612/GB162/NZ5/AU4/CA1;FR0. Source core7due/4leased/0dead/0stale, pending native webhooks0. Source publication/projections/queue0; paid queries0/bulkoff/manualpause. Existing native provider customer/subscription1each and billing operations0. SourceDB4,052,508,672bytes. No new LIVE billing objects/messages, source evidence or identity rewrites by this work, V2/PitchList changes or protected merges. Full new historical custody audit was not repeated; original triggers/schema remain unchanged and the100-row control passes.

**V3-029 remains ACTIVE:** ordinary API reads are still1.09–1.59s, so the sub-second target is not complete. Next focus: reduce whole-inventory transfer/mapping for market and single-listing reads, and reuse request-owned SEO data where safe. Retain current proof/revision/holds/producer clocks/expiry and Free/Pro safeguards; no unconditional READY cache. Storage48/72h due17/18October remains next in order, then broader French proof and upcoming/Save. The fixed migration steps above must be distinguished from organic storage growth.

[Full sanitized samples, parity, custody and health](../operations/findpitches-v3/reports/proof-read-performance-2026-10-16.json). The committed private-catalogue profiler saves only timing/counts/hashes, never the snapshot or credentials.
