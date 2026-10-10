# V3 customer API: the contract the V3 site needs

The site calls only its own origin, under **`/api/v3/*`**. There is one client, `public/assets/js/v3-api.js`. V3 implements
these endpoints with V3 services (the producer data in V3, V3 auth, V3 billing). The browser never sees a credential,
a database or another host.

- **Executable reference:** `dev/stub-server.mjs` + `dev/stub-engine.js`. These implement every endpoint below against
  producer data and are what the smoke test runs against.
- **Real responses:** `contract/examples/`.
- **Producer → site field rules:** `contract/reference/map-producer-record.mjs`.

## 1. Conventions

- JSON in, JSON out. Success responses carry `"ok": true` plus the documented fields. Errors are
  `{ "ok": false, "error": "<code>", "message": "<customer-safe text>", "fields"?: [...] }`, sent with the HTTP status below.
- **Session:** an HTTP-only, Secure, SameSite=Lax cookie set by V3 sign-in.
- **CSRF:** V3 sets a readable `fp_csrf` cookie on the first `GET /session`. Every non-GET request must send the same
  value in `x-csrf-token`; otherwise respond 403 `csrf_failed`.
- Markets are the canonical codes `GB US CA AU IE NZ SG HK`. URL slugs (`uk`, `us`, …) are frontend-only.
- Dates are `YYYY-MM-DD`; timestamps are ISO 8601 UTC. Distances are kilometres (`radius_km`, `distance_km`).
- **Missing data is `null`, never guessed or defaulted.** Keep every key present.
- Error codes the pages handle:

  | Code | HTTP |
  |---|---|
  | `auth_required` | 401 |
  | `upgrade_required`, `subscription_expired` | 402 |
  | `csrf_failed`, `forbidden` | 403 |
  | `not_found`, `unknown_market` | 404 |
  | `validation` (with `fields`), `invalid_email`, `invalid_link` | 400 |
  | `market_not_live`, `price_not_set` | 409 |
  | `rate_limited` | 429 |
  | `service_unavailable` | 503 |
  | `internal_error` | 500 |

## 2. Endpoints

