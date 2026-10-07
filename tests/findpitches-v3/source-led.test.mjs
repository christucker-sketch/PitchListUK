import test from 'node:test';
import assert from 'node:assert/strict';
import {database,NOW} from './helpers.mjs';
import {sql} from '../../platform/findpitches-v3/store.mjs';
import {startSourceLed,scheduleSourceLed,executeSourceLed,verifySourceLedCandidate,sourceLedMetrics,sourceLedPlan,sourceLedRoute,sourceLedStopReason,sourceLedStatus} from '../../platform/findpitches-v3/source-led.mjs';
import {reserveSerperQuery} from '../../platform/findpitches-v3/serper-usage.mjs';
import {drainPipeline,evaluateReadiness} from '../../platform/findpitches-v3/pipeline.mjs';
import {recordVerification} from '../../platform/findpitches-v3/verification-store.mjs';
import {verifyDocument} from '../../platform/findpitches-v3/verification.mjs';
const ENV={V3_CITY_ENABLED:'false',V3_DAILY_QUERY_LIMIT:'1000',SERPER_API_KEY:'fixture-provider-key'};
async function configured(t){const db=database(t);await sql(db,"INSERT INTO quality_gates VALUES ('structured-100-preservation',100,0,'{}','gate',?)",NOW).run();return db;}
async function fixtureRun(db,id,now=NOW){await sql(db,"INSERT INTO acquisition_runs(id,city,day,queries_reserved,status,created_at,updated_at) VALUES (?,?,'2026-10-06',1,'reserved',?,?)",id,'fixture',now,now).run();}
function officialDoc({country='CA',venue='1 River Street',body,organiserUrl='https://organiser.example/',date='2026-11-20'}={}){
 const url='https://organiser.example/river-fair',event={'@type':'Event',name:'River Craft Fair',url,startDate:date,endDate:date,organizer:{name:'River Association',url:organiserUrl},location:{name:'River Hall',address:{streetAddress:venue,addressLocality:'River Town',addressCountry:country}}};
 return {url,requested_url:url,fetched_at:NOW,content_hash:'fixture-hash',html:`<script type="application/ld+json">${JSON.stringify(event)}</script><main><h1>River Craft Fair</h1>${body??'<section><h2>Vendor applications</h2><p>Vendor applications are open</p><form action="/vendor/submit"><input name="business_name"><input name="products"><button type="submit">Submit vendor application</button></form></section>'}</main>`};
}
test('source-led plan balances five countries and deprioritises weak routes',()=>{
 const p=sourceLedPlan(NOW);assert.equal(p.length,25);assert.match(p[0].query,/localstalls.com\/uk\/event/);assert.ok(!p.some(r=>r.query.includes('filetype:pdf')));assert.deepEqual(p.slice(0,5).map(p=>p.market),['GB','CA','AU','NZ','US']);for(const c of ['GB','CA','AU','NZ','US'])assert.equal(p.filter(r=>r.market===c).length,5);assert.equal(new Set(p.map(r=>r.query)).size,25);
 for(const u of ['https://facebook.com/events/1','https://eventbrite.com/e/fair','https://organiser.example/news/fair','https://www.eventeny.com/events/','https://localstalls.com/gb/events/','https://organiser.example/login'])assert.equal(sourceLedRoute(u).disposition,'excluded');
 assert.equal(sourceLedRoute('https://council.gov.uk/trader-application.pdf').disposition,'unsupported_pdf');assert.equal(sourceLedRoute('https://docs.google.com/forms/d/123/viewform').disposition,'unsupported_form');
});
test('commercial budget counts earlier lanes and concurrent reservations cannot exceed 25',async t=>{
 const db=await configured(t);
 for(let i=0;i<12;i++){await fixtureRun(db,'earlier-'+i);await reserveSerperQuery(db,{runId:'earlier-'+i,index:0,query:'older '+i,market:'US',region:null,now:NOW});}
 const settled=await Promise.allSettled(Array.from({length:30},async(_,i)=>{await fixtureRun(db,'concurrent-'+i);return reserveSerperQuery(db,{runId:'concurrent-'+i,index:0,query:'query '+i,market:'CA',region:null,now:NOW});}));
 assert.equal(settled.filter(r=>r.status==='fulfilled').length,13);const s=await sourceLedStatus(db,NOW);assert.equal(s.daily_total_paid_queries,25);assert.equal(s.remaining_queries,0);assert.equal(s.budget_paused,true);
 const next='2026-10-06T23:00:00.000Z';await fixtureRun(db,'tomorrow',next);await reserveSerperQuery(db,{runId:'tomorrow',index:0,query:'tomorrow',market:'GB',region:null,now:next});
 assert.equal((await sourceLedStatus(db,next)).remaining_queries,24);
});
test('one query grant is replay-safe under concurrent execution and timeouts never rebill',async t=>{
 const db=await configured(t),p=await startSourceLed(db,{},NOW);const admissions=await Promise.allSettled([scheduleSourceLed(db,p.id,NOW),scheduleSourceLed(db,p.id,NOW)]);assert.equal(admissions.filter(r=>r.status==='fulfilled').length,1);
 const g=admissions.find(r=>r.status==='fulfilled').value;let calls=0;const run=()=>executeSourceLed(db,g.run_id,ENV,{now:NOW,fetcher:async()=>{calls++;return Response.json({credits:1,organic:[]});}});
 await Promise.allSettled([run(),run()]);assert.equal(calls,1);await run();assert.equal(calls,1);
 const next=await scheduleSourceLed(db,p.id,NOW);await assert.rejects(executeSourceLed(db,next.run_id,ENV,{now:NOW,fetcher:async()=>{calls++;throw Error('uncertain');}}),/outcome_requires_review/);
 await assert.rejects(executeSourceLed(db,next.run_id,ENV,{now:NOW,fetcher:async()=>{calls++;return Response.json({});}}),/outcome_requires_review/);assert.equal(calls,2);
 await assert.rejects(startSourceLed(db,{},NOW),/operator_review/);
});
test('balanced warmup automatically latches zero READY and refuses further spend',async t=>{
 const db=await configured(t),p=await startSourceLed(db,{},NOW);let calls=0;
 for(let i=0;i<10;i++){const g=await scheduleSourceLed(db,p.id,NOW);await executeSourceLed(db,g.run_id,ENV,{now:NOW,fetcher:async()=>{calls++;return Response.json({credits:1,organic:[]});}});}
 const m=await sourceLedMetrics(db,p.id,NOW);assert.equal(m.queries,10);for(const c of Object.values(m.by_target_country))assert.equal(c.queries,2);
 await assert.rejects(scheduleSourceLed(db,p.id,NOW),/zero_ready/);assert.equal(calls,10);assert.equal((await sourceLedStatus(db,NOW)).policy.manual_paused,1);
 await assert.rejects(sql(db,"UPDATE source_led_programmes SET status='active' WHERE id=?",p.id).run(),/cannot_reopen/);
});
test('source-led country quota is persistent across sessions and cannot be bypassed by reservation callers',async t=>{
 const db=await configured(t),p=await startSourceLed(db,{},NOW),g=await scheduleSourceLed(db,p.id,NOW);
 await sql(db,"UPDATE source_led_grants SET status='running' WHERE run_id=?",g.run_id).run();
 await sql(db,"INSERT INTO acquisition_runs(id,city,day,queries_reserved,status,created_at,updated_at) VALUES (?,?,'2026-10-06',1,'reserved',?,?)",g.run_id,'source-led:GB',NOW,NOW).run();
 for(let i=0;i<5;i++){await fixtureRun(db,'quota-'+i);await sql(db,"INSERT INTO serper_usage(id,run_id,query_index,kind,producer,lane,market,query_hash,queries_reserved,credit_units_reserved,status,budget_day,reserved_at) VALUES (?, ?,0,'live','source-led-search','source-led-paid','GB','fixture-hash',1,1,'complete','2026-10-06',?)",'prior-quota-'+i,'quota-'+i,NOW).run();}
 await assert.rejects(reserveSerperQuery(db,{runId:g.run_id,index:0,query:sourceLedPlan(NOW)[0].query,producer:'source-led-search',lane:'source-led-paid',market:'GB',region:null,programmeId:p.id,now:NOW}),/budget_exhausted/);
 await assert.rejects(reserveSerperQuery(db,{runId:'missing-grant',index:0,query:'anything',lane:'source-led-paid',market:'US',region:null,now:NOW}),/budget_exhausted/);
});
test('official inline vendor proof qualifies; links, footer forms, tickets and unrelated forms never do',()=>{
 assert.equal(verifyDocument(officialDoc(),{now:NOW}).status,'verified');
 const bad=[{country:null},{venue:'TBA'},{organiserUrl:'https://elsewhere.example/'},{date:'2025-11-20'},
 {body:'<section><h2>Vendor applications</h2><p>Vendor applications are open</p><a href="/login">Start application</a></section>'},
 {body:'<footer><section><h2>Vendor applications</h2><p>Vendor applications are open</p><form action="/submit"><input name="business"><input name="products"><button>Submit vendor application</button></form></section></footer>'},
 {body:'<section><h2>Vendor applications</h2><p>Vendor applications are open; join waitlist</p><form action="/submit"><input name="business"><input name="products"><button>Submit vendor application</button></form></section>'}];
 bad.push({body:officialDoc().html.match(/<section>[\s\S]*?<\/section>/)[0].replace('Vendor applications are open','Vendor applications are open to active chamber members only')});
 bad.push({body:officialDoc().html.match(/<section>[\s\S]*?<\/section>/)[0].replace('Vendor applications are open','Vendor applications are open for the 2025 edition')});
 for(const options of bad)assert.notEqual(verifyDocument(officialDoc(options),{now:NOW}).status,'verified',JSON.stringify(options));
});
test('paid discovery imports source country rather than query country; immutable proof reaches READY and replay adds nothing',async t=>{
 const db=await configured(t),p=await startSourceLed(db,{},NOW),g=await scheduleSourceLed(db,p.id,NOW),doc=officialDoc();
 await executeSourceLed(db,g.run_id,ENV,{now:NOW,fetcher:async()=>Response.json({credits:1,organic:[{title:'Search title is not evidence',link:doc.url},{title:'duplicate',link:doc.url}]})});
 const c=await sql(db,"SELECT candidate_id FROM source_led_candidate_progress WHERE status='pending'").first();assert.ok(c);
 const res=await verifySourceLedCandidate(db,c.candidate_id,{now:NOW,fetcher:async()=>new Response(doc.html,{headers:{'content-type':'text/html'}})});assert.equal(res.actual_country,'CA');
 assert.equal(res.status,'out_of_market');assert.equal(res.record_id,null);assert.equal((await sql(db,'SELECT COUNT(*) AS n FROM entities').first()).n,0);
 const caGrant=await scheduleSourceLed(db,p.id,NOW);assert.equal(caGrant.market,'CA');
 await executeSourceLed(db,caGrant.run_id,ENV,{now:NOW,fetcher:async()=>Response.json({credits:1,organic:[{title:'Source country missing',link:doc.url+'-ca'}]})});
 const ca=await sql(db,"SELECT p.candidate_id FROM source_led_candidate_progress p JOIN source_led_candidates c ON c.id=p.candidate_id WHERE p.status='pending' AND c.run_id=?",caGrant.run_id).first();
 const caDoc={...doc,url:doc.url+'-ca',requested_url:doc.url+'-ca',html:doc.html.replaceAll(doc.url,doc.url+'-ca')};
 const recovered=await verifySourceLedCandidate(db,ca.candidate_id,{now:NOW,fetcher:async()=>new Response(caDoc.html,{headers:{'content-type':'text/html'}})});assert.equal(recovered.actual_country,'CA');
 await drainPipeline(db,{now:NOW});const e=await sql(db,'SELECT entity_id FROM entity_records WHERE record_id=?',recovered.record_id).first();
 assert.equal((await sql(db,'SELECT market FROM entities WHERE id=?',e.entity_id).first()).market,'CA');
 await recordVerification(db,e.entity_id,{...caDoc,content_hash:undefined},{now:NOW});await evaluateReadiness(db,e.entity_id,{now:NOW});
 const m=await sourceLedMetrics(db,p.id,NOW);assert.equal(m.ready_gained,1);assert.equal(m.ready_by_country.CA,1);assert.equal(m.by_target_country.GB.queries,1);assert.equal(m.queries_per_ready,2);assert.equal(m.duplicate_rate,1/3);
 assert.equal((await verifySourceLedCandidate(db,c.candidate_id,{now:NOW,fetcher:()=>{throw Error('must not fetch');}})).replay,true);
 for(const stmt of ['UPDATE source_led_candidates SET discovery_json=\'{}\'','DELETE FROM source_led_candidates','UPDATE source_led_candidate_progress SET document_json=\'{}\''])await assert.rejects(sql(db,stmt).run(),/immutable/);
});
test('stop criteria measure READY, exclude weak source dominance and protect queue/integrity/leakage',()=>{
 const good={queries:10,ready_gained:2,pending_candidates:0,preservation_gate:1,candidates:20,duplicate_rate:.2,excluded_mix:.1};assert.equal(sourceLedStopReason(good),null);
 for(const [change,reason] of [[{ready_gained:0},'zero_ready_after_balanced_warmup'],[{queries:20,ready_gained:1},'ready_yield_below_threshold'],[{duplicate_rate:.8},'duplicate_rate_spike'],[{excluded_mix:.6},'excluded_source_mix_dominant'],[{due_jobs:41},'verification_backlog'],[{oldest_due_seconds:121},'verification_backlog'],[{source_mutations:1},'source_integrity_failure'],[{customer_rows:1},'shadow_scope_leakage']])assert.equal(sourceLedStopReason({...good,...change}),reason);
});
test('restricted membership proof cannot promote; historical false READY automatically pauses paid work',async t=>{
 const db=await configured(t),p=await startSourceLed(db,{},NOW),g=await scheduleSourceLed(db,p.id,NOW);
 const {documentFixture}=await import('./verification-fixture.mjs');
 const doc=documentFixture({event:{location:{name:'Town Hall',address:{streetAddress:'1 Main Street',addressLocality:'London',addressCountry:'GB'}}}});doc.html=doc.html.replace('Vendor Application | 2026','BUSINESS EXHIBITOR - CHAMBER MEMBER');
 assert.ok(verifyDocument(doc,{now:NOW}).reasons.includes('application_restricted_audience_requires_review'));
 await executeSourceLed(db,g.run_id,ENV,{now:NOW,fetcher:async()=>Response.json({credits:1,organic:[{title:'Vendor',link:doc.url}]})});
 const candidate=await sql(db,"SELECT candidate_id FROM source_led_candidate_progress WHERE status='pending'").first();
 const receipt=await verifySourceLedCandidate(db,candidate.candidate_id,{now:NOW,fetcher:async()=>new Response(doc.html,{headers:{'content-type':'text/html'}})});await drainPipeline(db,{now:NOW});
 const entity=await sql(db,'SELECT e.* FROM entities e JOIN entity_records er ON er.entity_id=e.id WHERE er.record_id=?',receipt.record_id).first();
 // Recorded simulation of the previous policy's immutable proof/READY claim.
 const old=verifyDocument(doc,{now:NOW});old.application_policy='current-application-v1.1';old.status='verified';old.reasons=[];
 await sql(db,"INSERT INTO source_documents VALUES ('previous-doc',?,NULL,?,?)",doc.url,NOW,JSON.stringify(doc)).run();
 await sql(db,"INSERT INTO source_verifications(id,entity_id,entity_revision,document_id,verifier_version,status,report_json,checked_at,expires_at) VALUES ('previous-proof',?,?,'previous-doc','source-proof-v1','verified',?,?,'2026-10-07T12:00:00.000Z')",entity.id,entity.revision,JSON.stringify(old),NOW).run();
 await evaluateReadiness(db,entity.id,{now:NOW});await sql(db,"UPDATE readiness SET status='ready' WHERE entity_id=?",entity.id).run();
 const m=await sourceLedMetrics(db,p.id,NOW);assert.equal(m.ready_gained,0);assert.equal(m.false_ready_promotions_detected,1);
 await assert.rejects(scheduleSourceLed(db,p.id,NOW),/false_ready_promotion_detected/);assert.equal((await sourceLedStatus(db,NOW)).policy.manual_paused,1);
 assert.equal((await sql(db,'SELECT COUNT(*) AS n FROM serper_usage').first()).n,1);
});
