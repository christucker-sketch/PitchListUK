# V3 permanent recheck fix: narrow covering index and two indexed lookups

4 November 2026. Prepared offline against branch head c03e93e0f698363566bb895cd364fa9ea3391118. **NOT deployed, NOT migrated and NOT live-benchmarked.** The previous canary remains failed and consumed; its approval is not reused.

## Published Claude status versus host state

Claude's Pi patch and handover ARE on GitHub in c03e93e0. That commit contains producer code/tests and team/HANDOVERS.md, but **does not include team/agents/CLAUDE.md**. That file still starts with 30 October status. This demonstrates a stale/unpublished status update, not a general failure of repository access; it does not reveal whether Claude has another local commit waiting to push.

Chris now reports the Pi patch is installed. Record that as owner-reported host state; it is not independently verified by Codex. The published handover's “awaiting install” is consequently out of date relative to the owner's report. Claude should refresh his own status and publish the installed hashes, current delivery/recheck state and retry_after through the hub. No credential changes, new remote or owner message relay is needed. Codex does not impersonate Claude by editing his authored status.

The Pi patch permits exports despite a failed recheck poll and backs off failing polls up to six hours. It cannot repair the cloud query. It also means the old “hourly retry /75minute observation” assumption must not be used for the next rollout.

## What the failed candidate taught us

The prior candidate avoided per-read JSON parsing, but still dereferenced wide producer_records rows while constructing metadata groups, and its separate pending-count query was not protected against the same producer-first plan. It took4115.4209ms and read91,326rows. Returning correct data was insufficient.

The new offline negative control verifies both facts: the historical failed candidate has zero JSON-extract VM operations **yet still reads columns from the producer_records table b-tree**. The replacement must eliminate those wide-table reads, rather than repeat a warm-cache benchmark or relax the gate.

## Concrete replacement

One new partial expression index, in migration0028:

```sql
CREATE INDEX IF NOT EXISTS structured_recheck_lookup ON producer_records(
  id,producer_record_id,market,json_extract(normalized_json,'$.last_checked')
) WHERE producer_name='independent-structured'
    AND environment='shadow' AND validation_status='accepted';
```

Two SQL literals within producerRechecks change:
1. Listing starts from pending requests, uses the existing entity_records_entity lookup and explicitly uses structured_recheck_lookup for the linked receipt ID. Identity, market and the MAX source clock are index columns. Environment is the literal shadow, equivalent to the mandatory predicate. Grouping, membership, null/market/producer distinctions, MAX and the three-field cursor remain equivalent.
2. Pending-entity count uses EXISTS with entity-first membership and the same new covering index. It does not count producer rows as entities or expand all history before checking membership.

No source field, evidence, acknowledgement condition, identity or clock is rewritten. The index is automatically maintained by SQLite for future accepted source receipts; there is no scheduled cache rebuild or manually refreshed snapshot. Receipt history still affects index work, but it no longer requires loading wide JSON rows on each poll. No claim that this solves every D1 workload or guarantees a production latency before the next approved test.

The existing customer-policy expression index remains untouched. This does require **one new D1 schema/index write**, which was explicitly excluded by the previous approval; it therefore needs a new specific approval.

## Offline evidence

**17 focused checks PASS**:
-7 real SQLite query/entrypoint tests: exact result equivalence; linked/unlinked and rejected/other-producer/test-environment histories; markets and null clocks; keyset pages; zero data mutation; actual producerRechecks output/count/cursor behaviour; growing linked histories; migration replay; missing index fails closed.
-4 bundle-patch tests: strict single-module parsing, exact two-site replacement, unchanged remaining bytes, hash drift/missing/ambiguous sites refused.
-4 release-guard tests: reviewed bytes frozen before tool use, no symlink, hash/active-version/role drift refused, wrong/missing index definition refused.
-2 existing source-release tests: native bindings/runtime retained, unhandled/customer/acquisition/wrong-DB/paid-enabled contexts refused.

The SQLite VM evidence checks that both the JSON parsing and producer table-column dereferences are absent from the listing. The actual count query's plan also uses the narrow index. These are physical-plan regressions, not a local wall-time threshold that could pass only on a warm machine. These focused checks do not claim the full V3 suite ran.

Wrangler4.127.1 completed a **local dry run only**. It emitted exactly one module, no extra modules, byte-for-byte equal to the reviewed candidate. An earlier dry run revealed Wrangler's unbundled mode scans additional text/SQL files by default; find_additional_modules is now explicitly false. No upload occurred during any dry run. The initial default log-path failure was resolved by local workspace-only XDG/log directories; no login/configuration on a host was changed.

## Exact artifact and deployment boundary

The active ingest module captured during the incident:
-Worker: findpitches-v3-ingest-shadow
-Version:030b2e68-6e5e-4d3e-89ba-8c7d249b4cf6
-Before module SHA256:4788e5ffe4cbc0db5fe03c6f43db67180c8643064b429eebdf0fcbbb34f52869
-Reviewed candidate module SHA256:**4ccd768128fd7e4613a17165e87da386efd449434835e55ebe9101d3d8bf160a**
-Exactly **two SQL literals** changed; all remaining source bytes are identical.
-Migration0028 SHA256:57850d0b399650d9a14a89b2def7af85d01d1caaebf13cbfc8e67315470bef7c

