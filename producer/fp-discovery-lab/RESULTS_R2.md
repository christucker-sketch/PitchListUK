# Results: FindPitches Discovery Lab, round 2 (4 Oct 2026)

Round 2 aimed to turn the first prototype into a high-precision system that is useful outside the US.
Every number below comes from `data/fpd.sqlite` and `output/metrics.json` (`python -m fpd report`).
Any record can be traced with `python -m fpd show <id>`. Audit labels are stored in the `audit_r2` and
`audit_merges` tables.

No Anthropic API and no paid search API were used. The only external APIs were Wikidata SPARQL
(179 calls, free, from round 1) and Overpass (3 calls, all failed).

## 1. Headline

| | Round 1 | Round 2 |
|---|---|---|
| Relevant trader opportunities | 2,074 (903 actionable + 1,171 uncertain) | **3,293** |
| Actionable now (OPEN_NOW + ROLLING) | 903 | **1,329** (1,133 open + 196 rolling) |
| Enquiry route available (no form yet) | – | **258** |
| Watch pipeline (upcoming / closed this cycle / historical / unknown) | – | 1,706 (28 / 305 / 1,168 / 205) |
| Strict precision of the actionable set, population-weighted | ≈78% | **95.3%** (≈91–99%) |
| Relevance precision of the actionable set (genuine trader opportunity, timing ignored) | ≈85% | **96.7%** |
| Actionable per 100 fetches | ≈3.0 (looser definition) | **4.0** (25 fetches per actionable record) |
| Non-US actionable | 103 | **261** (AU 109, NZ 73, GB 45, CA 33, IE 1) |
| Non-US enquiry routes | – | **251** (GB 131, AU 98, NZ 15, CA 6, IE 1) |
| DB + raw evidence on disk | ≈1.45 GB (DB 515 MB live, raw cache 938 MB) | **≈290 MB** (DB 120 MB, raw-evidence archive 172 MB) |

**Not like-for-like.** The round-1 "actionable" label did not separate timing from relevance. Part of
the rise from 2,074 to 3,293 relevant records comes from fixing over-merging (section 6), not from new
pages. New sources (LocalStalls, ClueMart, UKCraftFairs) added about 494 records.

## 2. What changed

1. **Explicit application-state model** (`fpd/state.py`). Relevance (is this a trader opportunity?) is
   now decided separately from state (what can a trader do today?). States:

   * `OPEN_NOW`
   * `ROLLING`
   * `ENQUIRY_AVAILABLE`
   * `UPCOMING_NOT_OPEN`
   * `CLOSED_CURRENT_CYCLE`
   * `HISTORICAL`
   * `UNKNOWN`
   * `NOT_RELEVANT`

   Every record carries a one-line `state_evidence`: quoted text plus the extracted dates. A recurrence
   ("12th annual", "every Saturday") is only recorded when the source says it, and it is never used to
   invent a future date.
2. **Rules fixed from the audit.** Each fix has a regression test (33 tests in total):
   * a closure statement beats "check back later";
   * an opening date that is already past is not "upcoming";
   * "all available price options are sold out" counts as closed;
   * "sold out" for one category, or "not accepting jewellery, pottery…", does not close the whole event;
   * an edition already under way counts as closed;
   * a weekly market whose season ends within 14 days (or "into mid October") counts as closed;
   * a weekly market whose only published dates are stale counts as historical;
   * an *implicit* open (a route exists but nothing says it is open) for an event starting within 10 days
     becomes UNKNOWN;
   * exhibitor-enquiry forms count as ENQUIRY;
   * "Applications open in January" no longer counts as "open";
   * council licence and permit pages, school or sports pitch lettings, lay-by catering concessions and
     platform marketing pages count as NOT_RELEVANT.

   One fix in this round over-reached: "Food Truck Application" and "Licensed tattoo artist" were caught
   by the new permit rule. The rejected-sample audit caught it, and it was corrected.
