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

Implementation verified locally; full suite and guarded customer-only release are in progress. Fresh public/browser baselines have been retained privately. No deployed improvement is claimed by this implementation checkpoint. Final measurements and custody will replace this section after release.

Billing remains DONE. The ordered follow-ups are the remaining measured V3-029 costs, scheduled storage observations on 17/18 October around 09:45 London, real French delivery/proof, then upcoming/Save when earlier tasks are stable. Public browsing and existing subscribers remain available during reversible releases; only new Checkout is briefly closed for the customer deployment.
