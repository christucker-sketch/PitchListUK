# Legacy UK paid-discovery recovery

This is a bounded salvage lane for receipts retained by the separate legacy global UK acquisition engine. Its V3 producer is `legacy-global-uk`; it is separate from `legacy_v2`, the independent structured producer and V3 paid acquisition. Legacy spend must not enter V3's paid-query KPI denominator or be attributed to Claude/Pi delivery.

Archive the original workflow receipts, their SHA-256 manifest, every repeated candidate occurrence and each distinct original source route before importing anything. Direct source fetches use the existing V3 enrichment document fetcher. No Serper search is required. Raw receipts and source documents stay in restricted operator storage outside Git; only aggregate reports are committed.

The recovery CLI checks each receipt against the manifest, verifies that the historical row actually occurs in that receipt, and checks the fetched HTML hash. It derives new facts from the current source. Historical customer-ready/publication flags, query city, event dates and application states remain immutable evidence metadata and cannot supply current facts. The GB collection scope is not verified geography. Contradictory country evidence and quarantined directory/social/index pages produce no new entity.

Recovered headings and structured event facts enter the normal per-field evidence model. Application links require the conservative verifier's scoped application evidence; the old generic footer/navigation scan cannot establish an application route. Availability starts UNKNOWN. This process neither bypasses current source proof nor promotes held evidence to READY.

`POST /legacy-global/import` is operator-only on the shadow ingest Worker. The ingest-only producer token cannot access it. Imports require publication disabled, empty customer/publication tables, bulk acquisition disabled and the commercial paid programme manually paused. The whole batch is validated before any writes. It uses normal preservation gates, content-hash replay, reconciliation and evidence authority. Weaker recovery cannot overwrite stronger structured source facts or silently alter identity.

```bash
node operations/findpitches-v3/legacy-global-recovery.mjs \
  --credentials /tmp/findpitches-codex-cloudflare.env \
  --state-dir /workspace/.pitchlist-cloud/v3-remote \
  --archive-dir /workspace/.pitchlist-cloud/v3-remote/legacy-global-recovery-2026-10-09 \
  --out-dir /workspace/.pitchlist-cloud/v3-remote/legacy-global-recovery-2026-10-09/import \
  --maximum 30
```

The CLI preserves a baseline, bounds the import to at most 50 source routes, waits for identity decisions and ordinary reconciliation jobs, then compares every pre-existing producer receipt/source fact and existing identity. Its report distinguishes evidence receipts, matched entities, new shadow entities, held outcomes and actual READY inventory. A later rerun with unchanged source documents is idempotent.

The user separately authorized pausing only legacy UK paid discovery on 9 October 2026. That pause sets `GLOBAL_UK_CONTROLLER_CUTOVER_ENABLED=false` on the legacy global Worker and pauses any active UK discovery workflows. It preserves code, Durable Object namespaces/state, unrelated bindings, shared scheduling and V2. It is a persistent live configuration change, not infrastructure deletion. V3 deployment tools do not target this Worker. An old legacy deployment configuration still containing `true` could re-enable it; do not deploy that configuration without explicit operator review of the pause. A V3-only budget cannot protect a separate legacy/Pi/external client using the same Serper account.

Checks: the full V3 suite, boundary check, source-country/directory rejection, immutable original fields, stronger-source preservation, replay, operator authentication and zero publication. The incident's observed metrics and pause verification are in the dated recovery report.
