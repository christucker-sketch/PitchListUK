# Catalogue growth audit — first implementation

Parent: #1869. This is the initial **read-only** baseline-reporting module. It makes no changes to acquisition, classifier, enrichment, promotion, publication, D1 schema or v1.

## Usage
`getCatalogueCoverageAudit(db)` in `platform/findpitches-v2/quality/catalogue-coverage-audit.mjs` accepts the v2 D1 binding and returns:
- A complete 50-state coverage matrix, including states with zero candidates.
- Per-state discovery, validation/rejection, current enrichment, projected validation, and source-backed current-revision projections.
- Unknown/malformed US region codes explicitly separated (not silently counted as a state).
- Rejected/held reason distribution across markets.
- Per-market validated candidates with/without current-revision enrichment and with current-revision source-backed projections.

**Interpretation limits:** `current_source_backed_projection` is *not* true currently visible inventory. The protected customer API (draft #1868) applies additional freshness, date, disposition and readiness checks. Candidate `region_code` is acquisition geography, *not proven venue geography*, so the state audit must be reconciled with confirmed event venues before customer-facing location or metro coverage is reported. Do not derive a city/metro from a source-excerpt alone.

The module deliberately exposes only aggregates. It is not yet wired to public `/status` or scheduled runs. Before deployment, agree on report access and query frequency: use an internal scheduled/bounded snapshot or a protected diagnostics endpoint, not multiple heavy queries on every public status check.

## Immediate next checkpoints
1. Run the module against the isolated v2 D1 and store dated snapshots; report zero-coverage US states and reason distributions.
2. Reconcile its projection totals against the actual **protected API read-time filter** from #1868, and add actual customer-ready counts by state using proven venue state.
3. Audit accepted event locations and stratified rejection categories to quantify false positives/negatives, with source evidence and sample sizes.
4. Use those findings to implement independent US gap-fill scheduling and targeted missing-evidence recovery without reducing or pausing existing acquisition.

Baseline (reported 2026-09-29 18:32 BST, **not a fresh audit result**): global current customer-ready 812; global source-backed 814/2036; US source-backed 359/843; event date 46/2036; deadline 43/2036.

## US place-level indexing (offline, not yet connected to acquisition)

The versioned builder `operations/findpitches-v2/scripts/build-us-place-index.mjs` combines the [2025 Census National Places Gazetteer](https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.2025.html) with Census 2020 decennial P.L. 94-171 `P1_001N` place population tables. It joins by seven-digit state+place GEOID, **not names**, to avoid collisions between states. It distinguishes incorporated LSAD types from CDPs and marks unfamiliar LSAD types for review rather than guessing. The builder is deliberately offline, has no access to D1 or search API credits, and produces an immutable JSON file and coverage summary. It excludes DC and Puerto Rico from the **50-state index denominator**, but those markets should be separately considered before production planning.

1. Obtain and unzip `2025_Gaz_place_national.zip` from the official Census 2025 Gazetteer portal.
2. Obtain Census 2020 decennial P1 responses for `get=NAME,P1_001N&for=place:*&in=state:<two-digit-state-FIPS>`, one JSON response per state. The Census API may require your own API key; never commit it or embed it in URLs saved to logs. Save the 50 responses in one private `population-json-dir`.
3. Run:
   `node operations/findpitches-v2/scripts/build-us-place-index.mjs /path/to/2025_gaz_place_national.txt /path/to/population-json-dir /tmp/us-places-2025-geo-2020-pop.json`
   The output file must not exist already. Review excluded regions and unfamiliar LSAD before treating the catalogue as complete.

**Important:** 2025 geography and 2020 population are different vintages. Boundary/name changes can cause missing GEOIDs; these fail closed, requiring a documented reconciliation rather than arbitrary default population. The provisional `~348` places above 100k and `19k+` incorporated-place estimates are planning figures only. The actual tier counts must be derived from the imported, scoped Census data, with the vintages disclosed. Verified event venue locations must later be matched to GEOIDs with confidence handling and administrative-boundary verification; discovery query origin is not a venue location.

Next PR: add a documented, separately reviewable gap-fill planner that consumes this index and **actual customer-visible** counts. No automatic 19k-place query sweep until yield and cost are measured.
