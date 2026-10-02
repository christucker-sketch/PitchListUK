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
    runId, result.market, result.region,
    Number(result.metrics?.queries || 0),
    Number(result.metrics?.search_results || 0),
    Number(result.metrics?.unique_urls || 0),
    startedAt, completedAt
  ).run();

  let stored = 0;
  let enqueued = 0;
  let sourceDomainsObserved = 0;

  for (const candidate of result.candidates || []) {
    const inserted = await db.prepare(
      `INSERT OR IGNORE INTO candidates (
        id, market, region_code, source_url, canonical_url, application_url,
        event_name, organiser, geography_json, evidence_json, score, status,
        rejection_reason, first_seen, last_checked, retry_count, run_id,
        opportunity_fingerprint
      ) VALUES (?, ?, ?, ?, ?, NULL, ?, NULL, ?, ?, 0, 'discovered',
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
      JSON.stringify([{
        kind: 'search_result',
        source: candidate.source_url,
        title: candidate.search_title || null,
        snippet: candidate.search_snippet || null,
        query_id: candidate.query_id || null,
        query: candidate.query || null
      }]),
      startedAt, completedAt, runId
    ).run();

    const isNew = Number(inserted?.meta?.changes || 0) === 1;
    if (isNew) stored += 1;

    const domain = sourceDomain(candidate.canonical_url || candidate.source_url);
    if (domain) {
      await db.prepare(
        `INSERT INTO source_reputation (
          market, domain, organisation, source_type, first_seen, last_seen,
          last_success, candidate_count, published_count, rejection_count,
          reputation_score
        ) VALUES (?, ?, NULL, 'search_discovered', ?, ?, NULL, ?, 0, 0, 0)
        ON CONFLICT(market, domain) DO UPDATE SET
          last_seen = excluded.last_seen,
          candidate_count = source_reputation.candidate_count + excluded.candidate_count`
      ).bind(
        candidate.discovery_market,
        domain,
        startedAt,
        completedAt,
        isNew ? 1 : 0
      ).run();
      sourceDomainsObserved += 1;
    }

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
    classification_enqueued: enqueued,
    source_domains_observed: sourceDomainsObserved
  });
}

export function sourceDomain(value) {
  try {
    const host = new URL(String(value || '')).hostname.toLowerCase().replace(/^www\./, '');
    return host && host.includes('.') ? host : null;
  } catch {
    return null;
  }
}
