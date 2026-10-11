# International expansion: Ireland, Canada, Australia and New Zealand (V3-011)

- **Author:** Claude
- **Date:** 2026-10-11
- **Requested by:** Chris, recorded as D-013. Priority countries are IE, CA, AU and NZ. Success means **customer-ready (V3 READY) listings**, not raw producer volume.
- **Scope:** free sources only. No paid search, no READY-rule weakening, and no Option B enablement.

## 1. Where we are

| Country | Producer current, 10 Oct | Main producer sources | V3 READY, 10 Oct |
| --- | --- | --- | --- |
| US | 1,397 | Eventeny 1,248, Marketspread 114 | 1,713 |
| GB | 226 | UKCraftFairs 159, LocalStalls 34, directories 18 | 128 |
| **AU** | **185** | LocalStalls 171 | **4** |
| **NZ** | **77** | ClueMart 52, LocalStalls 18 | **4** |
| **CA** | **28** | directories 15, Wikidata seeds 8, Marketspread 5 | **0** |
| **IE** | **2** | Wikidata seeds 2 | **0** |

AU and NZ already have volume, but almost none of it becomes customer-ready. IE and CA have almost no supply at all.

**AU/NZ producer state mix:**

| Lane | Open now | Rolling (undated) | Enquiry only |
| --- | --- | --- | --- |
| AU LocalStalls | 35 | 52 | 84 |
| NZ ClueMart | 48 | 4 | – |
| NZ LocalStalls | 4 | 1 | 13 |

V3 READY needs a source-proved, dated, open application. V3 has dedicated proof parsers for Eventeny, LocalStalls, UKCraftFairs, Eventbrite and Marketspread, with a conservative generic parser for everything else. **There is no ClueMart parser**, so ClueMart's open records cannot be proved.

## 2. Levers, ranked by customer-ready gain per effort

| # | Lever | Owner | Expected READY gain | Effort |
| --- | --- | --- | --- | --- |
| L1 | **ClueMart proof parser in V3**, matching the producer's NZ ClueMart lane | Codex | Up to about 50 NZ (the open-now ClueMart records), after V3's own checks | Small to medium: one parser plus fixtures |
| L2 | **AU/NZ LocalStalls blocker breakdown**: why 35+4 open-now LocalStalls records give about 10 READY worldwide | Codex (ledger data), then Claude (producer fixes) | Unknown until the breakdown exists; the ceiling is about 40 open-now AU/NZ | Small to diagnose |
| L3 | **D-012 enquiry readiness** in V3: contact-the-organiser listings with a verified https route shown as "Contact organiser" | Codex | About 97 AU/NZ LocalStalls enquiry listings, but only where V3 accepts the route as genuinely usable (generic LocalStalls contact pages are already ruled out). Also unlocks UK listings once transport is solved. | Medium |
| L4 | **IE/CA/AU/NZ organiser and council discovery** (producer): seasonal call-for-vendors hubs, council event-vendor pages and Christmas-market organisers, verified by V3's generic parser (as Mynt Image is in the UK) | Claude | Tens per country this season. CA and IE start from 0. | Medium, ongoing |
| L5 | Rolling (undated) markets: give a next-occurrence date where the source states one | Claude, then Codex review | Part of the 52 AU rolling LocalStalls records, only if V3 accepts a stated next date | Medium |

**Research notes for L4** (2026-10-11):
- **IE has no stallholder platform.** Supply is organiser-level. Examples:
  - Winterval, Waterford: open call for its 2026 Christmas market.
  - Glucksman Craft & Design Fair, Cork: via craftni.org.
  - Annual fundraiser craft fairs: via visualartists.ie adverts.
  - Existing IE hubs (irishshows.org, wheresthemarket.ie) have produced 2 listings.
- **CA supply is municipal and arts-council calls:**
  - Councils: Thorold and Brampton Canada Day vendor pages, Midland, alberta.ca.
  - Craft and arts calls: allianceforarts.com artists-calls (BC), Craft Ontario, Craft Council BC, Alberta Craft Council, akimbo.ca.
  - Many applications are Jotform or Tally forms.
  - Marketspread has a few CA markets; the producer has 5.
- **AU supply:**
  - Council stallholder calls, for example on the NSW government's NEON Marketplace and council news pages ("Stallholder Applications Open").
  - The Finders Keepers application portal.
  - Stall Manager has no public directory.
- **NZ:** ClueMart (covered), council and community markets, localmarkets.nz.

## 3. Proposed order

1. **Now (Claude, producer):**
   - Add verified IE/CA/AU/NZ hub and organiser seeds for the current season (Christmas markets and craft fairs, where applications are open now) and the Canada Day / Australia Day council vendor pages that open next.
   - Measure each seed's yield in the producer report and drop weak ones.
   - Kit for Pi install; no change to rules.
2. **Now (Codex, V3; requested in the handover):**
   - L1, the ClueMart parser.
   - L2, a per-source blocker breakdown for AU/NZ/CA/IE entities from the ledger. Reason codes are enough.
3. **After V3-001 closes:**
   - L3, as part of the D-012 work.
   - L5 if L2 shows dates are the blocker.
4. **Report weekly:** READY by country, not producer counts.

## 4. Guardrails

- **Free sources only.** Fetching is polite: robots.txt respected, existing per-host delays, no paid search.
- **No inferred geography or dates.** V3 keeps its proof rules unchanged.
- **Enquiry listings** count only under D-012: a verified https route, honestly labelled.
- **Effect on V3-001:** none. This runs on the producer alongside it and does not touch lifecycle or identity code.

## 5. First producer increment (built 2026-10-11, kit `SHA256SUMS` 29a7c85d…)

**New lane: `marketsireland` (MarketsIreland.ie).** It is Ireland's only stallholder listing platform found. Its sitemap lists 48 markets, and the platform does not host applications.

Each listing states its own vendor status, which the producer maps as follows:

| Listing says | Producer state |
| --- | --- |
| "Applications are open for this market" | OPEN_NOW with a `platform_enquiry` route, plus the organiser site where one is given |
| "Applications are closed or not managed here" | UNKNOWN. The wording is ambiguous, so it is not treated as a closure. The organiser site is followed for discovery. |
| No status (standing markets) | UNKNOWN |

Northern Ireland counties and BT postcodes map to GB.

**Dry run on all 48 pages** (fetched politely on 2026-10-11): 5 IE OPEN_NOW, 40 IE unknown, 3 GB (NI) unknown. The open five are:
- Castledermot, 6 Dec;
- Balla, 5 Dec;
- Kilmacthomas, 13 Dec;
- Brockagh, 29 Nov;
- Winterval Waterford, 13 Nov.

Most contact is by email or phone shown on the listing. Only Balla, Brockagh and Winterval link an organiser site. **This is a small, honest start for IE**: V3 must judge whether these routes meet its proof rules and D-012.

**New hub seeds:**
- `neon_nsw_markets`: the NSW Government's NEON Marketplace, market category, with council and organiser stallholder calls.
- `finderskeepers_apply_au`.
- `allianceforarts_calls_ca`: BC artists' calls, filtered to market, fair, vendor, craft and maker posts.
- `albertacraft_calls_ca`.

Per-seed yield will show in the producer report after the first cycles.

**Tests:** 95 pass, including 4 new MarketsIreland tests. The fixtures are sanitised: organiser emails and phone numbers have been replaced.
