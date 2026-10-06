# FindPitches V3 shadow operations

V3 is on `findpitches-v3/greenfield`. All application changes are under new V3 paths. V2 code, databases, deployments and customer datasets remain reference material. This runbook authorizes no production cutover, publication, infrastructure deletion or protected/live branch merge.

## Local setup and checks

Use Node 22.13 or newer. The onboarded cloud environment has Node 22.23.3 and pinned Wrangler in `/workspace/.pitchlist-cloud`; activate them with `source /workspace/.pitchlist-cloud/env.sh`. A fresh machine can install the separate V3 toolchain with:

```bash
npm ci --prefix operations/findpitches-v3 --no-audit --no-fund
node operations/findpitches-v3/verify-boundaries.mjs
node --test tests/findpitches-v3/woodchipper-control.test.mjs
npm test --prefix operations/findpitches-v3
```

In the onboarded environment, set `V3_TOOLING_ROOT=/workspace/.pitchlist-cloud/tooling` for the runtime test or Cloudflare scripts instead of installing duplicate tooling. The runtime test uses real workerd D1 and native queue delivery, takes several minutes, and destroys only its own ephemeral test runtime on completion.

The early control is 100 real reconstructed structured exports from the immutable 1,599-row artifact at `d111f9493300b3f4b94075cca46f99583fa8f7b9`, including Eventeny vendor 52126. Its ID manifest and source checksum are in the fixture. The original historical 100-row pilot ledger and after-snapshot were not available; this is a deterministic reconstruction of the failure categories. Verify every fixture field against the reference with `python3 operations/findpitches-v3/verify-control-fixture.py` after fetching that read-only Git ref.

To persist local evidence and generate a reviewable comparison snapshot:

```bash
node operations/findpitches-v3/control.mjs \
  --database /tmp/findpitches-v3-control.sqlite \
  --report /tmp/findpitches-v3-control-report.json \
  --snapshot /tmp/findpitches-v3-snapshot.json
node operations/findpitches-v3/compare.mjs \
  --input tests/findpitches-v3/fixtures/structured-control-100.json \
  --v3 /tmp/findpitches-v3-snapshot.json \
  --report /tmp/findpitches-v3-comparison.json
```

The control rejects a gate declaration unless all 100 records completed the pipeline, weak title extraction was rejected for each entity, original raw/fact/selected fields survived exactly, customer/publication tables are empty, and replay adds no entities. The gate is stored in the V3 D1 database, rather than accepted as a client count.

## Cloudflare resources and deployment

The [architecture](findpitches-v3-architecture.md) specifies the resource map. Configurations in `operations/findpitches-v3/cloudflare/` contain a deliberately invalid remote placeholder UUID; use generated configurations with the new D1 ID. Each of eight Workers binds only `FINDPITCHES_V3_DB`. Six stage queues, one dead-letter queue and a reserved publication queue are separate from V2. The publication queue has no producer/consumer binding; D1 rejects publication writes. City search defaults to disabled with a zero daily budget.

The token needs Workers Scripts edit, D1 edit, Queues edit, and sufficient account visibility for inventory. Supply `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in a secure credential file outside the checkout. Scripts parse the file as data and never source it, print its values or write them into tracked configs. Generated ingest/operator tokens and state are stored with restricted permissions outside the repository. The structured producer receives only the ingest token and Worker URL, never D1 or Cloudflare credentials.

Outbound environment access allows `api.cloudflare.com` and the newly assigned `workers.dev` hosts following the published environment change. `google.serper.dev` is needed only for deliberately enabled city acquisition. Deployment and end-to-end validation completed on 6 October 2026. The actual state/configs/secret files are in `/workspace/.pitchlist-cloud/v3-remote`; retain this ownership manifest securely for resumption. Public resource metadata and verification evidence are archived in `operations/findpitches-v3/reports/remote-*.json`.

For subsequent isolated shadow deployment/validation, use the existing ownership state, inventory first, then validate:

```bash
node operations/findpitches-v3/provision.mjs \
  --credentials /tmp/findpitches-codex-cloudflare.env \
  --state-dir /workspace/.pitchlist-cloud/v3-remote
