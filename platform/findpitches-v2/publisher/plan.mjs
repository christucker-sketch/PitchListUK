export async function planPublicationBatch(db, {
  market,
  limit = 25,
  minimumScore = 60
} = {}) {
  if (!db?.prepare) throw new Error('findpitches_v2_publisher_db_missing');
  const code = String(market || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) throw new Error('findpitches_v2_publisher_market_invalid');

  const boundedLimit = Math.max(1, Math.min(100, Number(limit) || 25));
  const threshold = Number.isFinite(Number(minimumScore)) ? Number(minimumScore) : 60;

  const result = await db.prepare(
    `SELECT id, market, region_code, source_url, canonical_url, application_url,
            event_name, organiser, geography_json, evidence_json, score, status,
            rejection_reason, opportunity_fingerprint
       FROM candidates
      WHERE market = ?
        AND status = 'validated'
        AND score >= ?
      ORDER BY score DESC, first_seen ASC, id ASC
      LIMIT ?`
  ).bind(code, threshold, boundedLimit).all();

  const candidates = (Array.isArray(result?.results) ? result.results : []).map(row => Object.freeze({
    id: row.id,
    market: row.market,
    region_code: row.region_code,
    source_url: row.source_url,
    canonical_url: row.canonical_url,
    application_url: row.application_url,
    event_name: row.event_name,
    organiser: row.organiser,
    geography: parseJson(row.geography_json, {}),
    evidence: parseJson(row.evidence_json, []),
    score: Number(row.score || 0),
    opportunity_fingerprint: row.opportunity_fingerprint
  }));

  return Object.freeze({
    market: code,
    mode: 'dry_run',
    additions_only: true,
    candidate_count: candidates.length,
    candidate_ids: Object.freeze(candidates.map(candidate => candidate.id)),
    candidates: Object.freeze(candidates)
  });
}

function parseJson(value, fallback) {
  try {
    const parsed = JSON.parse(String(value || ''));
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}
