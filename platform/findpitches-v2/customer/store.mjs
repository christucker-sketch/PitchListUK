// Storage adapter for customer-ready projections.
// Deliberately targets a separate customer_opportunities table rather than raw candidates.

export async function upsertCustomerOpportunity(db, opportunity = {}, searchDocument = {}) {
  requireDb(db);
  if (!opportunity.id) throw new Error('findpitches_customer_store_id_missing');

  await db.prepare(`INSERT INTO customer_opportunities (
    id, market, region_code, title, organiser, location, coordinates_json,
    event_start, event_end, application_deadline, canonical_url, application_url,
    offerings_json, recurring, description, search_text, last_checked, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    market=excluded.market, region_code=excluded.region_code, title=excluded.title,
    organiser=excluded.organiser, location=excluded.location, coordinates_json=excluded.coordinates_json,
    event_start=excluded.event_start, event_end=excluded.event_end,
    application_deadline=excluded.application_deadline, canonical_url=excluded.canonical_url,
    application_url=excluded.application_url, offerings_json=excluded.offerings_json,
    recurring=excluded.recurring, description=excluded.description, search_text=excluded.search_text,
    last_checked=excluded.last_checked, updated_at=excluded.updated_at`)
  .bind(
    opportunity.id, opportunity.market, opportunity.region_code, opportunity.title,
    opportunity.organiser, opportunity.location, json(opportunity.coordinates),
    opportunity.event_start, opportunity.event_end, opportunity.application_deadline,
    opportunity.canonical_url, opportunity.application_url, json(opportunity.offerings),
    opportunity.recurring == null ? null : opportunity.recurring ? 1 : 0,
    opportunity.description, searchDocument.search_text || '', opportunity.last_checked,
    new Date().toISOString()
  ).run();
  return opportunity.id;
}

export async function getCustomerOpportunity(db, id) {
  requireDb(db);
  return db.prepare('SELECT * FROM customer_opportunities WHERE id = ?').bind(String(id)).first();
}

export async function searchCustomerOpportunities(db, query = {}) {
  requireDb(db);
  const where=[], args=[];
  if (query.market) { where.push('market = ?'); args.push(query.market); }
  if (query.region_code) { where.push('region_code = ?'); args.push(query.region_code); }
  for (const term of [query.q, query.offering, query.cuisine].filter(Boolean)) {
    where.push('LOWER(search_text) LIKE ?'); args.push(`%${String(term).toLowerCase()}%`);
  }
  const limit=Math.max(1,Math.min(100,Number(query.limit)||25));
  const sql=`SELECT * FROM customer_opportunities ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY last_checked DESC, id ASC LIMIT ?`;
  return db.prepare(sql).bind(...args,limit).all();
}

function requireDb(db){if(!db?.prepare)throw new Error('findpitches_customer_store_db_missing');}
function json(value){return value==null?null:JSON.stringify(value);}
