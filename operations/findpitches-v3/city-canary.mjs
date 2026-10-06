import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { workerAdmin } from './worker-admin.mjs';
import { proxyFetch } from './cloudflare-api.mjs';

export function readSerperKey(file) {
  const text=fs.readFileSync(file,'utf8');let key;
  try{key=JSON.parse(text).SERPER_API_KEY;}catch{key=text.match(/^\s*(?:export\s+)?SERPER_API_KEY\s*=\s*(.*?)\s*$/m)?.[1]?.replace(/^['"]|['"]$/g,'');}
  if(typeof key!=='string'||key.length<20||key.length>256||/\s/.test(key))throw new Error('secure_serper_key_required');return key;
}
export async function runCityCanary({credentialsFile,stateDirectory,serperFile},{adminFactory=workerAdmin,fetcher=proxyFetch()}={}) {
  const key=serperFile?readSerperKey(serperFile):process.env.SERPER_API_KEY;
  if(key!==undefined&&(typeof key!=='string'||key.length<20||key.length>256||/\s/.test(key)))throw new Error('secure_serper_key_required');
  const admin=await adminFactory({credentialsFile,stateDirectory,role:'acquisition'}),{state,db}=admin;
  if(!key&&!admin.hasSerper)throw new Error('secure_serper_key_required');
  const token=JSON.parse(fs.readFileSync(path.join(stateDirectory,'worker-secrets.json'),'utf8')).V3_OPERATOR_TOKEN;
  const reportFile=path.join(stateDirectory,'city-canary-report.json'),previous=fs.existsSync(reportFile)?JSON.parse(fs.readFileSync(reportFile,'utf8')):null;
  if(previous)throw new Error('existing_canary_requires_review_before_another_run');
  const gate=await db.prepare("SELECT destructive_mutations FROM quality_gates WHERE name='structured-100-preservation' AND tested_records=100").first();
  if(gate?.destructive_mutations!==0)throw new Error('remote_preservation_gate_required');
  const report={schema:'findpitches-city-canary-v1',run_id:'canary_'+crypto.randomUUID(),city:'austin-tx',query_limit:1,started_at:new Date().toISOString(),status:'prepared',bulk_enabled:false,publication_enabled:false};
  const save=()=>fs.writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n',{mode:0o600});save();
  async function post(route,body) {
    const response=await fetcher(state.urls.acquisition+route,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(90000)});
    if(!response.ok)throw new Error('canary_http_'+response.status);return response.json();
  }
  let grantAttempted=false;
  try {
    if(key)await admin.installSerper(key);
    grantAttempted=true;await admin.deploy({canaryRunId:report.run_id,expiresAt:new Date(Date.now()+300000).toISOString()});
    report.status='queued';save();await post('/acquisition/canary',{run_id:report.run_id});await post('/tick',{limit:1});
    const deadline=Date.now()+120000;let run,rows=[],pipelineComplete=false;
    do {
      run=await db.prepare('SELECT * FROM acquisition_runs WHERE id=?').bind(report.run_id).first();
      if(run?.status==='failed')throw new Error('provider_outcome_requires_review');
      if(run?.status==='complete') {
        report.result=JSON.parse(run.result_json);
        const ids=report.result.imported.record_ids??[];
        rows=ids.length?(await db.prepare(`SELECT p.id,p.validation_status,er.entity_id,d.outcome AS identity,r.status AS readiness
          FROM producer_records p LEFT JOIN entity_records er ON er.record_id=p.id LEFT JOIN reconciliation_decisions d ON d.record_id=p.id LEFT JOIN readiness r ON r.entity_id=er.entity_id WHERE p.id IN (${ids.map(()=>'?').join(',')})`).bind(...ids).all()).results:[];
        if(!ids.length||rows.length===ids.length&&rows.every(r=>r.identity&&(r.readiness||!r.entity_id))){pipelineComplete=true;break;}
      }
      await delay(2000);
    }while(Date.now()<deadline);
    if(run?.status!=='complete'||!pipelineComplete)throw new Error('canary_pipeline_timeout');
    const leakage=await db.prepare('SELECT (SELECT COUNT(*) FROM customer_projections) AS customer_rows,(SELECT COUNT(*) FROM publication_queue) AS publication_rows').first();
    if(leakage.customer_rows||leakage.publication_rows)throw new Error('shadow_leakage_detected');
    report.status='complete';report.completed_at=new Date().toISOString();report.pipeline=rows;report.leakage=leakage;
    report.evidence_note='Search snippets retain UNKNOWN application state; readiness is measured, never inferred from a search title.';save();
  } catch(error) {
    report.status='failed';report.error=/^[a-z][a-z0-9_]+$/.test(error.message)?error.message:'city_canary_failed';save();throw new Error(report.error);
  } finally {
    if(grantAttempted) {await admin.deploy();report.grant_revoked_at=new Date().toISOString();save();}
  }
  return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2),get=name=>args[args.indexOf(name)+1];
  try{console.log(JSON.stringify(await runCityCanary({credentialsFile:get('--credentials'),stateDirectory:get('--state-dir'),serperFile:get('--serper-file')}),null,2));}
  catch(error){console.error(/^[a-z][a-z0-9_]+$/.test(error.message)?error.message:'city_canary_failed');process.exitCode=1;}
}
