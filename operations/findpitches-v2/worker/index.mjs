import { discoverBatch } from '../../../platform/findpitches-v2/acquisition/discover-batch.mjs';
import { persistDiscoveryBatch } from '../../../platform/findpitches-v2/acquisition/storage.mjs';
import { runClassificationBatch } from '../../../platform/findpitches-v2/classifier/run-batch.mjs';
import { createHttpFetchProvider } from '../../../platform/findpitches-v2/providers/fetch/http.mjs';
import { createRevalidator } from '../../../platform/findpitches-v2/revalidation/index.mjs';
import { createSerperSearchProvider } from '../../../platform/findpitches-v2/providers/search/serper.mjs';
import { ensureSchedulerCatalogue } from '../../../platform/findpitches-v2/scheduler/catalogue.mjs';
import { recordRunFailure } from '../../../platform/findpitches-v2/storage/d1.mjs';

const SERVICE = 'findpitches-v2-shadow';
const QUERY_LIMIT = 4;
const CLASSIFIER_CRON = '* * * * *';
const CLASSIFIER_BATCH_LIMIT = 12;
const CLASSIFIER_RULESET_VERSION = '2026-09-20-opportunity-intent-v2';
const RECLASSIFY_BATCH_LIMIT = 24;
const REVALIDATOR_BATCH_LIMIT = 6;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/health') {
      return health(env);
    }

    if (request.method === 'GET' && url.pathname === '/status') {
      return status(env);
    }

    if (request.method === 'GET' && url.pathname === '/sample') {
      return sample(env, url);
    }

    return Response.json({ ok: false, service: SERVICE, error: 'not_found' }, { status: 404 });
  },

  async scheduled(event, env, ctx) {
    if (event?.cron === CLASSIFIER_CRON) {
      ctx.waitUntil(
        runClassifierTick(env)
          .then(result => console.log('findpitches_v2_classifier_tick', JSON.stringify(result)))
          .catch(error => console.error('findpitches_v2_classifier_tick_failed', String(error?.stack || error)))
      );
      return;
    }

    ctx.waitUntil(
      runShadowTick(env, { trigger: 'cron' })
        .then(result => console.log('findpitches_v2_acquisition_tick', JSON.stringify(result)))
        .catch(error => console.error('findpitches_v2_acquisition_tick_failed', String(error?.stack || error)))
    );
  }
};

async function health(env) {
  try {
    const row = await env.FINDPITCHES_DB.prepare('SELECT 1 AS ok').first();
    return Response.json({
      ok: row?.ok === 1,
      service: SERVICE,
      mode: env.FINDPITCHES_V2_MODE || 'unknown',
      markets: String(env.FINDPITCHES_V2_MARKETS || '').split(',').filter(Boolean),
      database: 'isolated',
      search_configured: Boolean(String(env.FINDPITCHES_SEARCH_API_KEY || '').trim()),
      publication_enabled: false,
      legacy_runtime_dependency: false,
      local_runtime_dependency: false
    });
  } catch (error) {
    return Response.json({
      ok: false,
      service: SERVICE,
      error: String(error?.message || error)
    }, { status: 503 });
  }
}

