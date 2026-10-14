# US growth, live maps and commercial readiness

Codex checkpoint, 14 October 2026. Implementation foundation: `e67dc946`; this report's containing commit records the completed checkpoint. Measurements are timestamped snapshots.

## Customer inventory

Latest source-proof customer projection at **06:38:20 UTC (07:38 London)**: **1,894 eligible application opportunities — US 1,722 / GB 162 / NZ 5 / AU 4 / CA 1**. [Current runtime snapshot](../operations/findpitches-v3/reports/us-runtime-readiness-2026-10-14.json) includes source-domain totals, map coverage, producer delivery and paid controls. Core due/leased/dead reconciliation, eligibility, enrichment and readiness jobs were zero at **06:40:34 UTC**; future scheduled WATCH jobs are not an overdue reconciliation backlog.

The settled programme snapshot at **01:17:48 UTC** contained **1,890 opportunities — US 1,720 / GB 162 / NZ 5 / AU 2 / CA 1**. Public US/GB reads matched it during release validation. The four later additions (US2/AU2) are not attributed to this programme without separate receipt-level attribution. Current US inventory is 48 short of 1,770; the measured campaign result below remains net +50, not +54.

US improved **1,670 → 1,720, net +50**: 68 source-proved gains, 18 original-baseline records withheld. An intervening fresh starting inventory was 1,653; it must not replace the original 1,670 programme comparison. **The +100 target of 1,770 was not reached**; 50 remain. The +500 target is 2,170 and the 3,000 threshold remains 1,280 away.

These are application-opportunity entities, not different festivals. Advisory exact US event groups rose **1,035 → 1,037, net +2**. Most added routes concern events already represented. No identity merge occurred. More event/operator breadth is the commercial bottleneck; another pile of application variants is insufficient.

## Acquisition learning and stop

[Aggregate scorecard and immutable experiment references](../operations/findpitches-v3/reports/us-source-learning-2026-10-14.json).

- **211 native candidate reservations/decisions: 68 imported distinct entities, 143 held.** This includes the explicitly interrupted archive run. All source receipts and reservations were retained; no refunds or blind replay.
- **483 primary-proof HTTP attempts.** The six completed experiments have **532 fully attributed discovery/proof attempts**, excluding independent background maintenance. The intervention has separately retained primary custody; do not add these overlapping totals or claim complete attribution for its unfinished discovery phase.
- Recent Eventeny prefix won initially: 31/35 READY, then 26/35 after correcting the window selection. The runner had advanced by 500 after checking only 35 and skipped remaining productive candidates. It now exhausts native-deduplicated recent candidates before advancing.
- Later cohorts fell to 8/35, 1/27 and 0/35. **The paid lane remains paused, and this free source pattern is now paused for a new hypothesis.** Two settled cohorts below 10% READY/checks or two visited discovery cohorts without new proof pause an arm, even after historical success. Source quality is never relaxed to spend the remaining grant.
- Seven official seed pages used 14 requests and produced no platform leaves. The current adapter extracts platform links, not the operators' own forms/calendars. Parent exploration also produced no net-new READY. Zero extraction is not proof that these organisers have no useful events.
- Dominant losses: stale/closed editions, missing or restricted trader purpose, contradictory dates/editions and absent country/physical-venue proof. The 16 geography-loss receipts also lacked usable venue evidence; query geography was not substituted.
- **Zero added Serper queries/credits.** No US/global paid grant, standing scheduler, challenge bypass, source mutation or identity change.

Next allocation: stop stale archive/empty parent templates, preserve productive source seeds, and give Claude/Pi the measured official-operator extraction problem. See [source handoff](../team/CODEX_US_SOURCE_SCORECARD.md). The next checkpoint remains +100 net US READY with event/operator/state breadth, then +500 and 3,000–5,000+; this +50 is not completion of that scale objective.

## US map delivered

[Coverage and budget evidence](../operations/findpitches-v3/reports/us-address-map-2026-10-14.json), measured **00:52:47 UTC**:

| Measure | Result |
| --- | ---: |
| US READY | 1,720 |
| Opportunities with genuine source/address positions | **572 (33.26%)** |
| Distinct coordinate positions | **132** |
| Distinct source-location strings represented | 141 |
| States with mapped opportunities | **31** |
| Coverage-run provider requests / cap | **200 / 200** |
| Entity checks / cache hits | 684 / 442 |
| Remaining unpinned opportunities | 1,148 |
| Serper / paid geocoding | **0 / 0** |

There was one separate native canary request and one earlier operator probe; these are outside the 200-request coverage grant. The coverage run stopped automatically at its cap. Among checked holds: no exact match 42; disagreeing address components 25; missing exact street/city/state 41; ambiguous match 4; cap reached 1. Lower-priority records were not all attempted. 141 location strings are not certification of 141 independent physical venues.

Positions use source-owned venue coordinates or one exact US Census street/city/state/optional ZIP and house-range match. The new US positions are **address-range interpolation**, explicitly approximate, not GPS/rooftop claims. No city/state/ZIP-centre fallback. Immutable provider receipts bind to the exact current entity revision, source document and verification; changed/expired proof cannot retain the marker. Genuine proof renewal may reuse a matching address cache without a provider request or source-clock extension.

