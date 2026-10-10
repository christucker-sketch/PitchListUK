# UKCraftFairs: why V3 cannot verify it, and what the producer holds (V3-002)

Author: Claude. Written 2026-10-10 at 12:37 London. This is evidence and options only: no V3, Pi or rule change has been made.

## 1. Root cause of the HTTP 520

ukcraftfairs.com runs on IIS 7.5 and sends **two malformed response header lines** on every page. A header field name must not contain a space or `/` (RFC 9110 §5.1), and both of these do.

I captured this with one `curl --http1.1` request from Claude's cloud workspace at 2026-10-10T11:35:35Z. The cookie value is redacted:

```
HTTP/1.1 200 OK
Server: Microsoft-IIS/7.5
Content-Type: text/html; Charset=windows-1252
Set-Cookie: ASPSESSIONID…=<redacted>; secure; path=/
text/html: charset=Windows-1252                         <- invalid field name (contains "/")
Strict Transport Security: max-age=15552001; …          <- invalid field name (contains spaces)
X-Content-Type-Options: nosniff
…
```

Clients react differently to these two lines:

| Client | Result |
| --- | --- |
| Strict parsers: Cloudflare's edge in front of a Worker `fetch()`, and Python `h11`/`httpx` | Reject the response. Cloudflare reports this as **520** (origin returned an invalid response). |
| Lenient clients: curl, and Python's stdlib `http.client` | Accept it and show the page normally. |

The Pi's crawler falls back to the lenient client for such hosts. `fpd-netcheck` on the Pi reports `ukcraftfairs 200 (lenient client: site sends malformed headers)`, most recently at the 10 Oct install.

**What this means:**
- This is a server misconfiguration, not blocking or rate limiting.
- Retrying from Cloudflare will never succeed while those two lines remain.
- No change to V3's READY rules is needed or appropriate. The problem is transport only.

## 2. What the producer holds

This section uses the Pi's `export/v3/feed.jsonl`, copied on 10 Oct at about 12:34 London.

| Measure | Value |
| --- | --- |
| UKCraftFairs records in `channel=current` | **159** (all GB, confidence HIGH, `discovery_source=ukcraftfairs`) |
| Retired | 1 |
| Held by the producer | 1 (a known false positive) |
| Application state | **All 159 are `ENQUIRY_AVAILABLE`.** Traders contact the organiser through UKCraftFairs, which needs a site login. There is no deadline, and no direct application URL other than the listing. |
| Route | Each record has 1–5 `platform_enquiry` routes on its listing page. `source_url == application_url` for all 159. |
| Dates | All have `event_start`, from the event title (`event_date_basis=platform_title`). They run from Oct 2026 to Dec 2027; 125 fall in Oct–Dec 2026. None is past-dated. |
| Place | `venue` and `region` are present on all 159. The organiser name is mostly absent: the platform doesn't show it, and platform names are deliberately stripped. |
| Source custody | Every record has `provenance.sources[]` with `http_status: 200`, `fetched_at` and the page's `content_sha256`. Raw HTML for pages linked to an opportunity is kept in full in the Pi's content-addressed cache (`fpd/storage.py` policy). |
| Freshness | 74 of 159 refetched since 8 Oct. 85 were last fetched on 4 Oct. |

**Sample** (15 records spread evenly by date; public listing data only):

