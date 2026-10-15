# US producer/source assessment for Codex's scorecard handoff (Claude, 14 Oct 2026)

- **Responds to:** [CODEX_US_SOURCE_SCORECARD.md](../team/CODEX_US_SOURCE_SCORECARD.md), 13 Oct queue items 3–4.
- **Method:** measured only. Pages were read once with the producer user-agent, robots and crawl-delay were honoured, there were no paid queries and no form submissions.
- **Status:** no READY gains are claimed here.

## Pi facts (read-only, 14 Oct 08:36–08:50 London, run by Chris)

**Eventeny:** 10,218 of 25,876 indexed pages fetched. The yield floor is at id **37,000**.
- Above the floor everything is enumerated.
- Below the floor, about 15,600 older ids are probe-sampled only, because their usable rate is below 5%.
- Each cycle spends about 400 s on Eventeny, re-checking existing pages (about 220 fetched, about 120 usable each cycle), and queues **0 new pages**.
- This matches Codex's measurement (recent window 31/35, then 8/35, 1/27, 0/35). **The older Eventeny archive is not a material lever. No backfill is proposed.**

**Lane time:** the run budget was split evenly over 6 lanes, while Marketspread (99.8% visited), LocalStalls (100%), ClueMart and MarketsIreland have little to do.
- The new kit lets a lane that empties early hand its time on, with the largest backlog running last.
- **Expected catalogue effect: none measured.** It frees time for refreshes and rechecks only.

**D-018 (measured on the Pi):**

| Measure | Count |
| --- | --- |
| Current records delivered as ENQUIRY_AVAILABLE **with no route** | **18** (US 5, GB 8, CA 4, IE 1) |
| ...whose only route is a trader email | all 18 |
| Engine opportunities with trader email routes | OPEN_NOW 24, ENQUIRY 19, ROLLING 7, UNKNOWN 6 |
| Watch/UNKNOWN records with an https route and no past date (route candidates) | **78** (US 25, GB 20, CA 12, IE 9, AU 8, NZ 4); 47 lack only `current_dates` |

## Codex's seven official seeds, plus two candidate families

| Source | Finding | Verdict |
| --- | --- | --- |
| rockymountainevents.com | One registration form for 5 Breckenridge (CO) summer 2026 festivals | Small; season over |
| greatamericancraftfairs.com | Three 2026 Sierra/Nevada summer fairs (Jul–Aug) with one 2026 application | Small; past |
| coloradomarkets.com/vendors | The page is an SMS sign-up; the site exposes a Tribe events API | Possible via structured calendar (below) |
| oldtownchicago.org | Tribe events API answers (5 events) | Possible via structured calendar |
| plantriverside / Savannah Christmas Market, pacificbeachmarket, arizona.renfestinfo | Single-event operators | Not a multi-event family |
| **ZAPP (zapplication.org)** | Hundreds of US art-fair booth calls, but event dates and locations load from an **API that needs a key** (`INVALID_API_KEY`). Static pages carry only the name, fees and time remaining; robots `Crawl-delay: 60`. | **No legitimate structured route. Excluded.** |
| **Renegade Craft** (multi-city) | "2026 Applications Are Closed" | Excluded this season |

## Proposal (the next increment, before any further kit)

Codex's bottleneck is that official operator calendars are not turned into structured candidates. The repeatable mechanic for that is a **structured-calendar extractor**:
- the WordPress **The Events Calendar** public REST API (`/wp-json/tribe/events/v1/events`), which gives title, start/end, a venue with street/city/state/ZIP, the organiser, and the event URL;
- **schema.org `Event` JSON-LD**, which many organiser and municipal sites already emit.

Both give exact dates, venue and address (map-ready) and the organiser without inference. The trader route still has to come from the organiser's own vendor/apply page (D-018).

Plan:
1. Find US operator, market-network and municipal calendars that expose either format **and** have a current vendor intake.
2. Measure a bounded sample: events retrieved → future-dated → with a D-018 route.
3. Report expected upside. Only then publish a kit.

## Kit published now

`pi_kit_v3-011j`, `SHA256SUMS` `2091be95…`. It contains the D-018 retention changes and the lane-time roll-over.

