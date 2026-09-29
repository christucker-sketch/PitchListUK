import { classifyVenueEvidence } from '../enrichment/venue-evidence.mjs';
import { extractNamedFields } from '../enrichment/named-fields.mjs';

// Offline read-only planning. Accept the PRIVATE output from
// getUsCustomerVisibleAuditInventory(). Never write D1 or infer a Census GEOID.
// reviewedIds must be from independently checked venue evidence; the historic 31
// audit outcomes are NOT silently applied to new or revised candidate records.
export function planUsVenueRecovery(audit, { reviewedIds = [], limit = 100 } = {}) {
  if (!Array.isArray(audit?.visible)) throw new Error('findpitches_venue_recovery_visible_inventory_required');
  if (!Number.isInteger(limit) || limit < 1 || limit > 250) throw new Error('findpitches_venue_recovery_bad_limit');
  const reviewed=new Set(reviewedIds.map(String)), seen=new Set();
  const urlOwner=new Map();
  const queue=[],counts={visible:0,already_reviewed:0,stored_evidence_strong:0,
    weak_evidence:0,missing_current_enrichment:0,invalid_enrichment_json:0};
  for (const row of audit.visible) {
    const id=String(row?.id||'');
    if (!id || seen.has(id)) throw new Error('findpitches_venue_recovery_duplicate_or_missing_id');
    seen.add(id);counts.visible++;
    if(reviewed.has(id)){counts.already_reviewed++;continue;}
    let enrichment=null;
    if (row.enrichment_json) {
      try {enrichment=JSON.parse(row.enrichment_json)}
      catch {counts.invalid_enrichment_json++;}
    } else counts.missing_current_enrichment++;
    const field=enrichment?.location;
    const current=classifyVenueEvidence(field);
    const status=current.accepted?'stored_explicit_venue_candidate':'needs_source_reinspection';
    if (current.accepted)counts.stored_evidence_strong++;
    else counts.weak_evidence++;
    // A strict textual match is still NOT an independently verified venue or
    // proven current listing. Requires re-fetch + manual audit before GEOID.
    const reviewFlags=[];
    const canonical=validHttpUrl(row.canonical_url), application=validHttpUrl(row.application_url);
    for(const url of [...new Set([canonical,application].filter(Boolean))]){
      const canonicalUrl=normaliseEventUrl(url);
      if(urlOwner.has(canonicalUrl)) reviewFlags.push({code:'possible_duplicate_source',other_opportunity_id:urlOwner.get(canonicalUrl)});
      else urlOwner.set(canonicalUrl,id);
      if (/\b(?:19|20)\d{2}\b/.test(url)) {
        const years=[...url.matchAll(/(?:19|20)\d{2}/g)].map(x=>Number(x[0]));
        const currentYear=Number(String(audit.snapshot_at||new Date().toISOString()).slice(0,4));
        if(Number.isFinite(currentYear) && years.some(y=>y<currentYear-1)) reviewFlags.push({code:'stale_year_in_source_url'});
      }
    }
    if (queue.length<limit) queue.push({
      opportunity_id:id, region_acquired:String(row.region_code||''),
      review_flags:reviewFlags,
      status,stored_evidence_reason:current.reason,
      canonical_url:validHttpUrl(row.canonical_url),
      application_url:validHttpUrl(row.application_url),
      location_evidence_url:validHttpUrl(row.location_evidence_url),
      // Review is ordered by ID, not by completeness; this is an audit slice.
      action:'refetch_known_sources_review_event_venue_freshness_and_duplicate'
    });
  }
  return Object.freeze({snapshot_at:audit.snapshot_at || null,market:'US',
    ...counts,queued:queue.length,queue,
    caveat:'The queue is a bounded preview of unresolved visible rows. Text matches are candidates for independent venue verification, never confirmed venue GEOIDs. A reviewed ID may change on a later revision.'
  });
}

export function inspectRefetchedVenuePages(pages = []) {
  if(!Array.isArray(pages) || pages.length>5) throw new Error('findpitches_venue_recovery_page_limit');
  const docs=pages.map(p=>({
    url:validHttpUrl(p.final_url||p.url),
    body:String(p.body??'').slice(0,250000)
  })).filter(p=>p.url && p.body);
  const named=extractNamedFields(docs);
  const locationCheck=classifyVenueEvidence(named.location);
  return Object.freeze({
    status:locationCheck.accepted?'possible_event_venue_needs_independent_review':'venue_not_proven',
    location:locationCheck.accepted?named.location:null,
    reason:locationCheck.reason,
    fetched_pages_considered:docs.length,
    verified_venue_geoid:null,
    // Do not mark records customer-ready, create promotions or modify D1 here.
    requires_manual_review:true
  });
}
function normaliseEventUrl(value){
  const u=new URL(value);u.hash='';u.hostname=u.hostname.toLowerCase();
  return u.toString().replace(/\/$/,'');
}
function validHttpUrl(value) {
  try { const url=new URL(String(value||''));return ['https:','http:'].includes(url.protocol)?url.href:null; }
  catch{return null}
}