The US frontend uses the same pinned, locally bundled Albers USA projection as its generated public-domain state outlines, including Alaska/Hawaii. Numbered markers retain every ID/date, keyboard selection, filters, zero-result clearing and whole-US/fit views. The UK remains **123 opportunities at 12 source-proved venue positions**; 39 UK listings remain unpinned.

At **06:38:20 UTC**, the current projection maps **571/1,722 US opportunities (33.16%)**, still at 132 positions across 31 states; 1,151 are unpinned. UK remains 123/162 at 12 positions. These later counts supersede the coverage-run inventory snapshot for current display; the individual one-point difference has not been separately attributed. The map uses current proof, not a permanent pin count.

Public deployment: <https://findpitches.com/us/find-pitches/?view=map>. Map code released at **01:01:34 UTC**, followed by a guarded performance release at **01:32:49 UTC**. Existing LIVE Checkout was restored at **01:36:33 UTC (02:36 London)**. Active customer version **`a1d4515a-c176-4b7e-a294-fd6517e1d4c8`**. Native secrets, bindings, schedules, routes, DNS, existing public/account recovery and protected PitchList remained unchanged. No customer migration or new cutover.

## Performance release

[Sanitized release and measurement evidence](../operations/findpitches-v3/reports/us-runtime-readiness-2026-10-14.json). Six sequential anonymous reads before and six after the release measured:

| Route | Before, milliseconds | After, milliseconds |
| --- | --- | --- |
| Homepage data | 11,878 / 10,950 / 10,657 | 3,605 / 4,169 / 3,534 |
| US Finder data | 8,826 / 14,290 / 9,441 | 2,544 / 3,684 / 3,556 |

Before measurements ended at **01:23:55 UTC**, after at **01:34:04 UTC**. All returned HTTP 200; Finder retained 1,720 eligible US opportunities and 572 map points. This is a small request sample through this environment, not a production load benchmark or latency guarantee. Remaining 2.5–4.2 second data reads still warrant follow-up.

The release reuses a date formatter while evaluating the supplied instant on every call, and reuses the commercial evaluation already computed within a single catalogue request. It adds no cross-request evidence cache, expiry extension or relaxed budget/readiness gate. A retained-data local comparison reduced processing from 313 to 124 milliseconds with byte-identical output. London midnight/DST and source-expiry safeguards remain tested.

## Product gates and assurance

[Free/Pro implementation candidate](findpitches-v3-free-pro-policy-review-2026-10-14.md) is prepared and tested, with region/month/status teasers, fixed sample bounds and consistent map redaction. It is **not activated**: the hub explicitly requires ChatGPT/Chris to record the final product rule first. Current Free visibility remains the previously approved model. Sample size, exact-date/search disclosure and public SEO need a recorded decision before complete all-surface integration. Genuine owned LIVE Checkout → global Pro → Portal/cancellation acceptance remains separately pending; no synthetic claim replaces it.

**Full V3 403/403**, frontend 3/3, independence 87 files/build/boundaries pass. Actual retained-source local maps passed US32/UK32. Public US32/UK32 and public API/security/SEO29 passed with Checkout closed, followed by restored-LIVE revalidation. The final performance release passed API29/US32 by **01:37:34 UTC**; UK32 was checked again at **06:37:43 UTC (07:37 London)**, retaining 162 UK opportunities and 123 mapped opportunities. Zero synthetic pins, certificate bypass, foreign browser requests, provider/customer objects or messages in these checks.

[Preservation at 01:36:26 UTC (02:36 London)](../operations/findpitches-v3/reports/us-scale-map-preservation-2026-10-14.json): **25,230 original receipts / 218,939 facts / 7,280 fixed entity tuples; zero destructive mutations or identity changes**. Original build baseline also passed. Source publication remains disabled, source customer/publication rows 0/0 and publication API denied. Four-query/100-hour/1,000-day safeguards remain; paid manually paused/bulk off, London-day 14 October queries zero, lifetime V3 queries unchanged at 29. PitchList deployment and V2 schedules are unchanged.

At **06:38:20 UTC**, Pi was recently contacting V3, cadence flag true and freshness warning false: last authenticated poll **06:33:57 UTC**, latest receipt **05:46:55 UTC**, latest source check **05:35:32 UTC**. Recent poll intervals were 913.852 / 951.421 / 1,354.275 seconds; this is not a claim of exact 900-second delivery. Discovery remains three-hourly with up to one-hour export lag. **589 rechecks remain pending**, with zero currently fresh-evidence-ack eligible; 2,164 acknowledgements occurred in the last 24 hours. Delivery/recheck acknowledgement remains separate from executed source proof.

Native resource audit was repeated at **06:37:34 UTC (07:37 London)** and passed all eight owned shadow workers and eight expected queues/settings. The commercial paid policy was independently read at **06:40:34 UTC**: manually paused, 25/day limit; bulk off, zero queries attempted/reserved today, lifetime V3 queries 29. No Pi install kit was manufactured for this work.

Highest-value next task: a measured, repeatable **official multi-event operator/calendar → source-proved trader intake** adapter on the producer side, widening US event/operator/state coverage rather than revisiting the exhausted Eventeny tail. Paid acquisition stays disabled.
