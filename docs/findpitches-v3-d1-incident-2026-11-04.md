# V3 incident, 4 November 2026: recheck query exhausts D1's resource window

Investigation: 08:51–09:07 UTC, read-only Cloudflare API/GraphQL and SELECT/EXPLAIN, source review and offline SQLite tests. Governing handover: da3e7cc735162e5493ece6c5aab3e9f0fabe55b3. No deployments, cron/consumer changes, D1 writes/migrations, token changes, Pi or customer/legacy actions.

## Diagnosis

**High-confidence cause: the ingest /rechecks listing query causes short D1 resource-exhaustion bursts. This is not a continuous write lock or a database-full incident.** Its environment/producer-first plan traverses historical producer receipts, groups/sorts before LIMIT and evaluates JSON timestamps. As receipt history grows, this path can consume an entire short resource window. The first known failed Pi poll is at 21:09, exactly when its SELECT took 19.62 seconds and all four minute-cron Workers threw. Other writes continued throughout the incident.

The causal attribution is strongly supported by query plans, timings and temporal alignment, but the exact internal D1 resource threshold and historical exception text cannot be proven: detailed observability access returns 403. Do not claim a specific lingering transaction or cron started it. The source workload implicated is **ingest's producerRechecks SELECT**, with synchronized cron failures as collateral. No new ingest deployment coincides with the incident: its active version was deployed 16 October.

### Corrections to the initial hypothesis

- The normal poll successfully INSERTed contacts at **21:09:37.919, 21:24:58.370, 21:55:15.150**, then hourly through **07:57:50.135**. The contact row is committed before the response fails. Absence of a contact on diagnostic probe does not prove the normal request's contact INSERT failed.
- GraphQL reports **25,364 write queries / 79,255 rows written** during 20:30–08:50. Every hourly bucket has writes.
- Eligibility, enrichment, readiness and watch completed jobs through **08:47**. There were **zero leased jobs** at 08:52.
- D1 metadata reports **6,547,537,920 bytes**, 65.48% of the repository's conservative 10,000,000,000-byte cap. Hourly storage rises from 6,531,469,300 to 6,547,489,000 bytes; no full-database error. Subscription lookup itself returns HTTP403/code10000, so the current billing plan is not independently certified. Workers account usage model reports standard.
- No stuck-lease cleanup, queue purge, blanket pause or plan upgrade is justified by this evidence.

## Exact metrics and queries

Window: 2026-11-03T20:30:00Z ≤ datetime < 2026-11-04T08:50:00Z; first/last hour partial. GraphQL datasets are adaptive analytics; these are the values returned, not an unsampled per-request audit.

| Hour UTC | Read queries | Write queries | Rows read | Rows written | Batch p99 ms |
|---|---:|---:|---:|---:|---:|
| 3 Nov 20 (from :30) | 1,126 | 117 | 2,872,472 | 353 | 1,010.31 |
| 21 | 1,396 | 239 | 4,920,071 | 718 | 648.38 |
| 22 | 2,052 | 547 | 5,005,217 | 1,671 | 221.26 |
| 23 | 6,435 | 2,604 | 3,893,158 | 8,197 | 4.46 |
| 4 Nov 00 | 9,146 | 4,136 | 4,260,147 | 12,977 | 4.32 |
| 01 | 13,812 | 6,823 | 7,674,073 | 21,166 | 4.44 |
| 02 | 5,785 | 2,502 | 4,243,449 | 7,876 | 5.44 |
| 03 | 1,837 | 454 | 4,199,321 | 1,409 | 166.45 |
| 04 | 4,046 | 1,547 | 4,518,239 | 4,861 | 20.58 |
| 05 | 8,311 | 3,777 | 5,621,856 | 11,835 | 3.62 |
| 06 | 4,070 | 1,549 | 4,245,317 | 4,898 | 7.40 |
| 07 | 2,411 | 748 | 4,205,193 | 2,318 | 119.31 |
| 08 (to :50) | 1,405 | 321 | 3,713,989 | 976 | 157.34 |
| Total | 61,832 | 25,364 | 59,372,502 | 79,255 | — |

