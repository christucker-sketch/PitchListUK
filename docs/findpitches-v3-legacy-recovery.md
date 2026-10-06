# V2 legacy evidence recovery

V2 is a read-only reference. Recovery reconstructs source-backed export records in a separate `legacy_v2` producer lane; it never copies the V2 customer table into V3 or invokes V2 runtime code. Every recovered receipt is shadow-only, with promotion/publication disabled and an explicit pending audit.

`capture-legacy-v2.mjs` verifies the reference database name and exposes only fixed SELECT queries. It pins each table's identity set, pages retained candidates, customer rows, structured baselines, pilot history and enrichment, then hashes the captured tables. V2 may continue its own work during capture, so the manifest records a capture window rather than claiming a transactional snapshot. Keep this reference file and the recovery cache outside the checkout in a private directory.

The first capture contains 29,747 candidates, 3,161 customer records, 1,599 structured source baselines and 4,477 auxiliary enrichment/pilot rows. Candidate/customer pairs are one recovery unit. Explicit or uniquely source-linked baselines join the relevant unit; remaining baselines stay separate until V3 reconciliation. All 34,507 opportunity-bearing rows are represented in 31,203 recovery units.

| Category | Required evidence | Action |
| --- | --- | --- |
| Retained evidence | Structured source fields with retained excerpts, source URL, successful-fetch provenance and content hash; or a historical title literally corroborated in a retained fetched-page excerpt | Reconstruct the record, preserving its source fields and historical observation dates |
| Original-source re-fetch | A direct source response establishes a specific trading event through Event structured data or a named event heading with explicit vendor/application context | Reconstruct fresh evidence, retain response hash, URL/redirect provenance and timestamp |
| Uncertain/quarantine | Missing/unsafe routes, failed fetches, unsupported formats, ambiguous listings, unsupported country evidence or insufficient event identity | Retain the audit decision and secure source cache; create no entity from an unsupported record |

Primary and corroborating provenance can support a retained route. Trailing-slash aliases preserve the same route; different paths/query IDs require their own proof. Classifier scores, inferred application phrases and customer fields alone never establish recovery. Customer/candidate fields are comparison material for repair statistics. Direct country evidence repairs a conflicting historical discovery market. Application phrases alone yield UNKNOWN state.

Retained structured facts have authority 85, corroborated excerpts 60, direct Event facts 90 and direct headings 80. Derived UNKNOWN state has authority 40. The independent structured producer remains authority 100. Field-level proofs and immutable raw receipts accompany recovery, so stronger existing V3 evidence remains selected and disagreements remain reviewable.

Re-fetch uses only up to two original routes per opportunity, at most three redirects, a 12-second timeout per request and a 1 MiB response limit. Unsafe redirects are refused. No Serper search, discovered-link crawl or form submission is involved. A shared URL cache avoids repeated fetches; ordinary original-route launches per hostname are spaced by at least 1.2 seconds, and Facebook public-page reads by 300 milliseconds. HTTP 429 responses pause that hostname for its bounded Retry-After window (15 minutes when absent); affected routes are quarantined for review. Up to 32 source preparations feed two import batches, each capped at eight units. Completed source responses advance independently of slow requests. HTTP retries reuse the same immutable entry and bounded backoff. Audit claims and ledger rows are committed in small D1 batches, retaining per-entry immutable hash checks.

```bash
node operations/findpitches-v3/capture-legacy-v2.mjs \
  --credentials /secure/cloudflare.env --out /secure/legacy/snapshot.json

node operations/findpitches-v3/legacy-recovery.mjs \
  --snapshot /secure/legacy/snapshot.json \
  --credentials /secure/cloudflare.env \
  --state-dir /secure/v3-resources --out-dir /secure/legacy/recovery \
  --concurrency 32

node operations/findpitches-v3/report-legacy-recovery.mjs \
  --snapshot /secure/legacy/snapshot.json \
  --credentials /secure/cloudflare.env --state-dir /secure/v3-resources \
  --recovery-dir /secure/legacy/recovery --out /secure/legacy/report.json
```

The operator-only ingest routes are `POST /legacy/refetch`, `/legacy/import` and `/legacy/complete`. The home-PC ingest-only token cannot use them. A complete import manifest is verified against the ledger count once; reconciliation may still be pending. `/status` exposes recovery progress and identity review counts. A run is identified by the snapshot hash and evidence-rule revision; improved rules explicitly supersede earlier attempts while retaining their receipts and decisions. Resumption skips committed entries and uses cached sources.

`drain-legacy-recovery.mjs` can advance already-durable reconciliation with at most two operator requests in flight and a three-hour deadline. It cannot tick acquisition or publication, and it stops only after import completion and zero pending identity decisions. Other stages retain their normal consumers/cron. `verify-legacy-preservation.mjs` checks the captured pre-recovery live producer receipts/facts, reruns the deployed 100-row control and probes disabled acquisition/publication and token boundaries without a paid search.

The report counts inspected rows/units, retained and re-fetched recoveries, quarantines, matches to the initial V3 population and distinct new entities. It separates probable matches and identity holds, verifies immutable source hashes/values, and compares historical fields with reconstructed values. Repair statistics are evidence comparisons, not independently labelled ground truth. All recovered records require audit before any publication/cutover decision.

The [completed 6 October report](findpitches-v3-legacy-recovery-report-2026-10-06.md) records the full run. Its `final_categories` are mutually exclusive after source and identity holds; source-reconstruction totals separately include identity-held evidence. Within-recovery duplicate counts measure additional qualified units per new entity, independently of earlier held receipts.

Heading qualification matches whole trading-event words (including camel-case/year boundaries). It cannot mistake “Affairs” for “fair”; licensing/login pages, editorial/marketing headings and non-event directories remain uncertain. Named vendor signup forms can still qualify. `qualify-legacy-recovery.mjs` applies the stricter qualification to cached tentative evidence without re-fetching or deleting it. An immutable quality hold prevents a pending record from creating an entity, or blocks readiness when an already selected fact comes from held evidence. Stronger unheld source facts can qualify the canonical entity; identical stronger evidence upgrades its selected authority. `/status` and authenticated entity reads expose holds. Effective report categories exclude quality-held reconstructions, count overlapping holds once, and retain integrity verification for all earlier evidence.

`reselect-corroboration.mjs` can repair earlier selection metadata when a stronger unheld fact with the exact same value was retained only as corroboration. The operator-only enrichment route `/corroboration/reselect` requires existing entity membership and identical values; it cannot substitute a differing value or an unrelated/held fact. It records the ordinary selection audit and schedules fresh eligibility/readiness without altering any source receipt/fact.

V3 queue wake-ups are atomically coalesced for five minutes per durable job. Completed/leased duplicate pointers are acknowledged without another claim/fan-out cycle, and each consumer has maximum concurrency one. Failed transport remains recoverable from durable jobs and cron; no queue purge is required.
