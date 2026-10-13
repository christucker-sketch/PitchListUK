import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createRequire} from 'node:module';
import {database,NOW,seed,record} from './helpers.mjs';import {sql,loadEntity} from '../../platform/findpitches-v3/store.mjs';
import {budgetDay,reserveSerperQuery,serperStatus} from '../../platform/findpitches-v3/serper-usage.mjs';
import {startUKCampaign,stopUKCampaign,ukCampaignMetrics,ukCampaignStatus,startSourceLed,scheduleSourceLed,executeSourceLed,stopSourceLed,verifySourceLedCandidate,sourceLedPlan,sourceLedStatus} from '../../platform/findpitches-v3/source-led.mjs';
import {drainPipeline,evaluateReadiness} from '../../platform/findpitches-v3/pipeline.mjs';import {recordVerification} from '../../platform/findpitches-v3/verification-store.mjs';
import {verifyDocument} from '../../platform/findpitches-v3/verification.mjs';
const ENV={V3_CITY_ENABLED:'false',V3_DAILY_QUERY_LIMIT:'1000',SERPER_API_KEY:'fixture-only'};
const LATER='2026-10-06T12:00:01.000Z';
async function configure(db){await sql(db,"INSERT INTO quality_gates VALUES ('structured-100-preservation',100,0,'{}','fixture',?)",NOW).run();await sql(db,'UPDATE commercial_acquisition_policy SET manual_paused=1').run();}
const approve=db=>startUKCampaign(db,{max_queries:25,reason:'D-017 controlled diversified UK campaign; all spending remains centrally reserved.'},NOW);
const child=(db,campaign,max_queries=4)=>startSourceLed(db,{scope:'uk_campaign',campaign_id:campaign.id,max_queries},LATER);
async function seedPrior(db,n){for(let i=0;i<n;i++){
 const run='older-run-'+i;await sql(db,"INSERT INTO acquisition_runs(id,city,day,queries_reserved,status,created_at,updated_at) VALUES (?,'old canary',?,1,'complete',?,?)",run,budgetDay(NOW),NOW,NOW).run();
 await sql(db,"INSERT INTO serper_usage(id,run_id,query_index,kind,producer,lane,market,query_hash,queries_reserved,credit_units_reserved,status,budget_day,reserved_at) VALUES (?, ?,0,'live','city-search','city-acquisition','US',?,1,1,'complete',?,?)",'old-usage-'+i,run,'old-query-'+i,budgetDay(NOW),NOW).run();
}}
function officialDoc(i=1){
 const url='https://organiser.example.org/vendor-fair-'+i,date='2026-11-'+String(10+i).padStart(2,'0'),event={'@type':'Event',name:'River Lantern Artisan Fair '+i,url,startDate:date,endDate:date,organizer:{name:'River Association',url:'https://organiser.example.org/'},location:{name:'River Hall',address:{streetAddress:'1 River Street',addressLocality:'York',addressRegion:'Yorkshire',addressCountry:'GB'}}};
 return {requested_url:url,url,fetched_at:LATER,html:`<script type="application/ld+json">${JSON.stringify(event)}</script><main><h1>${event.name}</h1><section><h2>Vendor applications</h2><p>Vendor applications are open</p><form action="/vendor/submit"><input name="business"><input name="products"><button>Submit vendor application</button></form></section></main>`};
}
async function settleProof(db,candidateId,doc){
 const result=await verifySourceLedCandidate(db,candidateId,{now:LATER,fetcher:async()=>new Response(doc.html,{headers:{'content-type':'text/html'}})});
 await drainPipeline(db,{now:LATER});const linked=await sql(db,'SELECT entity_id FROM entity_records WHERE record_id=?',result.record_id).first();
 await recordVerification(db,linked.entity_id,doc,{now:LATER});assert.equal((await evaluateReadiness(db,linked.entity_id,{now:LATER})).status,'ready');
 const entity=await loadEntity(db,linked.entity_id);assert.equal(entity.market,'GB');assert.match(entity.location,/York/);assert.ok(!entity.location.includes('Scotland'));return entity;
}
async function paid(db,programme,{ready=false,id=1,calls={n:0},credits=1}={}) {
 const g=await scheduleSourceLed(db,programme.id,LATER);assert.equal(g.market,'GB');assert.equal(g.query_limit,1);
 const doc=officialDoc(id);await executeSourceLed(db,g.run_id,ENV,{now:LATER,fetcher:async(_u,o)=>{calls.n++;assert.equal(JSON.parse(o.body).gl,'gb');return Response.json({credits,organic:ready?[{link:doc.url,title:'Scottish market query text is not geography proof'}]:[]});}});
 if(ready){const row=await sql(db,"SELECT c.id FROM source_led_candidates c JOIN source_led_candidate_progress p ON p.candidate_id=c.id WHERE c.run_id=? AND p.status='pending'",g.run_id).first();
  await settleProof(db,row.id,doc);
 }
 return g;
}

