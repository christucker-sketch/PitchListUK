// Explicit D-017 operator execution. No scheduler, global unpause or V2 access.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
import {shadowContext} from './shadow-context.mjs';import {immutableDigests,sourceMutationCount} from './controlled-pilot.mjs';import {stableJson} from '../../platform/findpitches-v3/contract.mjs';import {ukCampaignMetrics,SOURCE_LED_LIMITS} from '../../platform/findpitches-v3/source-led.mjs';
const digest=r=>createHash('sha256').update(stableJson(r)).digest('hex'),wait=ms=>new Promise(r=>setTimeout(r,ms));
const save=(dir,name,v)=>fs.writeFileSync(path.join(dir,name),JSON.stringify(v,null,2)+'\n',{mode:0o600});
async function identities(db){const result={};let after='';for(;;){const rows=(await db.prepare('SELECT id,market,edition,environment,shadow_only,promotion_eligible,publication_eligible FROM entities WHERE id>? ORDER BY id LIMIT 250').bind(after).all()).results;if(!rows.length)break;for(const r of rows)result[r.id]=stableJson(r);after=rows.at(-1).id;}return result;}
async function custodyGuards(db){
 const triggers=(await db.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger' AND tbl_name IN ('producer_records','source_facts','source_documents','entities','identity_keys','reconciliation_decisions','entity_records','source_verifications','official_source_supersessions') ORDER BY name").all()).results;
 for(const name of ['records_immutable_update','records_immutable_delete','records_no_replace','facts_immutable_update','facts_immutable_delete','facts_no_replace','entity_scope_immutable','entity_market_immutable','entity_no_replace','entity_no_delete','decisions_immutable_update','decisions_immutable_delete'])if(!triggers.some(t=>t.name===name))throw Error('immutable_database_guard_missing');
 const counts=await db.prepare('SELECT (SELECT COUNT(*) FROM producer_records) records,(SELECT COUNT(*) FROM source_facts) facts,(SELECT COUNT(*) FROM entities) entities').first();return {triggers,counts};
}
export async function runUKPaidCampaign({credentialsFile,stateDirectory,outDirectory,baselineFile,maxQueries=25,reason='D-017 UK regional source-led acquisition; operator only',reviewCampaignId=null}) {
 if(!Number.isInteger(maxQueries)||maxQueries<1||maxQueries>25)throw Error('uk_campaign_max_25_required');fs.mkdirSync(outDirectory,{recursive:true,mode:0o700});
 const {db,call}=await shadowContext({credentialsFile,stateDirectory}),initial=await call('api','/status');save(outDirectory,'initial-status-private.json',initial);
 if(initial.customer_rows||initial.publication_rows||initial.publication_enabled||initial.serper.bulk_enabled||initial.serper.limits.queries_per_run!==4||initial.serper.limits.queries_per_hour!==100||initial.serper.limits.queries_per_day!==1000)throw Error('shadow_hard_limits_required');
 const input=baselineFile?JSON.parse(fs.readFileSync(baselineFile)):{immutable:await immutableDigests(db),identities:await identities(db)};
 const original=input.immutable,identityBaseline=Array.isArray(input.identities)?Object.fromEntries(input.identities.map(r=>[r.id,stableJson(r)])):{...input.identities},guards=await custodyGuards(db),subsets={records:{},facts:{}},runs=[];
 if(!original?.records||!original.facts||!Object.keys(identityBaseline).length)throw Error('fixed_original_integrity_baseline_required');
 save(outDirectory,'fixed-original-baseline-private.json',{immutable:original,identities:identityBaseline,guards});
 let campaign=null,stopReason=null,sourceMutations=0,identityChanges=0,lastCounts=guards.counts;
 async function perGrantIntegrity(){
  const current=await custodyGuards(db);if(stableJson(current.triggers)!==stableJson(guards.triggers))throw Error('immutable_database_guard_changed');for(const k of Object.keys(lastCounts))if(current.counts[k]<lastCounts[k])throw Error('evidence_count_decreased');lastCounts=current.counts;
  const next=await identities(db);for(const [id,value] of Object.entries(identityBaseline))if(next[id]!==value)identityChanges++;if(identityChanges)throw Error('identity_integrity_failure');for(const [id,value] of Object.entries(next))if(!(id in identityBaseline))identityBaseline[id]=value;
  if(campaign){
   const ids=(await db.prepare('SELECT DISTINCT er.entity_id FROM uk_paid_campaign_programmes cp JOIN source_led_grants g ON g.programme_id=cp.programme_id JOIN source_led_candidates c ON c.run_id=g.run_id JOIN source_led_candidate_progress p ON p.candidate_id=c.id JOIN entity_records er ON er.record_id=p.record_id WHERE cp.campaign_id=?').bind(campaign.id).all()).results.map(r=>r.entity_id);
   for(const entityId of ids)for(const [key,table] of [['records','producer_records'],['facts','source_facts']]){
    let after='';for(;;){const page=(await db.prepare(`SELECT t.* FROM ${table} t JOIN entity_records er ON er.record_id=${key==='records'?'t.id':'t.record_id'} WHERE er.entity_id=? AND t.id>? ORDER BY t.id LIMIT 250`).bind(entityId,after).all()).results;if(!page.length)break;for(const row of page){const value=digest(row),expected=original[key][row.id]??subsets[key][row.id];if(expected&&expected!==value)sourceMutations++;if(!(row.id in subsets[key]))subsets[key][row.id]=value;}after=page.at(-1).id;}
   }
   if(sourceMutations)throw Error('source_integrity_failure');
  }
  save(outDirectory,'introduced-custody-private.json',{subsets,identities:identityBaseline,counts:lastCounts,source_mutations:sourceMutations,identity_changes:identityChanges});
 }
 await perGrantIntegrity();
 try {
  campaign=await call('acquisition','/source-led/campaign/start',{max_queries:maxQueries,actor:'codex',reason,...reviewCampaignId?{review_campaign_id:reviewCampaignId}:{}});save(outDirectory,'campaign-private.json',campaign);
  while(Date.now()<Date.parse(campaign.expires_at)){
   await perGrantIntegrity();
   const current=await call('acquisition','/source-led/campaign/status'),session=current.sessions.find(s=>s.id===campaign.id);if(session?.status!=='active'){stopReason=session?.stop_reason??'campaign_not_active';break;}
   let child;const admissionDeadline=Date.now()+180000;
   while(!child&&Date.now()<admissionDeadline){try{child=await call('acquisition','/source-led/start',{scope:'uk_campaign',campaign_id:campaign.id,max_queries:4});}catch(e){const row=await db.prepare('SELECT status,stop_reason FROM uk_paid_campaigns WHERE id=?').bind(campaign.id).first();if(row?.status!=='active'){stopReason=row?.stop_reason;break;}if(e.message==='shadow_http_400_uk_campaign_previous_batch_not_settled'){for(const role of ['reconcile','eligibility','enrichment','readiness'])await call(role,'/tick',{});await wait(1500);continue;}throw e;}}
   if(stopReason)break;if(!child){stopReason='uk_verification_settlement_pending';break;}
   save(outDirectory,'children-private.json',[...runs.map(r=>r.programme_id),child]);
   for(let n=0;n<child.max_queries;n++){
    await perGrantIntegrity();let grant;
    try{grant=await call('acquisition','/source-led/next',{programme_id:child.id});}catch(e){const row=await db.prepare('SELECT status,stop_reason FROM uk_paid_campaigns WHERE id=?').bind(campaign.id).first();if(row?.status!=='active'){stopReason=row?.stop_reason;break;}throw e;}
    if(grant.complete||grant.waiting){stopReason=grant.reason;break;}
    save(outDirectory,'dispatch-private.json',{grant,issued_at:new Date().toISOString()});console.log(JSON.stringify({paid_query:runs.length+1,target_region:grant.target_region,targeting_only:true,family:grant.family}));
    // A lost/ambiguous provider reply is never retried. Durable accounting must be reviewed.
    await call('acquisition','/source-led/run',{run_id:grant.run_id});
    const candidates=(await db.prepare("SELECT c.id FROM source_led_candidates c JOIN source_led_candidate_progress p ON p.candidate_id=c.id WHERE c.run_id=? AND p.status='pending' ORDER BY c.position").bind(grant.run_id).all()).results;
    for(const c of candidates){const result=await call('enrichment','/source-led/verify',{candidate_id:c.id});console.log(JSON.stringify({candidate:result.candidate_id,status:result.status,proof:result.proof_status,country:result.actual_country,reasons:result.reasons}));if(result.record_id)await call('reconcile','/tick',{});}
    let settled=false;const deadline=Date.now()+180000;
    while(Date.now()<deadline){for(const role of ['reconcile','eligibility','enrichment','readiness'])await call(role,'/tick',{});const m=await ukCampaignMetrics(db,campaign.id);if(m.customer_rows||m.publication_rows||m.publication_enabled||m.bulk_enabled)throw Error('shadow_scope_leakage');if(m.due_jobs>SOURCE_LED_LIMITS.max_due_jobs||m.oldest_due_seconds>SOURCE_LED_LIMITS.max_oldest_due_seconds)throw Error('verification_backlog');if(!m.pending_candidates&&!m.due_jobs){settled=true;break;}await wait(1500);}
    if(!settled)throw Error('verification_did_not_settle');await perGrantIntegrity();const metrics=await ukCampaignMetrics(db,campaign.id);runs.push({...grant,metrics});save(outDirectory,'progress-private.json',{campaign,runs});console.log(JSON.stringify({queries:metrics.queries,candidates:metrics.candidates,entities:metrics.distinct_entities,ready:metrics.ready_gained,duplicate_rate:metrics.duplicate_rate}));
   }
   if(stopReason)break;await call('acquisition','/source-led/stop',{programme_id:child.id,reason:'operator_complete'});
  }
  stopReason??='campaign_expired';
 }catch(e){stopReason=/^[a-z0-9_]+$/.test(e.message)?e.message:'campaign_operator_outcome_requires_review';}
 finally{if(campaign)await call('acquisition','/source-led/campaign/stop',{campaign_id:campaign.id,reason:stopReason??'operator_stop'});}
 // Full original-record/fact audit after paid authority is closed. First hashes
 // are never overwritten; introduced campaign custody is checked separately.
 await perGrantIntegrity();const full=await immutableDigests(db);sourceMutations+=sourceMutationCount(original,full)+sourceMutationCount(subsets,full);
 if(sourceMutations||identityChanges)throw Error('final_integrity_failure');if(!campaign)throw Error(stopReason??'uk_campaign_start_failed');
 const final=await call('api','/status'),metrics=await ukCampaignMetrics(db,campaign.id),session=await db.prepare('SELECT status,stop_reason,review_required FROM uk_paid_campaigns WHERE id=?').bind(campaign.id).first();save(outDirectory,'final-status-private.json',final);
 const report={schema:'findpitches-v3-uk-paid-campaign-report-v1',as_of:final.now,campaign_id:campaign.id,scope:'UK D-017 only',budget_timezone:'Europe/London',daily_total_paid_cap:25,child_query_cap:4,prior_queries_today:initial.serper.usage.day_queries_attempted,total_paid_queries_today:final.serper.usage.day_queries_attempted,metrics,stop:session,runs,source_mutations:sourceMutations,identity_changes:identityChanges,original_records_fully_verified:Object.keys(original.records).length,original_facts_fully_verified:Object.keys(original.facts).length,campaign_related_records_verified:Object.keys(subsets.records).length,campaign_related_facts_verified:Object.keys(subsets.facts).length,per_grant_integrity:'Pinned immutable trigger SQL, monotonic counts, full identity tuples, original and first-seen campaign-related source hashes. Full original corpus compared again after parent closure.',customer_rows:final.customer_rows,publication_rows:final.publication_rows,publication_enabled:final.publication_enabled,bulk_enabled:final.serper.bulk_enabled,global_limits:final.serper.limits,commercial:final.commercial,queue_health:final.jobs,structured_delivery:final.structured_delivery};
 save(outDirectory,'uk-paid-campaign-report.json',report);if(final.customer_rows||final.publication_rows||final.publication_enabled||final.serper.bulk_enabled)throw Error('final_shadow_scope_leakage');return report;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const a=process.argv.slice(2),get=k=>a.includes(k)?a[a.indexOf(k)+1]:undefined;try{const r=await runUKPaidCampaign({credentialsFile:get('--credentials'),stateDirectory:get('--state-dir'),outDirectory:get('--out-dir'),baselineFile:get('--baseline'),maxQueries:Number(get('--max-queries')??25),reviewCampaignId:get('--review-campaign')??null});console.log(JSON.stringify({queries:r.metrics.queries,ready:r.metrics.ready_gained,stop:r.stop}));}catch(e){console.error(/^[a-z0-9_]+$/.test(e.message)?e.message:'uk_campaign_operator_failed');process.exitCode=1;}}
