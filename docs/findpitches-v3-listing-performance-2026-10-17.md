# Scoped listing HTML — 17 October 2026

The listing JSON API already reads the requested entity's proved country. Listing HTML still fetched the whole global catalogue to produce only that entity's title and structured metadata. V3-029 now applies the existing exact-ID scope to canonical and legacy query-ID listing documents, including language-prefixed routes. It selects by canonical entity ID; the path's country supplies no geography proof. Only that entity is transferred for HTML metadata. The browser detail API retains the complete proved country for identical related listings.

Country/category SEO and sitemaps retain full global counts. Missing/expired listings still return404. Old complete source responses remain a safe compatibility fallback; unexpected partial scopes fail closed through the existing contract. No proof cache, original-source/identity change, schema/producer/Pi/V2 change, paid query or billing-policy change.

Focused checks prove exact HTML parity between complete and properly scoped snapshots for UK/US/query-ID/French-language paths, current expiry/missing-ID exclusion, global country SEO and unchanged Free redaction. **519/519 full V3 tests pass, zero failed/skipped**, including the native100-row preservation control.31focused/boundaries, public29before+closed+restored,18browser samples per phase and5native billing capabilities plus canonical prices/global trial/mail pass. Static frontend assets are unchanged; the earlier response release's frontend3/independence98/build60 baseline stands, with assets rebuilt for release.

Runtime code **dae1b6f0** is LIVE. Final customer version **a3803f31-fe3b-4482-816d-72bd05bd9987**, deployment **0d3cd5c8-0652-47fa-857c-90a73f4c4e16**. Exact tested code ETag preserved after Checkout restoration. Public/sign-in/recovery remained on; new Checkout alone closed briefly and was restored **00:22:42 London**. All eight source Workers, native settings/secrets/schedules, routes/DNS, customer schema/history and protected PitchList deployment are preserved. Normal public-read rate counters were updated by checks; no new LIVE business objects or messages.

## Measured public effect

The same canonical listing ID was measured in both HTTP phases and both browser viewports.

| Listing read | Before | After |
| --- | ---: | ---: |
| HTML HTTP median,3samples | 1.717s | **0.231s** |
| Desktop useful content | 3.041s | **1.645s** |
| Mobile viewport useful content | 2.762s | **1.217s** |

UK API medians remain below a second: catalogue0.385/filter0.425/regions0.492/listing0.423s. Remaining global reads are slower: home1.270/markets1.443/USmap1.383/combinedSEO1.521s. This is a stable measured checkpoint, not a claim that every read is sub-second. Before measurements come from the preceding response release, retaining original timestamps; short live samples vary and are not field percentiles. No speedup is attributed to unchanged routes.

## Verification pacing correction

Parallel HTTP/browser profiling exceeded the existing **120requests/minute per-IP** guard. The final HTTP SEO probe returned429 and the concurrent browser attempt timed out. The failed/partial evidence is retained in the linked report. This was resolved by resuming the incomplete HTTP path, then running the browser profile sequentially with five-second navigation spacing; all final checks pass. The spacing occurs before measured navigation, so timings exclude it. No runtime limit was weakened, provider action repeated, or healthy public service rolled back. The browser profiler now defaults to this bounded pacing; future HTTP/browser profiles should run sequentially. An invalid5001ms setting was rejected before starting a browser, as expected.

## Current product and remaining work

At **00:27:27 London**, **1,777READY**: US1606/GB161/NZ5/AU4/CA1/FR0. Core/dead/stale0, pending customer webhooks0, sourceDB4,090,884,096bytes. Paidqueries0/bulkoff/manualpause; unused source publication/projections/queue0. No source evidence/identity writes by this work, migrations, direct source requests, Pi/V2/PitchList changes or protected merges. No fresh full historical custody audit or inventory-withdrawal cause audit is claimed.

The final read-only French check at **00:23:10 London** still finds0shadow receipts/entities/READY, with two controls excluded. [The reason-code reporter and producer handoff](findpitches-v3-french-intake-2026-10-17.md) are ready for actual delivery.404producer rechecks still need linked fresh evidence (00:12measurement); do not confuse them with the empty V3 work queue or clear them artificially.

[Storage](findpitches-v3-storage-followup-2026-10-17.md) remains40.91% used; actual48/72hour observations are due **17/18October09:45London**. The report distinguishes fixed migration windows from the continuing216.71MB/day event-excluded net rate. No premature storage migration. Upcoming/Save remains deferred pending earlier proof and real not-open evidence. Billing is DONE; public/Checkout/recovery remain on; paid stays off. Remaining global latency is an open performance follow-up.

[Complete sanitized timings, failed/retried probe evidence, custody and safety](../operations/findpitches-v3/reports/listing-performance-2026-10-17.json).