The recheck listing SELECT: **12 executions, 175,963.4863ms summed SQL duration, 14,663.6239ms average, 19,618.82ms p95, 1,594,037 rows read, zero rows written**. This is ~45.8% of the 384,198.7085ms summed query duration returned by query analytics, despite few invocations. The contact INSERT: **11 analytics executions, 19.8704ms summed, 1.8064ms average, 3.19ms p95, 33 rows written**. Its actual table has 15 relevant recheck contacts; adaptive counts are not substituted for that SELECT count.

At **20:53** (last successful cycle) batch p95 was already **19,632.93ms**; at **21:09** it was **19,618.82ms**, with **3 read queries, 1 write query, 118,819 rows read, 3 rows written**. This is a query-cost threshold/resource-window problem, not a large arrival-rate spike. Why a near-limit poll succeeds once and a later one fails cannot be resolved exactly without the provider's detailed logs/accounting.

Observed original listing SQL:
```sql
SELECT q.entity_id,q.requested_at,q.reason,r.producer_record_id,r.market,r.environment,
    MAX(json_extract(r.normalized_json,'$.last_checked')) AS latest_accepted_source_check
    FROM recheck_requests q JOIN entity_records er ON er.entity_id=q.entity_id JOIN producer_records r ON r.id=er.record_id
    WHERE r.producer_name='independent-structured' AND r.environment='shadow' AND r.validation_status='accepted' AND (q.requested_at>? OR (q.requested_at=? AND (q.entity_id>? OR (q.entity_id=? AND r.producer_record_id>?))))
    GROUP BY q.entity_id,q.requested_at,q.reason,r.producer_record_id,r.market,r.environment
    ORDER BY q.requested_at,q.entity_id,r.producer_record_id LIMIT ?
```
Parameters for the first page: `['','','','','',101]`.

Live EXPLAIN: search r using `sqlite_autoindex_producer_records_2 (environment=? AND producer_name=?)`; search entity_records by record_id; search pending requests by entity_id; temporary B-trees for GROUP BY and ORDER BY. Thus unrelated historical receipt membership is traversed before output is paginated.

Read-only investigative comparison (not the final proposed SQL):
- Original: 101 rows, **144,789 rows read, 778.5766ms**, zero writes.
- Immediate alternative: **HTTP429, code7429, “D1 DB is overloaded. Too many resources consumed within a 10 second window”**. This followed an investigative SELECT; it is direct evidence of resource-window rejection, not a claim to have captured the Pi's original exception.
- Isolated CROSS JOIN alternative: same 101-row SHA-256 `720257d9a2a6badb87f37f06f181a3d04e635fb9ee9d63f039f344a3fbcf3926`, **72,465 rows read, 966.8386ms**, zero writes.
- An existing-index hint alone: same row hash, **146,450 rows read, 547.4388ms**, zero writes.
- These modest/warm timings do **not** establish a durable fix. Neither alternative is the proposed deployment. Further complex live benchmarking was stopped after automatic review rejected it as risking further saturation.

Investigator load is disclosed: the jobs GROUP BY itself scanned 509,164 rows and took 5,369.5634ms; the investigation did add read load. No repeated expensive experiment was made after the rejection.

## Workers, queues and jobs

All eight source Workers were checked through settings/schedules: same shadow D1 ID, observability logs enabled/persistent at sampling1. Crons: reconcile/eligibility/enrichment/readiness every minute; watch hourly; acquisition every15minutes; ingest/API none. Their schedules were last modified in October, not at incident onset.

| Worker role | Requests | Uncaught errors |
|---|---:|---:|
| ingest | 233 | 0 |
| reconcile | 744 | 4 |
| eligibility | 1,180 | 4 |
| enrichment | 1,173 | 4 |
| readiness | 1,384 | 4 |
| watch | 416 | 0 |
| acquisition | 50 | 0 |
| API | 346 | 0 (one clientDisconnected outcome) |

