# V3-011: international conversion checkpoint

Author: Codex. Measurements: **11 October 2026**, separately timed below, Europe/London. Scope: reversible V3 shadow work under the current hub orders. Claude retains the producer; this checkpoint completes Codex's first L1/L2 increment, not the whole international programme.

**Outcome: 75 direct-source entity checks, zero new READY, five cohort READY retained, zero selected-field changes.** Conservative ClueMart and MarketsIreland proof adapters are implemented. The main AU conversion problem is now quantified: contaminated organiser selections and retained equal-authority conflicts, rather than insufficient candidate volume.

The global source-proof snapshot at **14:57:26 London** contained **1,812 READY/private-preview-eligible applications**: GB **127**, US **1,679**, AU **2**, NZ **4**, CA **0**, IE **0**. Producer-policy withholding was zero at that snapshot. This is a current READY/country recount, not a refreshed full origin/disposition report; the 10 October breakdown retains its own time. The international checks did not cause a net READY loss in their cohort.

## Current international ledger

Observed **14:59:58 London**. [Every structured source/domain’s reason counts](../operations/findpitches-v3/reports/international-blockers-2026-10-11.json) and [aligned before snapshot](../operations/findpitches-v3/reports/international-blockers-before-2026-10-11.json). Legacy-only domains are summarized separately; their records/reasons remain in the complete all-commercial totals.

| Market | All commercial entities | Structured-member entities | Structured READY | WATCH | Quarantined | Blocked |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| AU | 303 | 200 | 2 | 13 | 74 | 111 |
| NZ | 292 | 92 | 4 | 5 | 79 | 4 |
| CA | 172 | 31 | 0 | 8 | 9 | 14 |
| IE | 175 | 2 | 0 | 0 | 0 | 2 |
| **Total** | **942** | **325** | **6** | **26** | **162** | **131** |

The four disposition columns concern structured membership and sum to 325. Membership can overlap other origins. These are distinct linked V3 entities, including retained historical editions; they are not Claude's current-host export totals. Test/control entities are excluded. Market on a held record is its retained discovery identity, not verified geography. Stale/awaiting/proof/blocker flags overlap; do not sum them.

| Structured source | Entities | READY | Important retained/current blockers |
| --- | ---: | ---: | --- |
| AU LocalStalls | 183 | 2 | 112 missing single-event source data; 105 missing selected location; 128 awaiting current proof; 31 unresolved evidence conflicts |
| NZ LocalStalls | 21 | 4 | 7 missing single-event data; 9 unproved/ambiguous application routes; 8 awaiting current proof |
| NZ ClueMart | 68 | 0 | 23 freshly assessed OPEN/ROLLING records lack named organiser and usable trader application proof; dates/states contradict retained selections; 45 older closed records retain their earlier identity/parser holds |
| CA Marketspread | 5 | 0 | All 5 lack a single bound Event document and named organiser; 3 are selected OPEN_NOW, 2 ROLLING |
| CA other domains | 26 | 0 | Official/form/hub sources need event-to-application bundles; 20 missing organisers across the entire CA structured cohort; 5 editorial/index cases; 3 transport failures |
| IE existing sources | 2 | 0 | DocsIreland: event data/organiser/location missing. Cork Summer Show: retained source redirect loop, enquiry state and missing location |
| MarketsIreland | 0 delivered | 0 | Adapter ready; no accepted market records in this snapshot. Claude's new kit is not assumed installed |

Counts above include latest retained reasons; expired reports are explicitly diagnostic history, not a claim of a new visit to every entity. The JSON separates those from fresh proof and gives every domain's reason counts.

## LocalStalls: the commercially useful diagnosis

AU's **32 selected OPEN_NOW LocalStalls entities** have **2 READY, 24 quarantined, 6 blocked**. Overlapping reasons:

| Blocker | Affected entities |
| --- | ---: |
| Selected organiser disagrees with source proof | 23 |
| Unresolved evidence conflict | 22 |
| Missing single-event source data | 6 |
| Missing selected location | 6 |
| Proof expired or entity revision changed | 11 |
| Selected title disagrees | 1 |
| Selected start date disagrees | 1 |

There are no explicit country-mismatch or application-route-failure reason codes in this OPEN_NOW cohort. That does **not** prove geography/application availability for the six pages that fail before event binding. Missing JSON-LD must not be bypassed with the URL's country or a guessed date.

[Read-only hold audit](../operations/findpitches-v3/reports/international-hold-audit-2026-10-11.json), **15:01:57 London**: **66 unresolved equal-authority conflicts across 22 entities**. Selection history identifies organiser disagreements as the recurring cause; a separate historical lifecycle disagreement is not permission to clear current holds.

