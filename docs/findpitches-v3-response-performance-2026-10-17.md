# One proof read per anonymous SEO page — 17 October 2026

V3-029 removes the browser's redundant combined SEO read when the HTML request has already obtained current proof. The HTML includes only the exact Free-redacted combined response, with true cross-market counts, never the private proof snapshot. The API and HTML use the same page constructor. All source proof/revision/hold/producer-clock and expiry gates still run for that HTML request.

This response is single-use, path-bound and expires within ten seconds of capture, earlier if any global source proof or explicit application close expires. Crossing London midnight forces a live API read. Any session cookie suppresses the optimisation; signed-in client state also rejects it. Missing/malformed/expired/path-mismatched data falls back to the live API. No customer/session information, application/source destinations or private proof data are embedded. HTML/API remain private/no-store. No independent request uses a retained READY cache.

The [contract](../web/findpitches-v3-web/contract/V3_CUSTOMER_API.md) documents this internal HTML transport. Regression tests cover global source-expiry and application-close bounds, London midnight, future clocks, malformed data, excessive lifetime, path mismatch, session bypass, Free redaction, single-use consumption and fresh API fallback. Worker-level checks verify one source read, exact API search/market parity and no customer creation.

Runtime code **8fa4a5ba** is LIVE. Final customer version **43ab6894-db67-4439-89e7-3795051cb7ca**, deployment **f5903666-5bf7-495b-b9d8-a7bf7d047083**; exact tested script ETag preserved after Checkout restoration. Public/sign-in/recovery stayed on; only new Checkout closed briefly, restored **00:04:33 London on 17 October**. All eight source Workers/native settings/secrets/schedules, routes/DNS/customer storage and protected PitchList deployment are unchanged. No migrations/source/identity writes, Serper, new LIVE objects/messages, producer/Pi/V2 changes or protected merges.

**513/513 full V3 tests pass, zero failed/skipped**, including native100-row preservation;27focused/frontend3/98-file independence/60-asset build/boundaries pass. Local browser6cases pass: GB/US/French/German/mobile use zero redundant SEO API reads; forced expiry uses exactly one live API call. The private fixture's initial asset shim lacked Request handling/MIME headers; corrected harness passes without relaxing CSP or TLS. Public29before+closed+restored and18browser samples per phase pass, with zero script/foreign-request errors.

| Useful content | Desktop before → after | Mobile viewport before → after |
| --- | ---: | ---: |
| UK country | 3.077 → 2.406s | 3.789 → 2.394s |
| UK category | 3.810 → 2.827s | 3.760 → 2.489s |

All four public country/category visits made **zero second SEO API calls**, versus one each before. The before samples are the immediately preceding count release's after profile, with original timestamps retained. Other path timings vary; no general improvement is claimed. Current API medians: UKcatalogue0.428/filter0.310/regions0.329/listing0.332s. Globalhome1.734/markets1.457/USmap1.239/combinedSEO1.235s remain above one second. This is a stable measured checkpoint, not a claim that every public path is sub-second; global transport/query work remains a follow-up.

At **00:04:48 London**,1,777READY: GB161/US1606/NZ5/AU4/CA1/FR0. Core/dead/stale0, pending customer webhooks0, sourceDB4,090,884,096bytes. Paid0/off/manualpause; unused source publication/projections/queue0. Counts are dated live snapshots, not optimisation gains; no cause audit for the GB161vs162 change or fresh full historical custody audit is claimed.

[Full sanitized evidence](../operations/findpitches-v3/reports/response-performance-2026-10-17.json). Continue the ordered queue at storage measurement preparation (actual48/72h due17/18October09:45London), then real French intake/proof reasons. Upcoming/Save remains deferred pending prior proof/dependencies. No autonomous paid acquisition or unrelated expansion.
