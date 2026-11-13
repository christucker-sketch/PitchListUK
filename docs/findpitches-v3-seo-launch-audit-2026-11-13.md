# FindPitches V3: production audit and SEO launch fixes (13 Nov 2026, Claude)

Branch `findpitches-v3/seo-launch-fixes`, based on `45f6a541`. It deliberately excludes the unrelated Mycelium commit `802747e2`. **Nothing here is deployed.** No production configuration, data, DNS, Stripe setting or subscription was changed. Every database access was a read-only `SELECT`.

## 1. Cloudflare inventory

This comes from the Cloudflare Developer Platform connector, used read-only.

**Workers (19).** The ones that matter:

| Worker | Last deployed | Role |
|---|---|---|
| `findpitches-v3-customer-production` | 16 Oct 23:22Z | Serves findpitches.com |
| `findpitches-v3-api-shadow` | 21 Oct | Catalogue API |
| `findpitches-v3-ingest-shadow` | 4 Nov | Pipeline |
| acquisition, eligibility, enrichment, readiness, reconcile, watch | various | Pipeline |
| `findpitches-v3-customer-preview` | 15 Oct | Preview |

- The production deploy timestamp matches `dae1b6f0` (16 Oct 23:19Z). Live asset hashes match the repo.
- Older and unrelated Workers are still present: V2 Workers, `findpitches-global-acquisition-shadow`, `findpitches-uk-acquisition-canary`, `findpitches-observer`, `pitchlist-texas-acquisition`, `pitchlistuk` (V1), `nohypeai`.

**D1 databases:**

| Database | Size | Notes |
|---|---|---|
| `findpitches-v3-shadow` | **7.91 GB** | Catalogue and pipeline |
| `findpitches-v3-customer-production` | 10 MB | |
| `findpitches-v3-customer-preview` | | |
| V2 shadow and enrichment | | |
| `findpitches-observer` | | |

**Crons**, taken from the repo configs because the connector cannot list them:
- eligibility, enrichment, readiness and reconcile run **every minute**;
- acquisition every 15 minutes;
- watch hourly;
- customer every 5 minutes.

**Not inspectable with this connector:** zone routes, WAF and bot settings, Worker logs and analytics. These need the operator's Cloudflare API token, held by Codex.

### Findings from the inventory

- **P0 (operations): the shadow D1 database is 7.91 GB and growing about 140–160 MB a day.**
  - Its own `storage_capacity_samples` show 4.59 GB on 20 Oct and 7.91 GB on 13 Nov.
  - D1's per-database limit is 10 GB, so it fills in **roughly 14 days**.
  - When writes fail, renewals stop, proofs expire and the customer catalogue drains.
  - One likely contributor: **879 renewal attempts against `www.ukcraftfairs.com` since 20 Oct**, which still yield HTTP 520 and leave 98 UK entities on WATCH.
- **Stripe webhooks are healthy.**
  - 268 live events have been received since 12 Oct, with 0 unprocessed and 0 errors.
  - They include PitchList V1 events (e.g. 72 `invoice.payment_failed`), which are ignored as `unowned_ignored`.
  - V3 has 2 customers and 1 subscription (cancelled). There are **no active V3 paying subscribers**.
- **PitchList V1 isolation:**
  - The V3 handler only re-syncs customers linked in V3's own D1.
  - The webhook stores only a hash of each event, not its body.
  - The V1 Worker and database are separate.
- **Customer errors are happening every day, independent of the audit.**
  - The production `customer_operation_events` table records 56–366 `service_unavailable` responses a day (6–12 Nov).
  - On 13 Nov the figure is 1,049, which includes this audit's crawl.

## 2. Why concurrent page views fail

- **Every** country, region, category or listing page fetches a **full** catalogue snapshot from the API Worker. The API Worker rebuilds it from the 7.9 GB shadow database. Measured read-only:
  - the inventory query reads about 22.7k rows, takes about 55 ms and returns about 3.1 MB of JSON;
  - the policy query reads about 167.6k rows and takes about 66 ms.
- That is about 190k rows per page view, on the same database that four pipeline Workers write to every minute.
- D1 runs one database's queries serially. A few concurrent page views, plus pipeline writes, queue up and fail. The customer Worker then returns 503 by design ("no stale fallback").
- Listing pages use an `ids` scope, but the policy read still materialises the full current policy.
- Every non-asset request also writes a rate-limit row to the customer D1.

**Change in this branch** (`customer-catalogue.mjs`):

1. **Single-flight reads, always on.** Concurrent requests in an isolate share one in-flight proof read per scope. Freshness is unchanged.
2. **Optional short cache**, set with `V3_CATALOGUE_CACHE_SECONDS`.
   - It is off by default, accepts 1–60, and is capped at 60.
   - It reuses one validated full snapshot for that many seconds and derives the scoped reads from it.
   - `mapProof(item, now)` still runs on every request, so proof expiry and close instants are enforced at request time.
   - Failed reads are never cached.
   - An unknown detail id falls back to a live read.
   - Turning it on is a deploy-time decision for Chris and Codex.

**Recommended next step:** have a cron materialise the customer snapshot into R2 or KV every 1–2 minutes, and serve page views from that. Pages would then stop reading the 7.9 GB database at all.

## 3. SEO fixes in this branch