Each of the four minute-cron roles threw at **21:09, 23:55, 02:56 and 07:57**, matching failed-poll/contact minutes. Ingest's caught HTTP400 responses count as successful Worker invocations, so zero uncaught ingest exceptions does NOT mean successful delivery.

Jobs snapshot:
- complete: acquisition9, reconcile65,965, eligibility109,007, enrichment107,627, readiness113,201, watch108,652.
- ready: enrichment8, watch4,652. All observed ready enrichment jobs have attempts0 and future available_at.
- leased: **0**, so oldest lease **none**.
- dead: enrichment43, all from **26 October**, attempts5, error `cjs_reviewed_intake_scripts_required`. Not a new incident loop.
- No observed active job retry loop explains the failure.

Exact SELECTs:
```sql
SELECT stage,status,COUNT(*) AS n,MIN(updated_at) AS oldest_updated,
 MAX(updated_at) AS newest_updated,MIN(lease_until) AS oldest_lease,
 MAX(attempts) AS max_attempts_seen FROM jobs GROUP BY stage,status;

SELECT kind,MAX(received_at) AS last_contact,COUNT(*) AS recent_contacts
 FROM structured_delivery_contacts
 WHERE received_at>='2026-11-03T20:30:00Z' GROUP BY kind;

SELECT kind,received_at,records,accepted,inserted,duplicates,rejected
 FROM structured_delivery_contacts WHERE received_at>='2026-11-03T20:30:00Z'
 ORDER BY received_at LIMIT 40;

SELECT stage,status,attempts,last_error,available_at,lease_until,updated_at
 FROM jobs WHERE status IN ('leased','dead')
 OR (status='ready' AND stage='enrichment') ORDER BY stage,updated_at LIMIT 70;

SELECT name,sql FROM sqlite_master WHERE type='index'
 AND tbl_name IN ('producer_records','entity_records','recheck_requests');
```

Queue configuration reads: consumers max_retries3; max_concurrency1 except enrichment3; no delivery pause. Hourly backlog averages peak at eligibility2, enrichment5, readiness1, watch3 messages; last partial-hour averages1/0/0/1. These are **hourly averages, not instantaneous maxima or exact current backlogs**. Acquisition/reconcile/dead/publication have no backlog telemetry groups in the window: missing data is not proof of zero. Message operation telemetry shows activity/deletions without a persistent storm; exact individual redelivery counts cannot be established from these aggregates.

Detailed observability query `POST /accounts/<account>/workers/observability/telemetry/query`, `dry:true`, ingest service filter and 20:50–21:40 timeframe, returns **HTTP403 Forbidden**. Token/account subscription GET returns403/code10000. No credentials were rotated/expanded, and no tail session, queue pull/ack or configuration mutation was used to work around this. Historical exception texts, route-level response histories and exact message attempts remain unverified.

## Data and wider effects

- Normal /rechecks has a committed **contact side effect despite its failed response**. That is partial request completion, not a partial imported export.
- Per the Pi evidence, the poll fails before deliverExport: no import is attempted on those failed cycles. Already stored source data is still readable and lifecycle processing continues. No evidence here of D1 deleting or corrupting accepted receipts.
- **No-loss cannot be certified.** Intermediate producer exports/revisions that were never sent may not all be recoverable from the latest export. The current export/backlog should be delivered after recovery if retained; no Pi files were inspected or changed.
- Collateral effects include failures in all four minute-cron stages, delayed downstream processing during those windows, and stale producer evidence/rechecks. Do not extend evidence expiry or promote stale readiness.
- Repository customer config binds V3_READY_API to `findpitches-v3-api-shadow`; therefore the word “shadow” alone cannot prove zero downstream customer impact. Source API analytics show one disconnect; stale/missing catalogue updates are possible. Customer production, its DB, V1 and V2 were not accessed or modified; their live status/impact was not independently tested in this scope.

## Proposed minimal code fix

