export async function persistDiscoveryBatch(db, job, result) {
  if (!db?.prepare) throw new Error('findpitches_v2_discovery_db_missing');

  const runId = String(job.run_id || crypto.randomUUID());
  const startedAt = String(result.started_at || new Date().toISOString());
  const completedAt = String(result.completed_at || new Date().toISOString());

  await db.prepare(
    `INSERT INTO acquisition_runs (
      run_id, market, region_code, status, query_count, search_results,
      unique_candidates, validated, duplicates, held, rejected, queued,
      published, started_at, completed_at
    ) VALUES (?, ?, ?, 'complete', ?, ?, ?, 0, 0, 0, 0, 0, 0, ?, ?)`
  ).bind(
    runId,
    result.market,
    result.region,
    Number(result.metrics?.queries || 0),
    Number(result.metrics?.search_results || 0),
    Number(result.metrics?.unique_urls || 0),
    startedAt,
    completedAt
  ).run();

  let stored = 0;
  let enqueued = 0;

  for (const candidate of result.candidates || []) {
    const inserted = await db.prepare(
      `INSERT OR IGNORE INTO candidates (
        id, market, region_code, source_url, canonical_url, application_url,
        event_name, organiser, geography_json, evidence_json, score, status,
        rejection_reason, first_seen, last_checked, retry_count, run_id,
        opportunity_fingerprint
      ) VALUES (?, ?, ?, ?, ?, NULL, ?, NULL, ?, '[]', 0, 'discovered',
                NULL, ?, ?, 0, ?, NULL)`
    ).bind(
      candidate.candidate_id,
      candidate.discovery_market,
      candidate.discovery_region_code,
      candidate.source_url,
      candidate.canonical_url,
      candidate.search_title,
      JSON.stringify({
        discovery_market: candidate.discovery_market,
        discovery_region_code: candidate.discovery_region_code,
        discovery_location: candidate.discovery_location,
        asserted: false
      }),
      startedAt,
      completedAt,
      runId
    ).run();

    if (Number(inserted?.meta?.changes || 0) === 1) stored += 1;

    const queued = await db.prepare(
      `INSERT OR IGNORE INTO classification_queue (
        candidate_id, status, attempts, available_at, lease_until,
        last_error, created_at, updated_at
      ) VALUES (?, 'ready', 0, ?, NULL, NULL, ?, ?)`
    ).bind(candidate.candidate_id, completedAt, completedAt, completedAt).run();

    if (Number(queued?.meta?.changes || 0) === 1) enqueued += 1;
  }

  return Object.freeze({
    run_id: runId,
    stored_candidates: stored,
    classification_enqueued: enqueued
  });
}