3. **Watch / revisit pipeline** (`fpd/watch.py`, `python -m fpd revisit`). Every non-actionable relevant
   record has:
   * `watch_reason`;
   * `missing_evidence`;
   * `revisit_url` (the organiser's page is preferred over a third-party form);
   * `next_check` and `next_check_basis`.

   Only three dates come from the source ("applications open 21 December 2026"). All others are
   labelled `internal:`. Two examples:
   * "two weeks after the current edition, to catch the next cycle";
   * "~6 months before the anniversary of the last edition (only meaningful if the event recurs, which
     is not assumed)".

   `revisit` re-queues due URLs into the normal crawler. `output/watchlist.csv` holds all 1,964
   watch + enquiry rows.
4. **Platform adapters** (`fpd/adapters.py`) for LocalStalls and UKCraftFairs. They read each
   platform's own structure: "Stallholder applications open" / "Contact event manager", the title
   pattern and the "Coming dates" list.
5. **Duplicate handling rebuilt.** Details are in section 6.
6. **Per-route storage.** A `routes` table keeps every application route with its vendor category
   (food, craft, art, exhibitor, nonprofit, produce, retail). One opportunity with separate food and
   craft applications stays one record with two routes (792 records have more than one category).
7. **Storage** (`fpd/storage.py`, `python -m fpd compact`):
   * Raw pages that matter for audit are kept in full: pages linked to an opportunity, hubs, and any
     page with a vendor signal. They are recompressed with zstd-19 and a trained dictionary.
   * The other ≈16k rejected pages are reduced to a structured extract: title, h1, the first 2,000
     characters, content hash and original size. Their decision stays fully explained by the stored
     assessment.
   * Superseded assessments from intermediate rule versions were pruned (118k rows). The latest
     assessment per page, with its classifier version, is kept.
   * Overall: ≈1.45 GB → 290 MB, with nothing an auditor needs lost.
8. **Robustness.**
   * Lenient fallback for hosts that send malformed HTTP headers (UKCraftFairs).
   * NULL-byte and IPv6 URL crashes fixed.
   * `?occurrence=` (WordPress calendar plugin) stripped during canonicalisation.
   * Country vocabulary added to the lexicon: stallholder, trade stand, EOI, pitch bookings, catering
     pitch, exposants.

## 3. New discovery approaches tested

### Non-US equivalents of Eventeny

| Platform | Countries | Enumerable? | State determinable? | Fetched | Result | Decision |
|---|---|---|---|---|---|---|
| **LocalStalls** | AU, NZ, UK, US | Yes: per-country child sitemaps | **Yes, explicitly** ("Stallholder applications open" / "Contact event manager" / coming dates) | 354 | 326 opps, 110 actionable, 135 enquiry; **31.1 actionable/100**; audit 20/20 | **Scale** (add US child sitemaps; re-poll monthly) |
| **ClueMart** | NZ | Yes: sitemap `/application/` pages | Implicit: a live application page exists | 74 | 64 opps, 61 actionable; **82 actionable/100**; audit 18/18 | **Keep** (small, but nearly every page is a lead) |
| **UKCraftFairs** | UK | Yes: sequential IDs (live window ≈26,300–26,900) | Enquiry only (organiser contact needs site login) | 1,201 (372 live IDs) | **104 dated enquiry opportunities**, 8.7/100 | **Keep, narrow** to the live ID window; poll new IDs weekly |
| marketsandstallholders.com | AU | Calendar of ~470 events | No: event pages have no organiser links or routes | 46 | 0 | **Pause.** Names only; could seed a future search lane |
| Stall Manager (AU) | AU | robots.txt disallows | – | 0 | – | Respect robots; recognised as a route when organisers link to it |
| MarketsIreland | IE | Cloudflare challenge | – | 0 | – | Not pursued |
| NCASS, EventOwl (UK) | UK | Login walls | – | 0 | – | Not pursued |
| mymarket.org (CA) | CA | Not enumerable (Common Crawl index returned 504s repeatedly) | Forms are recognised as routes | – | 4 actionable via organiser links | Recognised as a route only |
| Xibitor, Snapforms, OpenForms, FestivalPro, Fiona, Infoodle | AU/NZ | No public index | Form pages | – | Appear as routes (e.g. 2 OpenForms, 1 Xibitor, 1 Snapforms) | Recognised as routes |