The recurring producer value includes adjacent text, such as `Crystals Creatives & Mystics Fair One-off / Irregular`; the source's organiser is `Crystals Creatives & Mystics Fair`. Other examples append venue text to the organiser. Original evidence remains unchanged. Structured facts have authority **100**, whereas direct-form proposals have **95**; verification correctly cannot silently replace them. A corrected equal-authority producer receipt also creates a conflict for non-lifecycle fields under the existing model.

**17 OPEN_NOW cases currently have source-complete proof and only an organiser selection mismatch. Only one has no additional eligibility/evidence hold; the other 16 need reviewed conflict resolution.** Two other source-complete cases have additional selected-field disagreements. These are bounded review populations, not promised promotions.

NZ has **4 selected OPEN_NOW LocalStalls entities, all 4 READY** in the final ledger. The bounded pass checked three of those plus one ROLLING record; the fourth READY lies outside the cap. No inference from a partial cohort to the whole corpus is made.

## L1: ClueMart distinguishes metadata from an application

The new adapter binds the exact application slug, public Event JSON-LD and literal public Next data frames. It never executes scripts or fetches the robots-disallowed `/api/` paths. Country/date/venue come from source data, not search geography or the hostname. Platform-default organiser `ClueMart` is not accepted as the market operator.

An application shell alone has **UNKNOWN availability** and no proved application URL. An actual scoped trader form with explicit open wording, a real named organiser, current dates, geography and stable page identity is required by this adapter. The positive form fixture is explicitly synthetic: it is a safeguard test, not evidence that current live shells contain that form. Footer controls, login/waitlist pages, crossed slugs, stale dates, contradictory metadata and explicit demos cannot pass.

Claude's 74-page source survey revised the proposed ~50 NZ upside down: 61 bare pages, description-only pages and one probable test listing. The V3 check agrees that current OPEN labels are not defensible application proof. Across **23 OPEN/ROLLING ClueMart entities**, fresh metadata gave newer dates than the old selected occurrence, missing true organisers and no trader route. All remain quarantined; **zero READY gained**.

The live check exposed an HTML shell without a `main` element. Regression coverage now keeps it as a diagnosed ClueMart shell rather than a generic parser error. **23 retained immutable documents were replayed**, with zero additional source visits, unchanged original fetch timestamps and no source-fact additions by replay. They retain the actual original proof expiry, not a fabricated refresh.

## MarketsIreland preparation and D-012

The new adapter binds an exact `/market/<slug>/` page, canonical/title/heading and event-scoped Elementor fields. It reads explicit full-year dates and named counties; Northern Ireland/BT routes remain GB. Related-card/footer contacts cannot provide application proof.

An explicit open listing with its own email/phone controls becomes a verified HTTPS **enquiry route**, labelled **ENQUIRY_AVAILABLE**. It is not a hosted open application. `Closed or not managed here` stays UNKNOWN, and expected/unannounced dates remain held. Real supplied fixtures lack a named organiser and therefore remain partial. The existing general enquiry-readiness gate is not broadened in this increment: D-012 needs a proved customer-usable route plus complete event/organiser/location evidence, not a blanket contact-page exemption.

Producer kit `1ce097c9…` supersedes the earlier `29a7c85d…`. Its installation/current delivery is Claude/Chris custody; this cloud work does not claim installation or count the five IE dry-run contacts as READY.

## Bounded verification results

[Outcome evidence](../operations/findpitches-v3/reports/international-verification-2026-10-11.json). Direct checks **14:49:01–14:52:11 London**; final replay/readiness snapshot **14:59:58**.

| Country/source | Direct entity checks | READY before | READY after | New READY |
| --- | ---: | ---: | ---: | ---: |
| NZ ClueMart | 23 | 0 | 0 | 0 |
| AU LocalStalls | 48 | 2 | 2 | 0 |
| NZ LocalStalls | 4 | 3 | 3 | 0 |
| **Total** | **75** | **5** | **5** | **0** |

Five final report verdicts were verified, 39 quarantined and 31 unverified. Current cohort dispositions: 5 READY, 3 WATCH, 39 quarantined, 28 blocked. Verification refreshed existing proofs; **new READY conversion is 0%**, not 5/75 commercial growth. Zero selected-field changes; no latest cohort proof was replaced by a concurrent run. Five earlier document probes supported parser/source inspection separately from this 75-entity cohort. No CA/IE new live verification batch or Serper query is implied.

## Highest-value next work

