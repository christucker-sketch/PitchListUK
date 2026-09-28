# FindPitches customer API v1 contract

The customer API is first-party FindPitches infrastructure for the **v2 platform** (API version `v1`). It is served by the v2 Worker (`operations/findpitches-v2/worker/index.mjs`) and read by the FindPitches website's **server-side** layer only. Browsers never call it, never receive its token and never read D1.

## Resources

| Method | Path | Notes |
|---|---|---|
| GET | `/v1/markets` | Market catalogue from the market registry (all defined markets; commercial launch approval is a website decision) |
| GET | `/v1/regions?market=GB` | Regions for one market. `market` is required |
| GET | `/v1/opportunities/search` | Customer-ready opportunities (see parameters) |
| GET | `/v1/opportunities/:id` | One customer-ready opportunity |

Any other method on these paths is `405`. Unknown `/v1/*` paths fall through to the Worker's `404`.

## Authentication (server-to-server)

- `Authorization: Bearer <token>`. Tokens are the Worker secret `FINDPITCHES_CUSTOMER_API_TOKENS` (comma-separated to allow rotation; tokens shorter than 32 characters are ignored).
- **Fails closed:** with no token configured every `/v1` route returns `503 customer_api_not_configured`.
- Missing or wrong token: `401 unauthorized` with `WWW-Authenticate: Bearer`. No data and no detail about why.
- Markets and regions are protected by default. Setting `FINDPITCHES_CUSTOMER_API_PUBLIC_METADATA=true` makes only those two public (product decision). Search and detail are always protected.

## Search parameters

| Parameter | Behaviour |
|---|---|
| `market` | Canonical code (`GB`, `US`, …). Unknown → `400 invalid_market` |
| `region_code` / `region` | Exact region code from `/v1/regions` |
| `q` / `query` | Free text over title, organiser, location, region and offering terms |
| `offering`, `cuisine` | Open-ended offering / cuisine terms |
| `limit` | 1–100, default 25 |
| `lat`, `lng`, `radius_km`, `cursor` | **Not implemented yet.** Rejected with `400 unsupported_parameter` rather than silently ignored |

Response: `{ api_version, query, count, opportunities[] }`. **`count` is the number of opportunities in this response, not a total of all matches.** Results are ordered by `last_checked` descending.

## Opportunity fields

`id, market, region_code, title, organiser, location, coordinates, event_start, event_end, application_deadline, canonical_url, application_url, offerings, recurring, description, last_checked`. Optional enrichment fields are `null` when unknown; nothing is defaulted. Internal candidate fields (evidence, score, status, rejection reasons, search text) are never returned.

## Current-record protection (visibility policy)

A customer-ready row is returned only while, **at read time**:

1. its source candidate still exists with status `validated` or `published` (revalidation moves cancelled / applications-closed events to `held`, which hides them);
2. no newer candidate revision has been inspected and found **not** customer-ready (`customer_promotion_disposition`);
3. the application deadline, if known, has not passed;
4. the event end date, if known, has not passed; a non-recurring event with a past start date and no end date is treated as finished;
5. `last_checked` is within `FINDPITCHES_CUSTOMER_MAX_AGE_DAYS` (default 60);
6. it still passes `assessCustomerReadiness()` (required fields — including `location` since the location gate — blocked wrapper / social / procurement / stale-year URLs);
7. it has a nonblank event `location` **and** `location_evidence_url` (the source-backed location gate, see `findpitches-v2-location-gate.md`). Rows promoted before migration 0008 have no evidence URL and stay hidden until re-promoted with evidence. The evidence URL itself is internal and never returned.

Checks 1–5 and 7 are SQL conditions in `customer/store.mjs`; check 6 runs in `customer/service.mjs`. Nothing is deleted: promotion (`run-batch.mjs`), acquisition, classification, enrichment, PDF recovery and publication are unchanged. Hidden records are also `404` by id.

Note: `readiness.mjs` treats a date-only deadline as midnight UTC, so a listing disappears at the start of its deadline day. Changing that to end-of-day in the market's timezone would also change promotion, so it is left for a separate decision.

## Errors

`{ ok: false, error }` with: `400 invalid_market | market_required | invalid_parameter | unsupported_parameter`, `401 unauthorized`, `404 opportunity_not_found`, `405 method_not_allowed`, `500 internal_error`, `503 customer_api_not_configured`. Internal messages are logged with the `x-request-id`, never returned.

Offering and cuisine values are deliberately open-ended strings. Distance is canonicalised as kilometres at the API boundary once radius search exists.
