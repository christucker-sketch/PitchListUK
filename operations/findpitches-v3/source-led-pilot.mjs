// Operator-run, bounded shadow pilot. No standing paid scheduler or V2 access.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {shadowContext} from './shadow-context.mjs';
import {immutableDigests,sourceMutationCount} from './controlled-pilot.mjs';
import {stableJson} from '../../platform/findpitches-v3/contract.mjs';
import {sourceLedMetrics,SOURCE_LED_LIMITS} from '../../platform/findpitches-v3/source-led.mjs';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function identitySnapshot(db){const rows=(await db.prepare('SELECT id,market,edition,environment,shadow_only,promotion_eligible,publication_eligible FROM entities ORDER BY id').all()).results;return Object.fromEntries(rows.map(r=>[r.id,stableJson(r)]));}
export async function runSourceLedPilot({credentialsFile,stateDirectory,outDirectory,maxQueries=25}) {
 fs.mkdirSync(outDirectory,{recursive:true,mode:0o700});
 const {db,call}=await shadowContext({credentialsFile,stateDirectory}),initial=await call('api','/status');
 const save=(name,value)=>fs.writeFileSync(path.join(outDirectory,name),JSON.stringify(value,null,2)+'\n',{mode:0o600});
 save('initial-status-private.json',initial);
 if(initial.customer_rows||initial.publication_rows||initial.publication_enabled||initial.serper.bulk_enabled||initial.serper.limits.queries_per_run!==4||initial.serper.limits.queries_per_hour!==100||initial.serper.limits.queries_per_day!==1000)throw Error('shadow_limits_required');
 const baseline=await immutableDigests(db),identities=await identitySnapshot(db);save('integrity-baseline-private.json',baseline);save('identity-baseline-private.json',identities);
 let programme=null,reason=null,mutations=0,identityChanges=0;const runs=[];
 async function integrity(){const current=await immutableDigests(db);mutations=Math.max(mutations,sourceMutationCount(baseline,current));Object.assign(baseline.records,current.records);Object.assign(baseline.facts,current.facts);const next=await identitySnapshot(db);for(const [id,value] of Object.entries(identities))if(next[id]!==value)identityChanges++;Object.assign(identities,next);if(mutations||identityChanges)throw Error('source_integrity_failure');}
 try {
  programme=await call('acquisition','/source-led/start',{max_queries:maxQueries});save('programme-private.json',programme);
  while(Date.now()<Date.parse(programme.expires_at)) {
   let grant;
   try{grant=await call('acquisition','/source-led/next',{programme_id:programme.id});}
   catch(error){const state=await db.prepare('SELECT status,stop_reason FROM source_led_programmes WHERE id=?').bind(programme.id).first();if(state?.status==='paused'){reason=state.stop_reason;break;}throw error;}
   if(grant.complete){reason=grant.reason;break;}
   if(grant.waiting){reason=grant.reason;break;}
   console.log(JSON.stringify({run:runs.length+1,target_country:grant.market,query_limit:1}));
   await call('acquisition','/source-led/run',{run_id:grant.run_id});
   const candidates=(await db.prepare("SELECT p.candidate_id FROM source_led_candidate_progress p JOIN source_led_candidates c ON c.id=p.candidate_id WHERE c.run_id=? AND p.status='pending' ORDER BY c.position").bind(grant.run_id).all()).results;
   for(const c of candidates){const verified=await call('enrichment','/source-led/verify',{candidate_id:c.candidate_id});console.log(JSON.stringify({candidate:verified.candidate_id,status:verified.status,country:verified.actual_country,proof:verified.proof_status}));if(verified.record_id)await call('reconcile','/tick',{});}
   const deadline=Date.now()+120000;let settled=false;
   while(Date.now()<deadline){
    for(const role of ['reconcile','eligibility','enrichment','readiness'])await call(role,'/tick',{});
    const m=await sourceLedMetrics(db,programme.id);
    if(m.customer_rows||m.publication_rows||m.publication_enabled||m.bulk_enabled)throw Error('shadow_scope_leakage');
    if(m.oldest_due_seconds>SOURCE_LED_LIMITS.max_oldest_due_seconds||m.due_jobs>SOURCE_LED_LIMITS.max_due_jobs)throw Error('verification_backlog');
    if(!m.pending_candidates&&!m.due_jobs){settled=true;break;}await sleep(1000);
   }
   if(!settled)throw Error('verification_did_not_settle');
   // Deep custody check before authorising the next paid query; new facts are added to the baseline.
   await integrity();
   const m=await sourceLedMetrics(db,programme.id);runs.push({...grant,metrics:m});save('progress-private.json',{programme_id:programme.id,runs});console.log(JSON.stringify({queries:m.queries,ready_gained:m.ready_gained,candidates:m.candidates,duplicates:m.duplicate_rate}));
  }
  reason??='programme_expired';
 } catch(error){reason=/^[a-z0-9_]+$/.test(error.message)?error.message:'operator_outcome_requires_review';}
 finally{if(programme)await call('acquisition','/source-led/stop',{programme_id:programme.id,reason:reason??'operator_stop'});}
 await integrity();if(!programme)throw Error(reason??'source_led_start_failed');
 const final=await call('api','/status');save('final-status-private.json',final);
 const session=final.source_led_programme.sessions.find(s=>s.id===programme.id),m=session.metrics;
 const recommendation=m.ready_gained&&m.ready_per_100_queries>=10&&!m.false_ready_promotions_detected?'Keep the 25/day total cap for further operator-run country-balanced validation; do not increase yet.':'Keep paid acquisition paused (0/day effective) pending source/application verification improvements.';
 const report={schema:'findpitches-v3-source-led-pilot-report-v1',as_of:final.now,programme_id:programme.id,budget_timezone:'Europe/London',budget_day:session.budget_day,daily_total_paid_cap:final.source_led_programme.policy.daily_query_limit,queries_per_market:final.source_led_programme.policy.queries_per_market,prior_queries_today:initial.serper.usage.day_queries_attempted,paid_queries_used_this_pilot:m.queries,total_paid_queries_today:final.serper.usage.day_queries_attempted,observed_credits:m.observed_credits,
  metrics:m,stop_status:session.status,stop_reason:session.stop_reason??reason,policy:final.source_led_programme.policy,global_limits:final.serper.limits,source_mutations:mutations,identity_changes:identityChanges,customer_leakage:final.customer_rows,publication_leakage:final.publication_rows,publication_enabled:final.publication_enabled,bulk_enabled:final.serper.bulk_enabled,commercial_inventory:final.commercial,structured_delivery:final.structured_delivery,structured_host:'Raspberry Pi installation/delivery remains an external dependency; structured receipts and direct verification retain priority.',pricing_status:final.serper.pricing_status,runs,queue_health:final.jobs,immutable_records_verified:Object.keys(baseline.records).length,immutable_fields_verified:Object.keys(baseline.facts).length,recommendation};
 save('source-led-pilot-report.json',report);if(mutations||identityChanges||final.customer_rows||final.publication_rows)throw Error('final_integrity_or_leakage_failed');return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),get=name=>args[args.indexOf(name)+1];
 try{const r=await runSourceLedPilot({credentialsFile:get('--credentials'),stateDirectory:get('--state-dir'),outDirectory:get('--out-dir')});console.log(JSON.stringify({queries:r.paid_queries_used_this_pilot,ready:r.metrics.ready_gained,stop_reason:r.stop_reason}));}
 catch(error){console.error(/^[a-z0-9_]+$/.test(error.message)?error.message:'source_led_operator_failed');process.exitCode=1;}
}