async function status(env) {
  const now = new Date().toISOString();
  const [runs, candidates, jobs, publication, classification, latestRun, marketRows, catalogueMeta, candidateStates, schedulerStates, classifierStates] = await Promise.all([
    count(env, 'acquisition_runs'),
    count(env, 'candidates'),
    count(env, 'scheduler_jobs'),
    count(env, 'publication_queue'),
    count(env, 'classification_queue'),
    env.FINDPITCHES_DB.prepare(
      `SELECT run_id, market, region_code, status, query_count, search_results,
              unique_candidates, validated, duplicates, held, rejected,
              started_at, completed_at, error_code
         FROM acquisition_runs
        ORDER BY started_at DESC
        LIMIT 1`
    ).first(),
    env.FINDPITCHES_DB.prepare(
      `SELECT market,
              COUNT(*) AS jobs,
              SUM(CASE WHEN status = 'ready' THEN 1 ELSE 0 END) AS ready_jobs,
              MIN(CASE WHEN status = 'ready' THEN available_at ELSE NULL END) AS next_available
         FROM scheduler_jobs
        GROUP BY market
        ORDER BY market`
    ).all(),
    env.FINDPITCHES_DB.prepare(
      `SELECT value, updated_at
         FROM runtime_meta
        WHERE key = 'geography_catalog_version'`
    ).first(),
    env.FINDPITCHES_DB.prepare(
      `SELECT status, COUNT(*) AS count
         FROM candidates
        GROUP BY status
        ORDER BY status`
    ).all(),
    env.FINDPITCHES_DB.prepare(
      `SELECT
         SUM(CASE WHEN status = 'ready' THEN 1 ELSE 0 END) AS ready,
         SUM(CASE WHEN status = 'leased' THEN 1 ELSE 0 END) AS leased,
         SUM(CASE WHEN status = 'leased' AND lease_until IS NOT NULL AND lease_until <= ? THEN 1 ELSE 0 END) AS expired
       FROM scheduler_jobs`
    ).bind(now).first(),
    env.FINDPITCHES_DB.prepare(
      `SELECT
         SUM(CASE WHEN status = 'ready' THEN 1 ELSE 0 END) AS ready,
         SUM(CASE WHEN status = 'leased' THEN 1 ELSE 0 END) AS leased,
         SUM(CASE WHEN status = 'complete' THEN 1 ELSE 0 END) AS complete,
         SUM(CASE WHEN status = 'leased' AND lease_until IS NOT NULL AND lease_until <= ? THEN 1 ELSE 0 END) AS expired
       FROM classification_queue`
    ).bind(now).first()
  ]);

  return Response.json({
    ok: true,
    service: SERVICE,
    mode: env.FINDPITCHES_V2_MODE || 'unknown',
    search_configured: Boolean(String(env.FINDPITCHES_SEARCH_API_KEY || '').trim()),
    publication_enabled: false,
    catalogue: catalogueMeta || null,
    counts: { runs, candidates, scheduler_jobs: jobs, publication_queue: publication, classification_queue: classification },
    scheduler: {
      ready: Number(schedulerStates?.ready || 0),
      leased: Number(schedulerStates?.leased || 0),
      expired: Number(schedulerStates?.expired || 0)
    },
    classifier: {
      ready: Number(classifierStates?.ready || 0),
      leased: Number(classifierStates?.leased || 0),
      complete: Number(classifierStates?.complete || 0),
      expired: Number(classifierStates?.expired || 0)
    },
    candidate_statuses: Array.isArray(candidateStates?.results) ? candidateStates.results : [],
    revalidation: {
      archive_candidates: Number((await env.FINDPITCHES_DB.prepare("SELECT COUNT(*) AS count FROM candidates WHERE status = 'held' AND rejection_reason IN ('revalidation:event_cancelled', 'revalidation:applications_closed')").first())?.count || 0),
      stale_validated_24h: Number((await env.FINDPITCHES_DB.prepare("SELECT COUNT(*) AS count FROM candidates WHERE status = 'validated' AND last_checked <= ?").bind(new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()).first())?.count || 0)
    },
    markets: Array.isArray(marketRows?.results) ? marketRows.results : [],
    latest_run: latestRun || null
  });
}

async function sample(env, url) {
  const allowedStatuses = new Set(['validated', 'held']);
  const requestedStatus = url.searchParams.get('status') || 'validated';
  const statusValue = allowedStatuses.has(requestedStatus) ? requestedStatus : 'validated';
  const requestedMarket = String(url.searchParams.get('market') || '').toUpperCase();
  const market = ['GB', 'US', 'CA'].includes(requestedMarket) ? requestedMarket : null;
  const requestedLimit = Number(url.searchParams.get('limit') || 12);
  const limit = Math.max(1, Math.min(Number.isFinite(requestedLimit) ? requestedLimit : 12, 25));

  const sql = `
    SELECT id, market, region_code, event_name, organiser, canonical_url,
           application_url, score, status, rejection_reason, first_seen, last_checked
      FROM candidates
     WHERE status = ?
       ${market ? 'AND market = ?' : ''}
     ORDER BY score DESC, last_checked DESC
     LIMIT ?
  `;
  const statement = env.FINDPITCHES_DB.prepare(sql);
  const rows = market
    ? await statement.bind(statusValue, market, limit).all()
    : await statement.bind(statusValue, limit).all();

  return Response.json({
    ok: true,
    service: SERVICE,
    mode: env.FINDPITCHES_V2_MODE || 'unknown',
    status: statusValue,
    market,
    limit,
    publication_enabled: false,
    candidates: Array.isArray(rows?.results) ? rows.results : []
  });
}

async function count(env, table) {
  const allowed = new Set(['acquisition_runs', 'candidates', 'scheduler_jobs', 'publication_queue', 'classification_queue']);
  if (!allowed.has(table)) throw new Error('findpitches_v2_status_table_rejected');
  const row = await env.FINDPITCHES_DB.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first();
  return Number(row?.count || 0);
}

