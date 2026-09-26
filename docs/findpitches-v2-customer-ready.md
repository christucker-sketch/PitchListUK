# FindPitches v2 customer-ready boundary

This contract separates internal classifier state from customer-facing product data.

Pipeline:

```
Serper acquisition -> classifier -> enrichment/customer-ready -> customer API -> FindPitches frontend
```

## Meanings

- **validated**: classifier evidence says the candidate is a genuine trader/vendor/exhibitor opportunity.
- **customer-ready**: the record passes the customer-facing contract and can be considered for API/publication exposure.
- **published**: a later explicit publication decision. Publication remains disabled in shadow mode.

A validated candidate is not automatically customer-ready or publishable.

## Required customer-ready identity fields

`id`, `market`, `title`, `region_code`, `canonical_url`, `application_url`, and `last_checked`. URLs must be HTTP(S).

## Enrichment fields

Enrichment owns organiser, precise location, coordinates, event start/end, application deadline, adaptive `offerings`, genuine recurring state, and customer-safe description.

`offerings` is intentionally open-ended. A record can describe values such as Jamaican jerk, Ethiopian injera, Korean corn dogs, vegan pâtisserie or handmade ceramics without waiting for a taxonomy/code change. Optional `kind`, `cuisine`, and `product` labels provide useful structure but are not fixed enums.

Those offering values are customer-facing metadata: they can be displayed on opportunity listings and used by the customer search layer.

Unknown values stay unknown. Missing dates never imply recurring. Missing offerings never default to food. Internal evidence/review notes never become customer descriptions.

## Separation rules

1. Acquisition and Serper search do not wait for enrichment.
2. Classifier throughput and thresholds are independent from enrichment.
3. Customer API reads a customer-facing projection, not raw classifier evidence.
4. No direct frontend access to D1.
5. Publication is not enabled by this contract.
6. Market-specific wording/configuration belongs in market capabilities, not forks of the engine.
7. Coordinates use decimal latitude/longitude; distance uses kilometres canonically and the frontend may localise units.
8. Every exposed record retains source/application provenance and `last_checked`.

## Planned API surface

- `GET /v1/opportunities/search`
- `GET /v1/opportunities/:id`
- `GET /v1/markets`
- `GET /v1/regions`

Offering/cuisine/product vocabulary is discovered from customer-ready data and searched directly; it is not a fixed `/categories` enumeration.

This document defines the boundary only. It does not expose endpoints or change the live Worker.
