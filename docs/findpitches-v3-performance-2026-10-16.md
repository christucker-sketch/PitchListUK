# FindPitches measured performance checkpoint — 16 October 2026

**The first optimisation is LIVE. Country/category pages are around70–76% faster in the measured desktop run; ordinary catalogue APIs remain above the sub-second target. V3-029 stays ACTIVE.** No stale proof cache or relaxed hold/date/identity gate was introduced.

| Desktop useful-content timing | Before | After |
| --- | ---: | ---: |
| Country | 18.71s | 5.49s |
| Category | 22.02s | 5.39s |
| Listing | 11.69s | 4.69s |
| Finder | 4.97s | 3.34s |
| Search/filter interaction | 4.38s | 2.32s |
| Homepage | 4.71s | 3.50s |
| US map | 4.21s | 2.75s |

Mobile-viewport country20.01→6.18s; category19.04→5.91s; listing10.87→5.63s. These are Chromium desktop/mobile-viewports on the same runner/proxy, not real mobile hardware, cellular timings or field-user percentiles. Both phases block foreign/action requests and disable browser HTTP cache via the request guard. Backend cold starts are not forced or claimed.

## What changed

The old country/category frontend traversed the proof catalogue five times after the document's own traversal: market counts, regions, results and two country inventories. Some reads were serial; the concurrent ones contended on D1 and took longer. Registry-only startup now resolves routes cheaply; a single authenticated/Free-redacted `GET /api/v3/seo/page` returns source-backed results, region counts and cross-country inventories from one fresh proof snapshot. Listing startup also uses static registry metadata rather than another full catalogue read. Existing endpoints remain for older clients, and the independent dev stub supports the new contract.

The source catalogue's250-row pages caused nine serial inventory queries plus a policy query. A bounded1000-row customer page reduces this to three inventory queries, including the empty final page, plus policy. Operator defaults remain250. A sparse derived index covers the structured producer metadata used in latest-receipt hold decisions. Its exact source-clock/received-at/ID winner is unchanged, including stale replay, LOW/held/retired/WATCH handling and nullable legacy metadata. SQL EXCEPT comparison in one live database snapshot proves **2,206 old/new policy rows;0 missing/extra**. Existing schemas are unchanged; one additive index, no source-field or identity rewrite. Physical database increase during migration was~3.8MB, including concurrent background activity; that fixed step is not a daily growth rate.

D1 policy CPU sample858→44ms (~95% lower). Three operator traces show total query duration~2.0–2.3s→0.96–1.13s; transport-inclusive operator snapshot~4.5–6.1s→2.5–2.6s, ten→four queries. This is the remote D1 API trace, not a direct measurement of service-binding latency or Worker CPU. Synchronous catalogue code does not read R2.

## Public request profile / remaining bottleneck

Five successful GET samples per path, first/repeat labelled;14 paths before and15 after (the new SEO API is additional). Median public timings:

| Request | Before | After |
| --- | ---: | ---: |
| Catalogue API | 3.48s | 2.38s |
| Filter API | 3.58s | 2.56s |
| Home API | 3.43s | 2.70s |
| Map API | 3.51s | 2.45s |
| Regions API | 3.47s | 2.54s |
| Country document | 3.61s | 2.34s |
| Category document | 3.39s | 2.37s |

New combined SEO API median3.32s. Account/billing shells remain below0.5s at measured p95. Cache-Control remains private/no-store; no cross-request or client proof cache. Reported p95 is nearest-rank from five requests (effectively that small sample's maximum), not a production SLO. Worker CPU and binding/RPC/serialization costs are not individually exposed by this checkpoint; browser API timelines and approximate render tails are retained, not invented component CPU timings. Map payload size changed with the live corpus; no payload-compression gain is claimed.

**Next V3-029 work:** bounded current-proof/selected-field materialisation and direct RPC/serialization instrumentation. The inventory projection still takes roughly one second of D1 query time and transfers substantial data. Any read model must preserve current verification sequence, entity revision, conflicts/quality holds, latest producer disposition/source clock, expiry/deadline/closure and Free/Pro redaction. No unconditional cached READY or route-only promotion.

## Release / checks / safety

Code **bb9d09a9**. Source API version **ba82ad84-900f-4e00-a401-c7552c63d844**, deployment **2d406db3-ec14-4131-ab8c-4aba754cbc34**; API only, native bindings/secrets/R2/schedules preserved. Final customer version **c7974bb8-6e55-4587-8be2-91c3f1550d14**, deployment **b52143dc-f4c5-426e-9890-3b920bc376c0**. Public/sign-in/Checkout/recovery on after guarded restoration at19:31:44London. No route/DNS/PitchList/provider change; native billing remains live.

**485/485 V3 tests**, frontend3, independence98/build60/boundaries pass. Public29before/29after,18 browser route samples per phase,0 script/foreign-request failures. Existing held/expired/control exclusions and page-boundary/source-clock parity pass. No new full original-custody audit is claimed; changes are reads plus an additive derived index. Reusable profilers are committed under `operations/findpitches-v3/`.

At19:38:43London: **1,784 READY** (US1612/GB162/NZ5/AU4/CA1); core1due/0leased/0dead/stale; pending customer webhooks0. Source publication/projections/queue0; paid0/off/manualpause. READY moved during this live measurement interval (19:09snapshot1,836); timings are not a matched quality/yield experiment and no inventory gain/loss is attributed to the optimisation. A withdrawal-cause audit was not performed here. Original source/identity, Pi/producer, V2 and protected PitchList were not changed. No Serper or new LIVE customer/subscription/Checkout/charge. A separate empty LIVE subscription update verified native billing write permission without changing billing state.

The ordered queue remains: V3-029 ACTIVE; V3-022 WAITING for17/18October48/72-hour samples (no premature verdict/migration); French proof follows; upcoming/Save deferred. [Full sanitized evidence, request samples and API timelines](../operations/findpitches-v3/reports/performance-readiness-2026-10-16.json).