export async function runShadowTick(env, { trigger = 'unknown', now = new Date() } = {}) {
  const timestamp = now.toISOString();
  const catalogue = await ensureSchedulerCatalogue(env.FINDPITCHES_DB, { now });
  const recoveredExpiredLeases = await recoverExpiredSchedulerLeases(env.FINDPITCHES_DB, { now });
  const searchKey = String(env.FINDPITCHES_SEARCH_API_KEY || '').trim();

  if (!searchKey) {
    return {
      ok: true,
      service: SERVICE,
      trigger,
      phase: 'waiting_search_secret',
      catalogue,
      recovered_expired_leases: recoveredExpiredLeases,
      publication_attempted: false,
      at: timestamp
    };
  }

  const job = await env.FINDPITCHES_DB.prepare(
    `SELECT id, market, region_code, location, query_group, attempts
       FROM scheduler_jobs
      WHERE status = 'ready' AND available_at <= ?
      ORDER BY available_at ASC, id ASC
      LIMIT 1`
  ).bind(timestamp).first();

  if (!job) {
    return { ok: true, service: SERVICE, trigger, phase: 'idle', catalogue, recovered_expired_leases: recoveredExpiredLeases, at: timestamp };
  }

  const leaseUntil = new Date(now.getTime() + 4 * 60 * 1000).toISOString();
  const claim = await env.FINDPITCHES_DB.prepare(
    `UPDATE scheduler_jobs
        SET status = 'leased', lease_until = ?, attempts = attempts + 1, updated_at = ?
      WHERE id = ? AND status = 'ready'`
  ).bind(leaseUntil, timestamp, job.id).run();

  if (Number(claim?.meta?.changes || 0) !== 1) {
    return { ok: true, service: SERVICE, trigger, phase: 'claim_raced', job_id: job.id, catalogue, at: timestamp };
  }

  const runId = crypto.randomUUID();

  try {
    const searchProvider = createSerperSearchProvider({ apiKey: searchKey, resultsPerQuery: 8 });

    const result = await discoverBatch({
      market: job.market,
      region_code: job.region_code,
      location: job.location,
      query_limit: QUERY_LIMIT
    }, {
      searchProvider
    });

    const persisted = await persistDiscoveryBatch(
      env.FINDPITCHES_DB,
      { ...job, run_id: runId },
      result
    );

    await requeueJob(env.FINDPITCHES_DB, job.id, now, 15, null);

    return {
      ok: true,
      service: SERVICE,
      trigger,
      phase: 'shadow_discovery_complete',
      run_id: persisted.run_id,
      market: result.market,
      region_code: result.region,
      metrics: result.metrics,
      stored_candidates: persisted.stored_candidates,
      classification_enqueued: persisted.classification_enqueued,
      publication_queued: 0,
      publication_attempted: false,
      catalogue,
      at: timestamp
    };
  } catch (error) {
    await recordRunFailure(env.FINDPITCHES_DB, {
      runId,
      market: job.market,
      regionCode: job.region_code,
      error,
      startedAt: timestamp,
      completedAt: new Date().toISOString()
    });

    await requeueJob(env.FINDPITCHES_DB, job.id, now, 30, String(error?.message || error));

    return {
      ok: false,
      service: SERVICE,
      trigger,
      phase: 'shadow_acquisition_failed',
      run_id: runId,
      market: job.market,
      region_code: job.region_code,
      error: String(error?.message || error),
      publication_attempted: false,
      catalogue,
      at: timestamp
    };
  }
}

export async function recoverExpiredSchedulerLeases(db, { now = new Date() } = {}) {
  const timestamp = now.toISOString();
  const result = await db.prepare(
    `UPDATE scheduler_jobs
        SET status = 'ready',
            lease_until = NULL,
            available_at = ?,
            last_error = 'expired_lease_recovered',
            updated_at = ?
      WHERE status = 'leased'
        AND lease_until IS NOT NULL
        AND lease_until <= ?`
  ).bind(timestamp, timestamp, timestamp).run();
  return Number(result?.meta?.changes || 0);
}

export async function runClassifierTick(env, { now = new Date() } = {}) {
  const revalidation = await runRevalidationBatch(env.FINDPITCHES_DB, { fetchProvider: createHttpFetchProvider(), now });
  const reclassification = await enqueueStaleClassifications(env.FINDPITCHES_DB, { now });
  const result = await runClassificationBatch(env.FINDPITCHES_DB, {
    fetchProvider: createHttpFetchProvider(),
    limit: CLASSIFIER_BATCH_LIMIT,
    now
  });

  return Object.freeze({
    ok: true,
    service: SERVICE,
    engine: 'findpitches-v2-classifier',
    publication_attempted: false,
    revalidation,
    reclassification,
    ...result,
    at: now.toISOString()
  });
}


