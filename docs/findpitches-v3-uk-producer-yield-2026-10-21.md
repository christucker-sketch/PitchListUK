# UK producer yield — 21 October 2026

**The Pi does not lack UK records: it exports 232 current GB records. Very few become customer READY.** Codex's 20 October check counted 146 UK READY, 138 of them first produced by V3's own UK official sources. So, at most, about eight UK READY records are Pi-origin. Codex's 21 Oct checkpoint (157 UK READY) adds 11 calendar recoveries from V3's own sources, which does not change this picture. The largest UK lever is therefore conversion of records the Pi already delivers, before more discovery.

Measured read-only on `fpd-pi` with `uk-yield.sh`. Export snapshot 21 Oct 06:23 London; feed history from the producer's `v3_feed_state`. Counts only: no event lists, contacts or raw pages are published here. Nothing on the Pi was changed.

## What the Pi delivers for GB

| Channel | Records | Mix |
| --- | ---: | --- |
| Current (delivered as READY-eligible) | **232** | UKCraftFairs 147, LocalStalls 48, directory 20, Wikidata seed 13, organiser site 2, Eventeny 1, council 1 |
| Watch | 110 | UNKNOWN 61, HISTORICAL 27, CLOSED_CURRENT_CYCLE 15, UPCOMING_NOT_OPEN 7 |
| Held | 33 | organiser-only names 14 (13 council), geography unverified 11, unusable names 3, http-only URLs 3, other 2 |

Current by application state: ENQUIRY_AVAILABLE 182, OPEN_NOW 38, ROLLING 12. Current by producer confidence: HIGH 196, MEDIUM 13, LOW 23. 223 current records have a future event date.

**Weekly movement into and out of current:** in the last 7 days, 18 GB records entered current and 10 left, net +8. The 14- and 30-day figures (+226, +232) are dominated by the feed-history backfill when the lifecycle feed started, so they do not measure growth. Of the 23 records that left current in 14 days, 15 left because the engine stopped producing them for three consecutive exports, and 5 became HISTORICAL.

## Where the crawl time goes

15,648 pages were fetched in the last 7 days. The France lane took **8,087 (52%)** for 82 actionable pages; France has one customer READY. US lanes (Eventeny 3,021 and the farmers-market lane 2,542) took most of the rest. UK-specific generators took roughly 1,000 pages (about 6%):

| UK generator | Pages | Actionable | Uncertain |
| --- | ---: | ---: | ---: |
| UKCraftFairs platform | 338 | 0 | 188 |
| LocalStalls platform (all countries) | 299 | 109 | 173 |
| Festival Calendar UK (directory) | 95 | — | — |
| Craft NI (directory) | 68 | 2 | 0 |
| eFestivals 2027 (directory) | 40 | — | — |
| Festival Calendar food UK (directory) | 29 | — | — |

Directory pages are discovery hubs, so they show no actionable count themselves.

## Producer-side UK fixes identified

1. **Council pages named after the council** ("Bolton Council"): 13 GB records held as organiser-only names, several OPEN_NOW with future dates. This is a name-extraction fix.
2. **http-only source or application URLs:** 3 GB records held, for example a city Christmas market. Fix: deliver the https URL when the same page serves on https; never deliver http.
3. **LocalStalls listings in watch as UNKNOWN** with future dates (18): the listing gives no current booking signal. These need checking against the listings before any change; no relabelling.
4. **Crawl allocation:** UK-first (20 Oct order) is not reflected in how the Pi spends its time. A bounded change is proposed to Chris: shorten the France crawl and add a UK-only crawl slot. Not changed without his approval.

## Request to Codex (V3-034)

Please give the customer-side disposition of the **232 GB producer IDs currently delivered by the Pi**: READY / withheld, and withheld reason code, by `discovery_source`. In particular, say why the 147 UKCraftFairs and 48 LocalStalls ENQUIRY_AVAILABLE records are, or are not, READY. If a rule rejects a whole family, the producer should stop spending time there or supply the missing evidence. Producer IDs, not names, are enough; no customer data.

French corrections (kit 011w) are built and waiting for the Pi gate; see Claude's status file.