test('campaign plans diversify eight UK regions and source families without altering default scopes or exposing caller queries',async t=>{
 const db=database(t);await configure(db);const plan=sourceLedPlan(NOW,'uk_campaign');assert.equal(plan.length,25);assert.equal(new Set(plan.map(p=>p.query)).size,25);
 assert.ok(plan.every(p=>p.market==='GB'&&p.programme_scope==='uk_campaign'));assert.ok(new Set(plan.map(p=>p.target_region)).size>=8);assert.ok(new Set(plan.map(p=>p.family)).size>=3);
 assert.equal(sourceLedPlan(NOW).length,25);assert.equal(sourceLedPlan(NOW,'uk_growth').length,4);
 for(const options of [{max_queries:26,reason:'too big'},{reason:'foreign',market:'US'},{reason:'caller plan',plan_json:'[]'},{reason:'caller query',query:'arbitrary'},{actor:'producer',reason:'wrong actor'}])await assert.rejects(startUKCampaign(db,options,NOW),/operator|approval/);
 const campaign=await approve(db);assert.equal(campaign.max_queries,25);assert.equal(campaign.max_credits,25);assert.equal(campaign.child_query_ceiling,4);
 await assert.rejects(startSourceLed(db,{scope:'uk_campaign',campaign_id:campaign.id,max_queries:5},NOW),/bounded_child/);
 await assert.rejects(startSourceLed(db,{scope:'uk_campaign',campaign_id:campaign.id,market:'CA'},NOW),/start_fields/);
 await assert.rejects(startSourceLed(db,{scope:'international'},NOW),/operator_review/);
 assert.equal((await sql(db,'SELECT manual_paused FROM commercial_acquisition_policy').first()).manual_paused,1);
 await assert.rejects(reserveSerperQuery(db,{runId:'foreign-caller',index:0,query:'x',producer:'city-search',lane:'city-acquisition',market:'US',region:null,now:NOW}),/exhausted_or_paused/);
 await assert.rejects(sql(db,'UPDATE uk_paid_campaigns SET max_queries=25,plan_json=\'[]\' WHERE id=?',campaign.id).run(),/immutable/);
});

test('zero READY stops the parent after four settled queries across two batches and cannot reset by starting another child',async t=>{
 const db=database(t);await configure(db);const campaign=await approve(db),calls={n:0};
 const a=await child(db,campaign,2);await paid(db,a,{calls});await paid(db,a,{calls});assert.equal((await scheduleSourceLed(db,a.id,LATER)).reason,'programme_budget_reached');
 const b=await child(db,campaign,2);await paid(db,b,{calls});await paid(db,b,{calls});
 await assert.rejects(scheduleSourceLed(db,b.id,LATER),/zero_ready_after_uk_warmup/);assert.equal(calls.n,4);
 const status=await ukCampaignStatus(db,LATER);assert.equal(status.sessions[0].review_required,1);assert.equal(status.sessions[0].metrics.queries,4);assert.equal(status.sessions[0].metrics.settled_queries,4);
 await assert.rejects(child(db,campaign),/not_active/);await assert.rejects(approve(db),/previous_stop_review_required/);
 assert.equal((await sql(db,'SELECT COUNT(*) n FROM serper_usage').first()).n,4);
});

