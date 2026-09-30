# FindPitches v2 practical customer readiness

Date: 30 September 2026. Draft implementation tracked in PR #1872 / issue #1869.

## Product rule

FindPitches should expose a credible, actionable vendor opportunity when the known facts are useful enough for a customer, while representing uncertainty explicitly. Exact venue, event date and application deadline improve an opportunity; they are not automatically prerequisites unless their absence would make the record misleading.

Hard blocking is reserved for materially unsafe or misleading records: unsupported/discovery-only location, invalid or wrapper URLs, social-only application routes, procurement/supplier pages, known stale source years, ended events and passed application deadlines.

## Location hierarchy

1. **venue** — exact event site supported by explicit event/source evidence. `venue_verified=true`.
2. **place** — source-backed town/city/locality, exact venue unavailable.
3. **area** — source-backed county/region/state/province, exact place unavailable.
4. **discovery_only** — geography supplied by the search/scheduler but not independently corroborated by the source. Internal only and never sufficient for customer visibility.

The existing strict `location` evidence remains the venue layer. `location_area` stores separately corroborated place/area evidence with its own source excerpt, confidence and precision. Never promote discovery geography simply because a query targeted that geography.

## Compatibility

The canonical model owns evidence and precision. The customer/front-end adapter may continue to expose the existing scalar `location` field, choosing the best supported venue/place/area value, while metadata exposes `location_precision`, `location_confidence`, `venue_verified` and completeness.

The front end therefore consumes the model; it does not define what counts as evidence.

## Optional detail

Unknown event date and application deadline are incomplete information, not automatic rejection. Known ended events and known passed deadlines remain hard blocks.

An opportunity can therefore be:
- **usable_partial** — credible route and supported location, but one or more optional detail fields are absent.
- **enhanced** — venue plus event date plus application deadline are all known.
- **hard_blocked** — fails a safety/truthfulness rule.

## Deployment safety

The practical model is being validated in isolated v2 with publication disabled. The existing protected customer API is not switched to this model until read-only catalogue audits and UK/US benchmarks show sensible precision/recall. v1 remains untouched.