**Finding.** There is no single "UK Eventeny". Outside the US, trader applications mostly sit on
organiser websites using generic form tools (Google Forms, Jotform, OpenForms, Snapforms) or are
enquiry-based ("for trade stand enquiries please email…"). The structured ecosystems that do exist
(LocalStalls in AU/NZ/UK, ClueMart in NZ, UKCraftFairs in the UK) are small but have very high
precision.

### Other ecosystems checked

| Ecosystem | Result | Decision |
|---|---|---|
| Marketspread (US/CA farmers markets), repurposed to its `/apply/` pages | 813 fetches, 2 actionable: only 4.6% of market pages have a public apply page | **Prune** |
| EntryThingy | Mostly art calls and fellowships | 121 fetches → 4 actionable; **drop** |
| ZAPP, app.fairs.com | robots.txt disallows | Respected |
| Map Your Show (US B2B trade-show booth portals) | ~60 found via Common Crawl | Not pursued (B2B, US) |

## 4. What worked

* **Platform-first, with adapters.**
  * The three productive platform lanes (Eventeny, LocalStalls, ClueMart): 4,430 fetches → 1,192
    actionable (27 per 100).
  * Including the failed platform experiments: 6,993 fetches → 1,198 actionable (17 per 100).
  * Organiser lanes (Wikidata, councils, directories): 26,166 fetches → 131 actionable (0.5 per 100).
* **The state model.**
  * Eventeny strict precision rose from 80% (round 1) to 96% (49/51).
  * The main remaining Eventeny errors are relevance edge cases: a juried art-exhibit submission, a
    shop-local promotion.
* **The audit loop.**
  * Each audit pass found concrete error classes, and each was fixed with a regression test.
  * The rejected-sample audit caught a regression introduced in this round.
* **Dedup diagnosis.** Sampling the pairs that dedup had merged showed the round-1 resolver was
  collapsing genuinely different events. Section 6 has the details.

## 5. What did not work

* **Organiser-site crawling from Wikidata and councils** stays poor: 0.41 and 0.25 actionable per 100
  fetches. Most of what it finds is HISTORICAL in October.
* **Aggregators without outbound links** (marketsandstallholders.com) give names but no routes.
* **Common Crawl CDX** (to enumerate mymarket.org) returned repeated 504s. **crt.sh** returned wildcard
  certificates only. Neither is usable for enumeration.
* **Small craft directories** (craftynetwork_uk, craftni, lehigh) produced 0 actionable from 356
  fetches.
* **Implicit "open" on organiser sites** is still the weakest call: open_organiser is 84% strict.
  Typical errors:
  * a homepage "vendor enquiries" line read as an application form;
  * a past registration window ("Exhibitor registration May 18 – June 28");
  * a closed-then-reopens notice ("closed this year; 2027 opens 1 February").

## 6. Duplicates

The audit sampled merged records (records with ≥2 source URLs, n=20). **5 of 20 were wrong merges:**

* monthly instances collapsed: Oct/Nov/Dec craft fairs, Jul/Aug/Sep pop-ups;
* two different events at the same brewery;
* a WineFest merged into a Supper Market by the same-site rule.

A pair scan also showed fuzzy matching joining different events that share only generic words
("Ohoka Farmers Market" ≈ "Cromwell Farmers & Craft Market"). Shared platform domains were being
counted as corroboration. Fixes:

