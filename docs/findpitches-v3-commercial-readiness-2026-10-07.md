# Commercial inventory and growth — 7 October 2026

**FindPitches V3 has 450 customer-ready opportunity entities in shadow inventory: 441 originated from Claude structured discovery, 9 from legacy recovery, and 0 from paid search.** This is the verified commercial snapshot at 15:20 BST / 14:20 UTC. Publication, production cutover and paid bulk acquisition remain disabled.

Claude direct-source verification added **434 READY opportunities**, taking the commercial total from 16 to 450. Source evidence and canonical identities were preserved. These are source-proved trading opportunities under the current gate; no customer listings were published.

## Authoritative inventory

Attribution uses the earliest accepted, non-diagnostic producer receipt linked to each entity. These origin rows are exclusive and sum to the commercial total. All 104 synthetic test/control entities are excluded. Existing real opportunities sampled in earlier audits remain commercial entities.

| Origin | Distinct entities | Verified | READY | WATCH | Quarantined | Blocked |
|---|---:|---:|---:|---:|---:|---:|
| Claude / `independent-structured` | 886 | 444 | **441** | 168 | 176 | 101 |
| `legacy_v2` | 4,555 | 9 | **9** | 732 | 226 | 3,588 |
| Serper / `city-search` | 20 | 0 | **0** | 0 | 11 | 9 |
| Commercial total | **5,461** | **453** | **450** | **900** | **413** | **3,698** |

| Origin | Awaiting verification | Missing application proof | Stale/expired | Distinct entities checked |
|---|---:|---:|---:|---:|
| Claude | 220 | 346 | 40 | 886 |
| Legacy | 4,494 | 4,546 | 90 | 121 |
| Serper/city | 10 | 20 | 0 | 12 |
| Commercial total | **4,724** | **4,912** | **130** | **1,019** |

READY, WATCH, quarantined and blocked are exclusive commercial dispositions. Verified and the three flags in the second table overlap those dispositions. Verified means current, revision-matched full proof; identity conflicts can still withhold a verified entity. Awaiting verification includes failed/unsupported source extraction and expired proof, even if a fetch was attempted. Stale/expired includes expired or revision-invalid proof and past event/application dates. Quarantine includes retained identity/evidence/legacy holds and unsafe source classifications. These categories are derived consistently by the commercial inventory service rather than counted from old readiness caches.

There are 888 Claude receipts representing 887 producer IDs, with 886 linked entities and one unlinked receipt requiring an identity decision. That receipt is withheld. The city cohort includes both the earlier 10-result canary and the later 10-entity pilot.

Source membership also remains visible because entities can retain several producers' evidence:

| Source membership — overlaps | Entities | Verified | READY | WATCH | Quarantined | Blocked | Awaiting verification | Missing application proof | Stale/expired |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Claude | 886 | 444 | 441 | 168 | 176 | 101 | 220 | 346 | 40 |
| `legacy_v2` | 5,433 | 452 | 449 | 898 | 398 | 3,688 | 4,711 | 4,885 | 130 |
| City search | 20 | 0 | 0 | 0 | 11 | 9 | 10 | 20 | 0 |

The membership READY counts must not be summed: 440 Claude-origin READY entities also retain legacy evidence. Qualified recovery still accounts for 5,597 records linked to 5,336 entities; the broader legacy-tagged inventory includes 97 held entities from pre-qualification ingestion. The 25,606 quarantined recovery units were not bulk-copied into commercial inventory. The earlier recovery totals remain unchanged.

## Where READY inventory comes from

| Verified country | READY |
|---|---:|
| United States | **443** |
| Australia | **3** |
| United Kingdom | **2** |
| New Zealand | **2** |
| Total | **450** |

| Source platform/domain | Claude-origin READY | Legacy-origin READY | Total READY |
|---|---:|---:|---:|
| Eventeny / `eventeny.com` | 435 | 8 | **443** |
| LocalStalls / `localstalls.com` | 6 | 1 | **7** |
| Total | **441** | **9** | **450** |

All 450 have source-proved **OPEN_NOW** applications. READY counts for ROLLING, ENQUIRY_AVAILABLE, waitlists and closed applications are zero. A retained ROLLING claim can be corroborated by a currently open application; the commercial state remains the source-proved OPEN_NOW. Generic enquiries do not qualify.

Inventory uses the existing canonical application-opportunity identity. An advisory equality check of proved country, event name, start/end dates, organiser and location produced 450 distinct event groups and zero exact multi-application groups. This diagnostic does not merge identities or assert that all semantically similar events have been adjudicated.

## Claude verification and commercial safeguards

