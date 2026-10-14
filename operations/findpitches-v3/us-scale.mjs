// Manual, bounded free source experiments. No paid search or standing scheduler.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath}from'node:url';
import {shadowContext}from'./shadow-context.mjs';
import {decodeSourceDocument}from'../../platform/findpitches-v3/document-custody.mjs';import {verifyDocument}from'../../platform/findpitches-v3/verification.mjs';
import {sourceUSState}from'../../platform/findpitches-v3/source-coordinates.mjs';import {hash,stableJson}from'../../platform/findpitches-v3/contract.mjs';
import {assertFreeGrowth}from'./inventory-scale.mjs';import {catalogueGrowthStop}from'./catalogue-growth.mjs';
const wait=ms=>new Promise(r=>setTimeout(r,ms));const save=(dir,name,d)=>fs.writeFileSync(path.join(dir,name),JSON.stringify(d,null,2)+'\n',{mode:0o600});
export function failureBucket(reasons=[]) {
 const s=reasons.join(',');return /robots|source_http_40[13]|source_http_429|challenge|source_fetch_failed/.test(s)?'source_blocked':/identity|edition|contradictory|selected_.*disagrees/.test(s)?'identity_edition_ambiguity':/past_event|past_source|deadline_passed|application_closed/.test(s)?'stale_closed':/outside_operator_scope/.test(s)?'out_of_market':/country|market|geography/.test(s)?'geography_insufficient':/trader|restricted_audience|non_trader/.test(s)?'trader_relevance_or_audience':/route|application_not_proved|waitlist/.test(s)?'no_current_usable_route':/single_event|structured_source|content_scope/.test(s)?'source_extraction_or_event_identity':/date/.test(s)?'no_current_date_proof':'other_hold';
}
export function armScore(m) {
 const visits=m.source_requests_observed??m.checked??0,ready=m.net_new_ready??0,duplicates=m.duplicates??0;
 return Number((100*ready/Math.max(1,visits)+2*(m.new_organisers??0)+(m.new_venue_strings??0)+3*(m.new_states??0)-10*duplicates/Math.max(1,m.candidates??1)-5*(m.blocked??0)/Math.max(1,visits)).toFixed(4));
}
export function allocateArms(total=50){if(!Number.isInteger(total)||total<1||total>100)throw Error('bounded_batch_1_to_100_required');const exploit=Math.floor(total*.7);return {exploit,explore:total-exploit};}
export function rankArms(experiments) {
 const metrics=new Map();for(const experiment of experiments)for(const arm of experiment.arms){
  const prior=metrics.get(arm.arm)??{arm:arm.arm,candidates:0,source_requests_observed:0,net_new_ready:0,new_organisers:0,new_venue_strings:0,new_states:0,duplicates:0,blocked:0,zero_batches:0};
  for(const key of ['candidates','source_requests_observed','net_new_ready','new_organisers','new_venue_strings','new_states','duplicates','blocked'])prior[key]+=arm[key]??0;
  if(arm.checked>=20&&!arm.net_new_ready)prior.zero_batches++;metrics.set(arm.arm,prior);
 }
 return [...metrics.values()].map(m=>({...m,score:armScore(m),paused:m.zero_batches>=2})).sort((a,b)=>b.score-a.score||a.arm.localeCompare(b.arm));
}
export async function recordExperiment(db,record) {
 const id='doc_'+(await hash(['us_source_experiment',record.experiment_id,record.phase])).slice(0,40),text=stableJson(record),digest=await hash(text);
 const prior=await db.prepare('SELECT document_json,content_hash FROM source_documents WHERE id=?').bind(id).first();
 if(prior){if(prior.document_json!==text||prior.content_hash!==digest)throw Error('immutable_experiment_conflicting_replay');return {id,replay:true};}
 await db.prepare('INSERT OR IGNORE INTO source_documents VALUES (?,?,?,?,?)').bind(id,'https://www.eventeny.com/sitemap/event_elements.xml',digest,record.recorded_at,text).run();
 return {id,replay:false};
}
const tally=(rows,key)=>rows.reduce((o,r)=>(o[key(r)]=(o[key(r)]??0)+1,o),{});
const group=r=>stableJson([r.country,r.title,r.event_start,r.event_end,r.organiser,r.location]);
async function healthy(db){const n=await db.prepare("SELECT COUNT(*) n FROM jobs WHERE stage IN ('reconcile','eligibility','enrichment','readiness') AND ((status='ready' AND available_at<=?) OR status IN ('leased','dead'))").bind(new Date().toISOString()).first();return n.n;}
export async function runUSScale({credentialsFile,stateDirectory,outDirectory,seeds=[],maxBatches=6,netTarget=100,baselineFile=null,priorExperimentsFile=null}) {
 if(!Number.isInteger(maxBatches)||maxBatches<1||maxBatches>6||!Number.isInteger(netTarget)||netTarget<1||netTarget>500)throw Error('bounded_us_scale_required');
 fs.mkdirSync(outDirectory,{recursive:true,mode:0o700});const c=await shadowContext({credentialsFile,stateDirectory}),initial=await c.call('api','/status');assertFreeGrowth(initial);
 if(await healthy(c.db)>40)throw Error('us_scale_initial_queue_not_clear');
 const start=await c.catalogue(),before=baselineFile?JSON.parse(fs.readFileSync(baselineFile)):start;
 if(before.schema!=='findpitches-v3-customer-proof-snapshot-v1'||!Array.isArray(before.items)||before.publication_enabled!==false||before.production_cutover_enabled!==false)throw Error('retained_customer_baseline_required');
 const baselineUS=before.items.filter(r=>r.country==='US'),baselineIDs=new Set(baselineUS.map(r=>r.id)),baselineOrg=new Set(baselineUS.map(r=>r.organiser)),baselineVenue=new Set(baselineUS.map(r=>r.location)),baselineGroups=new Set(baselineUS.map(group));
 const prior=priorExperimentsFile?JSON.parse(fs.readFileSync(priorExperimentsFile)):[];if(!Array.isArray(prior)||prior.some(r=>r.document_kind!=='us_source_experiment'||!Array.isArray(r.arms)))throw Error('retained_experiment_ledger_required');
 save(outDirectory,'us-scale-baseline-private.json',before);save(outDirectory,'us-scale-start-private.json',start);
 const experiments=[...prior],visitedSeeds=new Set(prior.length?seeds:[]),visitedParents=new Set(),attributed=new Set(start.items.filter(r=>r.country==='US'&&!baselineIDs.has(r.id)).map(r=>r.id)),knownOrg=new Set(start.items.map(r=>r.organiser)),knownVenue=new Set(start.items.map(r=>r.location)),knownStates=new Set(start.items.map(r=>sourceUSState(r.region)).filter(Boolean));let stop='bounded_batches_complete';
 for(let batch=0;batch<maxBatches;batch++) {
  if(await healthy(c.db)>40){stop='verification_backlog';break;}
  const ranking=rankArms(experiments),winner=ranking.find(r=>!r.paused&&r.net_new_ready>0&&['eventeny_recent_applications','event_platform_parent_exploration'].includes(r.arm))?.arm??'eventeny_recent_applications';
  const run=await c.call('enrichment','/catalogue/start',{max_candidates:50}),experimentId='us_scale_'+run.id,allocation={...allocateArms(),exploit_arm:winner,previous_scorecard:ranking};
  const started={document_kind:'us_source_experiment',experiment_id:experimentId,phase:'started',recorded_at:new Date().toISOString(),run_id:run.id,target_market:'US',geography_is_target_only:true,
    allocation,maximum_candidates:50,maximum_source_requests_per_candidate:16,paid_queries:0,continuous_schedule_enabled:false,baseline_us_ready:baselineUS.length};
  await recordExperiment(c.db,started);save(outDirectory,'batch-'+batch+'-started-private.json',started);const pages=[],outcomes=[];let reason='bounded_batch_complete';
  try {
   // Native recent-route dedup includes completed earlier batches and producer receipts.
   // Exhaust the measured winning prefix through native dedup before moving
   // to an older window. Advancing by 500 after checking only 35 skipped most
   // of the high-yield, still-unverified candidates.
   let p=await c.call('enrichment','/catalogue/discover',{run_id:run.id,url:'https://www.eventeny.com/sitemap/event_elements.xml',offset:0,limit:500,byte_offset:0});pages.push({arm:'eventeny_recent_applications',...p});
   if(!p.candidates.some(r=>!r.duplicate)){p=await c.call('enrichment','/catalogue/discover',{run_id:run.id,url:'https://www.eventeny.com/sitemap/event_elements.xml',offset:(batch+1)*500,limit:500,byte_offset:0});pages.push({arm:'eventeny_recent_applications',...p});}
   const strong=p.candidates.filter(r=>!r.duplicate).slice(0,winner==='eventeny_recent_applications'?allocation.exploit:allocation.explore);
   const explorationLimit=winner==='event_platform_parent_exploration'?allocation.exploit:allocation.explore;
   const explore=[];let parentSlots=0;
   for(const seed of seeds.filter(s=>!visitedSeeds.has(s)).slice(0,allocation.explore)) {
    if(explore.length>=explorationLimit)break;
    visitedSeeds.add(seed);await wait(1500);const p=await c.call('enrichment','/catalogue/discover',{run_id:run.id,url:seed,operator_page:true,limit:50});pages.push({arm:'official_operator_hop_one',...p});
    explore.push(...p.candidates.filter(r=>!r.duplicate).slice(0,explorationLimit-explore.length));
    for(const parent of (p.event_details??[]).slice(0,2)){if(explore.length>=explorationLimit||parentSlots>=5)break;parentSlots++;const child=await c.call('enrichment','/catalogue/discover',{run_id:run.id,url:parent.url,limit:50});pages.push({arm:'official_operator_hop_one',...child});explore.push(...child.candidates.filter(r=>!r.duplicate).slice(0,explorationLimit-explore.length));}

    if(p.reason?.includes('429')){reason='source_rate_limited';break;}
   }
   // A source arm with no links is not repeated without a new hypothesis.
   // Use the remaining exploration slots on a different public source path:
   // parent event pages expose sibling vendor forms, then each leaf is proved.
   if(explore.length<explorationLimit&&reason==='bounded_batch_complete'){
    const index=await c.call('enrichment','/catalogue/discover',{run_id:run.id,url:'https://www.eventeny.com/sitemap/events.xml',offset:batch*500,limit:500});pages.push({arm:'event_platform_parent_exploration',...index});
    // URL year text is discovery priority only; the leaf independently proves
    // actual current dates, country and trader route before import.
    const year=new Date().getUTCFullYear(),priority=r=>new RegExp('(?:'+year+'|'+(year+1)+')').test(r.url);
    const parents=(index.event_details??[]).filter(p=>!visitedParents.has(p.url)).sort((a,b)=>Number(priority(b))-Number(priority(a)));
    for(const parent of parents.slice(0,winner==='event_platform_parent_exploration'?10:5)){if(explore.length>=explorationLimit)break;visitedParents.add(parent.url);await wait(1500);const child=await c.call('enrichment','/catalogue/discover',{run_id:run.id,url:parent.url,limit:50});pages.push({arm:'event_platform_parent_exploration',...child});explore.push(...child.candidates.filter(r=>!r.duplicate).slice(0,explorationLimit-explore.length).map(r=>({...r,exploration_arm:'event_platform_parent_exploration'})));}
   }
   const used=new Set(strong.map(r=>r.id)),distinctExplore=[];for(const r of explore){if(!used.has(r.id)){used.add(r.id);distinctExplore.push(r);}}
   const selected=[...strong.map(r=>({...r,arm:'eventeny_recent_applications'})),...distinctExplore.slice(0,explorationLimit).map(r=>({...r,arm:r.exploration_arm??'official_operator_hop_one'}))];
   selected.sort((a,b)=>Number(b.arm===winner)-Number(a.arm===winner));
   for(const candidate of selected) {
    if(reason!=='bounded_batch_complete')break;if(await healthy(c.db)>40){reason='verification_backlog';break;}
    await wait(1500);let outcome;try{outcome=await c.call('enrichment','/catalogue/verify',{candidate_id:candidate.id,target_market:'US'});}catch(error){reason='candidate_custody_requires_review';throw error;}
    outcomes.push({...outcome,arm:candidate.arm});save(outDirectory,'batch-'+batch+'-outcomes-private.json',outcomes);
    if(catalogueGrowthStop(outcomes)){reason=catalogueGrowthStop(outcomes);break;}
   }
  }finally{await c.call('enrichment','/catalogue/stop',{run_id:run.id,reason});}
  // Never reset/force jobs to manufacture READY. Allow normal handlers to settle.
  for(let i=0;i<20&&await healthy(c.db)>0;i++){for(const role of ['reconcile','eligibility','enrichment','readiness'])await c.call(role,'/tick',{limit:25});await wait(1000);}
  const after=await c.catalogue(),us=after.items.filter(r=>r.country==='US'),gained=us.filter(r=>!baselineIDs.has(r.id)),currentIds=new Set(us.map(r=>r.id)),lost=baselineUS.filter(r=>!currentIds.has(r.id)),byId=new Map(us.map(r=>[r.id,r]));
  const progress=(await c.db.prepare(`SELECT c.id,p.status,p.reason,p.entity_id,d.document_json FROM catalogue_candidates c JOIN catalogue_progress p ON p.candidate_id=c.id LEFT JOIN source_documents d ON d.id=p.document_id WHERE c.run_id=?`).bind(run.id).all()).results;
  const parsed=new Map();for(const r of progress)if(r.document_json){const document=await decodeSourceDocument(r.document_json);parsed.set(r.id,{document,report:verifyDocument(document,{now:after.as_of})});}
  const arms=[];
  for(const arm of ['eventeny_recent_applications','official_operator_hop_one','event_platform_parent_exploration']) {
   const own=outcomes.filter(r=>r.arm===arm),sourcePages=pages.filter(p=>p.arm===arm),ready=[...new Set(own.map(r=>r.entity_id))].map(id=>byId.get(id)).filter(Boolean),newReady=ready.filter(r=>!baselineIDs.has(r.id)&&!attributed.has(r.id));
   newReady.forEach(r=>attributed.add(r.id));
   const evidence=own.map(r=>parsed.get(r.candidate_id)).filter(Boolean),states=ready.map(r=>evidence.find(e=>e.report.facts.event_name===r.title&&e.report.facts.location===r.location)?.report.venue_address?.state).filter(Boolean);
   const metric={arm,geography:'US target; verified leaf country required',queries:0,paid_credits:0,paid_cost:0,checked:own.length,
    source_requests_observed:sourcePages.reduce((n,p)=>n+(p.source_requests_observed??0),0)+evidence.reduce((n,e)=>n+(e.document.request_audit?.requests.length??0),0),
    candidates:sourcePages.reduce((n,p)=>n+p.candidates.length,0),duplicates:sourcePages.reduce((n,p)=>n+p.candidates.filter(r=>r.duplicate).length,0),source_pages_fetched:sourcePages.filter(p=>!p.reason).length,
    proved_current_event:evidence.filter(e=>e.report.page_kind==='event'&&e.report.facts.event_end>=after.as_of.slice(0,10)).length,
    trader_relevant:evidence.filter(e=>e.report.page_kind==='event'&&!e.report.reasons.some(r=>/not_a_trader|trader_application_purpose|restricted_audience/.test(r))).length,
    usable_route:evidence.filter(e=>e.report.status==='verified').length,ready:ready.length,net_new_ready:newReady.length,
    new_organisers:new Set(newReady.map(r=>r.organiser).filter(v=>!knownOrg.has(v))).size,new_venue_strings:new Set(newReady.map(r=>r.location).filter(v=>!knownVenue.has(v))).size,
    new_states:new Set(newReady.map(r=>sourceUSState(r.region)).filter(v=>v&&!knownStates.has(v))).size,
    distinct_source_states:new Set(states).size,ready_by_state:tally(states,s=>s),ready_by_route_type:tally(ready,r=>r.usable_route?.type??'event_application'),blocked:sourcePages.filter(p=>/robots|403|429|challenge/.test(p.reason??'')).length+own.filter(r=>/source_http_40[13]|429/.test(r.reason??'')).length,
    failure_taxonomy:tally(own.filter(r=>r.status!=='imported'||r.readiness!=='ready'),r=>failureBucket((r.reason??'').split(','))),
    allocation_status:own.length>=20&&!newReady.length?'pause_zero_ready_arm':'measured'};
   metric.score=armScore(metric);arms.push(metric);newReady.forEach(r=>{knownOrg.add(r.organiser);knownVenue.add(r.location);});states.forEach(s=>knownStates.add(s));
  }
  const finished={document_kind:'us_source_experiment',experiment_id:experimentId,phase:'completed',recorded_at:after.as_of,run_id:run.id,allocation,stop_reason:reason,arms,
   baseline_us_ready:baselineUS.length,current_us_ready:us.length,ready_gained:gained.length,ready_lost:lost.length,net_ready_gain:gained.length-lost.length,
   exact_event_groups:new Set(us.map(group)).size,new_exact_event_groups:new Set(gained.map(group).filter(k=>!baselineGroups.has(k))).size,
   next_source_ranking:rankArms([...experiments,{arms}]),queue_jobs:await healthy(c.db),source_request_scope:'HTTP attempts for discovery and candidate proof. Independent background verification is not acquisition attribution.',paid_queries:0,publication_pipeline_enabled:false};
  await recordExperiment(c.db,finished);experiments.push(finished);save(outDirectory,'us-scale-experiments.json',experiments);save(outDirectory,'us-scale-current-private.json',after);
  console.log(JSON.stringify({batch:batch+1,us_ready:us.length,net_gain:finished.net_ready_gain,event_groups:finished.exact_event_groups,queue_jobs:finished.queue_jobs,paid_queries:0}));
  if(finished.queue_jobs>40||reason!=='bounded_batch_complete'){stop=reason==='bounded_batch_complete'?'verification_backlog':reason;break;}
  if(finished.net_ready_gain>=netTarget){stop='net_us_ready_target_reached';break;}
  if(batch>=1&&experiments.slice(-2).every(e=>e.arms.every(a=>a.net_new_ready===0))){stop='zero_net_ready_after_two_batches';break;}
 }
 const final=await c.call('api','/status');assertFreeGrowth(final,initial.commercial.kpis.paid_acquisition_queries);
 const report={schema:'findpitches-v3-us-source-learning-v1',as_of:final.now,baseline_as_of:before.as_of,baseline_us_ready:baselineUS.length,target_net_us_ready:netTarget,maximum_batches:maxBatches,maximum_candidate_checks:maxBatches*50,
  planned_allocation:'70% exploit / 30% explore; actual HTTP effort separately measured',stop_reason:stop,experiments,paid_queries_added:0,paid_credits_added:0,continuous_paid_enabled:false,
  inventory:final.commercial,structured_delivery:final.structured_delivery};save(outDirectory,'us-scale-report.json',report);return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const a=process.argv.slice(2),v=k=>a[a.indexOf(k)+1];try{await runUSScale({credentialsFile:v('--credentials'),stateDirectory:v('--state-dir'),outDirectory:v('--out-dir'),seeds:a.includes('--seeds')?JSON.parse(fs.readFileSync(v('--seeds'))):[],maxBatches:a.includes('--max-batches')?Number(v('--max-batches')):6,baselineFile:a.includes('--baseline')?v('--baseline'):null,priorExperimentsFile:a.includes('--prior-experiments')?v('--prior-experiments'):null});}catch(error){console.error(/^[a-z0-9_]+$/.test(error.message)?error.message:'us_scale_stopped_for_custody_review');process.exitCode=1;}}
