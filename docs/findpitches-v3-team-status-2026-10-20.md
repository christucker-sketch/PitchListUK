# FindPitches V3 — full team status, 20 October 2026

**Operations have improved substantially. Catalogue growth and French conversion remain weak.** At **16:22 London**, the customer catalogue contained **1,679 READY opportunities**, down 50 from 1,729 on 18 October.

[Live measurement aggregates](../operations/findpitches-v3/reports/team-status-2026-10-20.json). Checks were taken between 16:22 and 16:34 London, with observation windows stated separately. Counts represent distinct application opportunities, not necessarily distinct festivals. The internal source count is 1,681; two French producer-LOW records are correctly withheld from customers.

| Measure | Previous checkpoint | Current observation |
| --- | ---: | ---: |
| Customer READY | 1,729 | **1,679**, down 2.89% |
| Producer rechecks pending | 673 | **128**, down 81.0% |
| Renewal attempts in matched 23-hour windows | 7,474 | **2,137**, down 71.4% |
| D1 net growth | Earlier reference about 203 MB/day | **About 116 MB/day** over 47.5 hours |
| D1 capacity used | 44.21% | **46.49%**, with 5.35 GB free |
| French customer READY | 1 from 29 entities | **1 from 30 entities** |
| V3 Serper usage since 18 October | Paused | **Zero usage rows; still paused** |

The renewal comparison measures processing attempts rather than HTTP requests or paid-search credits. Each window contains 23 completed hours and excludes the release boundary. Source mix, delivery and operator activity changed, so this is an observational comparison rather than an isolated causal benchmark.

Storage still grows. The first actual 24-hour checkpoint added 128.59 MB; 191 samples now cover 47.5 hours and 229.03 MB of growth. **The exact 48-hour endpoint is due today at 16:45 London and was not yet observed in this check.** No migration or deletion occurred.

**Inventory and withdrawals.** Twelve genuinely new US entities became customer READY. Sixty-two previously visible opportunities are now withheld: 49 US and 13 GB. All 62 identities remain in V3.

| Main current hold | Opportunities |
| --- | ---: |
| Application-deadline date hold | 21 |
| Event-ended date hold | 2 |
| Closed, cancelled or waitlist state | 17 |
| Identity or quality hold | 5 |
| Source-proof quarantine | 8 |
| Other verification or binding hold | 8 |
| Source retrieval failure | 1 |
| **Total withheld** | **62** |

These are current dispositions, prioritising retained date fields. They do not reconstruct the first withdrawal transition or prove every selected date correct; other holds can coexist. The 22 proof and quality cases need investigation, including eight reviewed-calendar binding holds. They should not all be described as natural expiry.

Of the 27 opportunities recovered on 18 October, **26 remain customer READY**. One is quarantined over a source/selected-deadline disagreement. Renewal monitoring shows **zero expired-positive/cached-READY gaps**, zero due, leased or dead core jobs, and zero stale leases. Seven source failures remain in daily cooldown, so the overall renewal health indicator still reports degraded.

| Country | Customer READY |
| --- | ---: |
| US | 1,522 |
| GB | 146 |
| NZ | 5 |
| AU | 4 |
| CA | 1 |
| FR | 1 |
| **Total** | **1,679** |

| Earliest origin producer | Customer READY |
| --- | ---: |
| Direct platform catalogue | 828 |
| Independent Claude/Pi structured producer | 430 |
| Source-reverified legacy V2 recovery | 279 |
| UK official sources | 138 |
| Earlier source-led paid discovery | 3 |
| Original PitchList recovery | 1 |
| **Total** | **1,679** |

Origin attribution is exclusive; records can have additional corroborating producers. The three source-led records came from earlier work. They do not indicate a paid restart. Recovered records must pass current V3 proof gates.

**Pi and structured delivery.** The latest authenticated poll was at 16:18 London, source check at 15:28 and genuinely new receipt at 15:47. Compared with the 18 October 17:22 observation, the producer delivered 3,176 additional immutable versions and 45 additional producer IDs. Versions include refreshes; producer IDs are not READY opportunities.