test('a productive scoped campaign can pass the old GB-five quota while manual pause and other country quotas remain unchanged',async t=>{
 const db=database(t);await configure(db);const campaign=await approve(db),calls={n:0},a=await child(db,campaign);
 await paid(db,a,{calls,ready:true});for(let i=0;i<3;i++)await paid(db,a,{calls});assert.equal((await scheduleSourceLed(db,a.id,LATER)).reason,'programme_budget_reached');
 const b=await child(db,campaign);await paid(db,b,{calls});await paid(db,b,{calls});
 const m=await ukCampaignMetrics(db,campaign.id,LATER);assert.equal(m.queries,6);assert.equal(m.ready_gained,1);assert.equal(m.observed_credits,6);assert.equal(m.queries_per_ready,6);
 assert.ok(Object.keys(m.by_target_region).length>=6);assert.ok(m.run_telemetry.every(r=>r.market==='GB'&&r.target_region));
 const policy=await sql(db,'SELECT * FROM commercial_acquisition_policy').first();assert.equal(policy.manual_paused,1);assert.equal(policy.queries_per_market,5);assert.equal(policy.daily_query_limit,25);
 assert.equal((await serperStatus(db,LATER)).bulk_enabled,false);assert.equal(calls.n,6);
});

test('central daily accounting includes earlier lanes, and no campaign can consume query or credit number 26',async t=>{
 const db=database(t);await configure(db);await seedPrior(db,21);const campaign=await approve(db),a=await child(db,campaign),calls={n:0};
 await paid(db,a,{calls,ready:true});for(let i=0;i<3;i++)await paid(db,a,{calls});assert.equal((await scheduleSourceLed(db,a.id,LATER)).reason,'programme_budget_reached');
 const b=await child(db,campaign);const end=await scheduleSourceLed(db,b.id,LATER);assert.equal(end.complete,true);assert.equal(end.reason,'commercial_daily_budget_reached');
 const usage=await serperStatus(db,LATER);assert.equal(usage.usage.day_queries_reserved,25);assert.equal(usage.usage.day_credit_budget_units,25);assert.equal(calls.n,4);
 assert.equal((await sql(db,'SELECT status FROM uk_paid_campaigns WHERE id=?',campaign.id).first()).status,'complete');
});

test('forged country, producer, lane, query, region and second grant index cannot obtain the campaign pause/quota exception',async t=>{
 const db=database(t);await configure(db);const campaign=await approve(db),p=await child(db,campaign),g=await scheduleSourceLed(db,p.id,NOW),entry=sourceLedPlan(NOW,'uk_campaign')[0];
 await sql(db,"UPDATE source_led_grants SET status='running' WHERE run_id=?",g.run_id).run();await sql(db,"INSERT INTO acquisition_runs(id,city,day,queries_reserved,status,created_at,updated_at) VALUES (?,'test',?,1,'reserved',?,?)",g.run_id,budgetDay(NOW),NOW,NOW).run();
 const request={runId:g.run_id,index:0,query:entry.query,producer:'source-led-search',lane:'source-led-paid',market:'GB',region:entry.target_region,programmeId:p.id,now:NOW};
 for(const change of [{market:'US'},{producer:'city-search'},{lane:'city-acquisition'},{query:'forged query'},{region:'GB-SW'},{index:1},{programmeId:'unknown'}])await assert.rejects(reserveSerperQuery(db,{...request,...change}),/exhausted_or_paused/);
 assert.equal((await sql(db,'SELECT COUNT(*) n FROM serper_usage').first()).n,0);await reserveSerperQuery(db,request);
 await assert.rejects(reserveSerperQuery(db,{...request,index:1}),/exhausted_or_paused/);assert.equal((await sql(db,'SELECT COUNT(*) n FROM serper_usage').first()).n,1);
 await assert.rejects(sql(db,"UPDATE uk_paid_campaign_targets SET target_region='US' WHERE run_id=?",g.run_id).run(),/immutable/);
});

test('provider credit overcharge and uncertain outcomes preserve the global safety latch and never replay another paid request',async t=>{
 const db=database(t);await configure(db);const campaign=await approve(db),p=await child(db,campaign),g=await scheduleSourceLed(db,p.id,NOW);let calls=0;
 await assert.rejects(executeSourceLed(db,g.run_id,ENV,{now:NOW,fetcher:async()=>{calls++;return Response.json({credits:2,organic:[]});}}),/outcome_requires_review/);
 await assert.rejects(executeSourceLed(db,g.run_id,ENV,{now:NOW,fetcher:async()=>{calls++;return Response.json({credits:1,organic:[]});}}),/outcome_requires_review/);
 const policy=await sql(db,'SELECT * FROM serper_policy').first();assert.equal(policy.manual_paused,1);assert.equal(policy.pause_reason,'provider_credit_charge_exceeded_reservation');assert.equal(calls,1);
 await assert.rejects(startUKCampaign(db,{reason:'do not override critical credit safety'},NOW),/hard_safety/);
});

