# Exact SEO counting — 16 October 2026

V3-029 replaces repeated full searches used only for SEO totals with an exact count path. Search and counts share selection and validation. Counts skip facets, sorting, presentation and map payloads; public search still computes facets before the type filter and retains pagination, ordering and Free/Pro redaction. Region counts visit each proved region and its parents once per row, retaining registry order, zeroes and unknown-location exclusion.

This is customer computation only. Each request still reads the live source proof snapshot with current verification, revision, holds, producer clocks and expiry. There is no cross-request cache, proof/identity change, source write, migration, producer change, paid query or billing-policy change.

## Identical-input validation

The read-only [computation profiler](../operations/findpitches-v3/profile-catalogue-computation.mjs) fetched one live snapshot (1,778 mapped rows) and compared the previous module with the new module. All **134 comparisons matched**: mapped rows, every configured market's regions/search variants, homepage and SEO inventories. Four new regression cases cover hierarchy/unknown regions, independent expected filter/date totals at London midnight, invalid requests and intent-region override semantics. Existing customer tests also pass.

Three alternating paired local samples measured:

| Inventory | Previous median | New median |
| --- | ---: | ---: |
| GB, 9 intents | 28.220 ms | 5.013 ms |
| US, 7 intents | 220.172 ms | 88.694 ms |
| FR, no configured intents | 0.204 ms | 0.030 ms |
| CA, 7 intents | 0.294 ms | 0.135 ms |

These are Node computation times on identical live inputs, not Cloudflare Worker CPU or public latency. No raw records were persisted by the profiler. The initial new test included the unactivated DE market and correctly failed `unknown_market`; it was corrected to use configured CA. Runtime geography support was not expanded.

## Release checkpoint

Customer-only runtime code **03614d73** is deployed. Final version **4d3b3693-9271-4a8a-8dea-16dc35595d78**, deployment **b1d8b55a-302d-490c-988f-23fec605d7b3**. Tested code ETag matches after Checkout restoration. All eight source Workers, native settings/secrets/schedules, routes/DNS, customer storage and protected PitchList deployment are unchanged. No migration or source/identity write. New Checkout alone was closed 23:55:41–23:56:32 London; public/sign-in/recovery remained on.

**509/509 full V3 tests pass, zero failed/skipped**, including native 100-row preservation. Public29 before,29 closed and29 restored;18 browser samples per phase;5 native billing capabilities and canonical product/prices/global trial/mail checks pass. Static frontend assets/design are unchanged; its unchanged unit suite was not rerun.

Fresh anonymous browser useful-content times:

| Page | Desktop before → after | Mobile viewport before → after |
| --- | ---: | ---: |
| UK country | 4.343 → 3.077 s | 4.671 → 3.789 s |
| UK category | 3.676 → 3.810 s | 4.463 → 3.760 s |
| Finder | 1.139 → 1.192 s | 1.689 → 1.152 s |

The public API medians remain variable; country1.586→1.619s, category1.484→1.803s and home1.758→1.490s. These short live samples do not establish a general public latency improvement; the identical-input Node measurements isolate the reduced computation. Browser categories and several unrelated paths did not improve consistently. Worker CPU/service-binding transport is not independently measured.

At **23:56:42 London**,1,778 READY (GB162/US1606/NZ5/AU4/CA1/FR0), core/dead/stale0, pending customer webhooks0. Paid0/off/manualpause; unused source publication/projections/queue0. SourceDB4,090,863,616bytes. This is a dated inventory snapshot, not a performance gain. No new LIVE objects/messages/Serper/Pi/V2/protected merges or full historical custody audit.

[Complete sanitized timings/custody/validation](../operations/findpitches-v3/reports/count-performance-2026-10-16.json).

**V3-029 remains ACTIVE:** remove the redundant browser proof read for anonymous SEO pages using a short-lived, single-use response from that same HTML request, with expiry/redaction/session safeguards. Never reuse proof across independent requests or bypass Pro checks.

Billing remains DONE. The ordered follow-ups are the remaining measured V3-029 costs, scheduled storage observations on 17/18 October around 09:45 London, real French delivery/proof, then upcoming/Save when earlier tasks are stable. Public browsing and existing subscribers remain available during reversible releases; only new Checkout is briefly closed for the customer deployment.
