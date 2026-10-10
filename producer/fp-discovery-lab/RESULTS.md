# Results: FindPitches Discovery Lab, first experiment (4 Oct 2026)

All numbers come from `data/fpd.sqlite` and `output/metrics.json`, produced by `python -m fpd report`.
Every opportunity can be audited with `python -m fpd show <id>`.

## 1. What it found

| | Count |
|---|---|
| **Actionable opportunities** (real route to apply/book/enquire, current, in scope) | **903** |
| Uncertain (genuine-looking, but timing/route/geo unclear) | 1,171 |
| Pages rejected | 15,302 |
| Hub/listing pages (used for discovery only) | 717 |

By country:

| Country | Actionable | Uncertain |
|---|---|---|
| US | 800 | 824 |
| Canada | 35 | 123 |
| UK | 35 | 123 |
| Australia | 30 | 60 |
| New Zealand | 2 | 23 |
| Ireland | 1 | 4 |

Event types among actionable records: markets 413, festivals 267, exhibitions/trade shows 121, craft
fairs 95, Christmas/holiday markets 62, farmers markets 49, food festivals 24, agricultural shows 23.
Records can carry more than one type.

Application routes among actionable records: Eventeny 750, organiser's own site (forms/PDFs/apply
pages) 96, Google Forms 20, email enquiry 11, Jotform 8, plus Marketspread, Cognito, Airtable,
Microsoft Forms, Formstack and Manage My Market.

**Why the uncertain bucket is large.** The commonest reasons are `stale_or_past_edition` (614) and
`applications_closed` (178). It is October, so most 2026 UK, Irish and Canadian summer shows and
festivals are over, and their 2027 trader applications typically open between November and March.
These records are the 2027 pipeline, not noise: in a manual sample 16 of 20 uncertain records were
genuine trader leads. `python -m fpd recheck` re-queues them for a later pass.

## 2. How it found them

There were five independent strategies. Yield is attributed to the strategy that produced the
opportunity's primary source.

| Strategy | Fetches | Actionable | Uncertain | Actionable per 100 fetches |
|---|---|---|---|---|
| Eventeny sitemap (newest 4,000 vendor-application pages) | 4,002 | 745 | 646 | **18.6** |
| Directories/associations (21 + 16 seeds; best: Toronto markets, Ag Shows Australia, UK ag-show guide, county fairs) | ~4,300 | 59 | ~170 | 0.2–3.7 per seed |
| Wikidata entities (895 event/market classes × 6 countries → ~4,000 organiser sites) | 16,743 | 79 | 302 | 0.47 |
| Wikidata local councils (GB, AU, NZ; ~800 councils) | 4,840 | 20 | 49 | 0.41 |
| Marketspread sitemap | 428 | 0 | 0 | 0 → **pruned** |
| OpenStreetMap marketplaces (Overpass) | 3 API calls | – | – | public endpoints overloaded (504/406); no data |
| Search API (Brave) | – | – | – | implemented, not run (no key) |

### Experiments that changed the approach

1. **Platform-first beats web-first by ~40×.** One public sitemap (Eventeny) produced 82% of
   actionable records at 18.6 per 100 fetches. Crawling organiser sites from entity lists produced
   ~0.5 per 100.
2. **Marketspread was a false lead.** Its `/market/` pages turned out to be directory profiles
   ("Claim this market"), not applications. An early rule counted them as actionable. I tightened
   platform rules to require an application URL pattern, and the strategy was pruned after 428
   fetches with zero yield.
3. **Sitemap descent on organiser sites was poor.** About 4,200 sitemap-driven fetches produced 11
   actionable pages (0.26 per 100), against ~2.9 per 100 for following homepage links. It is now
   restricted to root and page sitemaps.
4. **JavaScript rendering was tested and rejected.** 22% of organiser homepages expose fewer than 5
   links, which looked like a recall gap. Headless Chromium on 30 of them revealed new links on 4 and
   genuine trader links on 0, so it wasn't adopted.
5. **Aggregators are for discovery only.** Aggregator event pages (e.g. vendorsmap) were producing
   second-hand "opportunities" whose route was the aggregator's own sign-up. Pages on hub sites are
   now never opportunities; their outbound links seed organiser sites.
6. **Council sites add non-US coverage but need context rules.** "Pitch" means football pitch,
   "concession" means pensioner concession, and "pitch" can mean a traveller site. Specific negative
   contexts were added after seeing these errors. Street-trading and mobile-vendor permits are kept
   but marked uncertain (`trading_permit_not_event`).
7. **Rate limits and blocking.** Wikidata rejects some HTTP client fingerprints and penalises bursts.
   This cost 166 failed calls during development (all logged). The fix was one query per country
   with a pre-expanded class list, sent by POST. 676 URLs were skipped because robots.txt disallowed
   them, and the engine respected that.

## 3. How accurate it is