node operations/findpitches-v3/deploy-shadow.mjs \
  --credentials /tmp/findpitches-codex-cloudflare.env \
  --state-dir /workspace/.pitchlist-cloud/v3-remote
node operations/findpitches-v3/validate-remote.mjs \
  --credentials /tmp/findpitches-codex-cloudflare.env \
  --state-dir /workspace/.pitchlist-cloud/v3-remote
```

Deployment runs the preservation suite, boundary checks and all Worker bundles before creating infrastructure. It refuses an existing same-name resource without its locally retained ownership manifest. Keep that manifest for resumption. It applies migrations only to the new V3 database, deploys the role Workers, installs separate ingest/operator secrets, and records their URLs. The remote validation imports the real 100 into **test** scope, runs adverse extraction proposals, audits preservation, replays the import and checks publication HTTP 403. It makes no search-provider requests.

`audit-remote-resources.mjs` verifies all actual Worker database/queue bindings, consumer scripts, dead-letter/retry configuration, cron schedules and disabled publication/acquisition defaults. `validate-remote-operations.mjs` checks authentication, no-op evidence guards, lease ownership/heartbeat/expiry, dead-job requeue and bounded failure on the disabled acquisition handler. It retains two named diagnostic job rows after completing them; these are not provider acquisition runs. `validate-producer-roundtrip.mjs` delivers one unchanged real source record in shadow scope, waits for automatic readiness without core-stage operator ticks, then verifies producer-addressable watch requests and stale acknowledgment rejection. Its pending canary recheck requires an actual fresh producer export.

## APIs and producer integration

| Role | Route | Authentication / behavior |
| --- | --- | --- |
| Every Worker | `GET /health`, `GET /status` | Public service/aggregate health, stage backlogs, leases, retries/dead jobs, throughput, producer activity, readiness, conflicts, gate and query counts. No raw records or secrets. |
| Ingest | `POST /imports` | Bearer ingest token. JSON `{environment:"shadow",records:[...]}`; 1–100 export records and 1 MiB body maximum. Only shadow/test accepted. Invalid receipts are retained. |
| Ingest | `GET /rechecks` | Ingest token. Producer IDs for shadow entities due for an independent producer recheck. |
| Ingest | `POST /rechecks/ack` | Ingest token. Exact `{entity_id,requested_at}` acknowledgment requires linked producer evidence whose `last_checked` is at least the request timestamp. A stale export or old request cannot clear it. |
| Stage Workers | `POST /tick` | Operator token; bounded `{limit:10}` sweep of that role's durable jobs. |
| Stage Workers | `POST /jobs/requeue` | Operator token; `{job_id}` for a dead job belonging to that stage. |
| Enrichment | `POST /proposals` | Operator token; `{entity_id,proposals:[{field,value,kind,source_url,excerpt}]}` with at most 10. Fixed server authority; exact alternatives and decisions retained. |
| API | `GET /shadow?environment=shadow&limit=25&after=...` | Operator token; cursor-paginated shadow analysis. Use `environment=test` explicitly for control entities. |
| API | `GET /entities/{id}` | Operator token; selected facts and bounded audit history. |
| API | `POST /control` | Operator token; server verification of `{records,record_ids}` for the preservation gate. |
| Acquisition | `POST /acquisition` | Operator token; approved `{city:"austin-tx",query_limit:1}` only when enabled and budgeted. |
| Every Worker | `GET /v1/opportunities` | Always HTTP 403, independent of environment flags. |

The independent producer continues its own acquisition, classification, lifecycle and export implementation. `producer-delivery.mjs` reads its JSON/JSONL output, preserves each record's fields, and bounds requests by both 100 rows and UTF-8 body size. It uses only the ingest URL/token; it has no V3 runtime, D1 or Cloudflare credential dependency. A checkpoint resumes completed batches and relies on server idempotency for an uncertain request outcome. A single-run file lock prevents overlapping deliveries. Inspect the recorded PID before removing a stale local lock after a terminated process. V3 consumes the existing export contract; it does not replace the producer. Export path and cadence are still needed for continuous live operation.

Provide the producer only a secure file containing `V3_INGEST_TOKEN`; operator and Cloudflare tokens remain with operators. Example delivery, using a checkpoint outside the checkout:

```bash
node operations/findpitches-v3/producer-delivery.mjs \
  --input /secure/producer/latest-export.jsonl \
  --ingest-url https://findpitches-v3-ingest-shadow.ctucker.workers.dev \
  --token-file /secure/producer/v3-ingest.env \
  --checkpoint /secure/producer/v3-delivery.json \
  --rechecks-out /secure/producer/v3-rechecks.json