| # | Problem (live) | Fix |
|---|---|---|
| P0-1 | `robots.txt` disallowed `/api/`. Every page renders from `/api/`, so with robots obeyed pages rendered blank, and the homepage showed "temporarily unavailable" | Explicit `Allow` for the anonymous read endpoints (`PUBLIC_RENDER_API`); everything else under `/api/` stays disallowed. Those responses already carry `X-Robots-Tag: noindex` and are Free-redacted |
| P0-2 | Internal links went to `/seo.html?path=…` (noindex, canonical `/seo.html`) and `/opportunity.html?id=…` (noindex) | New `routes.href.*` helpers produce clean canonical URLs when the page is served by the Worker. All visible anchors use them. Legacy URLs now 301 (production only, language-aware, with an open-redirect guard) |
| P1 | Landing and listing HTML was an empty skeleton until JS ran | `customer-ssr.mjs` server-renders, for English pages: the h1, intro, the 12 listings with canonical links, and internal link groups to indexable pages. Listing pages get the h1, facts and breadcrumbs. Everything is built from `present(row)` (Free), so no source or application URLs appear |
| P1 | AU, CA and NZ listings were indexable and in the sitemap | Listing `robots` is `index` only for `launch_status: live` markets. The sitemap is limited to live markets |
| P1 | Listing pages had no meta description; titles ended in raw ISO dates | Meta description added. Titles show "— 13 Nov 2026" (presentation only; stored data unchanged) |
| P2 | Home and organisers missing from the sitemap; every `lastmod` was today | Both added. Listings use their last-checked date |
| P2 | No Open Graph tags | `og:*` added on indexable pages |
| P2 | Duplicate empty meta description | Removed when the server provides one |
| P2 | `finder.html?cc=uk&type=null` link | Fixed |
| P2 | Shell failure replaced the whole homepage | The notice is now inserted above existing content. An empty shell still gets the full notice |

Prices, the trial, entitlements and server-side redaction are untouched.

## 4. Data findings

**US duplicates: 1,157 listings, about 804 distinct event-dates.**
- 194 events appear 2–7 times, 353 extra rows in all.
- The duplicate classification query found **0 exact duplicates**. Every group is one source event with **separate per-category application forms**, mostly Eventeny vendor forms (Food vs Craft vs Corporate, booth sizes, artist alley).
- These are genuinely separate application routes, but customers see identical titles, and the counts are routes, not events.
- Only 7 US series recur across different dates (19 rows).
- **Proposal (not implemented):**
  - count and advertise events (title + start + place);
  - group the routes under one event, labelled with the application heading (already captured in proof as `application_heading`).

**UK: 124 listings, from only 15 market series.**

| Organiser | Readiness | Entities | Situation |
|---|---|---|---|
| Mynt Image | READY | 121 | Shown to customers |
| CJ's Events Warwickshire | still cached READY | 43 | Not shown: proofs expired 26 Oct (31 are future events). **Renewal has not attempted this host since 25 Oct 22:54Z** |
| UKCraftFairs.com | WATCH | 98 | Source returns HTTP 520 to the renewer |

- Across the UK pipeline (1,057 entities), the main block reasons are `organiser_missing` (593), `application_state_requires_recheck` (562) and `source_backed_location_missing` (506).
- The pipeline is not surfacing qualifying UK work because two of the three biggest UK sources are stalled (CJ's renewals stopped, UKCraftFairs returns 520).
- Root-causing why the renewal scheduler stopped selecting CJ's needs the pipeline owner (Codex).

## 5. Tests

- **New** `tests/findpitches-v3/customer-seo-launch.test.mjs`: **10/10**. It covers:
  - robots semantics (longest match, `$`);
  - every anonymous frontend endpoint being crawlable;
  - clean links;
  - redirects and the open-redirect guard;
  - SSR content and redaction;
  - indexable sub-page links;
  - live-only sitemap and robots;
  - single-flight and cache behaviour, including expiry and failure;
  - the title helper.
- `customer-production.test.mjs`: one assertion was updated, because the legacy `/opportunity.html?id=` now returns 301.
- **Full V3 suite: 593/596.** The same 3 native-D1/workerd tests fail on the unchanged base (environment).
- Frontend independence check passes; frontend tests 3/3.
- **End-to-end:** the real Build 4 frontend was run against the branch Worker in-process, with no network. With Google robots rules applied:
  - home, `/uk/`, `/uk/south-east/`, `/us/` and a listing all render fully;
  - there are no `seo.html` or `opportunity.html` links and no paid data.
  - With JS disabled, every landing and listing page still has an h1, listings and canonical links.

## 6. GO / NO-GO (revised)

**Code: GO for review and deployment once approved.** It fixes both P0 SEO blockers.

**Overall launch to Google: NO-GO until** all of the following are done:

1. this branch is reviewed by Codex and deployed with Chris's approval;
2. **the D1 growth is addressed**, because the database will hit 10 GB in about 2 weeks;
3. the 503 rate is re-measured after deploy, with `V3_CATALOGUE_CACHE_SECONDS` decided;
4. the advertised counts are corrected to distinct events (US) and the homepage coverage claims (IE/SG/HK, sports) are fixed.

The Google Search Console steps are in the report to Chris. Submitting a sitemap doesn't mean pages are indexed.
