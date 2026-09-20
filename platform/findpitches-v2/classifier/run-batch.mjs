import { getMarket } from '../markets/registry.mjs';
import { createDefaultCandidateEvaluator } from '../engine/evaluator.mjs';

export async function runClassificationBatch(db, {
  fetchProvider,
  limit = 12,
  now = new Date()
} = {}) {
  if (!db?.prepare) throw new Error('findpitches_v2_classifier_db_missing');
  const evaluator = createDefaultCandidateEvaluator({ fetchProvider });
  const timestamp = now.toISOString();
  const leaseUntil = new Date(now.getTime() + 4 * 60 * 1000).toISOString();

  const ready = await db.prepare(
    `SELECT q.candidate_id, c.market, c.region_code, c.canonical_url, c.event_name,
            c.geography_json
       FROM classification_queue q
       JOIN candidates c ON c.id = q.candidate_id
      WHERE (q.status = 'ready' AND q.available_at <= ?)
         OR (q.status = 'leased' AND q.lease_until <= ?)
      ORDER BY q.available_at ASC, q.candidate_id ASC
      LIMIT ?`
  ).bind(timestamp, timestamp, Math.max(1, Math.min(Number(limit) || 12, 25))).all();

  const rows = Array.isArray(ready?.results) ? ready.results : [];
  const outcomes = { processed: 0, validated: 0, held: 0, rejected: 0, failed: 0 };

  for (const row of rows) {
    const claim = await db.prepare(
      `UPDATE classification_queue
          SET status = 'leased', lease_until = ?, attempts = attempts + 1, updated_at = ?
        WHERE candidate_id = ?
          AND ((status = 'ready' AND available_at <= ?)
            OR (status = 'leased' AND lease_until <= ?))`
    ).bind(leaseUntil, timestamp, row.candidate_id, timestamp, timestamp).run();

    if (Number(claim?.meta?.changes || 0) !== 1) continue;

    try {
      const geography = parseJson(row.geography_json);
      const evaluated = await evaluator({
        market: getMarket(row.market),
        region_code: row.region_code,
        location: geography.discovery_location || row.region_code,
        result: { url: row.canonical_url, title: row.event_name }
      });

      await db.prepare(
        `UPDATE candidates
            SET application_url = ?, event_name = ?, organiser = ?,
                geography_json = ?, evidence_json = ?, score = ?, status = ?,
                rejection_reason = ?, last_checked = ?
          WHERE id = ?`
      ).bind(
        evaluated.application_url,
        evaluated.event_name,
        evaluated.organiser,
        JSON.stringify(evaluated.geography || {}),
        JSON.stringify(evaluated.evidence || []),
        Number(evaluated.score || 0),
        evaluated.status,
        evaluated.rejection_reason,
        new Date().toISOString(),
        row.candidate_id
      ).run();

      await db.prepare(
        `UPDATE classification_queue
            SET status = 'complete', lease_until = NULL, last_error = NULL, updated_at = ?
          WHERE candidate_id = ?`
      ).bind(new Date().toISOString(), row.candidate_id).run();

      outcomes.processed += 1;
      if (evaluated.status === 'validated') outcomes.validated += 1;
      else if (evaluated.status === 'held') outcomes.held += 1;
      else outcomes.rejected += 1;
    } catch (error) {
      const retryAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      await db.prepare(
        `UPDATE classification_queue
            SET status = 'ready', available_at = ?, lease_until = NULL,
                last_error = ?, updated_at = ?
          WHERE candidate_id = ?`
      ).bind(
        retryAt,
        String(error?.message || error).slice(0, 500),
        new Date().toISOString(),
        row.candidate_id
      ).run();
      outcomes.failed += 1;
    }
  }

  return Object.freeze(outcomes);
}

function parseJson(value) {
  try {
    return JSON.parse(value || '{}');
  } catch {
    return {};
  }
}
