// Shared read-time visibility policy for the protected customer API and private audits.
// Keep SQL eligibility separate from assessCustomerReadiness(), which must still be
// applied to every hydrated opportunity after the query.

export const DEFAULT_CUSTOMER_MAX_AGE_DAYS = 60;

export function customerVisibilityClause({ market = null, afterId = false } = {}) {
  const filters = [
    "c.status IN ('validated', 'published')",
    "COALESCE(d.disposition, '') <> 'not_ready'",
    "NULLIF(TRIM(o.location),'') IS NOT NULL",
    "NULLIF(TRIM(o.location_evidence_url),'') IS NOT NULL",
    '(o.application_deadline IS NULL OR date(o.application_deadline) IS NULL OR date(o.application_deadline) >= date(?))',
    '(o.event_end IS NULL OR date(o.event_end) IS NULL OR date(o.event_end) >= date(?))',
    'NOT (o.event_end IS NULL AND o.event_start IS NOT NULL AND date(o.event_start) < date(?) AND COALESCE(o.recurring, 0) = 0)',
    'datetime(o.last_checked) >= datetime(?)'
  ];
  if (market) filters.unshift('o.market = ?');
  if (afterId) filters.push('o.id > ?');
  return `JOIN candidates c ON c.id = o.id
    LEFT JOIN customer_promotion_disposition d
      ON d.candidate_id = o.id AND d.source_last_checked = c.last_checked
    WHERE ${filters.join('\n      AND ')}`;
}

export function customerVisibilityArgs({
  now = new Date(), maxAgeDays = DEFAULT_CUSTOMER_MAX_AGE_DAYS,
  market = null, afterId = false, cursor = ''
} = {}) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new Error('findpitches_customer_visibility_invalid_now');
  }
  const days = Number(maxAgeDays);
  if (!Number.isFinite(days) || days <= 0) {
    throw new Error('findpitches_customer_visibility_bad_max_age');
  }
  const today = now.toISOString().slice(0, 10);
  const cutoff = new Date(now.getTime() - days * 86400000).toISOString();
  const args = [today, today, today, cutoff];
  if (market) args.unshift(String(market).trim().toUpperCase());
  if (afterId) args.push(String(cursor));
  return args;
}

export function hydrateCustomerOpportunity(row = {}) {
  return Object.freeze({
    id: row.id,
    market: row.market,
    region_code: row.region_code,
    title: row.title,
    organiser: row.organiser ?? null,
    location: row.location ?? null,
    coordinates: parse(row.coordinates_json),
    event_start: row.event_start ?? null,
    event_end: row.event_end ?? null,
    application_deadline: row.application_deadline ?? null,
    canonical_url: row.canonical_url,
    application_url: row.application_url,
    offerings: parse(row.offerings_json),
    recurring: row.recurring == null ? null : Boolean(row.recurring),
    description: row.description ?? null,
    last_checked: row.last_checked
  });
}

function parse(value) {
  if (value == null || value === '') return null;
  try { return JSON.parse(value); } catch { return null; }
}
