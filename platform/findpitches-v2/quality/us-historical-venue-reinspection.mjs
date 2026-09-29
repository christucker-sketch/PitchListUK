import { classifyVenueEvidence } from '../enrichment/venue-evidence.mjs';
import { allowedExistingSource } from './us-venue-recovery-runner.mjs';

// Revisit historical human-verified venues without treating their old GEOIDs as
// evidence for a current candidate revision. The 29 Sep audit did not record
// revision stamps; every matching row must be rechecked before a future cutover.
// Private, in-memory planning only: no D1 writes, automatic GEOIDs or promotion.
export function planHistoricalVenueReinspection(audit, historicalReviews, {
  offset = 0, limit = 12
} = {}) {
  if (!Array.isArray(audit?.visible) || !Array.isArray(historicalReviews)) {
    throw new Error('historical_venue_audit_and_reviews_required');
  }
  if (!Number.isInteger(offset) || offset < 0 ||
      !Number.isInteger(limit) || limit < 1 || limit > 25) {
    throw new Error('historical_venue_bad_batch_bounds');
  }
  const historic = new Map();
  for (const item of historicalReviews) {
    const id = String(item?.opportunity_id || '');
    if (!id || historic.has(id)) throw new Error('historical_venue_duplicate_or_missing_review_id');
    historic.set(id, item);
  }
  const current = new Map();
  for (const row of audit.visible) {
    const id = String(row?.id || '');
    if (!id || current.has(id)) throw new Error('historical_venue_duplicate_or_missing_visible_id');
    current.set(id, row);
  }
  const weak = [], strong = [], absent = [];
  for (const [id, review] of historic) {
    const row = current.get(id);
    if (!row) { absent.push(id); continue; }
    let location = null;
    try { location = JSON.parse(row.enrichment_json || '{}').location; } catch {}
    const strict = classifyVenueEvidence(location);
    const entry = {
      opportunity_id: id,
      region_acquired: String(row.region_code || ''),
      location_evidence_url: allowedExistingSource(row.location_evidence_url),
      canonical_url: allowedExistingSource(row.canonical_url),
      application_url: allowedExistingSource(row.application_url),
      stored_evidence_reason: strict.reason,
      historical_place_for_comparison_only: String(review.place || ''),
      revision_match: 'unverified_historical_manifest_has_no_revision_stamp',
      review_flags: [{code:'historic_venue_requires_current_revision_and_freshness_check'}],
      status: strict.accepted ? 'historical_strict_match_recheck_revision' :
        'historical_known_good_missing_strict_stored_evidence',
      action: 'refetch_known_sources_verify_current_venue_event_date_application_and_duplicate'
    };
    (strict.accepted ? strong : weak).push(entry);
  }
  weak.sort((a,b)=>a.opportunity_id.localeCompare(b.opportunity_id));
  strong.sort((a,b)=>a.opportunity_id.localeCompare(b.opportunity_id));
  return Object.freeze({
    snapshot_at: audit.snapshot_at || null,
    historical_reviews: historic.size,
    current_visible_historical: weak.length + strong.length,
    missing_from_current_visible: absent.length,
    missing_ids: absent.sort(),
    strict_stored_pass: strong.length,
    needs_source_reinspection: weak.length,
    total_reinspection_cohort: weak.length,
    offset, limit,
    // Only the weak cohort is selected. Strict matches still need a separate
    // current-revision/freshness check before historical reviews can be reused.
    queue: weak.slice(offset, offset + limit),
    remaining: Math.max(0, weak.length - offset - limit),
    caveat: 'Historic GEOIDs are comparison-only. No revision proof, automatic acceptance or D1 mutation.'
  });
}
