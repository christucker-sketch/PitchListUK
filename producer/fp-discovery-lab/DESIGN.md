# FindPitches Discovery Lab: design

A clean-sheet engine for finding **actionable trading opportunities at events**: pages where a vendor,
trader, stallholder or exhibitor can apply, register, enquire or book a pitch. It was built without
reference to any existing FindPitches system.

## 1. The problem from first principles

What we want to find is not "events". It is a **(event × participation route)** pair:

* an event, or a recurring market, that is current;
* in a target country;
* with evidence that traders can take part (vendor/stallholder/exhibitor language);
* plus a concrete route: an application form, a platform listing, a booking document, or an email to enquire.

Three observations shaped the design:

1. **Opportunities are concentrated in a few structural places, not spread evenly across the web.**
   * *Application platforms.* Eventeny, ZAPP, Jotform, Google Forms and others host thousands of
     vendor applications in uniform, machine-readable formats. Some publish sitemaps of every
     application.
   * *Entities.* The shows, fairs, festivals and markets that take traders are recurring public
     entities. Many are enumerable from open knowledge bases (Wikidata) and from association or
     directory listings.
   * *Organiser sites.* Each organiser site usually has one "Traders / Vendors / Exhibitors" section,
     and the homepage navigation links to it.
2. **Finding a candidate is cheap; verifying it is the real work.** Most work goes into deciding
   whether a page *really* offers a current route to participate. So verification has to be
   explainable, quoting evidence, and re-runnable offline when the rules improve.
3. **Different strategies differ in yield by orders of magnitude.** The engine therefore measures
   yield per strategy and shifts crawl budget toward strategies that produce opportunities
   (a multi-armed bandit). A fixed search loop can't do that.

A conventional "search query → scrape results" loop was deliberately *not* the core. It depends on
paid APIs, it has poor recall for small organisers, and its results are dominated by aggregators
and SEO pages. It is included only as an optional, separately measured generator
(`BRAVE_API_KEY`).

## 2. Architecture

```
 generators (seeders)                      frontier (SQLite)                 verification
 ─────────────────────                     ─────────────────                 ────────────
 platform sitemaps  ─┐                     urls: state machine,              fetch (robots.txt, per-host
 Wikidata entities  ─┼──► Frontier.add ──► priority, generator,   ──lease──► politeness, size caps,
 directories/hubs   ─┤    (dedupe, per-    per-site budgets                  raw cache sha256)
 OSM marketplaces   ─┤     site budget)          ▲                                │
 search API (opt.)  ─┘                           │                          parse → classify
                                                 │                          (features, reason codes,
                                   plan_next ◄───┘                           quoted evidence, fields)
                                   (exploration policy)                           │
                                                                            resolve (entity
                                                                            resolution / dedup)
                                                                                  │
                                                                     opportunities + sources
                                                                     + telemetry → report
```

| Module | Responsibility |
|---|---|
| `fpd/generators/seeds.py` | Platform sitemap harvesting and directory/association hubs (from `seeds.json`) |
| `fpd/generators/wikidata.py` | Entity-first seeding: 895 event/market classes × 6 countries, with an official website |
| `fpd/generators/osm.py` | OpenStreetMap `amenity=marketplace` with a website (Overpass) |
| `fpd/generators/search.py` | Optional search-API generator (Brave), off by default |
| `fpd/frontier.py` | Persistent URL frontier, per-site budget, Thompson-sampling scheduler across generators |
| `fpd/fetch.py` | Async polite fetcher: robots.txt, ≥2 s per host, circuit breaker, gzip raw cache |
| `fpd/parse.py` | HTML → text (nav removed), links with context, forms, iframes, JSON-LD |
| `fpd/classify.py` + `lexicon.py` | Rule-based classifier with reason codes and verbatim evidence |
| `fpd/dates.py`, `geo.py`, `countries.py` | Date and deadline extraction; vote-based geography; country profiles |
| `fpd/explore.py` | Which links to follow next (organiser exploration, routes, hub fan-out, sitemaps) |
| `fpd/resolve.py` | Entity resolution: many pages → one opportunity, with corroborating sources kept |
| `fpd/pipeline.py` | Orchestration, time-boxed crawl loop, offline `rebuild` |
| `fpd/report.py` | Metrics, CSV export, HTML dashboard, per-record audit view |

