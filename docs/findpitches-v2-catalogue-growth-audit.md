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
