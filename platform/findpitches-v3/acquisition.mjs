import { EXPORT_SCHEMA,hash,stableJson,publicHttps } from './contract.mjs';
import { ingestRecords,sql } from './store.mjs';

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
export async function acquireCity(db,payload,env,{fetcher=fetch,now=new Date().toISOString(),runId=crypto.randomUUID()}={}) {
  const prior=await sql(db,'SELECT * FROM acquisition_runs WHERE id=?',runId).first();
  if(prior) {
    if(prior.status==='complete')return JSON.parse(prior.result_json);
    // Never automatically repeat a provider request whose billing outcome is uncertain.
    throw new Error('acquisition_outcome_requires_operator_review');
  }
  const canary=payload.canary===true;
  if(canary&&(!canaryApproved(env,runId,now)||payload.run_id!==runId||payload.query_limit!==1))throw new Error('one_shot_canary_not_authorized');
  const queries=cityQueries(payload.city),budget=canary?1:Number(env.V3_DAILY_QUERY_LIMIT),count=Number(payload.query_limit);
  if(!canary&&env.V3_CITY_ENABLED!=='true')throw new Error('city_acquisition_disabled');
  if(!env.SERPER_API_KEY)throw new Error('search_credential_required');
  if(!Number.isInteger(budget)||budget<1||budget>100||!Number.isInteger(count)||count<1||count>queries.length)throw new Error('explicit_bounded_query_budget_required');
  const gate=await sql(db,"SELECT name FROM quality_gates WHERE name='structured-100-preservation' AND tested_records=100 AND destructive_mutations=0").first();
  if(!gate)throw new Error('structured_preservation_gate_required');
  const reserved=await sql(db,`INSERT INTO acquisition_runs(id,city,day,queries_reserved,status,created_at,updated_at)
    SELECT ?,?,?,?,'reserved',?,? WHERE COALESCE((SELECT SUM(queries_reserved) FROM acquisition_runs WHERE day=?),0)+?<=?`,runId,CITY.id,now.slice(0,10),count,now,now,now.slice(0,10),count,budget).run();
  if(Number(reserved.meta?.changes)!==1)throw new Error('daily_query_budget_exhausted');
  let completed=0;const records=[];
  try {
    for(const query of queries.slice(0,count)) {
      const response=await fetcher('https://google.serper.dev/search',{method:'POST',headers:{'X-API-KEY':env.SERPER_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({q:query,gl:'us',num:10}),signal:AbortSignal.timeout(20000)});
      if(!response.ok)throw new Error('search_provider_http_'+response.status);
      const raw=await response.text();if(raw.length>1048576)throw new Error('search_response_size_limit');
      const body=JSON.parse(raw);
      records.push(...await normalizeCityResults(Array.isArray(body.organic)?body.organic:[],{query,now}));
      completed++;
      await sql(db,'UPDATE acquisition_runs SET queries_completed=?,updated_at=? WHERE id=?',completed,now,runId).run();
    }
    const imported=records.length?await ingestRecords(db,records,{producer:'city-search',environment:'shadow',now}):{accepted:0,inserted:0,rejected:0};
    const result={run_id:runId,city:CITY.id,queries:completed,discovered:records.length,imported};
    await sql(db,"UPDATE acquisition_runs SET status='complete',result_json=?,updated_at=? WHERE id=?",stableJson(result),now,runId).run();
    return result;
  } catch(error) {
    await sql(db,"UPDATE acquisition_runs SET status='failed',queries_completed=?,updated_at=? WHERE id=?",completed,now,runId).run();
    // Provider errors might echo API keys. Retain only our controlled error labels.
    throw new Error(/^search_provider_http_\d+$/.test(error.message)?error.message:'city_acquisition_failed_review_required');
  }
}