* fuzzy matches need at least one shared **distinctive** token (generic words such as market,
  festival, pride, folk and christmas don't count);
* a shared platform domain is no longer corroboration;
* similar names with different dates are different events;
* dated instances published separately on platforms are distinct opportunities;
* recurring markets only merge across instances that are ≤45 days apart;
* the same-site rule needs a name similarity of 80 or more.

After the fixes, the merge audit was **19/20 correct**. The one error was UKCraftFairs not yet being
treated as a platform, and it was fixed before the final build. In a scan of 25 now-separate
similar-name pairs, all were genuinely distinct.

Merge methods in the final build:

| Method | Merges |
|---|---|
| Exact name | 1,898 |
| Fuzzy name | 162 (was 1,351) |
| Same apply URL | 85 |
| Same site | 2 |

23 opportunities combine a platform page and an organiser site. Vendor categories are kept as routes
rather than separate records.

## 7. Precision audit (final build, fresh random samples, 95% Wilson intervals)

Strict means relevant **and** the state is right. Relevance ignores timing. "Missed" means a false
negative in the rejected sample. Records that a later fix moved out of a bucket are excluded from that
bucket's n (`left_bucket` in `audit_r2`).

| Bucket | Population | n | Strict | 95% CI | Relevance | Main errors |
|---|---|---|---|---|---|---|
| OPEN/ROLLING: Eventeny | 1,021 | 51 | **96.1%** | 86.8–98.9 | 96.1% | 2 not relevant (juried art submission; shop-local promo) |
| OPEN/ROLLING: LocalStalls | 110 | 20 | **100%** | 83.9–100 | 100% | (1 name-merge error seen, since fixed) |
| OPEN/ROLLING: ClueMart | 61 | 18 | **100%** | 82.4–100 | 100% | Open is implicit (live application page) |
| OPEN/ROLLING: organiser sites | 137 | 37 | **83.8%** | 68.9–92.3 | 97.3% | Timing: implicit open on homepages, past registration windows, imminent events |
| **Actionable, population-weighted** | **1,329** | 126 | **95.3%** | ≈91–99 | **96.7%** | |
| ENQUIRY_AVAILABLE | 258 | 20 | 95.0% | 76.4–99.1 | 95.0% | A UKCraftFairs workshop listing |
| UPCOMING_NOT_OPEN | 28 | 14 | 85.7% | 60.1–96.0 | 100% | "Check back soon" about an events list; stale cycle dates |
| CLOSED_CURRENT_CYCLE | 305 | 12 | 100% | 75.7–100 | 100% | |
| HISTORICAL | 1,168 | 12 | 91.7% | 64.6–98.5 | 91.7% | A car-show entry form |
| UNKNOWN | 205 | 11 | 72.7% | 43.4–90.3 | 90.9% | 2 should be CLOSED (imminent events), 1 not relevant |
| Rejected hard negatives (strong vendor language) | 431 | 20 | 95.0% correctly rejected | 76.4–99.1 | | 1 miss: FAQ page with a trade-enquiry email (`og:type=article`) |

**False-negative concerns.**

* FAQ pages tagged as articles.
* JS-only enquiry forms (e.g. a London Book Fair exhibitor-enquiry page with no detectable form).
* Opening dates in quotes that are not parsed into `opens_on` (MerleFest: "will open November 1").
  The state is right but the date is not machine-readable.
* Over-merged dated instances: fixed, but the old precision figures did not show them.

## 8. Results by country

| Country | Open | Rolling | Enquiry | Upcoming | Closed (cycle) | Historical | Unknown |
|---|---|---|---|---|---|---|---|
| US | 965 | 103 | 7 | 10 | 247 | 912 | 60 |
| AU | 53 | 56 | 98 | 5 | 9 | 92 | 25 |
| GB | 29 | 16 | 131 | 8 | 11 | 81 | 48 |
| NZ | 66 | 7 | 15 | 1 | 0 | 21 | 14 |
| CA | 19 | 14 | 6 | 4 | 36 | 61 | 44 |
| IE | 1 | 0 | 1 | 0 | 2 | 1 | 0 |

**Why the imbalance remains:**

1. Eventeny is US-centric and accounts for 77% of actionable records.
2. In the UK and Ireland the dominant route is an *enquiry*, not a form: trade-stand secretaries,
   UKCraftFairs organiser contact. Hence 131 GB enquiry records against 45 actionable.
3. It is October. Most UK, Irish and Canadian summer events are over and their 2027 forms open from
   November to March, so they sit in HISTORICAL or CLOSED with dated revisit plans.
4. Ireland has no crawlable platform. MarketsIreland is behind Cloudflare.

Country vocabulary helped classification. It did not create supply.

## 9. Results by strategy / platform (lanes)

| Lane | Fetches | Unique opps | Actionable | Enquiry | Watch | Dup. sightings | Opps/100 | Actionable/100 | Countries |
|---|---|---|---|---|---|---|---|---|---|
| platform:eventeny | 4,002 | 2,049 | 1,021 | 0 | 1,028 | 1,756 | 51.2 | **25.5** | US (+CA, GB) |
| platform:localstalls | 354 | 326 | 110 | 135 | 81 | 23 | 92.1 | **31.1** | AU, GB, NZ |
| platform:cluemart | 74 | 64 | 61 | 0 | 3 | 9 | 86.5 | **82.4** | NZ |
| platform:ukcraftfairs | 1,201 | 104 | 0 | 104 | 0 | 13 | 8.7 | 0 (8.7 enquiry) | GB |
| directory:nz_farmers_markets | 97 | 10 | 6 | 0 | 4 | 9 | 10.3 | 6.2 | NZ |
| directory:safeag_uk_shows | 216 | 28 | 6 | 1 | 21 | 21 | 13.0 | 2.8 | GB |
| directory:agshows_australia | 376 | 39 | 9 | 1 | 29 | 27 | 10.4 | 2.4 | AU, NZ |
| directory:ga_ag_fairs | 92 | 9 | 2 | 0 | 7 | 7 | 9.8 | 2.2 | US |
| directory:marketregular_to | 621 | 60 | 11 | 5 | 44 | 22 | 9.7 | 1.8 | CA |
| directory:countyfairgrounds | 353 | 24 | 4 | 1 | 19 | 9 | 6.8 | 1.1 | US |
| directory:vendorsmap | 384 | 17 | 4 | 2 | 11 | 2 | 4.4 | 1.0 | US |
| directory:rosemary_food_festivals | 371 | 29 | 3 | 0 | 26 | 16 | 7.8 | 0.8 | GB |
| directory:bc_market_trail | 850 | 26 | 5 | 0 | 21 | 17 | 3.1 | 0.6 | CA |
| wikidata | 16,743 | 397 | 69 | 7 | 321 | 188 | 2.4 | 0.41 | all six |
| wikidata_councils | 4,840 | 74 | 12 | 1 | 61 | 17 | 1.5 | 0.25 | AU, GB, NZ |
| platform:marketspread_apply | 813 | 5 | 2 | 0 | 3 | 0 | 0.6 | 0.25 | US |
| platform:entrythingy | 121 | 4 | 4 | 0 | 0 | 0 | 3.3 | 3.3 | US |
| directory:festivalcalendar_uk | 435 | 8 | 0 | 0 | 8 | 1 | 1.8 | 0 | GB |
| platform:marketspread | 428 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | – |
| directory:craftni / craftynetwork_uk / lehigh / localmarkets_nz | 447 | 9 | 0 | 0 | 9 | 2 | 2.0 | 0 | GB, NZ, US |

Through the platform → organiser → event → opportunity chain:

* **Eventeny:** 721 distinct organisers → 2,049 opportunities → 3,811 routes (613 with more than one
  vendor category).
* **LocalStalls:** 230 organisers → 326 opportunities.

### Decisions for the weaker strategies

| Strategy | Evidence | Decision |
|---|---|---|
| Wikidata entities | 16,743 fetches → 69 actionable (0.41/100); 83% of its relevant finds are not open now | **Repurpose**: use only as a seed list of organiser domains for the watch pipeline (re-check before the next season); stop broad exploration; exclude film/award classes |
| Councils | 4,840 → 12 (0.25/100); many hits were permits or sports pitches | **Narrow, then pause**: keep only council *market* pages (stallholder applications for council-run markets); permits are now NOT_RELEVANT |
| Directories | 4,583 → 50 (1.1/100), highly variable | **Narrow**: keep nz_farmers_markets, safeag_uk_shows, agshows_australia, ga_ag_fairs, marketregular_to; pause festivalcalendar_uk, rosemary, bc_market_trail, craft directories |
| Organiser sitemaps | Round 1: 0.26/100 | **Paused** |
| JS rendering | Round 1: 0 trader links in 30 pages | **Removed** |
| Marketspread (both lanes) | 1,241 fetches → 2 actionable | **Removed** |
| OSM / Overpass | 3/3 calls failed | **Paused** |
| marketsandstallholders_au | No outbound links | **Paused** |

## 10. Efficiency and freshness

* Overall: **4.0 actionable per 100 fetches** and **9.9 relevant per 100**.
* The lanes kept after this round (Eventeny, LocalStalls, ClueMart, UKCraftFairs, five directories): 7,033 fetches → 1,226 actionable (≈17 per 100) plus 246 enquiry routes.
* No paid API was used. Fetch cost is the only cost.

Freshness is measured separately from relevance. Of 3,293 relevant records:

* 58% are current: open, rolling, enquiry, upcoming or closed this cycle;
* 35% are HISTORICAL;
* 6% are UNKNOWN.

By lane, the share that is current:

| Lane | Current |
|---|---|
| ClueMart | 95% |
| LocalStalls | 75% |
| Eventeny | 60% |
| Wikidata | 37% |
| Councils | 26% |

A large historical share means a lane finds the right organisers but at the wrong time. That is
exactly what the watch pipeline is for.

Watch pipeline: 1,706 watch + 258 enquiry records.

* Priority: high 161, medium 736, low 809.
* Revisit peaks: Oct–Dec 2026 (817) and Feb 2027 (880).

## 11. Search API (optional, not required)

**Provider.** Brave Search API. It has an independent index, simple pricing and a free tier, and the
`search` generator already supports it via `BRAVE_API_KEY`.

**Why.** The weakest coverage is organiser-hosted UK, IE, CA and AU forms, which no platform lists.
Search can target country vocabulary directly, for example:

* `"trade stand application" 2027 site:.co.uk`
* `"stallholder application" "expression of interest" 2027`
* `"vendor application" 2027 site:.ca`
* `"traders wanted" 2027 site:.ie`

**Experiment.** 300–500 queries:

* 6 countries × ~10 vocabulary templates × event types × "2027";
* top 10 results each;
* results run through the existing classifier and state model.

**Success criteria:**

1. Actionable+enquiry per 100 queries ≥ 10.
2. ≥ 50% of resulting organiser domains not already reachable via platform lanes.
3. Strict precision ≥ 85% on a 30-record audit.
4. Non-US share of new actionable/enquiry records ≥ 60%.

Compare against UKCraftFairs and LocalStalls per unit of cost. Stop if criteria 1 or 2 fail after
150 queries.

## 12. Optional future enhancement: an LLM verifier (not used, no key needed)

A small LLM pass could re-read only the hardest bucket: implicit OPEN_NOW on organiser sites, about
140 records. It would answer from the stored text: "is there a current, open trader application?". It
would also extract quoted opening dates into `opens_on`. The engine works fully without it. It would
be an optional `--verify` step behind an environment variable.

## 13. Highest-value next step

**Build a recurring re-poll of the three non-US platform lanes.** The lanes are LocalStalls (all
country sitemaps including US), ClueMart and the UKCraftFairs live ID window. Add a monthly
`revisit` run of the dated watch list. Together they produce:

* two-thirds of non-US actionable records (171 of 261);
* 239 of the 251 non-US enquiry routes;
* at 100% audited precision;
* at fewer than 2,000 fetches per cycle.

After that, the Brave experiment above is the cheapest way to test whether the organiser-hosted
UK/IE/CA long tail can be reached at all.
