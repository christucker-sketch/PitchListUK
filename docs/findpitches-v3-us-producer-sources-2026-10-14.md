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
