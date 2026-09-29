# US place-level coverage from actual imported Census index

Verified first-run user dataset (2025 Gazetteer place geography / 2020 decennial population): SHA-256 `E12F3EF7591870E7CF7EBEC37DFD7301DBC2F80542B2FFBF8A221A3657CF55E7`.
- 50 states / 32,057 places including 19,497 incorporated, 12,540 CDPs, 20 legally special/unclassified entries.
- 314 matched incorporated places above 100k (2020 population), plus 7 populous special-government units to review (Indianapolis, Nashville, Louisville and others). The original imported JSON predates the new special tier but the coverage module detects those seven via their classification and population without requiring a re-import.
- 498 unmatched 2020 population GEOIDs, including 37 incorporated. Do not guess population, silently remove records or claim the major-city denominator is final.

## First tangible baseline
Use the user's full uploaded index as the fixed offline geography reference. The initial `FindPitches-US-Geography-Planning-2026-09-29.zip` export contains:
- Complete 50-state place totals and 314 + 7 priority-place selection.
- Full place index CSV for matching and eventual regional search source generation.
- 37 unmatched incorporated places needing population reconciliation.
- All existing per-city and per-state live inventory counts are explicitly **UNKNOWN**.

## Join contract
`planUsPlaceCoverage(index, venueRows, {completeSnapshot})` is pure/offline. A `venueRows` entry requires `opportunity_id`, `venue_geoid`, `venue_evidence_status:'verified_event_venue'`, and `customer_visibility:'visible_at_snapshot'`. An organiser's headquarters, scraped discovery location, inferred point proximity or non-visible projection cannot be counted as actual event-venue coverage.

Default `completeSnapshot:false` marks non-seen places **unknown**, not zero. Set `completeSnapshot:true` ONLY after a complete authoritative snapshot covering all currently visible customer opportunities and a verified event-venue GEOID assignment process, and report opportunities whose venue can't be resolved separately. Country/state or free-text matches alone cannot justify flipping completeness. Each opportunity ID must be unique to prevent double counting.

## Required next integration
1. Read isolated v2 D1's customer-ready data using the protected customer API's **read-time visibility checks**, including freshness, deadline, current revision and source-backed location gates. Draft API PR #1868 is not yet deployed; don't assert that current source-backed projections are customer-ready.
2. Audit and assign **actual event venue GEOIDs** using explicit source evidence and place boundary matching; avoid matching a town by the acquisition query's region or its point distance. County fairs outside incorporated limits must be tracked at county/metro level separately.
3. Produce the first US state/metro/city baseline. Keep unverified location, incomplete snapshot and zero coverage distinct.
4. Build targeted additional acquisition plans informed by measured gaps and cost/yield; keep broad international acquisition uninterrupted. Publication remains disabled; v1 unchanged.


## Read-only v2 customer-visible inventory snapshot (draft implementation)

`getUsCustomerVisibleSnapshot(db, {now,maxAgeDays,pageSize})` is now implemented in `platform/findpitches-v2/quality/us-customer-visible-snapshot.mjs`. It reads isolated v2 D1 in bounded, id-keyset pages; mirrors draft protected customer API #1868's SQL candidate status, projection disposition, event/deadline, freshness, and source-backed location checks; then applies the shared `assessCustomerReadiness()` check. It reports per-acquisition-region US customer-visible counts **separately** from actual event venue coverage. By default, it intentionally reports **zero verified place-level GEOIDs**, because current customer projection data has only location text, not independently assigned, boundary-checked event venue GEOIDs.

**No D1 run has occurred**; module requires the isolated v2 D1 binding, not v1, and has not been wired to a public API/cron. Review its duplicated SQL against the approved #1868 visibility module and consolidate onto a single imported visibility clause once that draft is merged. Call with a controlled internal read-only execution only. Do not claim city-level zeros from missing verified venues.

The next step after obtaining a real snapshot is to audit venue evidence and assign canonical 7-digit place GEOIDs with actual-event-venue verification (not proximity or search region). Until then, the 321 population-centre priority list has **unknown live venue coverage**.
