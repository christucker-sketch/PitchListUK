# UK commercial growth outcome — 12 October 2026

**134 UK customer-ready opportunities, up from 127: seven gained with zero Serper queries.** Customer inventory observed at **17:13:15 UTC / 18:13:15 London**; public API confirmed at 17:13:19 UTC. This is the completed first D-017/V3-007 batch, not completion of the wider UK growth programme. [Machine evidence](../operations/findpitches-v3/reports/uk-growth-outcome-2026-10-12.json).

| Commercial measure | Before | After |
| --- | ---: | ---: |
| UK customer-ready opportunities | 127 | **134** |
| Distinct exact source-location strings | 15 | **21** |
| Distinct source-organiser strings | 4 | **5** |
| Proved UK browse regions | 2 | **4** |
| Precisely located opportunities | 123 | 123 |
| Verified venue map groups | 12 | 12 |
| Mynt share of UK READY | 96.85% | **91.79%** |

Location strings are a transparent source-backed grouping, not a claim of globally certified physical-venue deduplication. The new CCA records represent **six independently proved named venue programmes** and seven event/application groups. Two Lowther editions remain separate opportunities at one venue. Multi-day bookings remain one opportunity per event, not invented daily rows.

## Where the READY inventory comes from

| Current verified source | UK READY |
| --- | ---: |
| Mynt Image | 123 |
| Creative Crafts Association | **7** |
| Eventeny / Discover Ellesmere | 2 |
| LocalStalls / King Edward’s School, Bath | 1 |
| Northampton Town Council | 1 |
| **Total** | **134** |

Exclusive historical origins are UK official 125, independent structured producer 5, platform catalogue 2, legacy Mk1 1 and legacy V2 1. Historical origin differs from the current proof source: this batch created **two new IDs** and made **five existing IDs READY**, comprising four structured-origin records and one legacy-V2-origin record. All seven additions now have independently fetched official CCA proof; no V2 customer field is being accepted as stronger evidence.

Proved browse coverage is South East 89, South West 34, North West **6**, West Midlands **1**, plus four without a proved registry region. Scotland/Wales/Northern Ireland remain zero. Earlier Scottish coverage was a display error: “Scotland Street” in Ellesmere, England. The conservative address-component fix is live; original evidence was unchanged.

The six new venue programmes are Staffordshire Showground, Dobbies Southport, Dobbies Liverpool, Lowther Gardens, Dobbies Carlisle and Haydock Park Racecourse. They add one operator and two browse regions. Exact map pins remain at 12: CCA postcode geography proves country/region, but postcode centres and Google map camera coordinates are not venue pins. All 11 unpinned opportunities are presented honestly.

## Proof, identity and spending

The CCA verifier binds each exact dated active booking control to its official venue calendar, full date range, named venue/address, matching public postcode-country receipt and current trader-purpose booking form. Disabled controls, waitlists, closed/restricted routes, contradictory editions and ambiguous geography are held. Four gazebo variants are excluded; the reversed-year Arley case remains held. No booking form was submitted.

Five directory-derived probable matches required explicit review. The review preserves original receipts, facts and PROBABLE_MATCH decisions, adds an immutable review receipt and per-field supersession ledger, retains the entity ID/country/edition/environment, and records the new official source aliases. Current source proof and readiness remain independent gates. Unchanged directory redelivery cannot undo the reviewed official facts; explicit closure still withholds readiness.

There are **45 audited source-backing supersessions**, including **35 selected value changes** to titles, organisers, full locations, application states/routes and source metadata. Start/end date values changed **zero** times. The missing official source IDs and proof region fields are additive. This is documented stronger-source reconciliation, not an unreported identity rewrite.

The adapter used **52 budgeted direct HTTP requests**: 17 initial catalogue requests, 5 on a transaction that rolled back, 25 fresh review requests and 5 Haydock requests. Public-source research used 14 separate GETs. **Paid queries/observed paid credits added: zero.** These counts exclude public browser/admin health reads and normal independent Pi work.

The first live review hit D1’s expression-depth limit and stopped automatically. Native workerd reproduced it; migration 0020 balances the same **53 unchanged guard predicates**. The failed transaction created zero review receipts/supersessions and left selections unchanged. Its five requests remain charged. Committed selections and proof now share an atomic transaction; tested recovery never resets proof clocks or budgets, and newer/expired proof cannot be promoted by replay.