All **886 distinct linked Claude entities** were checked, prioritising explicit application URLs, Eventeny/LocalStalls, future dates, OPEN/ROLLING states and organiser/location evidence. There were 980 verification attempts: 886 initial checks, 75 checks under corrected platform application semantics, and 19 commercial-scope rechecks. Five additional source documents were inspected read-only. **Zero Serper queries were added.**

| Claude source family | Checked | Verified | READY | New READY |
|---|---:|---:|---:|---:|
| Eventeny | 588 | 438 | 435 | 428 |
| LocalStalls | 135 | 6 | 6 | 6 |
| UKCraftFairs | 55 | 0 | 0 | 0 |
| ClueMart | 39 | 0 | 0 | 0 |
| Other sources | 69 | 0 | 0 | 0 |
| Total | **886** | **444** | **441** | **434** |

Full verification success is **50.11%**; current READY conversion is **49.77%**; newly gained READY conversion is **48.98%**. The final Claude dispositions are 441 READY, 168 WATCH, 176 quarantined and 101 blocked.

Two source semantics were corrected without changing source facts. A LocalStalls event-detail URL is a supported landing route only when that same event exposes a unique application UUID/event UUID and explicit open control. The actual form URL stays in proof. A current Eventeny OPEN application corroborates current availability of a discovery marked ROLLING; it does not establish perpetual availability. Footer/navigation links, waitlists, closed applications and source disagreements remain held.

A practical application-heading review then found that Eventeny's vendor endpoint also hosts non-trading routes. **Seven performer/entertainment, facility rental, parade or community-stop registrations and twelve nonprofit-only applications were withdrawn from general commercial READY.** The intermediate automatic total of 469 is superseded by 450. Nonprofit-only routes stay WATCH until commercial eligibility is demonstrated. Mixed commercial/nonprofit and actual sponsor/vendor booths retain their explicit source heading; the system does not infer an unsupported audience from a URL.

Application heading/audience are now additive proof metadata and are carried into the authenticated shadow projection. The gate applies these checks to older proofs as well as new fetches. Immutable historical receipts remain intact; first-READY KPIs exclude scope-blind historical claims from these unsupported routes. No customer or publication exposure occurred.

## Highest-impact blockers

Counts below describe affected Claude entities. Reason counts overlap, and a successful fetch alone is not a READY promotion.

| Rank | Source/blocker | Affected | Defensible opportunity for recovery | Engineering effort |
|---|---|---:|---|---|
| 1 | Eventeny retained-field disagreements | 65 | **32** otherwise complete OPEN candidates; conditional planning estimate **18–32 READY** | Medium, approximately 2–3 days |
| 2 | LocalStalls missing event source data and retained-field disagreements | 129: 79 missing JSON-LD, 50 disagreements | **22** otherwise complete OPEN candidates; conditional estimate **10–22 READY**. Another 38 OPEN/ROLLING discoveries lack full proof | Medium/high, approximately 2–4 days |
| 3 | Eventeny unpublished/unproved venue | 55 | Venue is the sole blocker in all 55. Three inspected examples explicitly say TBA. READY upside cannot be forecast until venues are published/proved | Small integration; source evidence dependency |
| 4 | UKCraftFairs HTTP 520 and unproved vendor routes | 55 | All retained states are ENQUIRY_AVAILABLE. No current READY upside is proved; restoring retrieval alone is insufficient | Medium; supported retrieval/export plus organiser verification |
| 5 | ClueMart event/application scope and organiser proof | 39 | Three inspected pages expose event data but no application control in the event article, and use the platform as organiser. No READY upside is currently proved | Medium/high; source-bound form/API and organiser proof |

The nearest bounded opportunity is **54 otherwise complete OPEN candidates** across Eventeny and LocalStalls. A cautious planning range is **28–54 additional READY**, conditional on source-bound adjudication. These are engineering estimates, not observed yield or a population forecast. The other groups have unquantified upside and are excluded from that estimate.

**The single highest-value inventory task is a source-bound additive adjudication workflow for the 32 Eventeny OPEN candidates held only by retained-field disagreements.** It should link new primary-source proof to the original fact and vendor identity, explain exactly what supersedes it, and retain all previous values. Country/edition conflicts and unsupported corrections must remain held. Eighteen of these candidates include a deadline disagreement; organiser, name, location and date differences require case-specific identity review. Raising generic extraction authority to make them pass would undermine this model.

LocalStalls should follow with event-UUID-bound form verification for full-year dates, country, organiser and trading application state. Contact-only forms, incomplete calendar dates and URL country hints cannot supply proof. PDFs and organiser forms need source-specific event/application binding before their smaller source families justify paid discovery.

## Commercial KPIs and continuing delivery