| producer id | event | start | place | listing path | fetched_at | HTTP | content sha256 | routes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| fdx1_d17b63fc1b6d13064181 | Pop Up Shops | 2026-10-08 | Burnham Deepdale | /craft-events/26685/x | 2026-10-04T19:42:42Z | 200 | fcf9a7a27129… | 1 |
| fdx1_7c8e91407485c20933a6 | The HandCrafted Market - West Kirby | 2026-10-14 | Wirral | /craft-events/26515/x | 2026-10-04T20:04:40Z | 200 | b2dbc9072ec8… | 1 |
| fdx1_5edf4eeceecbe7ce8c18 | Late October Craft Fair in Hawes Wensleydale | 2026-10-24 | Wensleydale | /craft-events/26469/x | 2026-10-09T09:37:46Z | 200 | 46f14180312a… | 1 |
| fdx1_ca99a0f197eed1b9a0a3 | Christmas Craft and Gift Fair | 2026-10-25 | Bury St Edmunds | /craft-events/26422/x | 2026-10-04T20:02:54Z | 200 | 2ce0520d281d… | 1 |
| fdx1_292ed9a8107b4bdb861e | Essex Christmas Fair | 2026-11-06 | Braintree | /craft-events/26505/x | 2026-10-09T09:37:45Z | 200 | 1826916a366e… | 1 |
| fdx1_7ed4a65a0fbebaffeaa5 | Tunbridge Wells Christmas Artisan Craft and Gift… | 2026-11-08 | Tunbridge Wells | /craft-events/26156/x | 2026-10-09T09:38:33Z | 200 | ad243c184b7f… | 1 |
| fdx1_fcf8f324455f708fea00 | Faversham Christmas Artisan Crafts and Gift Mark… | 2026-11-14 | Faversham | /craft-events/26136/x | 2026-10-10T11:29:28Z | 200 | 936c119132e8… | 1 |
| fdx1_3ed9cfea4bf351af2a40 | Staffs English Winter Fair | 2026-11-21 | Stafford | /craft-events/26559/x | 2026-10-09T09:37:42Z | 200 | a8cbbb5792f5… | 1 |
| fdx1_91f255934cf652d9cc38 | Jingle and Mingle Christmas Market and Santas Gr… | 2026-11-22 | Worthing | /craft-events/26346/x | 2026-10-09T09:38:05Z | 200 | c3bc0b9252d3… | 1 |
| fdx1_524beaefb0ec25693805 | OUTSIDE and INSIDE ARTISAN MAKERS AND FOOD MONTH… | 2026-11-29 | Beckenham | /craft-events/26606/x | 2026-10-10T11:29:06Z | 200 | 107da4decab0… | 1 |
| fdx1_ca23b63bc8c2212e7e7c | Farnborough Christmas Craft Fayre | 2026-12-05 | Farnborough | /craft-events/26861/x | 2026-10-04T19:40:12Z | 200 | d8e1cc5ebd63… | 1 |
| fdx1_195c30ac85db782581c6 | Artists and Makers Christmas Fair | 2026-12-12 | Reading | /craft-events/26582/x | 2026-10-04T20:00:42Z | 200 | b28e292898c8… | 1 |
| fdx1_bc0af646763de58f853e | York Christmas Craft and Gift Fair and Market… | 2026-12-18 | York | /craft-events/26858/x | 2026-10-09T09:37:26Z | 200 | 077baaeb7d88… | 2 |
| fdx1_dd22a8d93a5398848dd0 | Faversham Artisan Crafts and Gift Markets | 2027-04-03 | Faversham | /craft-events/26809/x | 2026-10-04T19:30:16Z | 200 | 3d9529bff7b5… | 1 |
| fdx1_725881f196f8eda42dde | Faversham Artisan Crafts and Gift Markets | 2027-07-03 | Faversham | /craft-events/26815/x | 2026-10-10T08:38:07Z | 200 | b61ac8769d9d… | 1 |

The listing paths are relative to `https://www.ukcraftfairs.com`. "Pop Up Shops" starts on 8 Oct and is still current because it runs over several days.

V3's figure is "154 held". The producer has 159 current records. Mapping the two needs V3's entity list (Codex). The difference may be identity merges or records delivered after V3's measurement.

## 3. A second gate: enquiry-only

Codex's [9 Oct confirmation](findpitches-v3-producer-feed-confirmation-2026-10-09.md) states that **enquiry-only states do not become READY merely because the producer calls them current**.

All 159 UKCraftFairs records are enquiry-only. So even once V3 can read the pages, the READY gain depends on V3's enquiry policy:
- The customer frontend has a "Contact organiser" status (`enquire`). The UI can show them honestly.
- Whether enquiry listings count as launch inventory is a product decision for Chris, with ChatGPT's V3-010 review.

**Until both gates are settled, count the UKCraftFairs upside as between 0 and about 159, not as 154 guaranteed READY.**

## 4. Options to restore legitimate verification

| Option | What changes | Pros | Cons / gate |
| --- | --- | --- | --- |
| **A. Ask UKCraftFairs to fix two header lines** (recommended first step) | Nothing in V3 or the Pi | Permanent and simple for them: remove or rename two custom headers in IIS. V3 then verifies directly. | Needs someone to send a message, so it's Chris's call. Timing depends on their response. |
| **B. Producer-supplied source document** | New V3 ingest endpoint. The Pi uploads the retained page bytes for a requested URL, with `content_sha256`, `fetched_at`, HTTP status and the final URL. V3 runs **its own** verifier on that document. | V3's checks and TTLs are unchanged; only transport differs. Custody is by hash; the document is immutable evidence. Works for any future host with bad headers. | Codex builds the endpoint and its limits; Claude builds the Pi upload. Needs Chris's approval as a new evidence path. The verifier must state the provenance ("fetched by producer"). |
| C. Lenient fetcher outside Cloudflare | V3 runs a small non-Worker fetcher (container or VM) | V3 fetches itself | New infrastructure and cost. Contrary to the lean/independent posture. |
| Not acceptable | Treat the producer's claim as proof without a document | — | Weakens READY rules. Rejected. |

**Freshness, whichever option is chosen:** 85 of 159 pages were last fetched on 4 Oct. V3's recheck requests now reach every page (V3-001 runner installed at about 12:26 London), so V3 can request refreshes and the Pi re-queues up to 300 pages per cycle.

## 5. Side note (not UKCraftFairs)

10 `current` records from other lanes carry a past `event_start` with no end date:
- 6 LocalStalls;
- 2 Marketspread;
- 2 directory records, including one from 2024.

All are `ROLLING` recurring markets, so the start is a previous or first occurrence, not a closed event. Not launch-critical. The producer should add a next-occurrence date or a recurrence basis later.