test('campaign expiry is capped at London midnight and parent/child grants cannot reopen or cross the day',async t=>{
 const db=database(t);await configure(db);const now='2026-10-06T22:30:00.000Z',c=await startUKCampaign(db,{reason:'late UK run'},now);assert.equal(c.expires_at,'2026-10-06T23:00:00.000Z');
 const p=await startSourceLed(db,{scope:'uk_campaign',campaign_id:c.id,max_queries:1},now);
 await assert.rejects(scheduleSourceLed(db,p.id,'2026-10-06T23:00:00.000Z'),/expired/);
 await assert.rejects(sql(db,"UPDATE uk_paid_campaigns SET status='active' WHERE id=?",c.id).run(),/immutable/);
});

test('the final parent reservation settles its provider response and source proof before a routine budget stop',async t=>{
 const db=database(t);await configure(db);const c=await startUKCampaign(db,{max_queries:4,reason:'Four-query approval must allow the last source proof to finish.'},NOW),a=await child(db,c,3),calls={n:0};
 for(let i=0;i<3;i++)await paid(db,a,{calls});assert.equal((await scheduleSourceLed(db,a.id,LATER)).reason,'programme_budget_reached');
 const p=await child(db,c,1),g=await scheduleSourceLed(db,p.id,LATER),doc=officialDoc();let entered,release;const started=new Promise(r=>entered=r),response=new Promise(r=>release=r);
 const last=executeSourceLed(db,g.run_id,ENV,{now:LATER,fetcher:async()=>{calls.n++;entered();return response;}});await started;
 await assert.rejects(child(db,c),/previous_batch_not_settled/);await assert.rejects(scheduleSourceLed(db,p.id,LATER),/previous_run_not_settled/);
 assert.equal((await ukCampaignStatus(db,LATER)).sessions[0].status,'active');assert.equal(calls.n,4);
 release(Response.json({credits:1,organic:[{link:doc.url}]}));await last;
 await assert.rejects(child(db,c),/previous_batch_not_settled/);assert.equal((await ukCampaignStatus(db,LATER)).sessions[0].status,'active');
 const candidate=await sql(db,"SELECT id FROM source_led_candidates WHERE run_id=?",g.run_id).first();await settleProof(db,candidate.id,doc);
 await assert.rejects(scheduleSourceLed(db,p.id,LATER),/campaign_budget_reached/);
 const state=(await ukCampaignStatus(db,LATER)).sessions[0];assert.equal(state.status,'complete');assert.equal(state.stop_reason,'campaign_budget_reached');assert.equal(state.metrics.ready_gained,1);assert.equal(state.metrics.queries,4);assert.equal(calls.n,4);
});

test('baseline READY with the same timestamp stays excluded from paid gain and the baseline is immutable',async t=>{
 const db=database(t);await configure(db);const doc={...officialDoc(),fetched_at:NOW},f=verifyDocument(doc,{now:NOW}).facts;
 const {entity,recordId}=await seed(db,record({opportunity_id:'existing-ready',country_code:'GB',event_name:f.event_name,organiser:f.organiser,location:f.location,event_start:f.event_start,event_end:f.event_end,canonical_url:doc.url,application_url:f.application_url,source_platform:'official_event',evidence:[{url:doc.url,excerpt:'Vendor applications are open'}]}),{environment:'shadow'});
 await recordVerification(db,entity.id,doc,{now:NOW});assert.equal((await evaluateReadiness(db,entity.id,{now:NOW})).status,'ready');
 const c=await approve(db),p=await child(db,c),g=await scheduleSourceLed(db,p.id,LATER);
 await executeSourceLed(db,g.run_id,ENV,{now:LATER,fetcher:async()=>Response.json({credits:1,organic:[{link:doc.url}]})});
 // A linked pre-existing match must not become a paid promotion, even at equal clocks.
 const candidate=await sql(db,"SELECT id FROM source_led_candidates WHERE run_id=?",g.run_id).first();await sql(db,"UPDATE source_led_candidate_progress SET record_id=? WHERE candidate_id=?",recordId,candidate.id).run();
 const m=await ukCampaignMetrics(db,c.id,LATER);assert.equal(m.ready_opportunities,1);assert.equal(m.ready_gained,0);assert.equal(m.queries_per_ready,null);
 await assert.rejects(sql(db,"UPDATE uk_paid_campaigns SET baseline_ready_sequence=0 WHERE id=?",c.id).run(),/immutable/);
 const status=await sourceLedStatus(db,LATER);assert.equal(status.uk_campaign.sessions[0].metrics.ready_gained,0);assert.equal(status.policy.manual_paused,1);
});

