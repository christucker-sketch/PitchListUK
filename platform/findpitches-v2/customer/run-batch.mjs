import { promoteCustomerOpportunity } from './promote.mjs';

export async function runCustomerPromotionBatch(db, { limit = 12 } = {}) {
  if (!db?.prepare) throw new Error('findpitches_customer_promotion_db_missing');
  const ready = await db.prepare(
    `SELECT c.id, c.market, c.region_code, c.canonical_url, c.application_url,
            c.event_name, c.organiser, c.geography_json, c.score, c.status, c.last_checked
       FROM candidates c
       LEFT JOIN customer_opportunities o ON o.id = c.id
      WHERE c.status = 'validated'
        AND (o.id IS NULL OR o.last_checked < c.last_checked)
      ORDER BY c.last_checked ASC, c.id ASC
      LIMIT ?`
  ).bind(Math.max(1, Math.min(Number(limit) || 12, 50))).all();

  const rows = Array.isArray(ready?.results) ? ready.results : [];
  const outcomes = { inspected: 0, promoted: 0, not_ready: 0 };

  for (const row of rows) {
    const geography = parse(row.geography_json);
    const candidate = {
      ...row,
      geography,
      organiser: row.organiser,
      candidate_id: row.id
    };
    // First shadow pass deliberately uses only evidence already held in the
    // classifier candidate. Dedicated enrichment can add optional fields later.
    const enrichment = {
      organiser: row.organiser,
      location: geography.location ?? geography.discovery_location ?? null
    };
    const result = await promoteCustomerOpportunity(db, candidate, enrichment);
    outcomes.inspected += 1;
    if (result.promoted) outcomes.promoted += 1;
    else outcomes.not_ready += 1;
  }
  return Object.freeze(outcomes);
}

function parse(value){try{return JSON.parse(value||'{}');}catch{return {};}}
