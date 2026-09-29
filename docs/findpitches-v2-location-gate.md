# FindPitches v2 event-location launch gate (2026-09-29)

**Publication stays disabled.** A discovery region or organiser address is not evidence of where an event takes place.

## Automatic gate

- Customer promotion requires an explicit event location found on an existing source page/PDF, backed by a URL and an excerpt containing the extracted value.
- The former fallback from acquisition geography to a customer event location is removed. Missing or unsupported locations remain **not ready**, not rejected; acquisition, classification and PDF recovery continue normally.
- The customer store preserves the location source URL in `location_evidence_url`. Both search and detail reads fail closed on old rows without it.
- Migration 0008 leaves historic rows intact and schedules previously promoted revisions for one evidence-based reinspection. The disposition ledger prevents repeated processing of unchanged revisions lacking evidence.
- `/status` separates total projections, nonblank locations and source-backed locations. It counts a validated row as current-ready only with both location and source provenance.
- This gate is a first step. **Source-backed is not the same as geocoded/independently verified**: a page can mention an ambiguous venue, or an organiser's office. A city/venue/postcode quality audit and geographical verification remain required before paid launch.

## Audit and follow-up

1. Capture per-market counts of projected, source-backed and pending-location records from the dedicated v2 D1; compare `customer_location_quality` and `customer_promotion` across checkpoints.
2. Sample at least 50 validated records spanning GB, US and CA, including source-backed records, region-only records and PDF applications. Compare source excerpts against the actual event place. Record event venue, town/city, country, address/postcode, event date and application deadline separately.
3. Expand enrichment of pages/PDFs only when the source identifies the **event venue**, not merely the organiser's contact address. Never fill the location from the crawler's search region. Unknown or ambiguous entries stay pending.
4. Verify the source evidence against a geographic place (or review it manually) before treating a listing as geographically launch-ready. Plan structured city/venue/address fields and distance search only after those checks are credible.
5. Audit missing event dates and application deadlines separately; never substitute the event date for the application cutoff.
6. Coordinate schema/store changes with Claude's unpushed website/backend integration branch and rebase its patch before deploying that customer API. The source-backed gate alone must not be presented as full geographic verification.

## Safety

Migration affects **v2 D1 only**, not v1 data. Search remains unavailable publicly and publication remains disabled. The pipeline and PDF replay need no interruption. A temporary drop in the `current_ready` metric is an intentional correction of previously permissive readiness, not lost candidates.
