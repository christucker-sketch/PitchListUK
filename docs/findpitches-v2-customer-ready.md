# FindPitches v2 customer-ready boundary

This contract separates internal classifier state from customer-facing product data.

Pipeline:

```
Serper acquisition -> classifier -> enrichment/customer-ready -> customer API -> FindPitches frontend
```

## Meanings

- **validated**: the classifier has enough evidence to believe the candidate is a genuine trader/vendor/exhibitor opportunity.
- **customer-ready**: the record passes the customer-facing contract and can be considered for API/publication exposure.
- **published**: a later, explicit publication decision. Publication remains disabled in shadow mode.

A validated candidate is **not** automatically customer-ready or publishable.

## Required customer-ready identity fields

The first contract requires: `id`, `market`, `title`, `region_code`, `canonical_url`, `application_url`, and `last_checked`.

These are the minimum identity/provenance fields. The readiness assessor also rejects malformed HTTP(S) URLs.

## Enrichment fields

The enrichment stage owns: organiser, precise location, coordinates, event start/end, application deadline, trader categories (`sells`), genuine recurring state, and customer-safe description.

Unknown values stay unknown. Missing dates must never imply recurring. Missing categories must never default to food. Internal evidence/review notes must never become customer descriptions.

## Separation rules

1. Acquisition and Serper search do not wait for enrichment.
2. Classifier throughput and thresholds are independent from enrichment.
3. Customer API reads a customer-facing projection, not raw classifier evidence.
4. No direct frontend access to D1.
5. Publication is not enabled by this contract.
6. Market-specific wording/configuration belongs in market capabilities, not forks of the engine.
7. Coordinates use decimal latitude/longitude; distance calculations use kilometres canonically and the frontend may localise display units.
8. Every exposed record retains source/application provenance and `last_checked`.

## Planned API surface

The intended first-party API surface is:

- `GET /v1/opportunities/search`
- `GET /v1/opportunities/:id`
- `GET /v1/markets`
- `GET /v1/regions`
- `GET /v1/categories`

This document defines the boundary only. It does not expose those endpoints or change the live Worker.
