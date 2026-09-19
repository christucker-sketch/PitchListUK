import { acquireBatch } from '../../../platform/findpitches-v2/engine/acquire-batch.mjs';
import { createDefaultCandidateEvaluator } from '../../../platform/findpitches-v2/engine/evaluator.mjs';
import { createHttpFetchProvider } from '../../../platform/findpitches-v2/providers/fetch/http.mjs';
import { createSerperSearchProvider } from '../../../platform/findpitches-v2/providers/search/serper.mjs';
import { ensureSchedulerCatalogue } from '../../../platform/findpitches-v2/scheduler/catalogue.mjs';
import { persistBatchResult, recordRunFailure } from '../../../platform/findpitches-v2/storage/d1.mjs';

const SERVICE = 'findpitches-v2-shadow';
const QUERY_LIMIT = 4;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/health') {
      return health(env);
    }

    if (request.method === 'GET' && url.pathname === '/status') {
      return status(env);
    }

    return Response.json({ ok: false, service: SERVICE, error: 'not_found' }, { status: 404 });
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(
      runShadowTick(env, { trigger: 'cron' })
        .then(result => console.log('findpitches_v2_shadow_tick', JSON.stringify(result)))
        .catch(error => console.error('findpitches_v2_shadow_tick_failed', String(error?.stack || error)))
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
  const [runs, candidates, jobs, publication, latestRun, marketRows, catalogueMeta] = await Promise.all([
    count(env, 'acquisition_runs'),
    count(env, 'candidates'),
    count(env, 'scheduler_jobs'),
    count(env, 'publication_queue'),
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
    ).first()
  ]);

  return Response.json({
    ok: true,
    service: SERVICE,
    mode: env.FINDPITCHES_V2_MODE || 'unknown',
    search_configured: Boolean(String(env.FINDPITCHES_SEARCH_API_KEY || '').trim()),
    publication_enabled: false,
    catalogue: catalogueMeta || null,
    counts: { runs, candidates, scheduler_jobs: jobs, publication_queue: publication },
    markets: Array.isArray(marketRows?.results) ? marketRows.results : [],
    latest_run: latestRun || null
  });
}

async function count(env, table) {
  const allowed = new Set(['acquisition_runs', 'candidates', 'scheduler_jobs', 'publication_queue']);
  if (!allowed.has(table)) throw new Error('findpitches_v2_status_table_rejected');
  const row = await env.FINDPITCHES_DB.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first();
  return Number(row?.count || 0);
}

export async function runShadowTick(env, { trigger = 'unknown', now = new Date() } = {}) {
  const timestamp = now.toISOString();
  const catalogue = await ensureSchedulerCatalogue(env.FINDPITCHES_DB, { now });
  const searchKey = String(env.FINDPITCHES_SEARCH_API_KEY || '').trim();

  if (!searchKey) {
    return {
      ok: true,
      service: SERVICE,
      trigger,
      phase: 'waiting_search_secret',
      catalogue,
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
    return { ok: true, service: SERVICE, trigger, phase: 'idle', catalogue, at: timestamp };
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
    const fetchProvider = createHttpFetchProvider();
    const searchProvider = createSerperSearchProvider({ apiKey: searchKey, resultsPerQuery: 8 });
    const evaluateCandidate = createDefaultCandidateEvaluator({ fetchProvider });

    const result = await acquireBatch({
      market: job.market,
      region_code: job.region_code,
      location: job.location,
      query_limit: QUERY_LIMIT
    }, {
      searchProvider,
      evaluateCandidate
    });

    const persisted = await persistBatchResult(
      env.FINDPITCHES_DB,
      { ...job, run_id: runId },
      result
    );

    await requeueJob(env.FINDPITCHES_DB, job.id, now, 15, null);

    return {
      ok: true,
      service: SERVICE,
      trigger,
      phase: 'shadow_acquisition_complete',
      run_id: persisted.run_id,
      market: result.market,
      region_code: result.region,
      metrics: result.metrics,
      stored_candidates: persisted.stored_candidates,
      publishable_candidates: persisted.publishable_candidates,
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