The UK-only paid programme is implemented with a server-owned four-query regional plan, source exclusions and zero-READY-after-four-settled-queries stopping. It has **not run**. Global 4/run, 100/hour, 1,000/day and commercial 25/day caps remain, with the existing GB quota; paid stays manually paused and bulk off. No standing scheduler was enabled.

## Deployment and validation

Full V3 **326/326**, frontend **3/3**, independence/boundary checks, native D1 review/rollback coverage, actual public desktop/mobile map **32/32** and public API/security/SEO **29/29** pass. The public smoke runner now explicitly supports the approved LIVE Checkout state; its earlier closed-Checkout assertion was a stale test assumption, not a production failure.

V3 shadow API/enrichment/acquisition and the affected reconciliation/classification/readiness Workers were released with native bindings, secrets and schedules preserved. Only V3 shadow migrations 0019/0020 were applied. The customer geography correction used the guarded version release with Checkout briefly closed, then restored. Current customer version is `ab008ef7-4317-4244-a42b-15ebdae1a6f2`; public browsing, account recovery and Checkout are **LIVE**. No new routing/cutover, alert campaign, provider object or email was created. FindPitches-only existing routes and protected PitchList remain intact.

Native observation **17:14:18 UTC**: global eligible READY **1,788** (GB 134 / US 1,648 / AU 2 / NZ 4); Nashville zero. Source due/leased/dead jobs **0/0/0**, future watch jobs 9,190. Pi poll 17:01:44 UTC; latest exported source time 14:40:08 UTC, cadence healthy, no freshness warning; **579 pending producer rechecks**. Transport health is not proof that every recheck was acted upon.

Preservation observation **17:17:54 UTC**: **23,021 receipts / 192,924 source facts / 7,232 fixed identity tuples** compared, zero destructive mutations or fixed ID/country/edition/environment changes. The older build baseline also passes: 15,811 receipts / 108,819 facts / 7,077 identities. Original identity custody survives in all five reviewed matches. Source customer-projection/publication-queue rows remain **0/0**, source publication denied/disabled, V2 schedules and PitchList deployment unchanged. Existing authorized customer exposure is LIVE; no unsafe leakage was detected.

Native billing/mail verification returned 200. Owned production customer/subscription/Checkout-attempt counts remain zero; seven unowned webhook receipts do not prove a real customer journey. Genuine owned LIVE Checkout → global Pro → Portal acceptance remains a separate pending task.

## Highest-value next work

The first target of seven READY gains and six venue programmes is met. The wider target remains +50 UK READY with at least three non-Mynt operators and four proved regions; it is a target, not a forecast.

**Next: Claude/Pi fresh official Folk & Bespoke event/application custody, then operator-first Scotland/Wales/NI discovery.** Cloud Folk fetches are blocked; 16 historic routes are leads, not 16 promised READY. The Pi must retain full source documents, exact source clocks and event/application joins, and hold past Chelmsford and contradictory Wyvern cases. [Producer requirements](../team/CLAUDE_UK_GROWTH_REQUIREMENTS.md) are posted; acknowledgement, installation and execution are not assumed.

| Remaining blocker / lane | Measured population | Defensible upside / action |
| --- | --- | --- |
| Operator concentration | Mynt 123/134 READY | Prioritise genuinely new operators and regional venue programmes. No numeric source forecast. |
| UKCraftFairs transport/enquiry proof | Original baseline 161; five now proved independently against CCA | Do not treat the remaining directory/enquiry population as READY. Option B stays closed. |
| Folk & Bespoke custody | 16 historic route observations; cloud 403 | Pi fresh proof first; recoverable READY unquantified. |
| LocalStalls occurrence/route/organiser proof | Baseline 40 entities, READY 1; diagnostics overlap | Precise suffix fix potentially 0–1; rolling/season identity requires explicit occurrence evidence. |
| VMC/CJS/council and regional forms | Five VMC dated service leads; other lead counts unproved | Public trader availability/event joins required; account intake/index/PDF shells are not proof. |

Continue free conversion first. A later four-query UK pilot is authorized under D-017 only when needed for a convertible source path; this completed batch did not need paid discovery. UKCF Option B, legacy subscriber migration, customer alerts, destructive legacy changes and protected/live merges remain separate gates.
