import { assessCustomerReadiness } from '../customer/readiness.mjs';

// Draft-only read-only snapshot for a separate v2 D1. This mirrors the protected
// customer API PR #1868 visibility criteria. Consolidate by importing its shared
// visibilityClause() when #1868 is merged; do not deploy this duplicate independently.
// Intentionally exports NO opportunity URLs, descriptions or internal evidence.
export async function getUsCustomerVisibleSnapshot(db, {
  now = new Date(), maxAgeDays = 60, pageSize = 250
} = {}) {
  if (!db?.prepare) throw new Error('findpitches_visible_snapshot_db_missing');
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error('findpitches_visible_snapshot_invalid_now');
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 500) throw new Error('findpitches_visible_snapshot_bad_page_size');
  const days = Number(maxAgeDays);
  if (!Number.isFinite(days) || days <= 0) throw new Error('findpitches_visible_snapshot_bad_max_age');
  const today = now.toISOString().slice(0,10);
  const cutoff = new Date(now.getTime() - days*86400000).toISOString();
  const sql = `SELECT o.*
    FROM customer_opportunities o
    JOIN candidates c ON c.id=o.id
    LEFT JOIN customer_promotion_disposition d
      ON d.candidate_id=o.id AND d.source_last_checked=c.last_checked
    WHERE o.market='US' AND o.id > ?
      AND c.status IN ('validated','published')
      AND NULLIF(TRIM(o.location),'') IS NOT NULL
      AND NULLIF(TRIM(o.location_evidence_url),'') IS NOT NULL
      AND (COALESCE(d.disposition,'') <> 'not_ready' OR c.last_checked <= o.last_checked)
      AND (o.application_deadline IS NULL OR date(o.application_deadline) IS NULL OR date(o.application_deadline) >= date(?))
      AND (o.event_end IS NULL OR date(o.event_end) IS NULL OR date(o.event_end) >= date(?))
      AND NOT (o.event_end IS NULL AND o.event_start IS NOT NULL AND date(o.event_start) < date(?) AND COALESCE(o.recurring,0)=0)
      AND datetime(o.last_checked) >= datetime(?)
    ORDER BY o.id ASC LIMIT ?`;
  let cursor = '', sqlEligible=0, customerVisible=0, filteredReadiness=0;
  const byDiscoveryRegion = new Map(), unresolvedVenue = [];
  const seen = new Set();
  for (;;) {
    const result = await db.prepare(sql).bind(cursor,today,today,today,cutoff,pageSize).all();
    const rows = result?.results;
    if (!Array.isArray(rows)) throw new Error('findpitches_visible_snapshot_invalid_d1_page');
    if (!rows.length) break;
    if (rows.length > pageSize) throw new Error('findpitches_visible_snapshot_page_exceeds_limit');
    for (const row of rows) {
      if (!row?.id || seen.has(row.id) || row.id <= cursor) throw new Error('findpitches_visible_snapshot_unstable_pagination');
      seen.add(row.id);
      const opportunity = {
        id:row.id, market:row.market, region_code:row.region_code,
        title:row.title, organiser:row.organiser ?? null, location:row.location,
        coordinates:parse(row.coordinates_json), event_start:row.event_start, event_end:row.event_end,
        application_deadline:row.application_deadline, canonical_url:row.canonical_url,
        application_url:row.application_url, offerings:parse(row.offerings_json),
        recurring:row.recurring==null?null:Boolean(row.recurring), description:row.description,
        last_checked:row.last_checked
      };
      sqlEligible++;
      if (!assessCustomerReadiness(opportunity,{now}).ready) {filteredReadiness++;continue;}
      customerVisible++;
      const region=String(row.region_code || '').toUpperCase();
      byDiscoveryRegion.set(region,(byDiscoveryRegion.get(region)||0)+1);
      // Projection's free-text location + evidence URL is NOT an independently
      // verified event venue inside a specific Census place boundary.
      unresolvedVenue.push({opportunity_id:String(row.id), discovery_region_code:region,
        reason:'verified_event_venue_geoid_not_established'});
    }
    const last=String(rows[rows.length-1].id);
    if (last <= cursor) throw new Error('findpitches_visible_snapshot_nonadvancing_cursor');
    cursor=last;
    if (rows.length < pageSize) break;
  }
  return Object.freeze({
    snapshot_at:now.toISOString(), market:'US', source:'isolated_v2_d1_read_only',
    visibility_policy:'draft_pr_1868_mirrored_review_required',
    counts:{sql_eligible:sqlEligible,readiness_rejected:filteredReadiness,
      customer_visible:customerVisible,verified_venue_geoids:0,venue_geoid_unresolved:unresolvedVenue.length},
    discovery_region_only:[...byDiscoveryRegion].sort(([a],[b])=>a.localeCompare(b))
      .map(([region_code,visible_opportunities])=>({region_code,visible_opportunities})),
    venue_geoid_unresolved:unresolvedVenue,
    city_coverage_status:'unknown_no_independently_verified_venue_geoids',
    caveat:'Discovery regions and location text cannot be used as verified event-venue place GEOIDs; counts are a bounded audit snapshot, not a deployed protected API result.'
  });
}
function parse(value){if(value==null || value==='')return null;try{return JSON.parse(value)}catch{return null}}
