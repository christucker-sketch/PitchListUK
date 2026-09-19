export async function persistBatchResult(db, job, result) {
  if (!db?.prepare) throw new Error('findpitches_v2_storage_db_missing');

  const runId = String(job.run_id || crypto.randomUUID());
  const startedAt = String(result.started_at || new Date().toISOString());
  const completedAt = String(result.completed_at || new Date().toISOString());

  await db.prepare(
    `INSERT INTO acquisition_runs (
      run_id, market, region_code, status, query_count, search_results,
      unique_candidates, validated, duplicates, held, rejected, queued,
      published, started_at, completed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`
  ).bind(
    runId,
    result.market,
    result.region,
    'complete',
    Number(result.metrics?.queries || 0),
    Number(result.metrics?.search_results || 0),
    Number(result.metrics?.unique_urls || 0),
    Number(result.metrics?.validated || 0),
    Number(result.metrics?.duplicates || 0),
    Number(result.metrics?.held || 0),
    Number(result.metrics?.rejected || 0),
    startedAt,
    completedAt
  ).run();

  let storedCandidates = 0;
  for (const candidate of result.candidates || []) {
    if (!candidate?.candidate_id || !candidate?.canonical_url) continue;

    await db.prepare(
      `INSERT INTO candidates (
        id, market, region_code, source_url, canonical_url, application_url,
        event_name, organiser, geography_json, evidence_json, score, status,
        rejection_reason, first_seen, last_checked, retry_count, run_id,
        opportunity_fingerprint
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
      ON CONFLICT(market, canonical_url) DO UPDATE SET
        application_url = excluded.application_url,
        event_name = excluded.event_name,
        organiser = excluded.organiser,
        geography_json = excluded.geography_json,
        evidence_json = excluded.evidence_json,
        score = excluded.score,
        status = excluded.status,
        rejection_reason = excluded.rejection_reason,
        last_checked = excluded.last_checked,
        run_id = excluded.run_id`
    ).bind(
      candidate.candidate_id,
      candidate.market,
      result.region,
      candidate.source_url,
      candidate.canonical_url,
      candidate.application_url,
      candidate.event_name,
      candidate.organiser,
      JSON.stringify(candidate.geography || {}),
      JSON.stringify(candidate.evidence || []),
      Number(candidate.score || 0),
      candidate.status,
      candidate.rejection_reason,
      startedAt,
      completedAt,
      runId,
      await opportunityFingerprint(candidate)
    ).run();

    storedCandidates += 1;
  }

  for (const query of result.queries || []) {
    const queryResultCount = (result.results || []).filter(item => item.query === query.query).length;
    await db.prepare(
      `INSERT INTO query_performance (
        market, region_code, template_id, query_text, runs, results,
        candidates, validated, published, failures, last_run_at, last_success_at
      ) VALUES (?, ?, ?, ?, 1, ?, 0, 0, 0, 0, ?, ?)
      ON CONFLICT(market, region_code, template_id, query_text) DO UPDATE SET
        runs = runs + 1,
        results = results + excluded.results,
        last_run_at = excluded.last_run_at,
        last_success_at = CASE WHEN excluded.results > 0 THEN excluded.last_run_at ELSE last_success_at END`
    ).bind(
      result.market,
      result.region,
      query.template_id,
      query.query,
      queryResultCount,
      completedAt,
      queryResultCount > 0 ? completedAt : null
    ).run();
  }

  return Object.freeze({
    run_id: runId,
    stored_candidates: storedCandidates,
    publishable_candidates: Number(result.metrics?.publishable || 0),
    publication_queued: 0
  });
}

export async function recordRunFailure(db, {
  runId = crypto.randomUUID(),
  market,
  regionCode,
  error,
  startedAt = new Date().toISOString(),
  completedAt = new Date().toISOString()
} = {}) {
  await db.prepare(
    `INSERT INTO acquisition_runs (
      run_id, market, region_code, status, error_code, started_at, completed_at
    ) VALUES (?, ?, ?, 'failed', ?, ?, ?)`
  ).bind(
    runId,
    market,
    regionCode,
    String(error?.message || error || 'unknown').slice(0, 500),
    startedAt,
    completedAt
  ).run();

  return runId;
}

async function opportunityFingerprint(candidate) {
  const material = [
    candidate.market,
    candidate.organiser || '',
    candidate.event_name || '',
    candidate.geography?.locality || '',
    candidate.geography?.region_code || '',
    candidate.event_start || ''
  ].join('|').toLowerCase();

  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(material));
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('').slice(0, 32);
}
