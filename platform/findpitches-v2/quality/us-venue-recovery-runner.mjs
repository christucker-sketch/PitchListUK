import { inspectRefetchedVenuePages } from './us-venue-recovery.mjs';

const DEFAULT_PER_BATCH = 12;
const MAX_PER_BATCH = 25;
const MAX_PAGES_PER_RECORD = 3;

// Isolated offline runner. Fetches ONLY already discovered first-party source
// URLs through an injected existing fetch provider, never calls Serper and
// never queries/writes D1 or a production endpoint. Returned data is PRIVATE.
// No automatic promotion, candidate status mutation or GEOID assignment.
export async function runUsVenueRecoveryPreview(queue = [], {
  fetchProvider,
  limit = DEFAULT_PER_BATCH,
  maxPagesPerRecord = MAX_PAGES_PER_RECORD,
  onRecord = null
} = {}) {
  if (!Array.isArray(queue)) throw new Error('findpitches_recovery_queue_required');
  if (!fetchProvider?.fetch) throw new Error('findpitches_recovery_fetch_provider_missing');
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PER_BATCH) {
    throw new Error('findpitches_recovery_bad_batch_limit');
  }
  if (!Number.isInteger(maxPagesPerRecord) || maxPagesPerRecord < 1 || maxPagesPerRecord > 3) {
    throw new Error('findpitches_recovery_bad_page_limit');
  }
  const selected = queue.slice(0, limit);
  const seenIds = new Set(), outcomes = [];
  for (const item of selected) {
    const id = String(item?.opportunity_id || '');
    if (!id || seenIds.has(id)) throw new Error('findpitches_recovery_duplicate_or_missing_id');
    seenIds.add(id);
    const urls = [...new Set([
      item.location_evidence_url,item.application_url,item.canonical_url
    ].map(allowedExistingSource).filter(Boolean))].slice(0,maxPagesPerRecord);
    const pages = [], failures = [];
    for (const url of urls) {
      try {
        const page = await fetchProvider.fetch(url);
        const finalUrl = allowedExistingSource(page?.final_url || url);
        if (!finalUrl || new URL(finalUrl).hostname !== new URL(url).hostname) {
          failures.push({source_url:url,reason:'unsafe_or_cross_host_redirect'});
          continue;
        }
        if (typeof page?.body !== 'string' || !page.body.trim()) {
          failures.push({source_url:url,reason:'empty_source'});
          continue;
        }
        pages.push({url:finalUrl,body:page.body.slice(0,250000)});
      } catch (error) {
        // Never serialize raw fetch error strings; providers can include tokens.
        failures.push({source_url:url,reason:safeFailureReason(error)});
      }
    }
    const inspected = inspectRefetchedVenuePages(pages);
    // A network failure or absence of safe known URLs is not evidence that a
    // historically verified venue is invalid. Keep these review lanes distinct.
    const disposition = pages.length ? inspected.status :
      failures.length ? 'all_known_source_fetches_failed' : 'no_safe_known_sources';
    const outcome = Object.freeze({
      opportunity_id:id, fetched:pages.length, failed:failures.length,
      // Potential matches await independent human source/date/venue review.
      disposition, venue_candidate:inspected.location?.value || null,
      verified_venue_geoid:null,needs_human_review:true,
      evidence:inspected.location?.evidence || [], failures,
      review_flags:item.review_flags || []
    });
    outcomes.push(outcome);
    if (onRecord) await onRecord(outcome); // optional operator callback, not automatic D1 writes.
  }
  return Object.freeze({
    attempted:outcomes.length,possible_venue:outcomes.filter(x=>x.disposition==='possible_event_venue_needs_independent_review').length,
    without_venue:outcomes.filter(x=>x.disposition==='venue_not_proven').length,
    fetch_failed_records:outcomes.filter(x=>x.failed>0).length,
    all_sources_failed_records:outcomes.filter(x=>x.disposition==='all_known_source_fetches_failed').length,
    no_safe_known_source_records:outcomes.filter(x=>x.disposition==='no_safe_known_sources').length,
    remaining_queue:Math.max(0,queue.length-selected.length),outcomes,
    caveat:'Operator-only preview. Never automatically re-promote or mark a venue verified.'
  });
}

export function allowedExistingSource(raw) {
  try {
    const u = new URL(String(raw||''));
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    if (u.username || u.password || u.port && !['80','443'].includes(u.port)) return null;
    const host=u.hostname.toLowerCase().replace(/^\[|\]$/g,'');
    if (!host || host==='localhost' || host.endsWith('.local') || host.endsWith('.internal') ||
        host.endsWith('.localhost') || host.endsWith('.test') || host.endsWith('.invalid') ||
        host.endsWith('.example') || host.endsWith('.onion') || /^\d+(?:\.\d+){3}$/.test(host) ||
        host.includes(':') || !host.includes('.')) return null;
    return u.toString();
  } catch {return null}
}

function safeFailureReason(error){
  const message=String(error?.message||'');
  if (message==='private_or_unknown_dns_rejected') return 'private_dns_rejected';
  if (message==='literal_ip_not_allowed'||message==='rejected_source_url') return 'unsafe_url_rejected';
  if (error?.cause?.code==='ENOTFOUND'||error?.cause?.code==='EAI_AGAIN'||['ENOTFOUND','EAI_AGAIN'].includes(error?.code)) return 'dns_unavailable';
  if (message==='findpitches_v2_fetch_too_large') return 'source_exceeds_size_cap';
  if (message==='findpitches_v2_pdf_no_extractable_text') return 'pdf_no_extractable_text';
  if (/^findpitches_v2_fetch_http_(?:403|404|410|429|500|502|503|504)$/.test(message)) return message.replace('findpitches_v2_fetch_','');
  if (error?.name==='AbortError'||error?.name==='TimeoutError') return 'fetch_timeout';
  return 'fetch_failed';
}
