// Operator-only reconciliation of delivery bookkeeping. No source/identity repairs.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {shadowContext} from './shadow-context.mjs';
import {fetchRechecks} from './producer-delivery.mjs';
export async function verifyRecheckBacklog({credentialsFile,stateDirectory,acknowledgeDelivered=false}) {
  const ctx=await shadowContext({credentialsFile,stateDirectory}),before=await ctx.call('api','/status');
  if(before.customer_rows||before.publication_rows||before.publication_enabled||before.serper.bulk_enabled||before.source_led_programme.policy.manual_paused!==1)throw Error('shadow_only_paid_paused_required');
  if(!before.structured_delivery.rechecks?.pagination_supported)throw Error('recheck_protocol_not_deployed');
  const requests=await fetchRechecks({ingestUrl:ctx.state.urls.ingest,token:ctx.ingestToken,fetcher:ctx.fetcher,probe:true});
  const now=Date.now(),eligible=requests.filter(r=>Date.parse(r.latest_accepted_source_check)>=Date.parse(r.requested_at)&&Date.parse(r.latest_accepted_source_check)<=now),decisions=[];
  if(acknowledgeDelivered)for(const request of eligible) {
    const result=await ctx.call('ingest','/rechecks/ack',{entity_id:request.entity_id,requested_at:request.requested_at,producer_record_id:request.producer_record_id},{ingest:true});
    decisions.push({entity_id:request.entity_id,producer_record_id:request.producer_record_id,requested_at:request.requested_at,...result});
  }
  // An absent exact work token must fail; it cannot clear an unrelated request.
  const invalid=await ctx.call('ingest','/rechecks/ack',{entity_id:'ent_nonexistent_recheck_probe',requested_at:'2099-01-01T00:00:00.000Z',producer_record_id:'nonexistent-producer'},{ingest:true});
  if(invalid.acknowledged)throw Error('invalid_recheck_ack_accepted');
  const after=await ctx.call('api','/status');
  if(after.customer_rows||after.publication_rows||after.publication_enabled||after.commercial.kpis.paid_acquisition_queries!==before.commercial.kpis.paid_acquisition_queries)throw Error('recheck_shadow_integrity_failed');
  const summary={schema:'findpitches-v3-recheck-backlog-verification-v1',as_of:after.now,all_pages_fetched:true,requests_fetched:requests.length,distinct_requested_entities:new Set(requests.map(r=>r.entity_id)).size,
    fresh_accepted_requests_eligible:eligible.length,acknowledgements_attempted:decisions.length,acknowledged:decisions.filter(d=>d.acknowledged).length,invalid_exact_token_refused:true,
    before:before.structured_delivery.rechecks,after:after.structured_delivery.rechecks,serper_queries_added:0,customer_rows:after.customer_rows,publication_rows:after.publication_rows,
    interpretation:'Acknowledgements establish fresh accepted linked delivery, not that the producer explicitly consumed each request, source proof success, or customer READY. Remaining requests are retained; no timestamps fabricated.'};
  fs.writeFileSync(path.join(stateDirectory,'producer-recheck-backlog-verification-private.json'),JSON.stringify({summary,decisions},null,2)+'\n',{mode:0o600});return summary;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2),get=n=>args[args.indexOf(n)+1];
  try {
    if(!args.includes('--credentials')||!args.includes('--state-dir'))throw Error('credentials_and_state_directory_required');
    console.log(JSON.stringify(await verifyRecheckBacklog({credentialsFile:get('--credentials'),stateDirectory:get('--state-dir'),acknowledgeDelivered:args.includes('--ack-delivered')}),null,2));
  }catch(error){console.error(/^[a-z][a-z0-9_]+$/.test(error.message)?error.message:'producer_recheck_backlog_verification_failed');process.exitCode=1;}
}