| Method and path | Access | Request | Response (`ok:true` + …) |
|---|---|---|---|
| `GET /markets` | public | — | `{ markets: Market[] }` (§3.3) |
| `GET /stats` | public | — | `{ as_of, total, sports, markets: { CODE: { count, regions } } }` |
| `GET /regions?market=` | public | | `{ regions: Region[] }` (§3.5) with `opportunity_count` |
| `GET /geo/resolve?market=&q=` | public | | `{ location: { kind: point\|region\|unknown\|unresolved\|none, label, region_id?, region_code?, lat?, lng?, precision? } }` |
| `GET /opportunities` | public (paid fields redacted, §3.1) | `market` (required), `q` (place, postcode, ZIP, region id or slug), `q_text` (keyword), `region` (id, includes descendants), `radius_km`, `types` (csv), `sells`, `organiser_types` (csv), `when` (`30\|90\|xmas\|2027`), `month` (`YYYY-MM`), `sort` (`nearest\|soonest\|recently_checked\|az`), `page`, `page_size` (≤100) | `{ market, market_status, coverage: available\|none, location, total, page, page_size, sort, next_start, results: Opportunity[], facets: { types, unclassified_types, months, undated, regions }, map_points: [{id,lat,lng,type,title}] }` |
| `GET /opportunities/count` | public | the same filters | `{ total }` |
| `GET /opportunities/:id` | public (redacted) | | `{ opportunity: Opportunity + { similar: Opportunity[≤4], is_current, region_path: Region[] } }`; 404 `not_found` |
| `GET /opportunities/upcoming?market=&limit=&type=` | public | | `{ items: Opportunity[] }` soonest first, start ≥ today |
| `POST /opportunities/by-ids` | public | `{ ids: [] }` | `{ items: Opportunity[] }` (unknown ids omitted) |
| `POST /seo/inventory` | public (cache it) | `{ market, intents: [{ key, filters: { types?, sells?, organiser_types? } }] }` | `{ market, generated_at, market_total, intents: {key: n}, regions: {region_id: n}, combos: {"key\|region_id": n} }` |
| `GET /session` | public | | `{ signed_in, user: { email, business_name, contact_name, phone, market, base_postcode, specialty, regions, public_listing_opt_in } \| null, access: { tier: free\|trial\|pro, status, plan_id?, market?, trial_ends?, renews_on?, cancel_at_period_end?, has_billing_account?, checkout_allowed?, trial_eligible?, billing_review_required? } }` |
| `POST /session/link` | public, CSRF, rate limited | `{ email, next }` | `{ sent: true }` and an emailed one-time link (`dev_link` only in non-production) |
| `GET /session/verify?token=&next=` | link | | 303 → `next` (same-origin path) with the session cookie set; bad or used link → `/account.html?signin=expired` |
| `POST /session/verify` | CSRF | `{ token }` | Session |
| `POST /session/logout` | CSRF | | `{}` |
| `PATCH /session/profile` | signed in, CSRF | profile fields | Session |
| `GET /saved` | signed in | | `{ ids: [] }` |
| `GET /saved?expand=1` | signed in | | `{ items: (Opportunity + { saved_at, is_current })[], missing: n }` |
| `POST /saved` | signed in, CSRF | `{ id }` | `{ count }` |
| `DELETE /saved/:id` | signed in, CSRF | | `{ count }` |
| `GET /alerts` | signed in | | `{ alerts: [{ id, name, query: {market,q?,place_label?,radius_km?,types?,sells?,organiser_types?,when?}, frequency: instant\|daily\|weekly, paused, created_at, current_matches, sample: Opportunity[≤3] }] }` |
| `POST /alerts` | Pro or trial, CSRF | `{ name, query, frequency }` | `{ alert }`; 402 `upgrade_required` for Free |
| `PATCH /alerts/:id` | owner, CSRF | partial | `{ alert }` |
| `DELETE /alerts/:id` | owner, CSRF | | `{}` |
| `GET /billing/plans?market=` | public | | `{ plans: [{ id: free\|pro_monthly, name, market, price\|null, price_label, currency, interval, trial_days, card_required, features[], note\|null }] }`. A plan with no confirmed price returns `price: null` and the UI shows "To be confirmed". |
| `POST /billing/checkout` | signed in, CSRF | `{ plan_id, market }` | `{ checkout_url }`: the payment provider's hosted page. On return it lands on `/account.html?checkout=success&session_id=…`, or `/pricing.html?checkout=cancelled`. |
| `POST /billing/confirm` | signed in, CSRF | `{ session_id }` | Session (access starts on return, before the webhook) |
| `POST /billing/portal` | signed in, CSRF | | `{ url }`: the hosted billing portal (cancel at period end, card, invoices) |
| `POST /inbox/organiser_submission` · `/inbox/partnership_enquiry` · `/inbox/listing_report` · `/inbox/waitlist` | public, CSRF, rate limited | form fields | `{ reference }` (stored for staff review; nothing is published automatically) |

## 3. Objects

Signed-in access includes server-derived Checkout/trial eligibility. Account and pricing screens must not promise a second trial to a returning owner or offer ordinary Checkout when billing needs review. These fields are presentation hints; the server independently enforces canonical ownership and duplicate/trial guards on every billing request. A generic plan's `trial_days` is not proof of individual eligibility.

### 3.1 Opportunity (what the server returns for each listing)

```jsonc
{
  "id": "fdx1_0089b683573022c6f7cb",             // the producer's stable opportunity_id (or a V3 id mapped 1:1 to it)
  "market": "GB", "title": "…", "source_title": null,
  "type": "christmas_market", "type_label": "Christmas market",    // §3.4
  "organiser": { "name": "…|null", "type": "council|null", "type_label": "Council|null", "verified": false },
  "location": { "label": "Venue, Town, County", "locality": "…|null", "region": "…|null", "region_id": "gb/cumbria|null",
                "region_name": "…|null", "region_code": "TX|null", "postal_code": null, "lat": null, "lng": null, "precision": null },
  "dates": { "start": "YYYY-MM-DD|null", "end": "…|null", "recurring": false, "application_deadline": "…|null" },
  "application": { "status": "…", "deadline": "…|null", "days_left": 12, "opens_on": "…|null", "basis": "deadline|event_dates|source|null" },  // §3.2
  "fee": { "text": null, "currency": "GBP" },
  "sells": ["craft"],                              // food | craft | market | general; [] = not stated (never defaulted)
  "notes": null,                                   // customer description; null until V3 has reviewed copy
  "checked": { "last_checked": "YYYY-MM-DD", "freshness": null },
  "canonical_path": "/uk/opportunity/fdx1_…/",
  "distance_km": null,                             // only for point searches with geocoded listings
  "access": { "locked": true,  "source_domain_hint": ".co.uk", "source_url": null, "application_url": null }   // Free / signed out
  // "access": { "locked": false, "source_domain": "example.co.uk", "source_url": "https://…", "application_url": "https://…" }  // trial / Pro
}
```

