# FindPitches structured-feed importer

This importer is the defensive boundary between the independent structured-source discovery engine and FindPitches.

## Safety model

The importer is deliberately split into two phases:

1. **Dry-run reconciliation** — reads producer JSONL plus a FindPitches snapshot and classifies incoming records as `existing_match`, `probable_match`, `new_candidate`, `conflict`, or `reject`. No writes.
2. **Shadow staging** — loads validated producer records only into `structured_feed_imports` and `structured_feed_records` in the v2 shadow D1 database.

Shadow staging does **not** write to `customer_opportunities`, `publication_queue`, or any live/public dataset.

## Producer contract

Canonical schema: `findpitches-discovery-export-v1`.

The staging writer preserves producer identity, application state, lifecycle event, source/application URLs, dates, provenance, evidence, source fingerprint and content hash. Producer `opportunity_id` is the idempotency key.

## Dry-run reconciliation

```powershell
node operations/findpitches-v2/importer/dry-run-import.mjs `
  --feed "C:\Users\ChrisT\OneDrive - Managed Technology Corporation Ltd\Documents\fp-discovery-lab\integration_export\full\current.jsonl" `
  --existing-csv "C:\Users\ChrisT\OneDrive - Managed Technology Corporation Ltd\Documents\fp-discovery-lab\comparison\existing-findpitches-readonly-snapshot.csv" `
  --out "C:\Users\ChrisT\OneDrive - Managed Technology Corporation Ltd\Documents\fp-discovery-lab\importer_dry_run"
```

Outputs:

- `dry-run-summary.json`
- `dry-run-actions.csv`
- `dry-run-actions.jsonl`

Matcher v5 is intentionally conservative. Different platform application IDs and separately actionable dated instances are not silently collapsed.

## Shadow staging

Migration: `operations/findpitches-v2/migrations/0009_structured_feed_staging.sql`

Generate an idempotent staging SQL file:

```powershell
node operations/findpitches-v2/importer/stage-structured-feed.mjs `
  --feed "C:\Users\ChrisT\OneDrive - Managed Technology Corporation Ltd\Documents\fp-discovery-lab\integration_export\full\current.jsonl" `
  --manifest "C:\Users\ChrisT\OneDrive - Managed Technology Corporation Ltd\Documents\fp-discovery-lab\integration_export\full\current-manifest.json" `
  --out "C:\Users\ChrisT\OneDrive - Managed Technology Corporation Ltd\Documents\fp-discovery-lab\importer_dry_run\structured-feed-stage.sql"
```

The generated SQL only targets `structured_feed_imports` and `structured_feed_records`.

On producer content change, reconciliation is reset to `unreconciled`. Unchanged records retain their reconciliation result.

## Tests

```powershell
node operations/findpitches-v2/importer/dry-run-import.test.mjs
node operations/findpitches-v2/importer/stage-structured-feed.test.mjs
```

## Promotion boundary

No record staged here is customer-visible. A later reconciliation/promotion phase must explicitly decide whether a staged record:

- maps to an existing candidate/customer opportunity,
- becomes a new v2 candidate,
- remains held for review,
- is rejected.

Only after that separate decision may the existing FindPitches readiness and customer-promotion gates be invoked.
