// Read-only market intake/proof attribution. Never persists receipts, source
// excerpts, entity IDs, contact destinations, customer data or credentials.
import fs from 'node:fs';import path from 'node:path';import {parseArgs} from 'node:util';import {fileURLToPath} from 'node:url';
import {shadowContext} from './shadow-context.mjs';
import {commercialRows,commercialEntity} from '../../platform/findpitches-v3/commercial.mjs';
import {marketOf,readCatalogue} from '../../platform/findpitches-v3/customer-catalogue.mjs';
import {PRODUCERS} from '../../platform/findpitches-v3/contract.mjs';

// Rank deliveries before selecting the market: an old FR receipt must not be
// described as the latest delivery if that producer ID later changed country.
export const LATEST_MARKET_DELIVERIES_SQL=`WITH deliveries AS (
 SELECT producer_name,producer_record_id,market,validation_status,errors_json,
 ROW_NUMBER() OVER(PARTITION BY producer_name,producer_record_id ORDER BY received_at DESC,id DESC) AS rank
 FROM producer_records WHERE environment='shadow'
) SELECT producer_name,validation_status,errors_json FROM deliveries WHERE rank=1 AND market=? LIMIT 5001`;
const code=value=>typeof value==='string'&&/^[a-z][a-z0-9_]{0,95}$/.test(value)?value:'unclassified_reason';
const add=(out,key)=>{out[key]=(out[key]??0)+1;};
const producer=value=>Object.hasOwn(PRODUCERS,value)?value:'unrecognized_producer';
export function marketProofSummary({market,now,receipts,latestDeliveries,rows,customerRows,transport}) {
 marketOf(market);if(latestDeliveries.length>5000||rows.length>5000)throw Error('market_report_capacity_exceeded');
 const all=rows.map(r=>commercialEntity(r,now)),commercial=all.filter(r=>r.commercial),readyIds=new Set(customerRows.filter(r=>r.market===market).map(r=>r.id));
 const latest={},validationReasons={},proofReasons={},proofStatus={},families={},domains={},readyByProducer={};
 for(const r of latestDeliveries){const key=producer(r.producer_name);latest[key]??={accepted:0,rejected:0};add(latest[key],r.validation_status);
  let errors;try{errors=JSON.parse(r.errors_json);}catch{errors=['unclassified_reason'];}for(const reason of new Set(Array.isArray(errors)?errors:['unclassified_reason']))add(validationReasons,code(reason));
 }
 for(const row of commercial){add(proofStatus,row.proof_sequence?code(row.proof_status):'awaiting_verification');
  if(!readyIds.has(row.id)){for(const reason of new Set(row.reasons))add(proofReasons,code(reason));
   if(row.ready)add(proofReasons,'not_in_current_customer_snapshot');
   if(row.awaiting_verification)add(proofReasons,'awaiting_current_verification');
   if(row.stale_expired)add(proofReasons,'stale_or_expired');if(row.quality_holds)add(proofReasons,'quality_hold');if(row.conflicts)add(proofReasons,'unresolved_conflict');
   if(row.producer_upcoming_not_open)add(proofReasons,'producer_applications_not_open_yet');
  }
  const family=code(row.proof.profile??'unverified'),domain=/^[a-z0-9.-]{1,253}$/.test(row.domain)?row.domain:'unclassified';
  for(const [target,key] of [[families,family],[domains,domain]]){target[key]??={entities:0,customer_ready:0};target[key].entities++;target[key].customer_ready+=Number(readyIds.has(row.id));}
  if(readyIds.has(row.id))add(readyByProducer,producer(row.origin));
 }
 const count=predicate=>commercial.filter(predicate).length;
 return {schema:'findpitches-v3-market-proof-report-v1',as_of:now,market,state:!receipts.length&&!commercial.length&&!readyIds.size?'awaiting_first_delivery':'intake_observed',
  immutable_receipts:receipts.map(r=>({...r,producer_name:producer(r.producer_name)})),latest_delivery_units:latest,validation_reason_counts:validationReasons,
  commercial_entities:commercial.length,excluded_test_entities:all.filter(r=>r.environment==='test').length,excluded_other_entities:all.length-commercial.length-all.filter(r=>r.environment==='test').length,
  current_customer_ready:readyIds.size,ready_by_origin_producer:readyByProducer,unattributed_ready_entities:readyIds.size-commercial.filter(r=>readyIds.has(r.id)).length,proof_status:proofStatus,
  verification:{verified:count(r=>r.verified),awaiting_current:count(r=>r.awaiting_verification),watch:count(r=>r.watch),quarantined:count(r=>r.quarantined),blocked:count(r=>r.blocked),stale_or_expired:count(r=>r.stale_expired),missing_application_proof:count(r=>r.missing_application_proof)},
  held_reason_counts:proofReasons,source_families:families,source_domains:domains,transport,
  read_only:true,original_source_or_identity_writes:0,source_gets:0,serper_queries:0,
  interpretation:'Receipts are immutable versions; latest delivery units use transport time, not proof/source-clock authority. Customer READY comes from the current scoped catalogue after producer-policy, identity, proof and expiry gates. These are sequential live reads, not an atomic database snapshot; not_in_current_customer_snapshot can reflect producer-policy/time gates or concurrent changes and is not an inferred root cause. Verification flags/reasons can overlap. No arrival, READY gain or source-fetch execution is inferred from a producer switch.'};
}
export async function marketProofReport(ctx,{market,now=new Date().toISOString(),customerRows}) {
 marketOf(market);
 const receipts=(await ctx.db.prepare("SELECT producer_name,validation_status,COUNT(*) receipts,COUNT(DISTINCT producer_record_id) producer_ids,MIN(received_at) first_received_at,MAX(received_at) last_received_at FROM producer_records WHERE environment='shadow' AND market=? GROUP BY producer_name,validation_status").bind(market).all()).results;
 const latestDeliveries=(await ctx.db.prepare(LATEST_MARKET_DELIVERIES_SQL).bind(market).all()).results;
 const n=await ctx.db.prepare('SELECT COUNT(*) AS n FROM entities WHERE market=?').bind(market).first();if(n.n>5000)throw Error('market_report_capacity_exceeded');
 const rows=await commercialRows(ctx.db,{market});
 const contacts=(await ctx.db.prepare("SELECT received_at FROM structured_delivery_contacts WHERE environment='shadow' AND kind='rechecks' ORDER BY received_at DESC LIMIT 4").all()).results;
 const batch=await ctx.db.prepare("SELECT received_at,records,accepted,inserted,duplicates,rejected,source_last_checked FROM structured_delivery_contacts WHERE environment='shadow' AND kind='import' ORDER BY received_at DESC LIMIT 1").first();
 const transport={last_authenticated_poll:contacts[0]?.received_at??null,recent_poll_intervals_seconds:contacts.slice(1).map((r,i)=>(Date.parse(contacts[i].received_at)-Date.parse(r.received_at))/1000),last_import_batch:batch,scope:'Global structured transport; an import batch is not proof that a complete FR export was delivered.'};
 return marketProofSummary({market,now,receipts,latestDeliveries,rows,customerRows,transport});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const {values}=parseArgs({options:{'credentials-file':{type:'string'},'state-dir':{type:'string'},market:{type:'string'},output:{type:'string'}}});
 if(!values.output)throw Error('output_path_required');marketOf(values.market);
 const ctx=await shadowContext({credentialsFile:values['credentials-file'],stateDirectory:values['state-dir']}),secrets=JSON.parse(fs.readFileSync(path.join(values['state-dir'],'worker-secrets.json'))),now=new Date().toISOString();
 const snapshot=await readCatalogue({V3_STAGING_TOKEN:secrets.V3_STAGING_TOKEN,V3_READY_API:{fetch:(url,init)=>{const u=new URL(url);return ctx.fetcher(ctx.state.urls.api+u.pathname+u.search,{...init,signal:AbortSignal.timeout(45000)});}}},now,{market:values.market});
 const report=await marketProofReport(ctx,{market:values.market,now,customerRows:snapshot.rows});
 report.customer_snapshot_as_of=snapshot.as_of;report.producer_policy_withheld=snapshot.producer_policy_withheld;report.private_catalogue_gets=1;report.completed_at=new Date().toISOString();
 fs.writeFileSync(values.output,JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(report));
}