**Redaction is server-side:** Free and signed-out users never receive `source_url`, `application_url` or `source_domain`.
That is the entitlement model Build 4 was designed and approved with (search free, where-to-apply on Pro).

**Visibility:** return only producer records with `channel == "current"` (`export_readiness == "READY"`). Until LOW
confidence has been reviewed, also exclude `confidence.level == "LOW"` (see 06_QUALITY_AUDIT). Records V3 receives with
any other channel (closures, withdrawals, watch) must update or hide the listing, never show it as open.

### 3.2 Application status (evidence only; derived from the producer's `application_state`)

| status | from | card text |
|---|---|---|
| `closing_soon` | OPEN_NOW with a deadline ≤ 14 days away | "Closes 12 Nov" |
| `open` | OPEN_NOW with a later deadline | "Apply by …" |
| `open_now` | OPEN_NOW, no deadline published | "Taking applications" |
| `rolling` | ROLLING | "Apply any time" |
| `enquire` | ENQUIRY_AVAILABLE | "Contact organiser" |
| `opens_later` (+`opens_on`) | UPCOMING_NOT_OPEN | "Opens 1 Feb" |
| `closed` | CLOSED_CURRENT_CYCLE, or a deadline that has passed | "Deadline passed" |
| `ended` | HISTORICAL, or an event date that has passed | "Finished" |
| `unknown` | anything else | nothing |

### 3.3 Market (registry, configured in V3)

Each market carries:
- `code`, `route_slug`, `display_code`, `name`, `the`, `launch_status` (`live|building`), `locale`, `currency`, `date_format`;
- `distance_unit` (display only), `radius_options` (in display units), `postal { label, label_mid, example, kind, has_postcodes? }`;
- `region_label { singular, plural }`, `vocab { listings, trader, traders, traders_short, fee, apps, sport, pitch }`;
- `opportunity_count`;
- **`search { radius, region, geocoder }`**: set `radius: true` only where V3 can geocode both the query and the listings.
  Today the producer supplies no coordinates, so `radius` is false everywhere and the Finder hides distance search.

The current values (GB and US live; the others building; GB £4.99 Pro) are in `contract/examples/GET_markets.json`,
`dev/stub-engine.js` (`MARKETS`) and `GET_billing_plans_GB.json`. They are configuration, so changing them needs no code.

### 3.4 Event types (site vocabulary) and mapping from producer types

`christmas_market`, `holiday_market`, `food_festival`, `festival`, `market`, `street_trading`, `show`, `concession`, `event`,
`sport`. The mapping from the producer's `opportunity_type` is in `contract/reference/map-producer-record.mjs`
(`siteType`). Labels ship with the site (`v3-api.js` `TYPES`).

### 3.5 Region (taxonomy owned by V3)

`{ id: "gb/kent", name, slug, level: nation|region|county|state|province|district, parent_id, code: "US-TX"|null, opportunity_count }`.
- Ids are stable: they appear in URLs, alerts and SEO pages.
- A starter GB tree (nations → English regions → counties) and the US states are in `dev/stub-engine.js`.
- The producer supplies a `region` name (and an ISO `region_code` for US/CA/AU). V3 maps the name to an id.

## 4. Server-side rendering and routes (SEO)

- Serve `public/` as static files. Map clean URLs to templates with `server/seo-edge.mjs` `seo.resolve(path, ctx)`:
  - `page` → `seo.html`;
  - `app` → `finder.html` or `opportunity.html` with the query parameters it returns;
  - `redirect` → a real 301;
  - `not_found` → a real 404.
- Render `<title>`, meta description, canonical, robots, hreflang and JSON-LD into the HTML response from
  `seo.meta(...)`, using `GET /seo/inventory` and `GET /opportunities` data. Generate `/sitemap.xml` and the per-market
  sitemaps with `seo.pages()` and `seo.sitemapXml()`. Full rules: `03_SEO_PRESERVATION.md` in the hand-off.
- Headers for every response:
  - `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - HSTS
  - `X-Robots-Tag: noindex` on every non-production host

Native preview geography: without verified coordinates, radius and nearest sorting return `400 radius_unavailable`. A non-region place query performs a literal match against retained source location and returns `location.kind: unresolved`; it never geocodes or falls back to all-country results. `facets.unclassified_types` counts rows whose source-backed type remains unknown, so All types includes them without inventing a category.