test('automatic integrity, leakage and backlog stops latch the parent without admitting any paid grant',async t=>{
 for(const [scenario,change,reason] of [
  ['integrity',"UPDATE quality_gates SET destructive_mutations=1",'source_integrity_failure'],
  ['leakage',"UPDATE serper_policy SET bulk_enabled=1",'shadow_scope_leakage'],
  ['backlog',"INSERT INTO jobs(id,stage,dedupe_key,payload_json,available_at,created_at,updated_at) VALUES ('stale-work','enrichment','stale-work','{}','2026-10-06T11:00:00.000Z','2026-10-06T11:00:00.000Z','2026-10-06T11:00:00.000Z')",'verification_backlog'],
 ])await t.test(scenario,async s=>{
  const db=database(s);await configure(db);const c=await approve(db),p=await child(db,c);await sql(db,change).run();
  await assert.rejects(scheduleSourceLed(db,p.id,LATER),new RegExp(reason));
  const state=(await ukCampaignStatus(db,LATER)).sessions[0];assert.equal(state.status,'paused');assert.equal(state.review_required,1);assert.equal(state.stop_reason,reason);
  assert.equal((await sql(db,'SELECT COUNT(*) n FROM source_led_grants').first()).n,0);assert.equal((await sql(db,'SELECT COUNT(*) n FROM serper_usage').first()).n,0);
 });
});

test('benign short verification work waits while leaving the approved parent active and spending zero',async t=>{
 const db=database(t);await configure(db);const c=await approve(db),p=await child(db,c);
 await sql(db,"INSERT INTO jobs(id,stage,dedupe_key,payload_json,available_at,created_at,updated_at) VALUES ('brief-work','enrichment','brief-work','{}',?,?,?)",LATER,LATER,LATER).run();
 assert.equal((await scheduleSourceLed(db,p.id,LATER)).reason,'uk_verification_settlement_pending');
 const state=(await ukCampaignStatus(db,LATER)).sessions[0];assert.equal(state.status,'active');assert.equal(state.metrics.queries,0);assert.equal(state.review_required,0);
});

test('native D1 accepts the bounded central reservation SQL, including a campaign override with commercial pause still on',{timeout:180000},async t=>{
 const require=createRequire(new URL('../../operations/findpitches-v3/package.json',import.meta.url)),{Miniflare,convertV4MiniflareOptions}=require('miniflare'),{unstable_splitSqlQuery}=require('wrangler');
 const mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:'campaign',modules:true,script:'export default {fetch(){return new Response("fixture");}}',compatibilityDate:'2026-06-01',d1Databases:{DB:'campaign-fixture'}}]}));t.after(()=>mf.dispose());const db=await mf.getD1Database('DB','campaign'),dir=new URL('../../operations/findpitches-v3/migrations/',import.meta.url);
 for(const name of fs.readdirSync(dir).filter(n=>n.endsWith('.sql')).sort())for(const q of unstable_splitSqlQuery(fs.readFileSync(new URL(name,dir),'utf8')))await db.prepare(q).run();
 await configure(db);const c=await approve(db),p=await child(db,c,1),g=await scheduleSourceLed(db,p.id,NOW);let calls=0;
 const run=()=>executeSourceLed(db,g.run_id,ENV,{now:NOW,fetcher:async()=>{calls++;return Response.json({credits:1,organic:[]});}});
 const dispatched=await Promise.allSettled([run(),run()]);assert.equal(dispatched.filter(r=>r.status==='fulfilled').length,1);
 const replay=await executeSourceLed(db,g.run_id,ENV,{now:NOW,fetcher:()=>{throw Error('must not dispatch twice');}});assert.equal(replay.replay,true);
 assert.equal(calls,1);assert.equal((await ukCampaignMetrics(db,c.id,NOW)).queries,1);assert.equal((await sql(db,'SELECT manual_paused FROM commercial_acquisition_policy').first()).manual_paused,1);
});
