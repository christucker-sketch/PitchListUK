# FindPitches customer languages — 15 October 2026

German and French are live in the existing V3 customer application. The language selector changes the interface independently of the country being searched. Existing English URLs, accounts, global Pro membership and prices are preserved.

- German: https://findpitches.com/lang/de/
- French: https://findpitches.com/lang/fr/
- France in French: https://findpitches.com/lang/fr/fr/

Home, Finder, listing details, country/category pages, pricing, account, saved searches, alerts and organiser screens share one application and API. The catalogs contain 1,019 owned interface messages per added language. Dates, numbers and monetary formatting follow the chosen language; country units and selected billing currency keep their existing meaning. The selector preserves country, entity and search filters. It remembers an explicit choice without guessing from browser language or location.

Original listing titles, organisers, venue/location names, source notes, fees, URLs, identities and proof clocks remain original. The detail screen explains the original source language. No translation service runs against source fields. Enquiry, registration, phone and application actions keep distinct, honest labels on desktop and mobile.

Sign-in mail uses the chosen language and existing sender; its proof remains one-use with a 15-minute expiry. Checkout and Portal receive the validated language and fixed same-origin return paths. Existing sessions, currency, trial/idempotency safeguards and global entitlement retain precedence. Automated tests used mocked mail/billing providers: no new sign-in messages, Checkout sessions or payment objects were created. Real owned LIVE Checkout → global Pro → Portal acceptance remains the separate V3-010 gate.

## Deployment and checks

Final active public Worker version: `e6c4f562-dd47-4e63-9658-1b2ff9ad2669`; code upload `db4dbffd-b4f3-4735-a6b1-bac59107fcd4`. Restricted preview: `95f59b27-2475-4d7d-a2e9-8de9459c2746`. The guarded customer code/assets release temporarily closed new Checkout, then restored the original LIVE setting. Public browsing, account recovery and LIVE Checkout are enabled. Native configuration reconfirmed at 20:12 London: bindings exactly match the original baseline; routes/DNS/PitchList, secrets, customer storage and schedules were preserved. No migrations or source Worker deployments.

| Check | Result |
| --- | --- |
| Full V3 suite | 439 passed; 0 failed/skipped |
| Focused customer/localisation/production tests | 44 passed |
| Frontend contract tests | 3 passed |
| Independence / build / runtime boundaries | 93 files checked; 56 public files built; passed |
| Local desktop/mobile browser | 130/130 passed |
| Restricted native preview, earlier checkpoint | 112/112 passed before final category/copy additions |
| Final actual public desktop/mobile browser | 124/124 passed, 15 October 11:48 London |
| Public security/API/SEO smoke with LIVE Checkout | 29/29 passed; rechecked 15 October 20:13 London |

Public browser acceptance covers both languages, country/filter switching, Free redaction, original titles compared with the exact rendered API response, responsive bounds, category guidance and localised navigation. Zero browser errors, foreign requests or TLS bypasses. The local harness also exercises Pro routes without creating a real customer. Mail, payment locale/ownership and one-use proof safeguards have meaningful mocked-provider coverage; the tests do not claim hosted-provider real-device acceptance.

The retained-evidence audit at 11:33 London compared 15,811 receipts, 108,819 source facts and 7,077 existing entity IDs by original-row digests: **0 destructive mutations and 0 existing identity changes**. Original-build deployment/V2 schedules remained unchanged. Source customer projection/publication rows stayed 0/0, publication API denied, source publication off, paid queries 0 and bulk off. The independent source snapshot at 11:37 London had core due/leased/dead jobs 0/0/0. Its READY count was 1,862 at that checkpoint; localisation created **zero** new opportunities or imports. These measurements retain their observation times rather than being presented as fresh commercial inventory.

## Gates and next work

German/French pages are `noindex,follow` and absent from the sitemap and language alternates. Indexing needs native-language copy/keyword review and useful source-proved inventory. The optional indexing control cannot bypass existing country/proof/inventory rules. English indexing remains unchanged. The optional whole-feature opt-out and same-country hreflang behavior are tested.

German UI does not activate Germany as an inventory country. Germany still needs coordinated country/proof integration and Claude's producer pack. Original source translations, if introduced later, need separate provenance-bound display records and cannot replace evidence.

France cloud/storage gates were cleared at 07:22 London. Claude's subsequent host-hardening handover reports kit 011n installed, memory cgroup enabled, an SSD boot fix and a small supervised test passed. France crawl has resumed; FR export stays held pending about 24 hours of clean cycles. Its 172 engine candidates are not V3 READY totals. Codex did not independently inspect the Pi or change producer/Pi files. V3-020 French official organiser/council HTML/PDF proof and V3-022 hot-data growth monitoring remain open. Source publication and paid acquisition remain disabled. No production cutover, protected merge or V2 mutation occurred.

[Machine-readable evidence](../operations/findpitches-v3/reports/customer-localisation-2026-10-15.json) · [Implementation and maintenance](../web/findpitches-v3-web/LOCALISATION.md).