Precision was measured by manually reading the stored evidence for random samples after the final
classifier version. The samples were drawn with fixed seeds, separately from the earlier tuning
samples. The results are in the `reviews` table and `review_label` on each opportunity.

| Sample | Correct | Precision |
|---|---|---|
| Actionable, Eventeny (n=25) | 20 | 80% |
| Actionable, other sources (n=35) | 25 | 71% |
| **Actionable, weighted by population (745 / 158)** | | **≈78% (±~10pp at these sample sizes)** |
| Actionable that are *genuine trading opportunities*, ignoring timing | 51/60 | ≈85% |
| Uncertain that are genuine trader leads (n=20) | 16 | 80% |

What the errors were (15 of 60 actionable judged wrong under the strict "currently actionable"
standard):

* **Timing (7): the biggest error mode.** Closed 2026 applications not phrased in a recognised way;
  2026 farmers-market season forms at season end; "2027 applications open in January"; a stale 2020
  page. These are real organisers with real routes but the wrong status.
* **Non-vendor application types on platforms (4).** A busker, a candy-station merchant, a
  storefront sign-up and a performer programme. All were Eventeny "vendor" URLs.
* **Wrong kind of form or page (4).** A trade-stand *payment* form, an exhibitor extra-passes form, an
  environmental-health stallholder form, and "Park & Pitch" (camping).
* Field errors that don't change the label: some names are poor ("Google Docs", a date, a Wikidata
  label for a sister festival), and a few countries are wrong (LAMMA tagged AU via a directory hint;
  one Tacoma market tagged CA).

**Duplicates.** 2,851 sightings were merged into existing records (exact name 1,501; fuzzy name
1,237; same application URL 101; same organiser site 12). 545 actionable records have more than one
supporting page (mean 3.1 sources). Among actionable records only 2 exact-name duplicate pairs
remain. In the 60-record sample I saw roughly 2 residual fuzzy duplicates, about 3%.

**Recall** was *not* measured rigorously, because there is no ground-truth list. Indicators: 6,874
pages showed some vendor signal. Spot checks of organiser sites where nothing was found showed four
causes: trader info sits behind attendee-facing sections ("Food", "Crafts"), JS menus, robots
blocks, and Wikidata entities with no trader programme (many are film festivals or awards). A proper
recall benchmark is the first thing I'd add (see §5).

## 4. How efficient it was

* **Work:** 30,300 fetch attempts (27,217 OK, 2,382 failed, 676 robots-blocked) across 4,594 sites,
  about 5.4 GB transferred. There were 182 external API calls (179 Wikidata, 3 Overpass). Crawling
  took about 1.5 h of wall-clock time in 43 time-boxed runs, on a 2-core VM, at 32 concurrent
  connections with ≥1–2 s per host.
* **Overall yield:** 2.98 actionable per 100 fetches, or **33.6 fetches per actionable opportunity**.
  * Eventeny: **5.4 fetches per actionable**.
  * Everything else: **~166 fetches per actionable** (158 records from 26,298 fetches).
* **Diversity:** 151 distinct primary domains among actionable records. Platform concentration is
  high (HHI 0.68) because Eventeny dominates. The non-platform records come from 140+ independent
  organiser sites.
* **Failures:** 404 (832), connection errors (484), 403 (384), non-HTML content (301), timeouts (94).
  Dead or old Wikidata websites account for most of these.

## 5. What I'd do next, in order of expected value

1. **Recheck calendar.** Re-run `recheck` monthly from November to March. The 614 past-edition and
   21 not-yet-open records are mostly 2027 opportunities whose applications haven't opened yet. This
   is the cheapest large gain, especially for UK/IE/CA.
2. **LLM adjudication of the uncertain bucket and the timing decisions.** The rules are good at
   finding candidates but brittle on phrasing such as "applications for 2026 have closed". A small
   model call on ~1,200 uncertain pages would also fix names and organisers. Needs `ANTHROPIC_API_KEY`.
3. **More platform harvesters.** The data says platforms are where the yield is. Next candidates are
   ZAPP's event API, EntryThingy, Stall Manager/LocalStalls (AU) and Marketspread's actual
   application URLs (`/apply/`), which do exist.
4. **A UK-focused search generator** (Brave API) measured against the free strategies. UK coverage
   is the weakest relative to need.
5. **A recall benchmark:** 100 hand-labelled UK/IE events (e.g. from ASAO and Irish Shows lists) with
   known trader pages, to measure recall per strategy.
6. **Splitting multi-event pages.** Operators that list 10 markets on one page are currently one
   record.

## 6. Reproducing or continuing

See README.md. The full raw-page cache used for `rebuild` lived in the session's scratch disk. The
raw pages for **every page attached to an opportunity** (4,911 pages) are kept in
`data/evidence_pages.tar`, so all accepted and uncertain records stay auditable.