The deployed `/status.commercial` and operator-only `GET /commercial` provide the authoritative inventory and business metrics. A first-proved-READY ledger is append-only and excludes old unverified cache claims, repeated evaluations and proof renewals.

| KPI | Current value |
|---|---:|
| Current customer-ready opportunities | **450** |
| First proved READY on 7 October, London day | **450**; 16 earlier plus 434 gained in this work |
| READY / commercial entities checked | **44.16%** — 450 / 1,019 |
| Claude READY conversion | **49.77%** — 441 / 886 |
| New READY per 100 paid queries | **0** — 0 from 13 lifetime V3 queries |
| Paid queries / new paid READY | Undefined: zero paid READY |
| Paid credit/monetary cost per READY | Undefined: zero paid READY; monetary unit price is unconfigured |
| Stale/expired READY removed | **0 / 450 — 0%** under current commercial criteria |
| Linked candidate/entity duplicate rate | Claude **0%**, city **0%**, legacy **4.65%** |
| READY with source-proved application URL | **100%** |
| READY with future or same-day event start | **95.11%** — 428 / 450 |
| READY with source-proved location | **100%** |
| READY with source-proved organiser | **100%** |

The other 22 READY event starts are in the past, with current event periods and source-open applications still proved. Coverage across all inventory is separately labelled unverified field presence; it must not be confused with READY proof coverage. Duplicate rate uses excess distinct linked producer candidate IDs per distinct entity and excludes replayed receipt versions. It does not automatically merge similar titles. New READY/day measures first valid commercial readiness, including conversion of older discoveries.

READY proof renewals are scheduled two hours before expiry where possible. Within the final two hours of a fixed deadline the next check runs at expiry, preventing a repeated fetch loop. Refresh generations propagate through completed daily jobs, and superseded generations are skipped. Current READY renewals take priority over older legacy work while every lower-priority durable job remains recoverable. Direct verification never acknowledges a producer recheck or changes its source `last_checked` value.

The cloud producer endpoint is ready at a 900-second cadence. **No authenticated producer recheck polling has been observed; host delivery cadence remains unconfirmed.** The last new receipt was 6 October at 13:44 UTC, with retained source checking time of 5 October. Continuing producer growth therefore depends on confirming the Windows scheduled runner and fresh export generation. Source verification in the cloud does not disguise stale producer exports as a fresh crawl.

## Bounded acquisition plan and validation

Paid acquisition remains disabled. The [draft source-led pilot](../operations/findpitches-v3/reports/source-led-acquisition-plan-2026-10-07.json) caps any future trial at **24 queries**, with 16 Eventeny application queries, four LocalStalls application queries and four preverified official organiser/council form queries. Query geography is targeting metadata; canonical geography must come from the source. Social, directory, editorial, visitor-ticket and generic contact/demo routes are excluded or strongly deprioritised.

Before granting paid work, a source-led adapter and **30 unseen free holdout records** must demonstrate at least 20 READY, at least two countries including three non-US READY, a supported application URL mix of at least 80%, zero false promotions/mutations/leakage and a settled queue. Official/PDF discovery requires a working verifier first. The existing broad city runner stays disabled. The draft grants no paid work and does not forecast novel-search yield from the Claude corpus's 73.98% Eventeny conversion.

The plan pauses at zero new READY after eight queries, under 0.2 new READY/query after twelve, duplicate rate above 70% after twenty candidates, excessive verification/backlog delay, or any mutation/identity/leakage violation. Existing hard ceilings remain **4/run, 100/hour and 1,000/day**. Today still shows 12 queries/12 observed credits from the earlier pilot; lifetime V3 usage is 13 queries. This work spent zero additional Serper credits.

All **105 V3 tests pass**, including native workerd/D1, the 100-row preservation control, budget protection, application scope, old-proof invalidation, history immutability and renewal/backlog priority. Migrations 0011/0012 and all eight owned shadow Workers are deployed. Remote checks confirm:

- **8,240 original receipts and 63,759 original source facts preserved; zero destructive mutations.** The 65 added enrichment receipts/facts are additive.
- **Zero identity changes and zero new/deleted entities from verification.**
- **Zero customer rows, zero publication rows, zero due core/acquisition jobs, zero dead jobs and zero stale leases.** Future watch work is scheduled rather than overdue.
- Current READY entities have generation-bound refresh schedules. Publication returns HTTP 403; ingest credentials cannot access commercial/operator routes; bulk and ungranted canary requests are rejected before provider calls.
- V2 code/data/infrastructure, production traffic and protected branches remain untouched.

The [machine-readable readiness report](../operations/findpitches-v3/reports/commercial-readiness-2026-10-07.json) contains the exact cohort/source breakdown, blockers, preservation checks, KPI definitions and delivery state.
