// One-off, read-only private v2 D1 recovery preview. Requires the same GitHub
// Cloudflare secret and account variable used by the bounded PDF replay workflow.
// No D1 writes, no Serper, no promotion, no scheduler changes, no deployments.
import { appendFile, writeFile, readFile, rename } from 'node:fs/promises';
import { classifyVenueEvidence } from '../../platform/findpitches-v2/enrichment/venue-evidence.mjs';
import { fetchPinnedPublicSource } from './pinned-public-fetch.mjs';
import { getUsCustomerVisibleAuditInventory } from '../../platform/findpitches-v2/quality/us-customer-visible-snapshot.mjs';
import { planUsVenueRecovery } from '../../platform/findpitches-v2/quality/us-venue-recovery.mjs';
import { planHistoricalVenueReinspection } from '../../platform/findpitches-v2/quality/us-historical-venue-reinspection.mjs';
import { planUsUnresolvedVenueSweep } from '../../platform/findpitches-v2/quality/us-venue-unresolved-sweep.mjs';
import { runUsVenueRecoveryPreview, allowedExistingSource } from '../../platform/findpitches-v2/quality/us-venue-recovery-runner.mjs';
import { createHttpFetchProvider } from '../../platform/findpitches-v2/providers/fetch/http.mjs';

const API='https://api.cloudflare.com/client/v4';
const DB='6732bcc9-a172-4d38-ad4d-7660ed13392f'; // isolated v2 D1, confirmed by prior audit
const token=process.env.CLOUDFLARE_API_TOKEN;
const account=process.env.CLOUDFLARE_ACCOUNT_ID;
if (!token || !account) throw new Error('cloudflare_account_or_token_not_configured');
const now=new Date();
const MAX_TOTAL_VISIBLE=500;
const BATCH_LIMIT=12;
const BATCH_CLASS=String(process.env.RECOVERY_CLASS||'weak');
if(!['weak','strong','historical','unresolved'].includes(BATCH_CLASS)) throw new Error('invalid_recovery_class');
const BATCH_OFFSET=Number(process.env.RECOVERY_OFFSET||0);
if(!Number.isInteger(BATCH_OFFSET)||BATCH_OFFSET<0||BATCH_OFFSET>240||BATCH_OFFSET%12!==0) throw new Error('invalid_recovery_offset');
const SWEEP_ALL=process.env.RECOVERY_SWEEP==='all';
if(SWEEP_ALL && (BATCH_CLASS!=='unresolved' || BATCH_OFFSET!==0)) throw new Error('unresolved_sweep_requires_zero_offset');
let readQueries=0;
async function query(sql,params) {
  if (!/^\s*SELECT\b/i.test(sql) || /;\s*\S/.test(sql)) throw new Error('read_only_select_required');
  if (++readQueries>150) throw new Error('bounded_d1_query_limit_reached');
  const response=await fetch(API+'/accounts/'+encodeURIComponent(account)+'/d1/database/'+DB+'/query',{
    method:'POST',headers:{Authorization:'Bearer '+token,'content-type':'application/json'},
    body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(20000)
  });
  const body=await response.json();
  if(!response.ok || !body.success || !body.result?.[0]?.success) {
    // Do not print D1 error bodies because they can contain queries or parameters.
    throw new Error('read_only_d1_query_failed_http_'+response.status);
  }
  return body.result[0];
}
const db={prepare(sql){return {bind(...params){return {all:async()=>({
  results:await query(sql,params).then(x=>x.results)
})}}}}};
const audit=await getUsCustomerVisibleAuditInventory(db,{now,pageSize:100});
if(audit.visible.length>MAX_TOTAL_VISIBLE) throw new Error('visible_inventory_above_safe_audit_cap');
const preview=planUsVenueRecovery(audit,{limit:500});
const historicalReviews=JSON.parse(await readFile(new URL('../../platform/findpitches-v2/quality/us-venue-review-2026-09-29.json',import.meta.url),'utf8'));
const historicalIds=new Set(historicalReviews.map(x=>String(x.opportunity_id)));
const followupReviews=JSON.parse(await readFile(new URL('../../platform/findpitches-v2/quality/us-venue-review-2026-09-29-followup.json',import.meta.url),'utf8'));
const followupIds=new Set(followupReviews.records.map(x=>String(x.opportunity_id)));
const unresolvedSweep=planUsUnresolvedVenueSweep(audit,{historicalIds:[...historicalIds],followupIds:[...followupIds]});
const currentlyVisibleHistorical=audit.visible.filter(x=>historicalIds.has(String(x.id)));
function strictStoredVenue(row){try{return classifyVenueEvidence(JSON.parse(row.enrichment_json||'{}').location).accepted;}catch{return false;}}
const historicOverlap={historical_review_ids:historicalIds.size,
  visible_id_overlap:currentlyVisibleHistorical.length,
  strict_stored_evidence_pass:currentlyVisibleHistorical.filter(strictStoredVenue).length,
  strict_stored_evidence_fail_or_absent:currentlyVisibleHistorical.filter(x=>!strictStoredVenue(x)).length,
  revision_match:'not_established_historic_manifest_omits_candidate_revision'};
const historicReinspection=planHistoricalVenueReinspection(audit,historicalReviews,{offset:BATCH_OFFSET,limit:BATCH_LIMIT});
const desired=BATCH_CLASS==='strong'?'stored_explicit_venue_candidate':'needs_source_reinspection';
const items=BATCH_CLASS==='historical' ? historicReinspection.queue :
  BATCH_CLASS==='unresolved' ? (SWEEP_ALL ? unresolvedSweep.queue : unresolvedSweep.queue.slice(BATCH_OFFSET,BATCH_OFFSET+BATCH_LIMIT)) :
  preview.queue.filter(x=>x.status===desired).slice(BATCH_OFFSET,BATCH_OFFSET+BATCH_LIMIT);