## 3. Discovery strategies (generators)

| Generator | Idea | Expected profile |
|---|---|---|
| `platform:eventeny` | Eventeny's sitemap lists ~25k public `/events/vendor/?id=` application pages. Newest IDs are taken first | Very high precision; US-centric |
| `platform:marketspread` | Same idea for Marketspread `/market/` pages | Tested and **pruned**: the pages are directory profiles, not applications |
| `wikidata` | Every Wikidata item that is an instance of one of 895 festival/fair/show/market subclasses, in the 6 countries, with an official website. The organiser site is then explored | Broad, diverse, multi-country; lower yield per fetch |
| `directory:*` | Association and directory pages (Agricultural Shows Australia, NZ Farmers Markets, county-fair lists…) are fanned out to organiser sites | Medium yield; good for AU/NZ/US fairs |
| `osm_marketplace` | Mapped marketplaces with websites | Implemented; public Overpass endpoints were overloaded during the experiment |
| `search:brave` | Trader vocabulary × region queries | Optional; requires a key |

**Exploration of an organiser site** works on a small budget (default 8 pages per site):

* homepage → the up-to-4 best internal links by anchor and URL score (`traders`, `stallholders`,
  `vendor`, `exhibit`, `apply`, `get involved`…);
* if there's no clear trader link → the sitemap (from robots.txt or `/sitemap.xml`), filtered by path;
* deep pages → only clearly trader-related links;
* application routes on external platforms (Jotform, Google Forms, Eventeny, ZAPP…) are fetched,
  because they confirm and enrich the record. These form pages inherit the referring page's
  event name, country and date.

**Scheduling.** Every lease slot picks a generator by Thompson sampling on
(opportunities found, pages fetched). 25% of slots explore uniformly, so new strategies aren't starved
before their yield is known. Per-host politeness (one in-flight request per host, ≥2 s between
requests) means a single platform can't monopolise the crawler.

## 4. Classification

Every fetched HTML page gets an immutable `assessments` row: label, reason codes, a feature vector,
**verbatim evidence snippets** and extracted fields. The labels are:

* **actionable**: strong vendor signal, an application route, current, applications not closed, and
  an in-scope country.
* **uncertain**: a vendor signal plus at least one missing or doubtful condition. The reason codes
  say which: `no_application_route`, `applications_closed`, `applications_not_yet_open`,
  `stale_or_past_edition`, `currency_undated`, `geography_unknown`, `general_interest_list`, …
* **rejected**: no vendor signal, or a different meaning. Procurement "vendor registration",
  livestock/competition "exhibitors", sponsorship-only, online events, news articles, out-of-scope
  countries.
* **hub**: listing/aggregator pages. These are never opportunities themselves but are used for
  discovery. ("Aggregators are for discovery; verification happens on organiser or platform pages.")

Signals:

* **Vendor signal.** There are two tiers of patterns. Participation language ("vendor application",
  "apply for a pitch", "become a stallholder", "booth fees", "now accepting vendors") is separated
  from topical mentions ("30+ food vendors", "trade stands") that also appear on attendee pages.
  Navigation menus are removed first, so a "Traders" menu item on every page doesn't count.
* **Route.** On-platform application page > link to an application platform > embedded form >
  on-page form (≥4 fields, business-like) > application document (PDF/DOC named
  application/booking/prospectus) > "apply/book/register" link in vendor context > vendor-context
  email. Links for parades, volunteers, newsletters and sponsors are excluded.
* **Currency.** JSON-LD dates, then text dates (day-first and month-first, ranges, deadlines
  identified by cue words), then recurrence ("every Saturday"). Year mentions are only a fallback;
  copyright years and law names don't count. Evergreen trader pages borrow the next event date
  learned from the organiser's homepage. That borrowing is shown in the evidence.
