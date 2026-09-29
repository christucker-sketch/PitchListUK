import { assessCustomerReadiness } from '../customer/readiness.mjs';
import {
  customerVisibilityArgs,
  customerVisibilityClause,
  hydrateCustomerOpportunity
} from '../customer/visibility.mjs';

// Draft-only read-only snapshot for the separate v2 D1. It consumes the shared
// protected-customer visibility policy instead of maintaining a second SQL copy.
// Intentionally exports NO opportunity URLs, descriptions or internal evidence.
export async function getUsCustomerVisibleSnapshot(db, {
  now = new Date(), maxAgeDays = 60, pageSize = 250
} = {}) {
  if (!db?.prepare) throw new Error('findpitches_visible_snapshot_db_missing');
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error('findpitches_visible_snapshot_invalid_now');
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 500) throw new Error('findpitches_visible_snapshot_bad_page_size');
  const days = Number(maxAgeDays);
  if (!Number.isFinite(days) || days <= 0) throw new Error('findpitches_visible_snapshot_bad_max_age');
  const sql = `SELECT o.* FROM customer_opportunities o
    ${customerVisibilityClause({market:'US',afterId:true})}
    ORDER BY o.id ASC LIMIT ?`;
  let cursor = '', sqlEligible=0, customerVisible=0, filteredReadiness=0;
  const byDiscoveryRegion = new Map(), unresolvedVenue = [];
  const seen = new Set();
  for (;;) {
    const result = await db.prepare(sql)
      .bind(...customerVisibilityArgs({now,maxAgeDays:days,market:'US',afterId:true,cursor}),pageSize).all();
    const rows = result?.results;
    if (!Array.isArray(rows)) throw new Error('findpitches_visible_snapshot_invalid_d1_page');
    if (!rows.length) break;
    if (rows.length > pageSize) throw new Error('findpitches_visible_snapshot_page_exceeds_limit');
    for (const row of rows) {
      if (!row?.id || seen.has(row.id) || row.id <= cursor) throw new Error('findpitches_visible_snapshot_unstable_pagination');
      seen.add(row.id);
      const opportunity = hydrateCustomerOpportunity(row);
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
    visibility_policy:'shared_customer_visibility_v1_strict_current_disposition',
    counts:{sql_eligible:sqlEligible,readiness_rejected:filteredReadiness,
      customer_visible:customerVisible,verified_venue_geoids:0,venue_geoid_unresolved:unresolvedVenue.length},
    discovery_region_only:[...byDiscoveryRegion].sort(([a],[b])=>a.localeCompare(b))
      .map(([region_code,visible_opportunities])=>({region_code,visible_opportunities})),
    venue_geoid_unresolved:unresolvedVenue,
    city_coverage_status:'unknown_no_independently_verified_venue_geoids',
    caveat:'Discovery regions and location text cannot be used as verified event-venue place GEOIDs; counts are a bounded audit snapshot, not a deployed protected API result.'
  });
}

// Internal audit inventory. Unlike the public summary above, this includes the
// stored evidence needed for manual venue verification. Callers must keep the
// result private and must not treat location text as a Census match by itself.
export async function getUsCustomerVisibleAuditInventory(db, {
  now = new Date(), maxAgeDays = 60, pageSize = 100
} = {}) {
  if (!db?.prepare) throw new Error('findpitches_visible_snapshot_db_missing');
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error('findpitches_visible_snapshot_invalid_now');
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 250) throw new Error('findpitches_visible_snapshot_bad_page_size');
  const sql = `SELECT o.*, c.source_url, c.geography_json, c.evidence_json,
      (SELECT e.enrichment_json FROM candidate_enrichment e
        WHERE e.candidate_id=o.id AND e.source_last_checked >= c.last_checked
        ORDER BY e.source_last_checked DESC LIMIT 1) AS enrichment_json,
      (SELECT e.provenance_json FROM candidate_enrichment e
        WHERE e.candidate_id=o.id AND e.source_last_checked >= c.last_checked
        ORDER BY e.source_last_checked DESC LIMIT 1) AS provenance_json,
      (SELECT e.fetched_urls_json FROM candidate_enrichment e
        WHERE e.candidate_id=o.id AND e.source_last_checked >= c.last_checked
        ORDER BY e.source_last_checked DESC LIMIT 1) AS fetched_urls_json
    FROM customer_opportunities o
    ${customerVisibilityClause({market:'US',afterId:true})}
    ORDER BY o.id ASC LIMIT ?`;
  const visible = [], readinessRejected = [];
  let cursor = '';
  for (;;) {
    const result = await db.prepare(sql)
      .bind(...customerVisibilityArgs({now,maxAgeDays,market:'US',afterId:true,cursor}),pageSize).all();
    const rows = result?.results;
    if (!Array.isArray(rows)) throw new Error('findpitches_visible_snapshot_invalid_d1_page');
    if (!rows.length) break;
    if (rows.length > pageSize) throw new Error('findpitches_visible_snapshot_page_exceeds_limit');
    for (const row of rows) {
      if (!row?.id || row.id <= cursor) throw new Error('findpitches_visible_snapshot_unstable_pagination');
      const readiness = assessCustomerReadiness(hydrateCustomerOpportunity(row),{now});
      (readiness.ready ? visible : readinessRejected).push({...row,readiness});
    }
    const last=String(rows.at(-1).id);
    if (last <= cursor) throw new Error('findpitches_visible_snapshot_nonadvancing_cursor');
    cursor=last;
    if (rows.length < pageSize) break;
  }
  return Object.freeze({snapshot_at:now.toISOString(),market:'US',
    visibility_policy:'shared_customer_visibility_v1_strict_current_disposition',
    visible,readiness_rejected:readinessRejected});
}