const publicSummary={
  snapshot_at:audit.snapshot_at, visible: audit.visible.length,
  historic_manual_review_overlap:historicOverlap,
  historical_reinspection_summary: {
    current_visible_historical:historicReinspection.current_visible_historical,
    missing_from_current_visible:historicReinspection.missing_from_current_visible,
    strict_stored_pass:historicReinspection.strict_stored_pass,
    needs_source_reinspection:historicReinspection.needs_source_reinspection,
    revision_status:'unverified_historic_manifest_has_no_revision_stamps'
  },
  readiness_rejected:audit.readiness_rejected.length,
  unresolved_cohort:unresolvedSweep.selected,
  all_visible_preliminary_text_classification: {
    stored_explicit_venue_candidate:preview.stored_evidence_strong,
    need_source_reinspection:preview.weak_evidence,
    missing_current_enrichment:preview.missing_current_enrichment,
    invalid_enrichment_json:preview.invalid_enrichment_json
  },selected_for_batch:items.length,batch_offset:BATCH_OFFSET,batch_class:BATCH_CLASS,
  full_sweep:SWEEP_ALL,
  note:'This is a bounded live snapshot slice, not the full historical 321-record recovery queue.'
};
// The selected cohort is from one bounded, immutable D1 snapshot. Process
// serially in 12-record checkpoints; never refetch the same batch in this run.
const perHostCount=new Map();
const perHostLast=new Map();
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const provider=createHttpFetchProvider({
  fetchImpl:async(url,options)=>{
    const safe=allowedExistingSource(url);
    if(!safe)throw new Error('rejected_source_url');
    const host=new URL(safe).hostname;
    const count=perHostCount.get(host)||0;
    if(count>=8)throw new Error('source_host_budget_exceeded');
    perHostCount.set(host,count+1);
    const delay=Math.max(0,700-(Date.now()-(perHostLast.get(host)||0)));
    if(delay)await sleep(delay);
    perHostLast.set(host,Date.now());
    return fetchPinnedPublicSource(safe,options);
  },timeoutMs:8000,maxBytes:400000
});
const selectedById=new Map(items.map(item=>[item.opportunity_id,item]));
const allOutcomes=[];
let attempted=0,possible=0,notProven=0,fetchFailures=0,allFailed=0,noSafe=0;
let completedBatches=0;
for(let offset=0;offset<items.length;offset+=BATCH_LIMIT){
  const subset=items.slice(offset,offset+BATCH_LIMIT);
  const outcome=await runUsVenueRecoveryPreview(subset,{
    fetchProvider:provider,limit:BATCH_LIMIT,maxPagesPerRecord:2
  });
  allOutcomes.push(...outcome.outcomes.map(x=>({
      opportunity_id:x.opportunity_id,disposition:x.disposition,
      current_candidate_revision:selectedById.get(x.opportunity_id)?.current_candidate_revision || null,
      historical_revision_match:selectedById.get(x.opportunity_id)?.revision_match || null,
      venue_candidate:x.venue_candidate,verified_venue_geoid:null,
      venue_evidence:x.evidence.map(e=>({source_host:new URL(e.source).hostname,excerpt:String(e.excerpt||'').slice(0,220)})),
      failures:x.failures.map(f=>({source_host:new URL(f.source_url).hostname,reason:f.reason})),
      review_flags:x.review_flags
  })));
  attempted+=outcome.attempted;
  possible+=outcome.possible_venue;
  notProven+=outcome.without_venue;
  fetchFailures+=outcome.fetch_failed_records;
  allFailed+=outcome.all_sources_failed_records;
  noSafe+=outcome.no_safe_known_source_records;
  completedBatches++;
  const report={
    run_at:new Date().toISOString(),read_only:true,database:'isolated_v2',
    status:attempted===items.length?'complete':'partial',
    summary:publicSummary,
    reinspection:{attempted,possible_venue:possible,without_venue:notProven,
      fetch_failed_records:fetchFailures,all_sources_failed_records:allFailed,
      no_safe_known_source_records:noSafe,completed_batches:completedBatches,
      outcomes:allOutcomes},
    limitations:['No automatic GEOID assignment','No D1 writes or promotion',
      'Manual source, date and duplicate review required for every possible venue']
  };
  // An interrupted long sweep still yields a complete JSON checkpoint.
  await writeFile('venue-recovery-preview-private.tmp',JSON.stringify(report,null,2)+'\\n',{mode:0o600});
  await rename('venue-recovery-preview-private.tmp','venue-recovery-preview-private.json');
  console.log('Private US venue recovery batch: '+JSON.stringify({
    snapshot:publicSummary.snapshot_at,kind:BATCH_CLASS,batch:completedBatches,
    attempted,selected:items.length,possible,not_proven:notProven,
    rows_with_fetch_failures:fetchFailures,all_sources_failed:allFailed,
    no_safe_sources:noSafe,d1_queries:readQueries
  }));
}
if(process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY,
  '## FindPitches v2 private US venue recovery\\n\\n'+
  '- Snapshot: '+audit.snapshot_at+'\\n- US code-visible: '+audit.visible.length+
  '\\n- Cohort: '+BATCH_CLASS+'\\n- Selected: '+items.length+
  '\\n- Attempted: '+attempted+'\\n- Candidate statements awaiting human review: '+possible+
  '\\n- Fetched, but venue not proven: '+notProven+
  '\\n- Some source-fetch failures: '+fetchFailures+
  '\\n- All sources failed: '+allFailed+'\\n- No safe source: '+noSafe+
  '\\n\\n**No D1 writes, Serper, promotion or publication.**\\n');