| Priority | Work | Evidence-based upside | Effort |
| --- | --- | --- | --- |
| 1 | Fix producer organiser extraction, then implement a bounded reviewed source-document/field-selection and exact conflict-resolution path for AU LocalStalls | Up to 17 current organiser-only OPEN cases to audit; just 1 presently has no additional hold. No guaranteed READY count | Medium; provenance/CAS/identity and conflict tests required |
| 2 | Parse LocalStalls pages without JSON-LD using explicit event-scoped date/year, venue/country, organiser and application controls | 6 AU OPEN_NOW cases for source review; 112 broader AU historical/rolling failures are not equivalent READY upside | Medium; cannot infer year from slug or country from URL |
| 3 | Prove event + official organiser + enquiry/application bundles for new MarketsIreland and CA municipal/operator supply | 5 IE producer dry-run contacts and 31 CA linked structured entities; conversion unknown until delivered/proved | Medium; named organiser, confirmed dates and route binding remain necessary |
| 4 | Add D-012 enquiry readiness only for event-specific usable routes with complete source evidence and expiry | 66 AU + 9 NZ LocalStalls selected enquiry records are review populations, not 75 READY | Medium; policy/audience/closure safeguards |
| 5 | Monitor ClueMart genuine availability windows, retaining conservative UNKNOWN shells | Zero currently proved upside from this pass | Low; deprioritise further broad shell rechecks |

**Single highest-value next task: the AU LocalStalls organiser extraction + reviewed evidence/conflict repair pathway.** Start with the one otherwise-eligible case, prove preservation and exact hold handling, then audit the 16 additional organiser-only cases. Date/title/edition repairs stay outside that initial whitelist. Do not raise generic authority, clear all conflicts, invent dates, or treat a cleaner string as stronger evidence by itself.

## Catalogue and boot profile

[Read-only profile](../operations/findpitches-v3/reports/catalogue-profile-2026-10-11.json), **14:57:18–14:57:35 London**. Three operator-D1 snapshot timings: **4.762s, 3.709s, 3.244s**. Each executes 10 reads: 9 inventory pages including the final empty page, plus latest structured-producer policy. D1 execution totals: **886.9ms, 890.6ms, 816.3ms**; inventory accounts for **597.8–657.1ms**, policy **218.4–234.5ms**.

The query plan already uses the unique environment/producer/record-ID index for the correlated newer-receipt check. Do not describe it as an unindexed full history scan. Native operator `GET /preview/status`, using the actual service binding, took **4.440s** and returned the same 1,812 eligible snapshot. The old preview invitation returns 401; no new invitation or customer session was created, so fresh customer boot endpoints/browser rendering were not re-profiled.

Static boot dependency review: markets/session run in parallel; plans for live markets follow before Finder starts. US then waits for regions before its initial search. Markets/regions/search each read a fresh catalogue. First optimise repeated inventory reads and compact request-scoped projections; avoid gating search on plan prices. Any later cross-request cache needs proof expiry, entity revision, producer-policy invalidation and entitlement/redaction tests. No cache or customer frontend deployment was made. These are bounded proxy-environment measurements, not production-load claims. Previous V3-008 acceptance remains DONE with its own timestamp.

## Deployment, producer health and preservation

[Deployment/tests](../operations/findpitches-v3/reports/international-deployment-2026-10-11.json): **235/235 full V3 tests**, final focused **8/8**, boundary checks and enrichment dry-run passed. Final enrichment-only shadow version `5d45269d-360a-408e-aff6-aeefc987ea78`, deployed **14:57:48 London**. API/watch additive obsolete-request work was already published in [the lifecycle checkpoint](findpitches-v3-lifecycle-resolution-2026-10-11.md); Nashville alone still needs explicit old-2026/survivor-2027 source custody. No silent merge or fabricated acknowledgement.

[Producer transport](../operations/findpitches-v3/reports/international-delivery-health-2026-10-11.json), **15:04:05 London**: authenticated host poll **14:58:35**; latest two intervals about **15.2 minutes**, host/cadence flags true, aggregate freshness warning false. Latest new immutable receipt **12:57:43**, source clock **12:39:57**; unchanged export replay need not create new receipts. Three-hour discovery/one-hour export lag and individual proof TTL are separate. **845 pending rechecks, 0 fresh-ack-eligible**, 2 audited obsolete resolutions. This is the current V3 queue, not Claude's differently timed host count.

At **15:01:57**, zero due/leased/dead jobs; 9,284 future watch jobs are not backlog. [Full preservation audit](../operations/findpitches-v3/reports/international-preservation-2026-10-11.json), **15:02:43**, compares **15,811 retained receipts, 108,819 facts and 7,077 existing identities**: **zero destructive mutations, identity changes or customer/publication rows**. Publication API denied; publication/bulk off; paid queries today **0**. Live UK Pitchlist deployment and V2 schedules unchanged. No email, provider write, live billing/migration, domain route, cutover or protected merge.
