// Storage adapter for customer-ready projections.
// Deliberately targets a separate customer_opportunities table rather than raw candidates.

export async function upsertCustomerOpportunity(db, opportunity = {}, searchDocument = {}, { locationEvidenceUrl = null } = {}) {
  requireDb(db);
  if (!opportunity.id) throw new Error('findpitches_customer_store_id_missing');

  await db.prepare(`INSERT INTO customer_opportunities (
    id, market, region_code, title, organiser, location, coordinates_json,
    event_start, event_end, application_deadline, canonical_url, application_url,
    offerings_json, recurring, description, search_text, last_checked, updated_at, location_evidence_url
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    market=excluded.market, region_code=excluded.region_code, title=excluded.title,
    organiser=excluded.organiser, location=excluded.location, coordinates_json=excluded.coordinates_json,
    event_start=excluded.event_start, event_end=excluded.event_end,
    application_deadline=excluded.application_deadline, canonical_url=excluded.canonical_url,
    application_url=excluded.application_url, offerings_json=excluded.offerings_json,
    recurring=excluded.recurring, description=excluded.description, search_text=excluded.search_text,
    last_checked=excluded.last_checked, updated_at=excluded.updated_at,
    location_evidence_url=excluded.location_evidence_url`)
  .bind(
    opportunity.id, opportunity.market, opportunity.region_code, opportunity.title,
    opportunity.organiser, opportunity.location, json(opportunity.coordinates),
    opportunity.event_start, opportunity.event_end, opportunity.application_deadline,
    opportunity.canonical_url, opportunity.application_url, json(opportunity.offerings),
    opportunity.recurring == null ? null : opportunity.recurring ? 1 : 0,
    opportunity.description, searchDocument.search_text || '', opportunity.last_checked,
    new Date().toISOString(), locationEvidenceUrl
  ).run();
  return opportunity.id;
}

// ---------------------------------------------------------------------------------------------
// Read-time visibility policy.
//
// A row in customer_opportunities is only returned while ALL of these hold at read time:
//   1. its source candidate still exists and is 'validated' or 'published'
//      (revalidation moves cancelled/closed events to 'held'; rejected/held candidates disappear);
//   2. a newer revision of the candidate has not been inspected and found not customer-ready
//      (customer_promotion_disposition.disposition = 'not_ready' for the candidate's current last_checked);
//   3. the application deadline, if known, is today or later;
//   4. the event end date, if known, is today or later; a non-recurring event with a known start date
//      in the past and no end date is treated as finished;
//   5. last_checked is within the freshness window (FINDPITCHES_CUSTOMER_MAX_AGE_DAYS, default 60);
//   6. the record still passes assessCustomerReadiness() (URL block rules, required fields incl.
//      location) — applied in service.mjs after the query;
//   7. (location gate, PR #1865) it has a nonblank event location AND a source URL proving it
//      (location_evidence_url). Legacy rows promoted before location evidence existed fail closed.
// Promotion (run-batch.mjs) is unchanged; these checks make stale projections invisible without
// deleting anything.
// ---------------------------------------------------------------------------------------------
export const DEFAULT_MAX_AGE_DAYS = 60;

export function visibilityClause() {
  return `JOIN candidates c ON c.id = o.id
    LEFT JOIN customer_promotion_disposition d ON d.candidate_id = o.id AND d.source_last_checked = c.last_checked
    WHERE c.status IN ('validated', 'published')
      AND NULLIF(TRIM(location),'') IS NOT NULL AND NULLIF(TRIM(location_evidence_url),'') IS NOT NULL
      AND (COALESCE(d.disposition, '') <> 'not_ready' OR c.last_checked <= o.last_checked)
      AND (o.application_deadline IS NULL OR date(o.application_deadline) IS NULL OR date(o.application_deadline) >= date(?))
      AND (o.event_end IS NULL OR date(o.event_end) IS NULL OR date(o.event_end) >= date(?))
      AND NOT (o.event_end IS NULL AND o.event_start IS NOT NULL AND date(o.event_start) < date(?) AND COALESCE(o.recurring, 0) = 0)
      AND datetime(o.last_checked) >= datetime(?)`;
}

export function visibilityArgs({ now = new Date(), maxAgeDays = DEFAULT_MAX_AGE_DAYS } = {}) {
  const today = now.toISOString().slice(0, 10);
  const days = Number.isFinite(Number(maxAgeDays)) && Number(maxAgeDays) > 0 ? Number(maxAgeDays) : DEFAULT_MAX_AGE_DAYS;
  const cutoff = new Date(now.getTime() - days * 86400000).toISOString();
  return [today, today, today, cutoff];
}

export async function getCustomerOpportunity(db, id, visibility = {}) {
  requireDb(db);
  return db.prepare(`SELECT o.* FROM customer_opportunities o ${visibilityClause()} AND o.id = ?`)
    .bind(...visibilityArgs(visibility), String(id)).first();
}

export async function searchCustomerOpportunities(db, query = {}, visibility = {}) {
  requireDb(db);
  const where=[], args=[];
  if (query.market) { where.push('o.market = ?'); args.push(query.market); }
  if (query.region_code) { where.push('o.region_code = ?'); args.push(query.region_code); }
  for (const term of [query.q, query.offering, query.cuisine].filter(Boolean)) {
    where.push('LOWER(o.search_text) LIKE ?'); args.push(`%${String(term).toLowerCase()}%`);
  }
  // Over-fetch slightly: service.mjs drops rows that fail the in-code readiness check, then trims to limit.
  const limit=Math.max(1,Math.min(100,Number(query.limit)||25));
  const fetchLimit=Math.min(200, limit * 2 + 10);
  const sql=`SELECT o.* FROM customer_opportunities o ${visibilityClause()} ${where.length?'AND '+where.join(' AND '):''} ORDER BY o.last_checked DESC, o.id ASC LIMIT ?`;
  return db.prepare(sql).bind(...visibilityArgs(visibility), ...args, fetchLimit).all();
}

function requireDb(db){if(!db?.prepare)throw new Error('findpitches_customer_store_db_missing');}
function json(value){return value==null?null:JSON.stringify(value);}