```

The standalone engine processes the producer IDs in the recheck file, performs its own source fetches and exports fresh `last_checked` evidence. Deliver that updated export with `--ack-rechecks /secure/producer/v3-rechecks.json`. The client skips stale, rejected and wrong-environment evidence; the server waits until fresh receipts are reconciled/linked. A request that is not acknowledged remains available for the next delivery cycle. The CLI returns failure if any records are rejected and preserves their receipts in its checkpoint. The fixture canary proves transport, not a fresh platform crawl.

## Evidence and job recovery

Facts, receipts, links, assessments, proposals and selection audit are append-only. SQL also guards `INSERT OR REPLACE` bypasses. Lower authority cannot overwrite a selected field; equal static disagreement creates a conflict. A newer explicit lifecycle transition from the same producer record can update the selected application/lifecycle state, retaining the previous source facts. Dates compare as timestamps. Classification writes only assessments. Missing supported fields can be added, and revision changes invalidate derived projections.

D1 jobs are the durable outbox; native Queues accelerate delivery. Failed/missing wakeups recover on cron. Atomic claims use a random lease token, four-minute expiry, ownership checks, bounded attempts and exponential backoff. A heartbeat helper exists for future long-running stages. Current acquisition uses at most four sequential 20-second provider calls. Expired leases return to ready or dead; old lease owners cannot complete another worker's job. Requeue dead jobs explicitly after inspecting the cause. A provider request with uncertain billing outcome is never automatically repeated; retain the acquisition-run ID and inspect it before scheduling a new one.

WATCH, CLOSED and ready records are rechecked over time. The watch stage asks the independent producer for fresh evidence and queues eligibility reassessment; it never refetches a generic page to rewrite source identity. Current source closure/reopening is accepted through the export contract. Conflict resolution and PDF extraction are deliberately separate future capabilities; unresolved conflicts remain reviewable and block readiness.

## City lane and comparison

The Austin lane contains four narrow vendor/craft/festival/farmers-market query families. It requires a passing stored 100-row gate, `SERPER_API_KEY`, `V3_CITY_ENABLED=true`, and `V3_DAILY_QUERY_LIMIT` between 1 and 100. Each run reserves 1–4 queries atomically against the daily limit before contacting the provider. Search results enter the common envelope at snippet authority 50 with UNKNOWN state; a snippet alone does not claim an open application. Recorded responses validate integration; no paid queries have been run.

V2 comparison is file-based and read-only. Provide a snapshot with `schema:"findpitches-shadow-evaluation-v1"`, exact `inputs_hash`, aligned `as_of`, `records` keyed by `producer_record_id` (validation, identity, entity_id, eligibility, readiness, fields), and optional measured cost/timing metrics. Add `--v2 file.json` and optionally `--gold labels.json` to the comparison command. Gold labels need the same input hash/time and `{producer_record_id,eligible}` records. Mismatched hashes/times, missing fields, missing labels and costs are reported explicitly. The report makes no automatic superiority claim.

`snapshot-remote.mjs --credentials <secure-file> --state-dir /workspace/.pitchlist-cloud/v3-remote --input <input-json> --environment test` exports deployed V3 results for the exact input hashes without touching V2. Its remote adapter verifies the target database name before querying it and bounds parameter batches. The archived deployed 100-record comparison has 100% source-field retention and the same 64 ready / 36 blocked result; V2/gold/cost figures remain unavailable.

Before requesting production cutover, obtain equivalent V2/V3 shadow snapshots, labelled false rejection checks, current provider/infra costs and throughput, continuing producer delivery, a passed remote preservation control, operational recovery proof, and a separately designed publication/customer migration plan. Stop for user authorization at that point.