* **Open/closed.** Explicit phrases ("applications are now closed", "no longer accepting
  responses", "will open in January") and passed deadlines.
* **Geography.** Weighted votes: JSON-LD address, ccTLD, postcodes, phone prefixes, currency,
  region names, "City, ST" patterns and generator hints. A directory's country is only a *weak*
  hint for the sites it links to.

The classifier is versioned (`CLASSIFIER_VERSION`). Because raw pages are cached, `fpd rebuild`
re-runs the current rules over everything offline, which is how the rules were iterated against
observed errors.

An LLM verifier would improve field extraction (organiser and dates especially). It was left out
to keep the engine free to run, deterministic and auditable. It is a natural next step for the
`uncertain` bucket.

## 5. Duplicates and entity resolution

Opportunities are resolved real-world entities. Every page that supports one is kept in
`opportunity_sources` with its match method and score. The matching cascade:

1. same page re-seen;
2. same specific application URL (form or platform page);
3. identical normalised name key (years, ordinals, filler and vendor words stripped) in the same
   country;
4. fuzzy token-set similarity ≥90 with a corroborating attribute (same domain, start dates within
   4 days, same locality), or ≥80 on the same domain.

An **edition guard** keeps 2026 and 2027 editions apart (start dates >120 days apart) unless the
record is a recurring market.

## 6. Provenance and audit

Each record links to its source URLs. Each source has the fetch time, HTTP status, final URL,
sha256 of the raw content (the gzipped raw page is kept in `data/cache/`), the generator that found
it, the parent page that linked to it, the classifier version and the quoted evidence.
`python -m fpd show <id>` prints all of it.

## 7. Resumability

* All state lives in SQLite: frontier, leases, generator cursors in `kv`, assessments, opportunities.
* A crawl is time-boxed (`--minutes`). Killing it at any point is safe: in-flight leases expire and
  return to `pending`.
* Generators record which units are done (e.g. `wikidata.done`, `seeds.done`), so re-running a seed
  never duplicates work.
* `rebuild` is itself resumable (cursor in `kv`).
* When the live DB sits on scratch disk (as in this experiment), `FPD_SNAPSHOT` mirrors it into the
  project folder. The snapshot is restored automatically if the live DB is missing.

## 8. Adding a country

Add a `CountryProfile` to `fpd/countries.py`: ISO code, Wikidata QID, ccTLDs, postcode regex,
regions, currency, phone prefix and trader vocabulary. The Wikidata and OSM generators and the geo
voter pick it up automatically. Then add any national directories to `fpd/seeds.json`.

## 9. Known limitations

* Pages describing several events (e.g. a market operator with 12 markets) become one
  organiser-level opportunity.
* Event-name extraction is heuristic. JSON-LD and platform pages are good; some organiser pages
  yield section names.
* JS-only sites (some Wix/React builds) and PDF-only application packs are recorded as routes but
  their contents aren't read.
* Some important sites block crawlers in robots.txt (these are counted). The engine respects that.

## 10. Round 2 additions

### 10.1 Relevance and state are separate decisions

`fpd/state.py` runs after the classifier on every page and returns `relevance`, `state`,
`state_evidence`, `open_strength` (explicit/implicit), `opens_on` (only when the source publishes a
date), `recurrence_evidence` and `missing`. The rules are applied in order, and the first match wins.

| # | Condition | Result |
|---|---|---|
| 1 | Not a trader opportunity, or a council licence/permit page | NOT_RELEVANT |
| 2 | Says applications will open later, with no contradicting closure, no past-dated opening phrase, and the edition not over; or a published future opening date | UPCOMING_NOT_OPEN |
| 3 | Closed phrase (partial-category closures excluded) or deadline passed | CLOSED_CURRENT_CYCLE if the edition is still ahead, otherwise HISTORICAL |
| 4 | Edition under way, or a weekly season ending within 14 days / "into mid October" | CLOSED_CURRENT_CYCLE |
| 5 | Weekly market whose only published dates are stale | HISTORICAL |
| 6 | Edition over, or only stale material | HISTORICAL |
| 7 | Regular market with an application route | ROLLING |
| 8 | Exhibitor-enquiry form page | ENQUIRY_AVAILABLE |
| 9 | Implicit route for an edition starting within 10 days | UNKNOWN (an open call is not credible) |
| 10 | Application route and current dates | OPEN_NOW |
| 11 | Downloadable form, unless its year is earlier than the event's | OPEN_NOW |
| 12 | Email or contact instruction only | ENQUIRY_AVAILABLE |
| 13 | Anything else | UNKNOWN |

`fpd/watch.py` combines page-level states into one state per opportunity:

* an explicit open wins;
* then closed;
* then upcoming;
* then the highest rank.

A page that could not see a date is overridden by a sibling page's past date. Watch planning writes
`watch_reason`, `watch_priority`, `next_check`, `next_check_basis`, `missing_evidence` and
`revisit_url`. `next_check_basis` says whether the date was published by the source or is an
`internal:` heuristic. Recurrence is recorded, never assumed.

### 10.2 Platform adapters

`fpd/adapters.py` holds per-platform readers:

* **LocalStalls:** country from the URL path; "Coming dates" resolved to the next occurrence; "Stallholder
  applications open" / "Submit Application" read as explicit open; "Contact event manager" read as
  enquiry.
* **UKCraftFairs:** title pattern gives name, date and town; "Contact the organiser" is an enquiry
  route; workshop listings are excluded.

New platforms are enumerated by:

* platform sitemaps with child-sitemap and URL patterns (`seeds.json` → `platform_sitemaps`);
* ID ranges (`platform_idranges`).

### 10.3 Duplicate guards

The resolver now applies these guards on top of the cascade in section 5:

* exact generic names ("Christmas Market") need a same domain, same locality or close dates;
* fuzzy matches need a shared *distinctive* token;
* a shared platform domain is never corroboration;
* similar names with different dates are different events;
* dated instances on platforms (more than 3 days apart) are distinct opportunities;
* recurring markets merge only within 45 days;
* the same-site rule needs a name similarity of 80 or more.

Vendor categories are kept as rows in `routes`, not as separate opportunities.

### 10.4 Evidence storage

The keep set is pages linked to an opportunity, hub pages, and pages with any vendor signal. These
keep their full raw HTML, recompressed with zstd-19 and a dictionary trained on the corpus.

Every other page is reduced to a `page_extracts` row (title, h1, first 2,000 characters, content hash,
original size). Its rejection stays explained by its `assessments` row. Only the latest assessment per
page is kept; it records the classifier version.

### 10.5 Lane accounting

Every fetch belongs to a lane: the generator that found the URL, inherited along follow links. The
report computes for each lane:

* fetches;
* candidates;
* unique opportunities;
* actionable, enquiry and watch counts;
* rejected pages;
* duplicate sightings;
* opportunities and actionable per 100 fetches;
* organiser domains;
* countries.

The best and worst lanes are listed. Lanes with ≥200 fetches and less than 0.5 actionable per 100
are candidates for pausing (RESULTS_R2.md §9).

## Integration export (round 4)

The producer side of the FindPitches integration lives in `fpd/integration/` and publishes to
`integration_export/` (contract: `integration_export/README.md`; status: `INTEGRATION_READY.md`).
Design choices:

* **Identity:** a natural key (`country|programme|edition`) hashed to `fdx1_…`, plus an anchor
  registry so ids survive URL and name changes. Anchors never merge different programmes or
  monthly instances.
* **Lifecycle:** derived by diffing against the last successful export's state, kept in
  `integration_state`. Absence never implies closure.
* **Atomic publication:** staging, validation, checksums, `os.replace`, then `latest.json` last.
* **Platform sources:** operated as indexed populations (`fpd/sources.py`), not as one-off crawls.