export async function runRevalidationBatch(db, { fetchProvider, now = new Date(), limit = REVALIDATOR_BATCH_LIMIT } = {}) {
  const timestamp = now.toISOString();
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const rows = await db.prepare(
    "SELECT id, market, source_url, canonical_url FROM candidates WHERE status = 'validated' AND last_checked <= ? ORDER BY last_checked ASC, id ASC LIMIT ?"
  ).bind(cutoff, Math.max(1, Math.min(Number(limit) || REVALIDATOR_BATCH_LIMIT, 25))).all();
  const candidates = Array.isArray(rows?.results) ? rows.results : [];
  const revalidator = createRevalidator({ fetchProvider, now: () => now });
  const outcomes = { checked: 0, current: 0, archive_candidates: 0, retry: 0 };

  for (const candidate of candidates) {
    const result = await revalidator.revalidate(candidate);
    outcomes.checked += 1;
    if (result.status === 'archive_candidate') {
      outcomes.archive_candidates += 1;
      await db.prepare("UPDATE candidates SET status = 'held', rejection_reason = ?, last_checked = ? WHERE id = ? AND status = 'validated'")
        .bind('revalidation:' + result.reason, timestamp, candidate.id).run();
    } else if (result.status === 'recheck_required') {
      outcomes.retry += 1;
      await db.prepare("UPDATE candidates SET retry_count = retry_count + 1, last_checked = ? WHERE id = ?").bind(timestamp, candidate.id).run();
    } else {
      outcomes.current += 1;
      await db.prepare("UPDATE candidates SET last_checked = ?, retry_count = 0 WHERE id = ?").bind(timestamp, candidate.id).run();
    }
  }

  return Object.freeze(outcomes);
}

async function requeueJob(db, jobId, now, delayMinutes, lastError) {
  const availableAt = new Date(now.getTime() + delayMinutes * 60 * 1000).toISOString();
  await db.prepare(
    `UPDATE scheduler_jobs
        SET status = 'ready',
            available_at = ?,
            lease_until = NULL,
            last_error = ?,
            updated_at = ?
      WHERE id = ?`
  ).bind(availableAt, lastError, new Date().toISOString(), jobId).run();
}


export async function enqueueStaleClassifications(db, { now = new Date(), limit = RECLASSIFY_BATCH_LIMIT } = {}) {
  const timestamp = now.toISOString();
  const metaKey = 'classifier_ruleset_version';
  const sweepKey = 'classifier_ruleset_sweep_started_at';
  const current = await db.prepare('SELECT value FROM runtime_meta WHERE key = ?').bind(metaKey).first();
  if (current?.value === CLASSIFIER_RULESET_VERSION) return Object.freeze({ ruleset: CLASSIFIER_RULESET_VERSION, enqueued: 0, complete: true });

  let sweep = await db.prepare('SELECT value FROM runtime_meta WHERE key = ?').bind(sweepKey).first();
  if (!sweep?.value) {
    await db.prepare("INSERT INTO runtime_meta (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(sweepKey, timestamp, timestamp).run();
    sweep = { value: timestamp };
  }

  const rows = await db.prepare("SELECT c.id FROM candidates c LEFT JOIN classification_queue q ON q.candidate_id = c.id WHERE c.status IN ('validated', 'held') AND c.last_checked < ? AND (q.candidate_id IS NULL OR q.status = 'complete') ORDER BY c.last_checked ASC, c.id ASC LIMIT ?").bind(sweep.value, Math.max(1, Math.min(Number(limit) || RECLASSIFY_BATCH_LIMIT, 50))).all();
  const candidates = Array.isArray(rows?.results) ? rows.results : [];

  for (const row of candidates) {
    await db.prepare("INSERT INTO classification_queue (candidate_id, status, attempts, available_at, lease_until, last_error, created_at, updated_at) VALUES (?, 'ready', 0, ?, NULL, NULL, ?, ?) ON CONFLICT(candidate_id) DO UPDATE SET status = 'ready', attempts = 0, available_at = excluded.available_at, lease_until = NULL, last_error = NULL, updated_at = excluded.updated_at").bind(row.id, timestamp, timestamp, timestamp).run();
  }

  if (candidates.length === 0) {
    await db.prepare("INSERT INTO runtime_meta (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(metaKey, CLASSIFIER_RULESET_VERSION, timestamp).run();
  }

  return Object.freeze({ ruleset: CLASSIFIER_RULESET_VERSION, sweep_started_at: sweep.value, enqueued: candidates.length, complete: candidates.length === 0 });
}