**Measured expected effect:**
- **18 delivered ENQUIRY records gain their trader-email route**; about 50 usable records gain explicit email evidence.
- **78 route candidates** become available. They are sent only after `sudo fpd-v3-feed candidates-on`, once Codex confirms.

Tests: Python 106, alerts 34, prune 3.

## Learning-loop checkpoint (seven questions), as of 2026-10-14 about 11:00 London

1. **What did we try?**
   - Pi-side measurement of Eventeny coverage and yield floor.
   - D-018 producer loss measurement on the Pi.
   - Single-visit review of Codex's 7 official seeds, plus ZAPP and Renegade Craft as candidate multi-event families.
   - Probes of the public Tribe calendar API on the 7 seed hosts.
   - All with the producer user-agent, robots and crawl-delay honoured, and no paid queries.
2. **What converted to net-new READY?** **Nothing yet.** This was measurement and producer retention work. The D-018 kit (`2091be95…`) is approved for installation by Chris, but it only *retains* evidence: 18 route-less ENQUIRY records gain trader-email routes. V3 decides any READY effect.
3. **Which source arms won and lost?**
   - **Lost or paused:** the Eventeny archive below id 37,000 (under 5% usable, matching Codex's 8/35, 1/27 and 0/35); the 7 single-operator seeds (small, single-event or past season); ZAPP (key-gated API); Renegade (2026 applications closed).
   - **Not yet measured:** structured official calendars (Tribe REST / JSON-LD / ICS). Two of the seven hosts answer the Tribe API: coloradomarkets.com and oldtownchicago.org.
4. **Why did the losers fail?**
   - Stale or past editions: Eventeny archive, Great American Craft Fairs, Rocky Mountain Events.
   - Closed application cycle: Renegade.
   - No legitimate structured route to dates and location: ZAPP.
   - Single-event scale: Plant Riverside, Pacific Beach, Arizona Renaissance festival.
5. **What gets more or less effort next?**
   - **Less:** Eventeny archive, single-event seeds, ZAPP.
   - **More:** a bounded structured-calendar sample across multi-event organisers, councils and market networks, with funnel counts; and a producer loss-reason report from existing Pi records (no extra crawling).
   - The calendar reader will be built only if the sample shows repeatable value.
6. **New organisers, venues, states and map points:** 0 so far, from this work.
7. **US READY total:** 1,722 per Codex's latest customer snapshot. That is +52 against the 1,670 baseline (+50 net settled programme gain), **48 short of +100 (1,770)**, about 448 short of +500 and about 1,278 short of 3,000.

## Structured-calendar sample: alignment report actions 3–5 (14 Oct, later)

**Method.** One visit per site from Claude's workspace, not the Pi; no Serper, no paid search.
- Producer user-agent (`FPDiscoveryLab`), robots.txt honoured, 1.2 s spacing.
- Per site: the given page; `/wp-json/tribe/events/v1/events?start_date=2026-10-14`; JSON-LD `Event` blocks; `.ics` / `ical=1` links; vendor/application wording.
- The sites were 18 US multi-event candidates: city and county special-events or vendor pages, downtown associations, a fairground, a farmers-market network, a state plaza and a living-history village, plus the two seed hosts.
- For the one calendar that returned events, all 3 pages (124 events) were read, along with the two organiser pages its market events link to.

**Correction to the earlier checkpoint.** coloradomarkets.com and oldtownchicago.org do *not* give the producer a Tribe route:
- coloradomarkets.com disallows our user-agent in robots.txt;
- oldtownchicago.org disallows `/wp-json/`.

The earlier probe was not robots-checked under our user-agent. Neither host counts.

### Funnel

| Step | Count | Notes |
| --- | --- | --- |
| Sites checked | 18 | |
| Reachable under robots | 12 | 5 robots-disallowed (incl. coloradomarkets, empirestateplaza.ny.gov, two city sites); 1 dead URL (404) |
| Structured calendar detected | 3 | Tribe REST on 2 (one with 0 events); `.ics` link on 3; **JSON-LD `Event` on 0** |
| Calendars with future events | **1** | Historic Manassas (VA), Tribe REST |
| Events extracted | 124 | All future-dated; venue city/state on 36 |
| …distinct event titles | 15 | 61 of the 124 are weekly occurrences of one farmers market |
| …trader-relevant (market/fair/craft) | 3 titles → **2 opportunities** | (a) the Historic Manassas farmers/winter market; (b) ARTfactory's Holiday Market |
| Trader route in the calendar entry | **0** | The descriptions are shopper copy ("artisan crafts… local vendors") and link to shopper pages |
| Trader route one hop away (organiser page) | 1 | The winter-market application is a **Marketspread** link (marketspread.com/market/4809…/apply), a platform the Pi already covers at 99.8%. ARTfactory's page is robots-disallowed. |
| **Expected net-new deliverable candidates** | **0–1** | The Marketspread route is very likely already held by the Pi |

Separately, 7 of the 12 reachable pages *did* carry vendor/application wording (Monroe, Fairfax County, Mill City, Richmond IN, North Port, Allaire, Danish Festival). None of those 7 had a structured calendar. Where trader routes exist, they sit on hand-written organiser vendor pages, not in calendars.

### Decision (action 5)

**Do not build the calendar reader.** The sample does not show repeatable value:
1. Structured calendars are uncommon on these sites: 2 of 12 have Tribe REST and none have JSON-LD.
2. Where they exist, they list shopper events and recurring occurrences, not trader opportunities.
3. They carry no D-018 route; the route lives one hop away, and here that hop led to a platform we already cover.

The address/geocode value (map-ready venue fields) is real but adds no READY without a route.

**No kit.** The lever that remains is the existing `organiser_pages` lane (kit 011i): official vendor-application pages, one per organiser, with exact-event or standing routes. I will add US organiser pages only once each one is checked by hand for a current route and date. That is small, linear work, not a volume lever. 3,000–5,000 US READY needs platform-scale sources, and none found so far is both legitimate and current.

## Producer loss-reason report: action 6 (no crawling)

`producer/fp-discovery-lab/tools/loss_report.py` (stdlib only; opens the database read-only) reads what the Pi already holds:
- the frontier;
- the latest assessment per page;
- source attachment (merge method);
- the last export.

It prints counts only (no URLs, names or contacts), at four stages: fetch → page gate → identity → export gate, per country. It rolls these up into the report's eleven buckets: no current date, no trader relevance, no usable route, generic route, identity ambiguity, geography missing, duplicate, stale/closed, parser failure, blocked source, freshness conflict. It also shows the non-loss outcomes, including D-018 route candidates awaiting review.

Each item is counted once, at the stage where it stopped. Uncertain pages are not counted at the page stage, because they carry on into watch records. There is a regression test (107 Python tests pass).

The Pi run is a single read-only command (`loss-report.sh`, given to Chris).

### Pi result, 2026-10-14 08:14Z (read-only)

**Engine:** 6,678 opportunities (from 11,871 attached sources; 4,825 exact or apply-URL merges, 366 fuzzy-name merges).
- Exported: current 1,821, watch 2,016, held 230.
- 2,611 retired or internal (past, with no recurrence evidence).

**Where US records stop after the page gate:**

| Bucket | US | All countries |
| --- | --- | --- |
| Delivered as current | 1,403 | 1,821 |
| Watch: stale or closed (past edition / closed cycle) | **1,612** | 1,798 |
| Held: identity (event name unusable or organiser-only) | **51** | 92 |
| Held: geography missing or unverified | **44** | 102 (+6 conflict) |
| Watch: D-018 route candidate (specific route) | 24 | 60 |
| Watch: generic route only (category "general") | 1 | 18 |
| Watch: no usable route | 18 | 90 |
| Watch: not yet open | 11 | 47 |
| Held: http URL / invalid URL | 9 | 18 |
| Held: known false positive / lane suspended | 10 | 12 |
| Watch: no current date | 0 | 3 |
| Freshness conflict | 0 | 0 |

60 + 18 = the 78 D-018 candidates measured earlier. The 18 that have only "general" routes are the weakest.

**Before the export gate (pages and fetches, not opportunities):**
- 16,751 pages had no trader relevance and 12,119 were platform pages with no application. That is crawl cost, not lost opportunities.
- 1,197 URLs were blocked by robots / 401 / 403 / 429. That is permanent: no bypass.
- Parser failures: 5.

### What this says

1. **The US loss is time, not extraction.** 1,612 US records sit in watch as past or closed editions, about 54% of US exported records. The only legitimate recovery is next-edition evidence on the source, which watch revisits already schedule. No new source fixes this.
2. **The cheapest identifiable US lever is the 95 held records** (identity 51, geography 44). Some may be in usable states and would be current if the name or geography were proven. That breakdown is being measured next (read-only). Any fix must prove name and geography from the source, never guess them.
3. Route discovery on held organisers (no usable route, 18 US) is small. Blocked sources are not addressable.


## Learning-loop checkpoint 2 (seven questions), 14 Oct later

1. **What did we try?** A bounded structured-calendar sample (18 sites, funnel above), and a producer loss-reason report tool (no crawling).
2. **What converted to net-new READY?** **Nothing.** The calendar sample yields 0–1 expected candidates, so nothing was built or shipped.
3. **Which source arms won and lost?** **Lost:** structured official calendars (Tribe REST, JSON-LD, ICS) as a route source. **Unchanged:** `organiser_pages` remains the only clean small lane.
4. **Why did the losers fail?**
   - Calendars are rare (2 of 12 reachable sites).
   - They list shopper events and weekly occurrences.
   - They hold no trader route.
   - Their one route pointed back into an already-covered platform.
   - 5 of 18 sites disallow our user-agent.
5. **What gets more or less effort next?**
   - **Less:** calendar extraction (stopped; no reader, no kit).
   - **More:** the loss-reason numbers from the Pi decide the next producer change. If "no usable route" or "generic route" dominates watch, the lever is route discovery on already-held organisers, not new sources.
6. **New organisers, venues, states and map points:** 0.
7. **US READY total:** unchanged at 1,722 per Codex, **48 short of 1,770**. The 78 D-018 route candidates remain **OFF** pending Codex review.

## 15 Oct 2026: USDA farmers-market directory (lane `usda_fm:us`, kit `pi_kit_v3-011o`)

**Access:**
- The USDA Local Food Portal API turns away non-browser clients. Its `robots.txt` also returns 403, and a registered key changes nothing. We do not disguise the client.
- Chris downloaded the farmers-market directory by hand from the portal's data-sharing page. It has 7,148 markets with names, addresses and coordinates, but **no websites or contacts**.
- The file stays on the Pi only (`/srv/fpd/data/seeds/`), never in Git. A request for API access has been drafted for Chris to send to USDA.

**Measured (read-only, on the Pi):**
- **Overlap:** 309 of the 7,148 markets are already known to the producer, which leaves **6,839 new**.
- **Freshness:** only 403 of the new markets were updated in 2024–26; the rest were last updated in 2023 or earlier.
- **Website probe on 60 new markets** (half updated since 2024): obvious website names were tried, and a site counted only if its own title named the market and the page named its town, ZIP or state.
  - 12 websites confirmed.
  - 9 with a vendor page.
  - 7 with an application route (Google Forms, a PDF or an on-page form).
  - 6 with open wording.
  - 8 mentioning 2026 or 2027.
  - One route was a false positive: a city "Investment Application" PDF, which the classifier must reject.
- **Yield by freshness:** about 1 in 3 recently updated markets had a confirmable site, against about 1 in 15 older ones.
- **Rough scale:** about 250–450 new US application candidates, from a small sample. This is a floor, because markets that only have a Facebook page or a page on a council site are not found.

**The lane** (`fpd/generators/usda_fm.py`) works like DATAtourisme, hop one only:
- Each cycle checks up to 150 markets (`FPD_USDA_MARKETS`, 0 = off), within 300 s, at about one request per second, with robots.txt honoured.
- A persistent cursor walks recently updated markets first.
- Markets the producer already knows are skipped.
- Confirmed homepages are enqueued with the market's name and place as hints.
- Dates, place, trader route and state come only from the market's own pages, through the normal classifier and export gate. Records go out as `organiser_site` / `usda_farmers_market` / `entity_seed_crawl`.
- Classification code is unchanged, so no classifier-diff is needed.
- 170 Python tests pass, plus the shell tests (alerts 34, prune 3, source-key 8).

