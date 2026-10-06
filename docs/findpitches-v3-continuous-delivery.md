# Continuous independent producer delivery

The permanent V3 boundary is `https://findpitches-v3-ingest-shadow.ctucker.workers.dev/imports`. The independent producer pushes existing `findpitches-discovery-export-v1` records using an ingest-only bearer token. It receives no D1, Cloudflare, operator or Serper credentials. HTTPS, validation, shadow/test isolation and producer ID plus content-hash idempotency apply to every import. Requests contain at most 100 records and are also bounded by UTF-8 bytes.

The current source is `C:\Users\ChrisT\OneDrive - Managed Technology Corporation Ltd\Documents\fp-discovery-lab\integration_export\`. It remains local source/reference material. V3 does not mount OneDrive or depend on that Windows path. A delivery process runs beside the producer, reads completed normalized JSON/JSONL files and pushes them to the cloud endpoint.

## Windows setup

Install Node 22.13 or newer on the producer host. Use the V3 branch or standalone delivery bundle. Transfer **only** the ingest token file through your secure credential mechanism. The operator copy is `/workspace/.pitchlist-cloud/v3-remote/producer-ingest.env`; keep it outside the repository/export directory and do not paste it into chat. The installer rejects Cloudflare, operator and provider credentials.

From the bundle/repository root, run PowerShell:

```powershell
.\operations\findpitches-v3\install-producer-delivery.ps1 `
  -TokenFile "$env:LOCALAPPDATA\FindPitchesV3\ingest.env"
```

This defaults to the supplied directory and creates `FindPitches-V3-Structured-Delivery` in Task Scheduler. It runs every **15 minutes**, starts when available, prevents overlapping instances and uses the current user's limited privileges while that user is signed in. This local installation cannot be performed from the Linux cloud environment. The installer has been reviewed for Windows PowerShell 5 syntax but has not been executed on Windows here.

Protected state and an ingest-only token copy live under `%LOCALAPPDATA%\FindPitchesV3\producer-delivery`; access is restricted to the current user and SYSTEM. The export directory is read-only to the delivery process. `*.json*` selects completed `.json`/`.jsonl` files and excludes `.tmp` files. Pass a narrower `-FilePattern` if the directory also contains other JSON. An invalid/partial selected export fails before import and is retried next cycle.

Inspect `state\status.json` for delivery status, hashes, source age, rejected counts, rechecks and failures. Freshness warnings concern producer evidence timestamps, not successful transport. Checkpoints preserve completed batches; uncertain outcomes are replayed safely through server idempotency. Repeated exports do not create new entities.

The runner writes producer-addressable `rechecks.json` and acknowledges only delivered fresh evidence. The independent engine still owns fetching sources and exporting updates. If reconciliation has not linked the receipt, the next cycle retries acknowledgment. Stale exports cannot clear requests.

After a forced termination, inspect the lock PID and verify it has exited before removing `cycle.lock` or a checkpoint lock. Do not remove a live owner's lock. Normal failures release locks automatically.

## Always-on host

The standalone Node runner supports `input_file`, `input_directory` plus `file_pattern`, or an HTTPS `export_url`; configure exactly one source. A separate export-server bearer file is optional. Redirects are refused, export size is bounded, and the ingest token is never sent to the export server.

Copy `producer-runner.example.json` outside the checkout and configure paths. Verify one cycle:

```bash
node operations/findpitches-v3/producer-runner.mjs --config /secure/producer/v3-runner.json
```

Use `--loop` under a service manager for continuous delivery. `findpitches-v3-producer.service.example` supplies a template; update its user and paths. Normal cadence is 900 seconds, with bounded failure backoff. The runner remains separate from the discovery engine and V3 runtime.

The deployed endpoint has been tested using the historical control export. That proves transport/replay, not continuous fresh acquisition. The Windows schedule becomes live when installed on the producer host with its ingest-only credential.

## Cloud observation and health checks

`/status.structured_delivery` exposes the expected 900-second cadence, the last authenticated runner poll, recent poll intervals, receipt counts and source freshness. Every runner cycle already polls `/rechecks`, including when unchanged checkpointed exports skip `/imports`. The cloud records these contacts as append-only telemetry. Diagnostic `/rechecks?probe=1` requests and test imports are excluded from host cadence. Three contacts with two intervals between 10 and 20 minutes are required before the observed cadence is marked verified. Contact within 30 minutes is reported separately from export freshness; successful transport cannot make old source checks fresh.

`verify-producer-health.mjs` tests unchanged server replay and checkpoint replay, changed/new test records through the deployed queue pipeline, retained immutable facts, and refusal of stale recheck acknowledgment. It uses clearly synthetic test-scope fixtures and diagnostic polls, which cannot establish the Windows host is active. Live-source preservation is verified independently against the original receipt/fact baseline.

If cloud contacts remain absent, inspect the existing `FindPitches-V3-Structured-Delivery` scheduled task on the designated PC, its last run result, the signed-in task user, export-directory access and local `state/status.json`. The installer runs under that user's limited privileges while signed in; the cloud cannot start the Windows task. No cloud or provider credentials are required by the runner.
