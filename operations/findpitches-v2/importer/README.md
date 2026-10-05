# FindPitches structured-feed importer (dry-run phase)

This importer is the defensive boundary between an independent structured-source discovery feed and FindPitches.

## Safety

This phase performs **no writes** to D1, Cloudflare, customer publication, or the production API. It only reads an integration JSONL feed plus an existing FindPitches snapshot and writes a local reconciliation report.

## Inputs

- Producer feed: `findpitches-discovery-export-v1` JSONL, normally `integration_export/full/current.jsonl` or a delta file.
- Existing FindPitches corpus, supplied as either:
  - the read-only comparison CSV (`--existing-csv`), or
  - a directory containing the static snapshot modules `opportunities.mjs`, `us-opportunities.mjs`, `ca-opportunities.mjs` (`--existing-dir`).

Expected producer fields used by this phase include `opportunity_id`, `country_code`, `event_name`, `organiser`, `location`, `region`, `event_start`, `application_state`, `source_url`, and `application_url`. Missing optional fields are tolerated; records missing identity/routing essentials are rejected from the dry-run plan.

## Dry-run classifications

- `existing_match`: high-confidence same opportunity/edition.
- `probable_match`: likely same opportunity or event family, but requires review; different annual editions deliberately land here unless the date identity is exact.
- `new_candidate`: no credible existing match found.
- `conflict`: route identity collides with contradictory event identity.
- `reject`: malformed/unsupported record or not currently in one of the usable producer states (`OPEN_NOW`, `ROLLING`, `ENQUIRY_AVAILABLE`).

The thresholds are intentionally conservative. A later shadow writer must never treat `probable_match` as safe to create or update without additional reconciliation.

## Matching signals

The matcher uses:

1. canonicalised application/source URLs (tracking parameters removed),
2. event-name token similarity,
3. organiser similarity,
4. location similarity,
5. region,
6. event date/year,
7. country as a hard boundary.

Exact URL identity carries the largest weight, but contradictory identity evidence can still be surfaced for review. Different years are not silently collapsed.

## Run on Windows

Example against the comparison snapshot created for the lab:

```powershell
node operations/findpitches-v2/importer/dry-run-import.mjs `
  --feed "C:\Users\ChrisT\OneDrive - Managed Technology Corporation Ltd\Documents\fp-discovery-lab\integration_export\full\current.jsonl" `
  --existing-csv "C:\Users\ChrisT\OneDrive - Managed Technology Corporation Ltd\Documents\fp-discovery-lab\comparison\existing-findpitches-readonly-snapshot.csv" `
  --out "C:\Users\ChrisT\OneDrive - Managed Technology Corporation Ltd\Documents\fp-discovery-lab\importer_dry_run"
```

## Outputs

- `dry-run-summary.json` — counts and thresholds.
- `dry-run-actions.csv` — human review table.
- `dry-run-actions.jsonl` — machine-readable plan.

`writes_performed` is always `0` in this phase.

## Tests

```powershell
node operations/findpitches-v2/importer/dry-run-import.test.mjs
```

The test set covers URL canonicalisation, exact matching, annual-edition separation, new-candidate handling, rejection, country isolation, and scoring.

## Next phase, deliberately not implemented yet

After a real feed dry-run is audited, the next phase can add a shadow-store adapter that:

1. consumes only audited `new_candidate` and resolved matches,
2. writes to v2 shadow candidate/projection storage rather than customer publication,
3. remains idempotent on producer `opportunity_id`,
4. preserves producer provenance and lifecycle state,
5. routes every imported record through normal FindPitches readiness/promotion gates.

Do not enable writes before auditing the dry-run results against the current producer export.
