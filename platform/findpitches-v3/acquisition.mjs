import { EXPORT_SCHEMA,hash,stableJson,publicHttps } from './contract.mjs';
import { ingestRecords,sql } from './store.mjs';
import {budgetDay,serperPolicy,reserveSerperQuery,observeSerperCredits,attributeSerperRecords} from './serper-usage.mjs';

// One independent producer boundary. No V2 runtime imports or generic national sweep.
export const CITY = Object.freeze({ id:'austin-tx',name:'Austin',region:'TX',market:'US' });
export function cityQueries(city=CITY.id) {
  if(city!==CITY.id)throw new Error('city_not_approved');
  return ['"Austin" "vendor application" market','"Austin" "craft fair" vendors apply','"Austin" "festival" "vendor registration"','"Austin" "farmers market" "vendor application"'];
}
export function canaryApproved(env,runId,now=new Date().toISOString()) {
  return /^canary_[a-f0-9-]{36}$/.test(runId??'')&&env.V3_CANARY_RUN_ID===runId
    && Number.isFinite(Date.parse(env.V3_CANARY_EXPIRES_AT))&&Date.parse(now)<=Date.parse(env.V3_CANARY_EXPIRES_AT);
}
export async function normalizeCityResults(results,{query,now=new Date().toISOString()}={}) {
  const records=[];
  for(const item of results.slice(0,10)) {
    if(typeof item.title!=='string'||!item.title.trim()||!publicHttps(item.link))continue;
    records.push({schema_version:EXPORT_SCHEMA,opportunity_id:'city_'+(await hash([CITY.id,item.link])).slice(0,32),country_code:CITY.market,region_code:CITY.region,
      event_name:item.title.slice(0,4000),location:CITY.name,canonical_url:item.link,application_url:null,application_state:'UNKNOWN',lifecycle_event:'NEW',
      source_platform:'serper',first_seen:now,last_seen:now,last_checked:now,
      evidence:[{source:item.link,query,snippet:String(item.snippet??'').slice(0,4000),kind:'search_snippet'}],provenance:[{producer:'city-search',city:CITY.id,query}],
    });
  }
  return records;
}
export async function acquireCity(db,payload,env,{fetcher=fetch,now,clock=()=>new Date(),runId=crypto.randomUUID()}={}) {
  const timestamp=()=>now??clock().toISOString(),started=timestamp();
  const prior=await sql(db,'SELECT * FROM acquisition_runs WHERE id=?',runId).first();
  if(prior) {
    if(prior.status==='complete')return JSON.parse(prior.result_json);
    throw new Error('acquisition_outcome_requires_operator_review');
  }
  const canary=payload.canary===true;
  if(canary&&(!canaryApproved(env,runId,started)||payload.run_id!==runId||payload.query_limit!==1))throw new Error('one_shot_canary_not_authorized');
  const queries=cityQueries(payload.city),count=Number(payload.query_limit),policy=await serperPolicy(db);
  if(!canary&&(env.V3_CITY_ENABLED!=='true'||policy.bulk_enabled!==1))throw new Error('city_acquisition_disabled');
  if(!env.SERPER_API_KEY)throw new Error('search_credential_required');
  if(Number(env.V3_DAILY_QUERY_LIMIT)!==1000||!Number.isInteger(count)||count<1||count>queries.length)throw new Error('explicit_bounded_query_budget_required');
  if(count>policy.max_queries_per_run||count>policy.max_credits_per_run)throw Error('serper_run_query_limit_exceeded');
  const gate=await sql(db,"SELECT name FROM quality_gates WHERE name='structured-100-preservation' AND tested_records=100 AND destructive_mutations=0").first();
  if(!gate)throw new Error('structured_preservation_gate_required');
  await sql(db,`INSERT INTO acquisition_runs(id,city,day,queries_reserved,status,created_at,updated_at)
    VALUES (?,?,?,?,'reserved',?,?)`,runId,CITY.id,budgetDay(started),count,started,started).run();
  let completed=0,discovered=0,usageId=null;
  const imported={accepted:0,inserted:0,rejected:0,duplicates:0,record_ids:[],new_record_ids:[],errors:[]};
  const result=()=>({run_id:runId,city:CITY.id,queries:completed,discovered,imported});
  try {
    for(let index=0;index<count;index++) {
      const query=queries[index],at=timestamp();
      usageId=await reserveSerperQuery(db,{runId,index,query,market:CITY.market,region:CITY.region,now:at});
      await sql(db,"UPDATE serper_usage SET status='dispatched',queries_attempted=1,dispatched_at=? WHERE id=?",timestamp(),usageId).run();
      const response=await fetcher('https://google.serper.dev/search',{method:'POST',headers:{'X-API-KEY':env.SERPER_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({q:query,gl:'us',num:10}),signal:AbortSignal.timeout(20000)});
      await sql(db,'UPDATE serper_usage SET http_status=? WHERE id=?',response.status,usageId).run();
      const raw=await response.text();if(raw.length>1048576)throw new Error('search_response_size_limit');
      let body;try{body=JSON.parse(raw);}catch{throw Error(response.ok?'search_response_invalid':'search_provider_http_'+response.status);}
      const excessCharge=await observeSerperCredits(db,usageId,body.credits,timestamp());
      if(!response.ok)throw new Error('search_provider_http_'+response.status);
      const records=await normalizeCityResults(Array.isArray(body.organic)?body.organic:[],{query,now:at});
      completed++;discovered+=records.length;
      // Persist each successful query before making another paid request.
      const receipt=records.length?await ingestRecords(db,records,{producer:'city-search',environment:'shadow',now:timestamp()}):null;
      if(receipt) {
        for(const key of ['accepted','inserted','rejected','duplicates'])imported[key]+=receipt[key];
        for(const key of ['record_ids','new_record_ids','errors'])imported[key].push(...receipt[key]);
        await attributeSerperRecords(db,{runId,usageId,recordIds:receipt.record_ids,newRecordIds:receipt.new_record_ids,now:timestamp()});
      }
      await sql(db,"UPDATE serper_usage SET status='complete',queries_completed=1,candidates_produced=?,candidates_imported=?,completed_at=? WHERE id=?",records.length,receipt?.accepted??0,timestamp(),usageId).run();
      await sql(db,'UPDATE acquisition_runs SET queries_completed=?,result_json=?,updated_at=? WHERE id=?',completed,stableJson(result()),timestamp(),runId).run();
      usageId=null;
      if(excessCharge)throw Error('serper_credit_charge_requires_operator_review');
    }
    await sql(db,"UPDATE acquisition_runs SET status='complete',result_json=?,updated_at=? WHERE id=?",stableJson(result()),timestamp(),runId).run();
    return result();
  } catch(error) {
    const label=/^(search_provider_http_\d+|serper_[a-z_]+)$/.test(error.message)?error.message:'city_acquisition_failed_review_required';
    if(usageId)await sql(db,"UPDATE serper_usage SET status='failed',error_code=?,completed_at=? WHERE id=?",label,timestamp(),usageId).run();
    await sql(db,"UPDATE acquisition_runs SET status='failed',queries_completed=?,result_json=?,updated_at=? WHERE id=?",completed,stableJson(result()),timestamp(),runId).run();
    throw new Error(label);
  }
}
