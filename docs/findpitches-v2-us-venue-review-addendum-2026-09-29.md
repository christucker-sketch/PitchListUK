# US venue recovery: first additional independently corroborated event venue — 2026-09-29

**Candidate:** `fpv2_cc259ee1485c162d7f029ee5`

**Recovery excerpt:** St. Clair Shores municipal vendor/food-truck page states that the Sunday October 11 Pumpkin Patch market will be held at Blossom Heath Park. This candidate was one of the ten strict text matches in the read-only isolated-v2 D1 snapshot at 2026-09-29T20:31:41.021Z and was re-fetched in [run 36626948286](https://github.com/christucker-sketch/PitchListUK/actions/runs/36626948286). Unlike the nine other strict-text matches, its ID is **not** among the prior 31 independently checked IDs in `platform/findpitches-v2/quality/us-venue-review-2026-09-29.json`.

**Independent corroboration of event, venue and date:**
- City of St. Clair Shores [official Vendor & Food Truck Application page](https://www.scsmi.net/877/Vendor-Food-Truck-Application) confirms the 2026 Sunday 11 October noon–6pm market at Blossom Heath Park; the city provides vendor sign-up.
- [Official current city events page](https://www.scsmi.net/307/Events) confirms the October 11 Pumpkin Patch at Blossom Heath Park, 24800 Jefferson Ave, St. Clair Shores, MI.
- [Event-specific Marketspread page](https://marketspread.com/market/30895/st-clair-shores-farmers-market/events/79229/) also shows October 11, 2026 and vendor application entry point. **Actual current applications-open state must still be checked** against the live form before claiming the opportunity is available for customers.

**Census match:** `2670760`, St. Clair Shores city, MI, in the user's verified checksum-pinned 2025 US place index (2020 decennial population 58,874). The confirmed park's city address gives high-confidence city-level match; the existing index centroid alone is not proof. This city is in the incorporated regional/small tier, **not** the 314-city >=100k tier.

**Provisional disposition:** `new_independently_corroborated_venue_place_match_pending_application_check`. This is a potential **one-place addition to the historical 29-place manually verified venue baseline**, not an automatic publication or new customer-ready count. Compare the candidate's current canonical/application URLs, event title, current revision, deadline and any duplicate keys before approving a new verified opportunity; do not write a GEOID or change v2 D1 from this review document.

## Critical lesson from strong-text sample

Prior 68/352 'strong' textual matches were inflated by boilerplate (venue restrictions, storage, insurance, website headings). After strict delimiter/context and named-place checks, the next live read-only snapshot found **10/352 strict stored-text matches**, of which **nine were already in the historic 31 manually verified list**, and this St. Clair Shores record was the one new ID. Seven of the ten strict cohort returned possible venue statements on bounded source refetch, including one truncated hotel excerpt requiring further evidence.

The strict new extractor improves precision, but **does not retain all historic real-world venue confirmations** (only 9/31 historic IDs had strict stored-text matches at the sampled time). Thus **do not deploy the stricter gate as an irreversible rejection policy yet**. Route ambiguous genuine opportunities into evidenced manual reinspection, and obtain source excerpts/current-revision fixtures for historical known-good venues to measure false negatives before any controlled promotion cutover.

No D1 write, no Serper search, no production deployment, and no v1 change occurred.
