# FindPitches V3 performance profiling order — 16 October 2026

Owner: Codex  
Coordinator: ChatGPT  
Authority: Chris requested the live site performance issue be treated as the next Codex priority.

## Why this is now a priority

The public FindPitches service is functionally live and commercially close to ready, but the customer experience still feels noticeably laggy. Current hub state still records variable catalogue latency as an unresolved follow-up. Do not treat green functional/browser tests as proof that the service is fast enough.

This work is about **measured customer-facing latency**, not speculative optimisation.

## Objective

Produce a proper end-to-end performance profile of the live FindPitches customer path, identify the dominant sources of latency, then implement the smallest safe changes that materially improve perceived speed without weakening evidence, identity, Free/Pro gating, customer isolation, source integrity, PitchList isolation or LIVE billing safeguards.

Target ordinary catalogue reads at **sub-1 second server/API response where realistic**, with cached/common reads ideally in the **few-hundred-millisecond range**. Do not claim success from synthetic unit timing alone; use real public-origin measurements before and after.

## Required measurement pass

Profile these paths independently rather than averaging everything together:

1. Homepage / initial application shell.
2. Finder/search first load.
3. Search/filter interaction after initial load.
4. Country page.
5. Category page.
6. Listing-detail page.
7. Map-data request and map interaction payloads.
8. Account/sign-in shell excluding external mail delivery.
9. Any customer-facing API endpoints called serially during page load.

For each path record, where available:

- total observed browser/request duration;
- Worker execution time;
- D1/query time;
- internal Worker/service-binding time;
- R2 involvement, if any;
- render/serialization time;
- response payload size;
- cache status;
- query count and repeated/duplicate reads;
- cold versus warm behaviour;
- p50/p95 or an equivalent bounded sample rather than one favourable timing.

Use production-safe read-only instrumentation first. Do not introduce a new persistent logging volume large enough to worsen V3-022 storage growth.

## Specific things to test

Investigate rather than assume:

- catalogue queries scanning or joining more live/history state than the customer read requires;
- expensive D1 joins/sorts/COUNTs or missing/ineffective indexes;
- evidence/proof resolution happening synchronously on ordinary customer reads when a current projection should already exist;
- map requests returning too much data or recomputing stable geometry/state;
- multiple sequential frontend fetches that can safely run in parallel;
- repeated reads for country/category/filter metadata;
- avoidable large JSON payloads;
- cache keys that are too granular to achieve useful hit rates;
- Worker cold-start/service-binding variance;
- query-plan regressions introduced as the catalogue/history corpus grew;
- localisation adding duplicate requests or blocking render;
- server-side rendering or frontend hydration creating apparent lag even when API latency is acceptable.

## Preferred architectural direction

Do **not** solve this by weakening truth checks or bypassing the current source/evidence model.

If profiling proves ordinary customer reads are coupled too closely to proof/history machinery, prefer a **precomputed/current customer catalogue projection or cache** derived from the existing authoritative READY state. The customer path should normally read the smallest current representation needed for display/search/map, while evidence/history remains available behind it for verification and lifecycle work.

Any new cache/projection must:

- invalidate correctly when READY/proof/lifecycle state changes;
- preserve Free/Pro redaction;
- preserve country/language behaviour;
- never expose held/expired/unproved records;
- keep original IDs and provenance stable;
- not become a second uncontrolled source of truth.

## Delivery order

1. Publish a **baseline performance report** before material runtime changes.
2. Rank the top latency contributors by measured customer impact.
3. Implement only the highest-value fixes first.
4. Run focused/full regression and public browser/security checks.
5. Publish **before/after timings** for the same routes and sample conditions.
6. Record any residual slow paths separately instead of calling the whole problem solved.

## Guardrails

- Do not interrupt or weaken V3-022 storage monitoring; note whether any performance change materially alters D1 growth.
- Do not enable paid acquisition, source publication, FR export, DE intake or unrelated customer features as part of this work.
- Do not alter pricing/entitlement semantics or fake the outstanding V3-010 owned LIVE acceptance.
- Do not mutate PitchList or V2.
- Do not trade correctness for speed: stale/held/unproved inventory must remain excluded.
- Keep changes reversible and preserve active Worker bindings/secrets/routes/schedules.

## Acceptance

Call the performance task successful only when the hub contains:

- measured baseline by route;
- identified bottleneck(s), not guesses;
- exact runtime/query/cache changes made;
- regression/custody/security results;
- real public-origin before/after timings;
- confirmation that catalogue truth, Free/Pro gating, LIVE Checkout and PitchList isolation remain intact.

This is now the next customer-experience optimisation priority because the product is close enough to commercial use that perceived speed directly affects conversion and organic-search usability.
