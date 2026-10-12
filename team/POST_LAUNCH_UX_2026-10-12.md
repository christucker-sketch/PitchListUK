# FindPitches V3 post-launch UX defects — 12 Oct 2026

Reported by Chris during a real production click-through after the root/Safari recovery.

## P1 customer-facing issues

### 1. General site/API performance is too slow
Chris reports normal navigation/search feels very slow. This matches the already-known multi-second catalogue/API latency concern.

Required follow-up:
- profile real production page/search timings from the public hostname;
- separate frontend rendering time from customer API/D1/catalogue/proof-read time;
- identify the slowest endpoints/queries and remove repeated full-policy/inventory/proof reads where safe;
- preserve proof freshness, entitlement, held/expired/Nashville filtering and avoid unsafe stale cross-request caches;
- record before/after timings from real public-origin requests.

Treat this now as a real customer UX issue, not just polish.

### 2. Finder map view has no opportunity markers
Chris reports that search works, but switching to map view does not put opportunity markers on the map.

Required follow-up:
- reproduce on production;
- inspect the search result payload supplied to the map renderer;
- verify latitude/longitude availability and field names/shape;
- distinguish listings with genuine coordinates from listings with unknown geography;
- ensure valid-coordinate listings render markers and unknown-coordinate listings remain honestly unplotted;
- test after search/filter changes and on mobile/desktop.

Do not fabricate coordinates to populate the map.

### 3. Homepage `Coming up. Get your application in.` section is empty
Chris's screenshot shows the section heading and table headers (`DATE`, `EVENT`, `WHERE`, `TYPE`) but no rows, despite substantial READY inventory.

Required follow-up:
- identify the endpoint/query that feeds this block;
- verify whether the frontend expects event date, application deadline, or another sort field;
- ensure genuinely eligible upcoming rows are returned and rendered;
- if no rows are legitimately available, show a deliberate empty-state message rather than a blank table shell;
- verify row links and Free/Pro redaction behave correctly.

### 4. Homepage UK area coverage shows only one area
Chris's screenshot of the homepage `Thousands of traders need what you sell.` section shows only a single geographic card: `United Kingdom — East Anglia`, despite current GB READY inventory being spread beyond one area.

Required follow-up:
- reproduce against production homepage data;
- inspect the region/area aggregation endpoint and frontend filtering;
- verify GB opportunity region mapping and whether only one region is being returned, only one has counts, or the UI is truncating/hiding other regions;
- compare against current READY GB inventory and expected region distribution;
- render all meaningful UK regions with real counts, or a truthful subset if deliberately curated;
- do not infer regions for listings whose geography is not proven.

## Acceptance expectation
These four items should be treated as a focused post-launch UX pass. Fixes must preserve the evidence/identity/entitlement rules and should be proved against the live public hostname, including mobile where relevant.