The raw captured source and compiled artifact remain private workspace artifacts; the small patch generator, hashes and manifest are committed. Do not rebuild all source code from the current repository. prepare-recheck-query-patch.mjs reconstructs this exact two-site patch from a hash-checked capture of the active module.

release-source-worker.mjs now has an optional, tested incident path:
```js
await releaseSourceWorker({
  credentialsFile: existingCredentialsFile,
  stateDirectory: existingV3StateDirectory,
  outputDirectory: newPrivateReleaseDirectory,
  role: 'ingest',
  sourceFile: reviewedCandidateFile,
  expectedSourceSha256: '4ccd768128fd7e4613a17165e87da386efd449434835e55ebe9101d3d8bf160a',
  expectedActiveVersion: '030b2e68-6e5e-4d3e-89ba-8c7d249b4cf6'
});
```

It freezes a bounded regular source file, rejects symlinks/hash drift/version drift/wrong role, requires the exact0028 index definition, disables rebundling and additional-module discovery, then uses the existing native configuration/binding/runtime equality and activation rollback guards. Its existing default release path is unchanged. No source-release function was called remotely during this preparation.

## Proposed one-attempt rollout, requiring approval

**Scope:** only shadow DB75ccfd1a-f136-4598-8cfb-9a4489d174b9 and findpitches-v3-ingest-shadow. No Pi changes, no customer/V1/V2, no cron/queue/lease changes, no token rotation, no history deletion/archive/VACUUM, no new service or plan.

1. Refresh database identity/size, active ingest version/module hash and the relevant index definitions through the existing authorised identity. Abort on version/hash/definition drift. If the new index already exists unexpectedly, stop and investigate ownership rather than overwrite/drop it. Require reported source DB size≤9,000,000,000bytes (at least1GB below the repository's conservative10GB cap) before building; do not run bulk migrations.
2. Record a durable one-attempt intent, then execute **only** migration0028's CREATE INDEX statement. This is the newly requested write. It scans producer_records and can temporarily contend with other D1 writes; the index's production build time and size are not yet measured. There is no honest zero-impact guarantee. If rejected/timed out/outcome unknown, do not retry: inspect schema state once, record the outcome and stop without deploying.
3. After a successful build, verify its exact definition and database size. Allow at least30seconds for the short resource window to clear. No automatic queue retries, extra indexing or maintenance operations.
4. One validation attempt comprising **exactly two SELECTs**: the new101-row first page and pending-entity count, no retries. Their **combined reported SQL duration must be≤1000ms**, with correct shape/scope/order/count relationship and zero writes. Record row hashes. The old09:25 hash is not an oracle if the Pi mitigation has since delivered new source evidence; never suppress valid changed clocks or rerun the old expensive query just to match it. If correctness cannot be verified or the gate fails, stop and do not deploy.
5. Only if those gates pass, refresh the active-version guard and activate the exact reviewed two-SQL-site module on ingest, preserving all runtime/settings/bindings/secrets. Recheck equality after activation. No other Worker release.
6. Use the existing authorised ingest client for one complete probe pagination, at most5pages, at least10seconds apart. HTTP200, monotonic cursors, no repeats and no contact insert from probe requests. No new token or credential transfer is needed: the existing operator client already uses the installed worker-secrets file.
7. Observe the next **scheduled** producer poll/delivery. Claude's existing backoff state determines its due time; allow that due time plus15minutes, capped at6h15m from activation. Do not force a Pi job or change its timer/state. Publish cloud verification separately from end-to-end Pi verification if the next poll is still in backoff; do not claim full recovery just because exports bypass the failed poll.

Rollback:
-Restore ingest to030b2e68-6e5e-4d3e-89ba-8c7d249b4cf6 on activation/probe regression.
-Only after the old Worker is confirmed active, remove **only the index created by this approved attempt**, if necessary to restore the schema, with `DROP INDEX structured_recheck_lookup`. If the canary fails before deployment, the same owned-index removal can restore the pre-attempt schema. Never drop an index whose creation/outcome/ownership is uncertain.
-Dropping an index frees SQLite pages for reuse; it does not guarantee physical file shrinkage. No VACUUM or receipt deletion.
-No automatic repeat of a failed build, canary, deployment or probe. Preserve the outcome, application receipts and source work. Do not infer that missing a Pi poll before its backoff deadline means the cloud patch failed.

Index work uses the existing Cloudflare account's normal D1 resources. No new database, paid AI call, resource subscription or plan upgrade is proposed.

## Approval request

**Approve one covering-index build (0028) on findpitches-v3-shadow, one two-SELECT validation attempt, and—only if it passes—the exact two-query ingest-only patch above, preserving configuration, with the bounded probe/Pi verification and Worker/owned-index rollback described here?**

This is new schema scope, not a repeated request for the previous failed canary. No remote canary, DDL or deployment has been performed for this revision.
