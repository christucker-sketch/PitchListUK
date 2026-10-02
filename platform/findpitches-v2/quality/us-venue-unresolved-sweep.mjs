import { planUsVenueRecovery } from './us-venue-recovery.mjs';

// Private, single-snapshot cohort for ALL current visible US records lacking
// strict stored venue evidence, excluding separately inspected historical IDs.
// Neither an absent strict label nor a failed fetch means the event is invalid.
export function planUsUnresolvedVenueSweep(audit, {
  historicalIds = [], followupIds = [], maxVisible = 500
} = {}) {
  if (!Number.isInteger(maxVisible) || maxVisible < 1 || maxVisible > 500) {
    throw new Error('unresolved_venue_invalid_visible_bound');
  }
  if (!Array.isArray(audit?.visible) || audit.visible.length > maxVisible) {
    throw new Error('unresolved_venue_visible_inventory_invalid_or_above_cap');
  }
  const excluded = new Set([...historicalIds,...followupIds].map(String));
  const preview = planUsVenueRecovery(audit,{limit:maxVisible});
  const queue = preview.queue.filter(item =>
    item.status==='needs_source_reinspection' && !excluded.has(item.opportunity_id));
  return Object.freeze({
    snapshot_at:audit.snapshot_at || null,
    visible:preview.visible,
    excluded_review_ids:excluded.size,
    strict_text_candidates:preview.stored_evidence_strong,
    weak_stored_evidence:preview.weak_evidence,
    selected:queue.length,
    queue,
    caveat:'One private read-only snapshot. No venue or GEOID verified; no source refetch on planning; no automatic publication.'
  });
}