Candidate files:
- `platform/findpitches-v3/recheck-query.mjs`: MATERIALIZED metadata-only page, pending-request-first joins, then per-page clock aggregation using the **existing** `structured_customer_policy_lookup` expression index from migration0025.
- `platform/findpitches-v3/rechecks.mjs`: replace only the listing SQL; parameters, count, cursor, output shape and acknowledgement logic unchanged.
- `tests/findpitches-v3/recheck-query-plan.test.mjs`: **3/3 PASS** using real SQLite. Exact result equivalence including linked/unlinked history, wrong producer/environment/validation, multiple producers, markets and null clocks; identical cursor pages; SELECT makes no changes; plan uses existing clock index, with **zero JSON-extract VM operations**. Negative control forces the observed environment-first access path and detects its JSON parsing.

No schema migration or new index. No cron/consumer/lease change. No contact-write bypass or producer change: those are not this cause. Claude's error-body retention remains useful later; contact-write resilience remains a separate concern because these writes succeeded.

Candidate latency in deployed D1 is **unverified**. Final rewritten query was not executed remotely after the auto-review rejection. No full V3 suite claim: focused SQLite tests completed; the execution workspace became unavailable before further packaging/release checks.

### Guarded approval and execution sequence

1. **One isolated read-only canary** of the final rewritten SELECT, first-page parameters above, no automatic retry. If it returns7429/errors, more than101 rows, invalid provenance, or reported SQL duration above1000ms: stop; **do not deploy**. This is an observational duration gate, not a promise that aborting HTTP cancels remote work.
2. Only after that passes, prepare the source diff against the **currently active ingest version**, confirm the existing index and unchanged bindings/runtime/settings. At09:07 active version was **030b2e68-6e5e-4d3e-89ba-8c7d249b4cf6**, 100%, deployed2026-10-16T09:36:17Z. Abort if active version changed.
3. **Patch only its existing recheck SQL literal** to the tested query. The deployed ingest bundle was read successfully and matches the original query. Do **not** blindly rebuild today's shared worker source: that may include unrelated changes since16October. Verify a single intended SQL-site diff and configuration-preserving dry run before upload/activation. Existing release helper demonstrates preservation guards but its default rebuild of repository main is not the approved artifact. No wholesale helper deployment or new operational framework.
4. Activate only `findpitches-v3-ingest-shadow`; preserve secret bindings/values, D1/R2/queue bindings, runtime limits, observability and no-cron schedule. No other Worker, queue, customer or legacy change.
5. Validate one complete `/rechecks?probe=1` pagination, at most5pages, spaced at least10s: 200 responses, monotonic non-looping cursor, correct membership and existing provenance. Probes must not insert delivery contacts.
6. Leave Pi alone. Observe its next automatic hourly retry for at most75minutes: the normal poll succeeds, export delivery (if a new export exists) is acknowledged, an import contact/receipt is present where expected, and pipeline remains progressing. Duplicate-only receipts can be a legitimate success; source evidence/facts/identities must not be rewritten to make the test green.
7. If regression/new errors/probe failure or no transport success within75minutes, rollback the single ingest deployment to **030b2e68-6e5e-4d3e-89ba-8c7d249b4cf6**, recheck preserved config and stop. Retain all evidence. No database rollback, token rotation, manual Pi job or data deletion.

### Exact approval request

**Approve one isolated read-only canary of the tested recheck query and, only if it passes the gates above, a query-only patch of the active findpitches-v3-ingest-shadow Worker, preserving all configuration; verify read-only pagination and the Pi's next automatic delivery for up to75minutes, with rollback to030b2e68-6e5e-4d3e-89ba-8c7d249b4cf6 on failure. No cron/queue/lease/schema/token/customer/V1/V2/Pi changes.**

Automatic approval review rejected additional complex live read benchmarking because it could worsen saturation. That benchmark was not retried or bypassed. Explicit approval of the single bounded canary is needed before that currently blocked action; the offline fix/report and all unaffected investigation are complete. The execution workspace also became unavailable during final packaging, so execution must wait for an available authorised environment; no new credentials or alternate access are requested.
