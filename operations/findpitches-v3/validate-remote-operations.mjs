import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cloudflareClient,readCredentials,proxyFetch } from './cloudflare-api.mjs';
import { openRemoteD1 } from './remote-d1.mjs';
import { claimJob,heartbeat,finishJob,recoverExpired } from '../../platform/findpitches-v3/jobs.mjs';

function requireCheck(value,label){if(!value)throw new Error(label);}
export async function validateOperations({credentialsFile,stateDirectory}) {
  const state=JSON.parse(fs.readFileSync(path.join(stateDirectory,'resources.json'),'utf8')),secrets=JSON.parse(fs.readFileSync(path.join(stateDirectory,'worker-secrets.json'),'utf8'));
  const api=cloudflareClient(readCredentials(credentialsFile)),db=await openRemoteD1(api,state),fetcher=proxyFetch();
  const checks=[];const check=(value,label)=>{requireCheck(value,label);checks.push(label);};
  const sql=(query,...params)=>db.prepare(query).bind(...params);
  async function call(role,route,body,token=secrets.V3_OPERATOR_TOKEN) {
    const response=await fetcher(state.urls[role]+route,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(30000)});
    return {status:response.status,body:await response.json()};
  }
  check((await call('api','/shadow',undefined,'invalid')).status===401,'shadow_requires_operator_auth');
  check((await call('ingest','/imports',{records:[]},'invalid')).status===401,'import_requires_ingest_auth');
  check((await call('api','/imports',{records:[]},secrets.V3_INGEST_TOKEN)).status!==202,'api_role_cannot_import');
  check((await call('api','/v1/opportunities')).status===403,'publication_api_disabled');
  check((await call('acquisition','/acquisition',{city:'austin-tx',query_limit:1})).body.error==='city_acquisition_disabled','city_acquisition_disabled');
  const fact=await sql('SELECT id,record_id FROM source_facts LIMIT 1').first();requireCheck(fact,'control_facts_required');
  // No-op writes would preserve values even if a guard were missing.
  for(const [query,id,label] of [['UPDATE source_facts SET value_json=value_json WHERE id=?',fact.id,'source_fact_guard'],['UPDATE producer_records SET raw_json=raw_json WHERE id=?',fact.record_id,'source_receipt_guard']]) {
    let blocked=false;try{await sql(query,id).run();}catch{blocked=true;}check(blocked,label);
  }
  const now=new Date().toISOString(),future=new Date(Date.now()+600000).toISOString(),probe='v3_probe_'+crypto.randomUUID();
  const completeId=probe+':lease',deadId=probe+':expiry';
  await sql("INSERT INTO jobs(id,stage,dedupe_key,payload_json,available_at,created_at,updated_at) VALUES (?,'acquisition',?,'{}',?,?,?)",completeId,completeId,future,now,now).run();
  // Future availability avoids competing with the real scheduler during this lease probe.
  const lease=await claimJob(db,'acquisition',{jobId:completeId,now:future});check(lease?.id===completeId,'atomic_claim');
  check(await claimJob(db,'acquisition',{jobId:completeId,now:future})===null,'leased_job_not_claimed_twice');
  await heartbeat(db,lease,{now:future});checks.push('lease_heartbeat');
  let rejected=false;try{await finishJob(db,{...lease,lease_token:'wrong-token'},future);}catch{rejected=true;}check(rejected,'stale_owner_completion_rejected');
  await finishJob(db,lease,future);check((await sql('SELECT status FROM jobs WHERE id=?',completeId).first()).status==='complete','owned_completion');
  const expired=new Date(Date.now()-60000).toISOString();
  await sql("INSERT INTO jobs(id,stage,dedupe_key,payload_json,status,attempts,max_attempts,available_at,lease_until,lease_token,created_at,updated_at) VALUES (?,'acquisition',?,'{}','leased',1,1,?,?,?, ?,?)",deadId,deadId,future,expired,'expired-probe',now,now).run();
  await recoverExpired(db,'acquisition',now);let job=await sql('SELECT * FROM jobs WHERE id=?',deadId).first();check(job.status==='dead'&&job.last_error==='expired_lease_recovered','expired_lease_dead_letter');
  // The disabled city handler is a deterministic failing stage without provider requests.
  await sql('UPDATE jobs SET payload_json=? WHERE id=?',JSON.stringify({city:'austin-tx',query_limit:1,run_id:deadId}),deadId).run();
  check((await call('acquisition','/jobs/requeue',{job_id:deadId})).body.requeued===true,'operator_dead_job_requeue');
  const tick=await call('acquisition','/tick',{limit:1});check(tick.status===200,'deployed_stage_tick');
  job=await sql('SELECT * FROM jobs WHERE id=?',deadId).first();check(job.status==='dead'&&job.last_error==='city_acquisition_disabled','bounded_failure_dead_letter');
  // Retain the diagnostic rows and their report, while clearing the synthetic active fault.
  await call('acquisition','/jobs/requeue',{job_id:deadId});
  await sql('UPDATE jobs SET available_at=? WHERE id=?',future,deadId).run();
  const cleanupLease=await claimJob(db,'acquisition',{jobId:deadId,now:future});requireCheck(cleanupLease,'probe_cleanup_claim');await finishJob(db,cleanupLease,future);
  const leakage=await sql('SELECT (SELECT COUNT(*) FROM customer_projections) AS customer_rows,(SELECT COUNT(*) FROM publication_queue) AS publication_rows,(SELECT COALESCE(SUM(queries_completed),0) FROM acquisition_runs) AS provider_queries').first();
  check(leakage.customer_rows===0&&leakage.publication_rows===0,'no_customer_publication_leakage');check(leakage.provider_queries===0,'no_provider_queries');
  const result={checked_at:new Date().toISOString(),checks,diagnostic_job_ids:[completeId,deadId],...leakage};
  fs.writeFileSync(path.join(stateDirectory,'operations-report.json'),JSON.stringify(result,null,2)+'\n',{mode:0o600});return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2),get=name=>args[args.indexOf(name)+1];
  try{console.log(JSON.stringify(await validateOperations({credentialsFile:get('--credentials'),stateDirectory:get('--state-dir')}),null,2));}
  catch(error){console.error(error.message);process.exitCode=1;}
}