There were 1,145 acknowledgements over 24 hours. There are 128 pending rechecks and none currently eligible for acknowledgement from fresh evidence. This check cleared none. Contact and freshness are healthy, but one 24.1-minute gap leaves the strict 15-minute cadence flag false.

**France and Germany.** France has 30 commercial entities, three source-verified and one customer READY. The two producer-LOW holds remain. The four checked extraction errors are unchanged: Angers assigned to Bretagne with the wrong start date, Plouarzel's organiser recorded as Google Docs, La Verpillière's application window used as event dates, and Saint-Marcellin's generic site title. The reusable proof work is unfinished. [Source-backed repair cases](findpitches-v3-france-conversion-diagnosis-2026-10-18.md).

German source preparation and the German interface exist. German inventory intake and the customer country market remain disabled.

**Frontend and deployment.** The production site and existing LIVE Checkout are enabled. The homepage and German/French language pages returned 200 with matching language markup. Language routes are `/lang/de/` and `/lang/fr/`. France's country page `/fr/` returned 200; Germany's `/de/` correctly returned 404 because that market is disabled.

The customer Worker remains `a3803f31-fe3b-4482-816d-72bd05bd9987`. **All 29 fresh public security, API and SEO checks passed**, including Free link redaction, held-record exclusion and Checkout availability.

The APIs supply map points for **844 of 1,522 US** opportunities and **123 of 146 UK** opportunities. These count opportunities with eligible coordinates, not distinct pin positions. Single HTTP observations were homepage 0.56 seconds, UK API 0.78 seconds and US API 1.34 seconds; German/French language shells took 0.39/0.28 seconds. This was not a fresh browser or load benchmark. The remaining global performance follow-up stays open.

**Billing and commercial traction.** Production is configured for LIVE billing. Stored V3 records show one account, zero new accounts since 18 October, and one trialing subscription scheduled to cancel. There are no stored active paid subscriptions. These figures do not demonstrate new paying-customer growth and are consistent with the existing acceptance trial. Pending and error webhook counts are zero. No fresh Stripe invoice or revenue audit was performed. Live UK PitchList remains separate and untouched.

**Spend and preservation.** V3 acquisition remains manually paused with bulk off. The commercial ceiling remains 25 queries/day, alongside hard limits of 4/run, 100/hour and 1,000/day. No V3 Serper usage rows exist for 18–20 October. Native read-only checks show V2's scheduler empty and legacy global US, UK and CA controller flags false. This is not a complete account-wide provider credit audit.

The unused source publication pipeline remains off with zero customer/publication rows; the separately authorised public customer site stays on. Today's bounded custody check compared **79 original receipts, 1,163 original facts and 62 identity tuples**, finding **zero mutations or identity changes**. It excludes the separate 12-fact/one-identity deadline case from 18 October and is not a whole-database historical audit.

The last full V3 suite passed 541 tests on 18 October. It was not rerun for this read-only update; today's 29 public checks passed. Public probes can increment ordinary security counters. No source, identity, business, provider, runtime or producer-host change was made.

**Team activity and priorities.** Deployed automation continued between sessions. No newer shared-branch implementation or native V3 runtime release has landed since 18 October; unpublished external work is unknown. French fixes were not implemented in an unattended Codex session.

1. Complete genuine producer field corrections and reusable French official-event/application proof, beginning with the qualified Calypso, GL Events and form cases. Preserve evidence, identity and confidence safeguards.
2. Investigate the 22 proof/quality withdrawals, especially reviewed-calendar bindings. Prioritise defensible recovery over repeatedly fetching past or closed records.
3. Complete the actual 48-hour storage observation at 16:45 London. The 24-hour and 47.5-hour observations are available; future coverage is not claimed complete.
4. Build real customer acquisition around stronger inventory. LIVE billing works, but stored V3 records do not yet demonstrate paying-customer growth. Paid discovery stays paused while conversion improves.

Billing implementation remains complete. French conversion is active, global performance follow-up is open, and upcoming/Save remains deferred. V2, PitchList, infrastructure and protected branches were not modified.
