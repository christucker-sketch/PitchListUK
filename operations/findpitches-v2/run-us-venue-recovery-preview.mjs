// One-off, read-only private v2 D1 recovery preview. Requires the same GitHub
// Cloudflare secret and account variable used by the bounded PDF replay workflow.
// No D1 writes, no Serper, no promotion, no scheduler changes, no deployments.
import { appendFile, writeFile } from 'node:fs/promises';
import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { getUsCustomerVisibleAuditInventory } from '../../platform/findpitches-v2/quality/us-customer-visible-snapshot.mjs';
import { planUsVenueRecovery } from '../../platform/findpitches-v2/quality/us-venue-recovery.mjs';
import { runUsVenueRecoveryPreview, allowedExistingSource } from '../../platform/findpitches-v2/quality/us-venue-recovery-runner.mjs';
import { createHttpFetchProvider } from '../../platform/findpitches-v2/providers/fetch/http.mjs';

const API='https://api.cloudflare.com/client/v4';
const DB='6732bcc9-a172-4d38-ad4d-7660ed13392f'; // isolated v2 D1, confirmed by prior audit
const token=process.env.CLOUDFLARE_API_TOKEN;
const account=process.env.CLOUDFLARE_ACCOUNT_ID;
if (!token || !account) throw new Error('cloudflare_account_or_token_not_configured');
const now=new Date();
const MAX_TOTAL_VISIBLE=10000;
const BATCH_LIMIT=12;
const BATCH_OFFSET=Number(process.env.RECOVERY_OFFSET||0);
if(!Number.isInteger(BATCH_OFFSET)||BATCH_OFFSET<0||BATCH_OFFSET>240||BATCH_OFFSET%12!==0) throw new Error('invalid_recovery_offset');
const blocked=new BlockList();
for(const [network,bits] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.168.0.0',16],['198.18.0.0',15],['224.0.0.0',4],['240.0.0.0',4]]) blocked.addSubnet(network,bits,'ipv4');
for(const [network,bits] of [['::',128],['::1',128],['fc00::',7],['fe80::',10],['ff00::',8],['::ffff:0:0',96]]) blocked.addSubnet(network,bits,'ipv6');
async function assertPublicDns(url){
  const host=new URL(url).hostname;
  if(isIP(host)) throw new Error('literal_ip_not_allowed');
  const addresses=await lookup(host,{all:true,verbatim:true});
  if(!addresses.length||addresses.some(a=>!isIP(a.address)||blocked.check(a.address,a.family===4?'ipv4':'ipv6'))) throw new Error('private_or_unknown_dns_rejected');
}
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
const preview=planUsVenueRecovery(audit,{limit:250});
const items=preview.queue.filter(x=>x.status==='needs_source_reinspection').slice(BATCH_OFFSET,BATCH_OFFSET+BATCH_LIMIT);
const publicSummary={
  snapshot_at:audit.snapshot_at, visible: audit.visible.length,
  readiness_rejected:audit.readiness_rejected.length,
  all_visible_preliminary_text_classification: {
    stored_explicit_venue_candidate:preview.stored_evidence_strong,
    need_source_reinspection:preview.weak_evidence,
    missing_current_enrichment:preview.missing_current_enrichment,
    invalid_enrichment_json:preview.invalid_enrichment_json
  },selected_for_batch:items.length,batch_offset:BATCH_OFFSET,
  note:'Selections are a bounded first slice, not the complete 321-record historical recovery queue.'
};
// Each operator-selected batch refetches up to twelve already known URLs.
// Restrict to public domain names and refuse HTTP redirects; the existing bounded
// provider caps time/bytes/PDF text. The operator must review returned candidates.
const provider=createHttpFetchProvider({
  fetchImpl:async(url,options)=>{
    const safe=allowedExistingSource(url);
    if(!safe)throw new Error('rejected_source_url');
    // Preflight every DNS response; a restricted outbound egress proxy is still
    // required for complete DNS-rebinding protection.
    await assertPublicDns(safe);
    // No redirects (including same-host) for this first preview.
    return fetch(safe,{...options,redirect:'manual'});
  },timeoutMs:8000,maxBytes:400000
});
const outcome=await runUsVenueRecoveryPreview(items,{fetchProvider:provider,limit:BATCH_LIMIT,maxPagesPerRecord:2});
const report={
  run_at:new Date().toISOString(),read_only:true,database:'isolated_v2',
  summary:publicSummary,
  reinspection:{
    attempted:outcome.attempted,possible_venue:outcome.possible_venue,
    without_venue:outcome.without_venue,fetch_failed_records:outcome.fetch_failed_records,
    outcomes:outcome.outcomes.map(x=>({
      opportunity_id:x.opportunity_id,disposition:x.disposition,
      venue_candidate:x.venue_candidate,verified_venue_geoid:null,
      failures:x.failures.map(f=>({reason:f.reason})),review_flags:x.review_flags
    }))
  },limitations:['No automatic venue GEOID assignment','No D1 writes or promotion',
    'Bounded preview only; manual review required for extracted venue candidates']
};
await writeFile('venue-recovery-preview-private.json',JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
console.log('Private US venue recovery preview: '+JSON.stringify({
  snapshot:publicSummary,attempted:outcome.attempted,possible_venue:outcome.possible_venue,
  no_venue:outcome.without_venue,failed_fetch_records:outcome.fetch_failed_records,
  failures_by_reason:Object.fromEntries([...new Set(outcome.outcomes.flatMap(o=>o.failures.map(f=>f.reason)))].map(reason=>[reason,outcome.outcomes.flatMap(o=>o.failures).filter(f=>f.reason===reason).length])),
  d1_queries:readQueries
}));
if(process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY,
  '## FindPitches v2 private venue recovery preview\n\n'+
  '- Snapshot: '+audit.snapshot_at+'\n- US code-visible: '+audit.visible.length+
  '\n- Batch offset: '+BATCH_OFFSET+
  '\n- Batch refetched: '+outcome.attempted+'\n- Possible venues needing manual review: '+outcome.possible_venue+
  '\n- No venue confirmed: '+outcome.without_venue+
  '\n- Rows with fetch failures: '+outcome.fetch_failed_records+
  '\n\n**No writes, no GEOID assignment, no deployment or scheduler changes.**\n');
