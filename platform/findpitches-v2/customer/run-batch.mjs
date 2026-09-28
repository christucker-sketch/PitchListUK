import { promoteCustomerOpportunity } from './promote.mjs';

export async function runCustomerPromotionBatch(db, { limit = 12 } = {}) {
  if (!db?.prepare) throw new Error('findpitches_customer_promotion_db_missing');
  const ready = await db.prepare(
    `SELECT c.id, c.market, c.region_code, c.canonical_url, c.application_url,
            c.event_name, c.organiser, c.geography_json, c.score, c.status, c.last_checked,
            e.enrichment_json, e.source_last_checked
       FROM candidates c
       JOIN candidate_enrichment e ON e.candidate_id = c.id AND e.source_last_checked >= c.last_checked
       LEFT JOIN customer_opportunities o ON o.id = c.id
       LEFT JOIN customer_promotion_disposition d ON d.candidate_id = c.id AND d.source_last_checked = c.last_checked AND d.enrichment_last_checked = e.source_last_checked
      WHERE c.status = 'validated'
        AND (o.id IS NULL OR o.last_checked < c.last_checked)
        AND d.candidate_id IS NULL
      ORDER BY c.last_checked ASC, c.id ASC
      LIMIT ?`
  ).bind(Math.max(1, Math.min(Number(limit) || 12, 50))).all();

  const rows = Array.isArray(ready?.results) ? ready.results : [];
  const outcomes = { inspected: 0, promoted: 0, not_ready: 0 };

  for (const row of rows) {
    const geography = parse(row.geography_json);
    const candidate = { ...row, geography, organiser: row.organiser, candidate_id: row.id };
    const enrichment = parse(row.enrichment_json);
    const result = await promoteCustomerOpportunity(db, candidate, enrichment);
    outcomes.inspected += 1;
    if (result.promoted) outcomes.promoted += 1;
    else outcomes.not_ready += 1;
    await db.prepare(`INSERT INTO customer_promotion_disposition (candidate_id,source_last_checked,enrichment_last_checked,disposition,reason,inspected_at)
      VALUES (?,?,?,?,?,?) ON CONFLICT(candidate_id) DO UPDATE SET source_last_checked=excluded.source_last_checked,
      enrichment_last_checked=excluded.enrichment_last_checked,disposition=excluded.disposition,reason=excluded.reason,inspected_at=excluded.inspected_at`)
      .bind(row.id,row.last_checked,row.source_last_checked,result.promoted?'promoted':'not_ready',result.reason||null,new Date().toISOString()).run();
  }
  return Object.freeze(outcomes);
}

function parse(value){try{return JSON.parse(value||'{}');}catch{return {};}}
