const SERVICE = 'findpitches-v2-shadow';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/health') {
      return health(env);
    }

    if (request.method === 'GET' && url.pathname === '/status') {
      return status(env);
    }

    if (request.method === 'POST' && url.pathname === '/shadow/tick') {
      const result = await runShadowTick(env, { trigger: 'http' });
      return Response.json(result, { status: result.ok ? 200 : 500 });
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
  const [runs, candidates, jobs, publication] = await Promise.all([
    count(env, 'acquisition_runs'),
    count(env, 'candidates'),
    count(env, 'scheduler_jobs'),
    count(env, 'publication_queue')
  ]);

  return Response.json({
    ok: true,
    service: SERVICE,
    mode: env.FINDPITCHES_V2_MODE || 'unknown',
    counts: { runs, candidates, scheduler_jobs: jobs, publication_queue: publication }
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
  const job = await env.FINDPITCHES_DB.prepare(
    `SELECT id, market, region_code, location, query_group, attempts
       FROM scheduler_jobs
      WHERE status = 'ready' AND available_at <= ?
      ORDER BY priority DESC, available_at ASC, id ASC
      LIMIT 1`
  ).bind(timestamp).first();

  if (!job) {
    return { ok: true, service: SERVICE, trigger, phase: 'idle', at: timestamp };
  }

  const leaseUntil = new Date(now.getTime() + 4 * 60 * 1000).toISOString();
  const claim = await env.FINDPITCHES_DB.prepare(
    `UPDATE scheduler_jobs
        SET status = 'leased', lease_until = ?, attempts = attempts + 1, updated_at = ?
      WHERE id = ? AND status = 'ready'`
  ).bind(leaseUntil, timestamp, job.id).run();

  if (Number(claim?.meta?.changes || 0) !== 1) {
    return { ok: true, service: SERVICE, trigger, phase: 'claim_raced', job_id: job.id, at: timestamp };
  }

  const runId = crypto.randomUUID();
  await env.FINDPITCHES_DB.prepare(
    `INSERT INTO acquisition_runs (
       run_id, market, region_code, status, started_at, completed_at
     ) VALUES (?, ?, ?, 'shadow_scheduler_probe', ?, ?)`
  ).bind(runId, job.market, job.region_code, timestamp, timestamp).run();

  const nextAvailable = new Date(now.getTime() + 15 * 60 * 1000).toISOString();
  await env.FINDPITCHES_DB.prepare(
    `UPDATE scheduler_jobs
        SET status = 'ready', available_at = ?, lease_until = NULL, updated_at = ?
      WHERE id = ?`
  ).bind(nextAvailable, timestamp, job.id).run();

  return {
    ok: true,
    service: SERVICE,
    trigger,
    phase: 'shadow_scheduler_probe',
    run_id: runId,
    market: job.market,
    region_code: job.region_code,
    location: job.location,
    query_group: Number(job.query_group || 0),
    publication_attempted: false,
    at: timestamp
  };
}
