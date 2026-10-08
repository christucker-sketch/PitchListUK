import test from 'node:test';
import assert from 'node:assert/strict';
import {catalogueUrl,fetchCatalogueDocument,catalogueLinks,eventApplicationLinks,platformRoute} from '../../platform/findpitches-v3/source-catalogue.mjs';
import {directGrowthPriority,assertFreeGrowth,growthOutcome} from '../../operations/findpitches-v3/inventory-scale.mjs';
import {database,NOW,seed,record} from './helpers.mjs';
import {sql} from '../../platform/findpitches-v3/store.mjs';
import {documentFixture} from './verification-fixture.mjs';
import {startCatalogueRun,resumeReviewedCatalogueRun,stopCatalogueRun,discoverCataloguePage,verifyCatalogueCandidate,recoverUncommittedCatalogueLease,settleCommittedCatalogueReceipt,catalogueStatus} from '../../platform/findpitches-v3/catalogue-store.mjs';
import {commercialStatus} from '../../platform/findpitches-v3/commercial.mjs';
import {verifyDocument,compareProof} from '../../platform/findpitches-v3/verification.mjs';
import {reverifyRetainedSource,recordVerification} from '../../platform/findpitches-v3/verification-store.mjs';
import {evaluateReadiness,drainPipeline} from '../../platform/findpitches-v3/pipeline.mjs';
import {enqueue} from '../../platform/findpitches-v3/jobs.mjs';
import {catalogueGrowthStop,completedCatalogueOutcome} from '../../operations/findpitches-v3/catalogue-growth.mjs';
import {safeFailureCode} from '../../platform/findpitches-v3/worker.mjs';
const now='2026-10-07T15:00:00.000Z';
test('runtime diagnosis retains safe classes without returning SQL, source payloads or credentials',()=>{
  assert.equal(safeFailureCode(Error('D1_ERROR SQLITE_BUSY: database locked; private-payload')),'database_busy');
  assert.equal(safeFailureCode(Error('SQLITE_CONSTRAINT: source payload with private-token')),'sqlite_constraint');
  assert.equal(safeFailureCode(new TypeError('Cannot read private-property containing private-token')),'type_error');
  assert.equal(safeFailureCode(Error('unknown private-token text')),'runtime_error');
});
test('catalogues discover exact public application routes without creating event facts',()=>{
  const result=catalogueLinks({content:'<urlset><url><loc>https://www.eventeny.com/events/vendor/?id=42&amp;utm_source=x</loc></url><url><loc>https://www.eventeny.com/events/test-fair-123/</loc></url><url><loc>https://www.eventeny.com/events/</loc></url><url><loc>https://www.localstalls.com/au/event/gatton/summer-market</loc></url><url><loc>https://facebook.com/vendor/</loc></url></urlset>'});
  assert.equal(result.routes.length,3);assert.equal(result.routes[0].identity,'eventeny:vendor:42');assert.equal(result.routes[0].url,'https://www.eventeny.com/events/vendor/?id=42');assert.equal(result.routes[1].kind,'event_detail');assert.equal(result.routes.some(r=>r.country||r.application_state),false);
  assert.throws(()=>catalogueLinks({content:'<!DOCTYPE foo [<!ENTITY leak SYSTEM "file:///tmp/token">]><urlset/>'}),/entity_declaration_rejected/);
});
test('catalogue fetch restricts domains, paths, formats, redirects and size',async()=>{
  assert.equal(catalogueUrl('https://www.eventeny.com/robots.txt'),true);assert.equal(catalogueUrl('https://www.localstalls.com/sitemap_events.xml'),true);
  for(const u of ['https://evil.com/sitemap.xml','https://www.eventeny.com/private','https://www.eventeny.com:443/sitemap.xml?x=1','https://www.eventeny.com@sneaky.com/sitemap.xml'])assert.equal(catalogueUrl(u),false);
  await assert.rejects(fetchCatalogueDocument('https://evil.com/sitemap.xml'),/approved_public_catalogue/);
  const redirect=await fetchCatalogueDocument('https://www.eventeny.com/sitemap.xml',{now,fetcher:async()=>new Response('',{status:302,headers:{location:'https://evil.com/sitemap.xml'}})});assert.equal(redirect.reason,'catalogue_redirect_rejected');
  const bad=await fetchCatalogueDocument('https://www.eventeny.com/sitemap.xml',{now,fetcher:async()=>new Response('<html>Login</html>')});assert.equal(bad.reason,'catalogue_format_not_proved');
  const huge=await fetchCatalogueDocument('https://www.eventeny.com/sitemap.xml',{now,fetcher:async()=>new Response('<urlset>'+('x'.repeat(2097153))+'</urlset>')});assert.equal(huge.truncated,true);assert.equal(huge.coverage,'bounded_prefix_only');assert.equal(huge.retained_bytes,2097152);
});
test('event detail discovery excludes navigation and never supplies READY proof',()=>{
  const links=eventApplicationLinks({url:'https://www.eventeny.com/events/summer-fair-123/',html:'<body><nav><a href="/events/vendor/?id=1">Other</a></nav><main><h1>Summer fair</h1><a href="/events/vendor/?id=2">Arts vendor application</a><a href="/events/vendor/?id=2">Apply</a><a href="https://facebook.com/a">Apply</a></main></body>'});
  assert.equal(links.length,1);assert.equal(links[0].identity,'eventeny:vendor:2');assert.equal(links[0].label,'Apply');assert.equal(platformRoute('https://www.eventeny.com/events/vendor/?id=not-a-number'),null);
});
test('free inventory growth targets useful unverified source routes and requires paid pause',()=>{
  const row={id:'a',environment:'shadow',market:'US',edition:'2027',origin:'legacy_v2',fields_json:JSON.stringify({event_name:'Summer fair',canonical_url:'https://www.eventeny.com/events/vendor/?id=42',application_url:'https://www.eventeny.com/events/vendor/?id=42',event_start:'2027-01-01',event_end:'2027-01-01',application_state:'OPEN_NOW',organiser:'Council',location:'High street'})};
  assert.ok(directGrowthPriority(row,now)>100);assert.equal(directGrowthPriority({...row,quality_holds:1},now),null);assert.equal(directGrowthPriority({...row,proof_sequence:1},now),null);assert.equal(directGrowthPriority({...row,fields_json:JSON.stringify({canonical_url:'https://www.eventeny.com/events/'})},now),null);
  const s={mode:'shadow',serper:{bulk_enabled:false},source_led_programme:{policy:{manual_paused:1}},controlled_pilot:{active:[]},commercial:{kpis:{paid_acquisition_queries:25}}};assert.doesNotThrow(()=>assertFreeGrowth(s,25));assert.throws(()=>assertFreeGrowth(s,26),/unexpected_paid_spend/);assert.throws(()=>assertFreeGrowth({...s,customer_rows:1}),/shadow_paused_paid_required/);
  const out=growthOutcome([row],[{...row,market:'CA'}],{beforeAt:now,now});assert.equal(out.identity_mutations,1);
});
async function configured(t){const db=database(t);await sql(db,"INSERT INTO quality_gates VALUES ('structured-100-preservation',100,0,'{}','gate',?)",NOW).run();await sql(db,"UPDATE commercial_acquisition_policy SET manual_paused=1,pause_reason='quality_review' WHERE id=1").run();return db;}
test('free catalogue discoveries require fresh application proof; READY has independent attribution and replay creates nothing',async t=>{
  const db=await configured(t),run=await startCatalogueRun(db,{max_candidates:1},NOW),doc=documentFixture();
  const xml='<urlset><url><loc>'+doc.url.replaceAll('&','&amp;')+'</loc></url></urlset>',discovery=await discoverCataloguePage(db,{run_id:run.id,url:'https://www.eventeny.com/sitemap/event_elements.xml'},{now:NOW,fetcher:async()=>new Response(xml)});
  assert.equal((await sql(db,'SELECT COUNT(*) AS n FROM entities').first()).n,0);assert.equal(discovery.candidates.length,1);
  const id=discovery.candidates[0].id;let fetches=0;const result=await verifyCatalogueCandidate(db,id,{now:NOW,fetcher:async()=>{fetches++;return new Response(doc.html,{headers:{'content-type':'text/html'}});}});
  assert.equal(result.readiness,'ready');assert.equal(result.source_country,'US');assert.equal((await commercialStatus(db,NOW)).by_origin['platform-catalogue'].ready,1);
  assert.equal((await sql(db,"SELECT COUNT(*) AS n FROM jobs WHERE stage IN ('reconcile','eligibility','enrichment','readiness') AND status IN ('ready','leased')").first()).n,0);
  assert.equal((await verifyCatalogueCandidate(db,id,{now:NOW,fetcher:()=>{throw Error('must not fetch');}})).replay,true);assert.equal(fetches,1);
  assert.equal((await sql(db,'SELECT COUNT(*) AS n FROM serper_usage').first()).n,0);assert.equal((await catalogueStatus(db)).runs[0].checked,1);
  await assert.rejects(sql(db,"UPDATE catalogue_candidates SET url='https://evil.com'").run(),/immutable/);await assert.rejects(sql(db,'DELETE FROM catalogue_candidates').run(),/immutable/);await assert.rejects(sql(db,"UPDATE catalogue_progress SET record_id=NULL").run(),/custody_immutable/);
  const again=await discoverCataloguePage(db,{run_id:run.id,url:'https://www.eventeny.com/sitemap/event_elements.xml'},{now:NOW,fetcher:async()=>new Response(xml)});assert.equal(again.candidates[0].duplicate,true);assert.equal((await sql(db,'SELECT COUNT(*) AS n FROM entities').first()).n,1);
});
test('free catalogue limits persist and weak/stale/restricted application pages create no canonical entities',async t=>{
  const db=await configured(t),run=await startCatalogueRun(db,{max_candidates:2},NOW),doc=documentFixture(),second=doc.url.replace('52126','52127'),third=doc.url.replace('52126','52128');
  const discovery=await discoverCataloguePage(db,{run_id:run.id,url:'https://www.eventeny.com/sitemap/event_elements.xml'},{now:NOW,fetcher:async()=>new Response('<urlset>'+[doc.url,second,third].map(u=>'<url><loc>'+u+'</loc></url>').join('')+'</urlset>')});
  for(const [i,id] of discovery.candidates.slice(0,2).map(r=>r.id).entries()){
    const html=i?doc.html.replaceAll(doc.url,second).replace('Vendor Application | 2026','BUSINESS EXHIBITOR - CHAMBER MEMBER'):doc.html.replaceAll('2026-11-21','2025-11-21').replaceAll('2026-11-22','2025-11-22');
    assert.equal((await verifyCatalogueCandidate(db,id,{now:NOW,fetcher:async()=>new Response(html,{headers:{'content-type':'text/html'}})})).status,'held');
  }
  await assert.rejects(verifyCatalogueCandidate(db,discovery.candidates[2].id,{now:NOW,fetcher:()=>{throw Error('no budget');}}),/bounded_fetch_limit/);
  assert.equal((await sql(db,'SELECT COUNT(*) AS n FROM entities').first()).n,0);assert.equal((await sql(db,'SELECT COUNT(*) AS n FROM source_documents').first()).n,3);
  await sql(db,'UPDATE commercial_acquisition_policy SET manual_paused=0 WHERE id=1').run();await assert.rejects(startCatalogueRun(db,{},NOW),/shadow_preservation_required/);
});
test('Eventeny application purpose uses its own section; sports, advertising and member-only forms cannot promote',()=>{
  const doc=documentFixture();
  for(const heading of ['Adult Hockey League (PHA) Fall Season','Smoke Under the Oaks Rib Team Registration 2027','RADIO OPPORTUNITY ADS','Sponsorship Application']) {
    const bad={...doc,html:doc.html.replace('Vendor Application | 2026',heading)};assert.ok(verifyDocument(bad,{now:NOW}).reasons.includes('application_is_not_a_trader_opportunity'));
  }
  const ambiguous={...doc,html:doc.html.replace('Vendor Application | 2026','Application')};assert.ok(verifyDocument(ambiguous,{now:NOW}).reasons.includes('trader_application_purpose_not_proved'));
  const unrelated={...ambiguous,html:ambiguous.html.replace('</main>','<div><h2>About the event</h2><p>All vendors welcome at this event</p></div></main>')};assert.ok(verifyDocument(unrelated,{now:NOW}).reasons.includes('trader_application_purpose_not_proved'));
  const real={...ambiguous,html:ambiguous.html.replace('</main>','<div><h2>About the application</h2><p>Vendors can apply for a retail booth to sell their products.</p></div></main>')};assert.equal(verifyDocument(real,{now:NOW}).status,'verified');
  const restricted={...real,html:real.html.replace('Vendors can apply','Applicants must be an active chamber member. Vendors can apply')};assert.ok(verifyDocument(restricted,{now:NOW}).reasons.includes('application_restricted_audience_requires_review'));
});
test('stored document replay keeps the original source visit time and cannot renew expired proof',async t=>{
  const db=await configured(t),run=await startCatalogueRun(db,{max_candidates:1},NOW),doc=documentFixture(),page=await discoverCataloguePage(db,{run_id:run.id,url:'https://www.eventeny.com/sitemap/event_elements.xml'},{now:NOW,fetcher:async()=>new Response('<urlset><url><loc>'+doc.url+'</loc></url></urlset>')});
  const res=await verifyCatalogueCandidate(db,page.candidates[0].id,{now:NOW,fetcher:async()=>new Response(doc.html,{headers:{'content-type':'text/html'}})});
  const before=await sql(db,'SELECT COUNT(*) AS n FROM source_facts').first(),replayed=await reverifyRetainedSource(db,res.entity_id,{now:'2026-10-06T14:00:00.000Z'});
  assert.equal(replayed.report.checked_at,NOW);assert.equal((await sql(db,'SELECT COUNT(*) AS n FROM source_facts').first()).n,before.n);
  const proof=await sql(db,'SELECT expires_at FROM source_verifications ORDER BY sequence DESC LIMIT 1').first();assert.equal(proof.expires_at,'2026-10-07T12:00:00.000Z');
  await assert.rejects(reverifyRetainedSource(db,res.entity_id,{now:'2026-10-07T12:00:00.000Z'}),/document_expired/);
});
test('free catalogue warm-up measures READY and stops rate limits, backlog and leakage',()=>{
  const held=Array.from({length:50},()=>({status:'held'}));assert.equal(catalogueGrowthStop(held),'zero_ready_after_free_warmup');assert.equal(catalogueGrowthStop([...held,{readiness:'ready'}]),null);
  const declining=[...Array.from({length:300},()=>({readiness:'ready'})),...Array.from({length:200},()=>({status:'held'}))];
  assert.equal(catalogueGrowthStop(declining),'diminishing_ready_yield');assert.equal(catalogueGrowthStop([...declining.slice(0,-2),{readiness:'ready'},{readiness:'ready'}]),null);
  assert.equal(catalogueGrowthStop([],{due_jobs:41}),'verification_backlog');assert.equal(catalogueGrowthStop([{reason:'source_http_429'}]),'source_rate_limited');assert.equal(catalogueGrowthStop([],{customer_rows:1}),'shadow_scope_leakage');assert.equal(catalogueGrowthStop([],{source_mutations:1}),'source_integrity_failure');
});
test('inline catalogue processing preserves priority and actual fetching for due proof renewals',async t=>{
  const db=await configured(t),url='https://www.eventeny.com/events/vendor/?id=52125',oldTime='2026-10-05T12:30:00.000Z';
  const {entity}=await seed(db,record({opportunity_id:'older',canonical_url:url,application_url:url}),{environment:'shadow'});
  const old=documentFixture({url});old.fetched_at=oldTime;
  const proof=await recordVerification(db,entity.id,old,{now:NOW});await evaluateReadiness(db,entity.id,{now:NOW});
  await enqueue(db,'enrichment','due-renewal',{entity_id:entity.id,refresh_verification_id:proof.verification_id},NOW);
  const doc=documentFixture(),run=await startCatalogueRun(db,{max_candidates:1},NOW),page=await discoverCataloguePage(db,{run_id:run.id,url:'https://www.eventeny.com/sitemap/event_elements.xml'},{now:NOW,fetcher:async()=>new Response('<urlset><url><loc>'+doc.url+'</loc></url></urlset>')});
  const calls=[];const result=await verifyCatalogueCandidate(db,page.candidates[0].id,{now:NOW,fetcher:async u=>{calls.push(u);return new Response(u===url?old.html:doc.html,{headers:{'content-type':'text/html'}});}});
  assert.equal(result.readiness,'ready');assert.deepEqual(calls,[doc.url,url]);
  const renewed=await sql(db,'SELECT checked_at FROM source_verifications WHERE entity_id=? ORDER BY sequence DESC LIMIT 1',entity.id).first();assert.equal(renewed.checked_at,NOW);
  await drainPipeline(db,{now:NOW});
  assert.equal((await sql(db,'SELECT status FROM readiness WHERE entity_id=?',entity.id).first()).status,'ready');
});
test('sponsor labels need explicit guaranteed vendor space; a competition with a proved selling pitch remains valid',()=>{
  const doc=documentFixture(),withApplication=(heading,description)=>({...doc,html:doc.html.replace('Vendor Application | 2026',heading).replace('</main>','<div><h2>About the application</h2><p>'+description+'</p></div></main>')});
  assert.ok(verifyDocument(withApplication('Sponsors','Sponsorship may include vendor space and brand recognition.'),{now:NOW}).reasons.includes('sponsor_trading_entitlement_not_proved'));
  assert.ok(verifyDocument(withApplication('Trick-or-Treat Vendor (Sponsor/Advertiser)','Hand out candy. Decorate the booth.'),{now:NOW}).reasons.includes('sponsor_trading_entitlement_not_proved'));
  assert.equal(verifyDocument(withApplication('Sponsors','Each package includes one vendor booth to sell your products.'),{now:NOW}).status,'verified');
  assert.equal(verifyDocument(withApplication('Bake Off Competition Entry','The entry fee includes one competition entry and one vendor space at the market to sell your products.'),{now:NOW}).status,'verified');
});
test('a newly unsupported cached scope automatically pauses free acquisition before another source fetch',async t=>{
  const db=await configured(t),doc=documentFixture(),run=await startCatalogueRun(db,{max_candidates:2},NOW),url2=doc.url.replace('52126','52127');
  const page=await discoverCataloguePage(db,{run_id:run.id,url:'https://www.eventeny.com/sitemap/event_elements.xml'},{now:NOW,fetcher:async()=>new Response('<urlset>'+[doc.url,url2].map(u=>'<url><loc>'+u+'</loc></url>').join('')+'</urlset>')});
  const first=await verifyCatalogueCandidate(db,page.candidates[0].id,{now:NOW,fetcher:async()=>new Response(doc.html,{headers:{'content-type':'text/html'}})});
  const v=await sql(db,'SELECT * FROM source_verifications WHERE entity_id=? ORDER BY sequence DESC LIMIT 1',first.entity_id).first(),old=JSON.parse(v.report_json);old.application_heading='Sponsors';old.application_policy='current-application-v1.3';old.application_scope_proof={trader_application:true};
  await sql(db,"INSERT INTO source_verifications(id,entity_id,entity_revision,document_id,verifier_version,status,report_json,checked_at,expires_at) VALUES ('old-sponsor',?,?,?,'source-proof-v1','verified',?,?,?)",v.entity_id,v.entity_revision,v.document_id,JSON.stringify(old),v.checked_at,v.expires_at).run();
  await evaluateReadiness(db,v.entity_id,{now:NOW});await sql(db,"UPDATE readiness SET status='ready' WHERE entity_id=?",v.entity_id).run();
  let fetches=0;await assert.rejects(verifyCatalogueCandidate(db,page.candidates[1].id,{now:NOW,fetcher:()=>{fetches++;throw Error('must not fetch');}}),/current_scope_false_promotion/);
  assert.equal(fetches,0);assert.equal((await catalogueStatus(db)).runs[0].stop_reason,'current_scope_false_promotion');assert.equal((await catalogueStatus(db)).runs[0].checked,1);
});
test('environment loss recovers only an expired uncommitted lease and never refunds its fetch budget',async t=>{
  const db=await configured(t),doc=documentFixture(),run=await startCatalogueRun(db,{max_candidates:1},NOW),page=await discoverCataloguePage(db,{run_id:run.id,url:'https://www.eventeny.com/sitemap/event_elements.xml'},{now:NOW,fetcher:async()=>new Response('<urlset><url><loc>'+doc.url+'</loc></url></urlset>')}),id=page.candidates[0].id;
  await sql(db,"UPDATE catalogue_progress SET status='verifying',lease_until='2026-10-06T11:59:00.000Z' WHERE candidate_id=?",id).run();await sql(db,'UPDATE catalogue_runs SET checked=1 WHERE id=?',run.id).run();
  await stopCatalogueRun(db,run.id,'operator_review');
  assert.equal((await recoverUncommittedCatalogueLease(db,id,NOW)).reservations_refunded,0);assert.equal((await catalogueStatus(db)).runs[0].checked,1);assert.equal((await catalogueStatus(db)).runs[0].status,'paused');
  await assert.rejects(resumeReviewedCatalogueRun(db,{run_id:run.id,review:'Uncommitted lease cleared without restoring consumed budget.'},NOW),/unexpired_bounded_paused/);
  let fetches=0;await assert.rejects(verifyCatalogueCandidate(db,id,{now:NOW,fetcher:()=>{fetches++;throw Error('no budget');}}),/active_bounded_catalogue_run_required/);assert.equal(fetches,0);
  await assert.rejects(recoverUncommittedCatalogueLease(db,id,NOW),/uncommitted_expired_lease/);
});
test('an uncertain budget update cannot leave a claimed candidate stuck or refund a committed reservation',async t=>{
  const db=await configured(t),run=await startCatalogueRun(db,{max_candidates:2},NOW),doc=documentFixture(),page=await discoverCataloguePage(db,{run_id:run.id,url:'https://www.eventeny.com/sitemap/event_elements.xml'},{now:NOW,fetcher:async()=>new Response('<urlset><url><loc>'+doc.url+'</loc></url></urlset>')}),id=page.candidates[0].id,prepare=db.prepare;
  db.prepare=query=>{const statement=prepare(query);if(query.startsWith('UPDATE catalogue_runs SET checked=checked+1'))return {bind:(...args)=>({all:async()=>{await statement.bind(...args).all();throw Error('SQLITE_BUSY: simulated lost committed reservation response');}})};return statement;};
  let visits=0;await assert.rejects(verifyCatalogueCandidate(db,id,{now:NOW,fetcher:()=>{visits++;throw Error('no source visit');}}),/catalogue_budget_reservation_sqlite_busy/);db.prepare=prepare;
  assert.equal(visits,0);assert.equal((await sql(db,'SELECT status FROM catalogue_progress WHERE candidate_id=?',id).first()).status,'pending');
  const state=await sql(db,'SELECT checked,status,stop_reason FROM catalogue_runs WHERE id=?',run.id).first();assert.equal(state.checked,1);assert.equal(state.status,'paused');assert.equal(state.stop_reason,'budget_reservation_error');
});
test('interrupted committed catalogue custody settles without fetching, renewing proof, changing identity or refunding budget',async t=>{
  const db=await configured(t),run=await startCatalogueRun(db,{max_candidates:1},NOW),doc=documentFixture();
  const discovery=await discoverCataloguePage(db,{run_id:run.id,url:'https://www.eventeny.com/sitemap/event_elements.xml'},{now:NOW,fetcher:async()=>new Response('<urlset><url><loc>'+doc.url+'</loc></url></urlset>')});
  const id=discovery.candidates[0].id,prepare=db.prepare;
  db.prepare=query=>{if(query.startsWith("UPDATE catalogue_progress SET status='imported'"))throw Error('simulated_final_receipt_failure');return prepare(query);};
  await assert.rejects(verifyCatalogueCandidate(db,id,{now:NOW,fetcher:async()=>new Response(doc.html,{headers:{'content-type':'text/html'}})}),/final_receipt_failure/);db.prepare=prepare;
  const before=await sql(db,'SELECT * FROM catalogue_progress WHERE candidate_id=?',id).first(),proof=await sql(db,'SELECT id,checked_at,expires_at FROM source_verifications ORDER BY sequence DESC LIMIT 1').first(),facts=await sql(db,'SELECT COUNT(*) AS n FROM source_facts').first();
  assert.equal(before.status,'failed');assert.ok(before.record_id&&before.entity_id&&before.document_id);
  // Recovery is deliberately allowed after the old run expires, without
  // reopening its discovery/fetch permission. Expired proof yields WATCH.
  const result=await settleCommittedCatalogueReceipt(db,id,'2026-10-07T13:00:00.000Z');assert.equal(result.source_fetches,0);assert.equal(result.readiness,'watch');
  const after=await sql(db,'SELECT * FROM catalogue_progress WHERE candidate_id=?',id).first();
  for(const field of ['record_id','entity_id','document_id'])assert.equal(after[field],before[field]);
  assert.deepEqual(await sql(db,'SELECT id,checked_at,expires_at FROM source_verifications ORDER BY sequence DESC LIMIT 1').first(),proof);assert.equal((await sql(db,'SELECT COUNT(*) AS n FROM source_facts').first()).n,facts.n);
  assert.equal((await sql(db,'SELECT checked,status FROM catalogue_runs WHERE id=?',run.id).first()).checked,1);
  assert.equal((await sql(db,'SELECT status FROM catalogue_runs WHERE id=?',run.id).first()).status,'paused');
  await assert.rejects(settleCommittedCatalogueReceipt(db,id,'2026-10-07T13:00:00.000Z'),/committed_interrupted_receipt_required/);
});
test('a new bounded run skips recently held routes without turning them into canonical opportunities',async t=>{
  const db=await configured(t),doc=documentFixture(),xml='<urlset><url><loc>'+doc.url+'</loc></url></urlset>',fetcher=async()=>new Response(xml);
  const first=await startCatalogueRun(db,{max_candidates:1},NOW),page=await discoverCataloguePage(db,{run_id:first.id,url:'https://www.eventeny.com/sitemap/event_elements.xml'},{now:NOW,fetcher});
  await verifyCatalogueCandidate(db,page.candidates[0].id,{now:NOW,fetcher:async()=>new Response('<main><h1>Directory</h1></main>',{headers:{'content-type':'text/html'}})});
  const later='2026-10-07T01:00:00.000Z',second=await startCatalogueRun(db,{max_candidates:1},later),replay=await discoverCataloguePage(db,{run_id:second.id,url:'https://www.eventeny.com/sitemap/event_elements.xml'},{now:later,fetcher});
  assert.equal(replay.candidates[0].duplicate,true);assert.equal(replay.candidates[0].duplicate_reason,'recent_source_check_already_present');
  assert.equal((await sql(db,'SELECT COUNT(*) AS n FROM entities').first()).n,0);assert.equal((await sql(db,'SELECT checked FROM catalogue_runs WHERE id=?',second.id).first()).checked,0);
  const expired='2026-10-07T13:00:00.000Z',third=await startCatalogueRun(db,{max_candidates:1},expired),retry=await discoverCataloguePage(db,{run_id:third.id,url:'https://www.eventeny.com/sitemap/event_elements.xml'},{now:expired,fetcher});assert.equal(retry.candidates[0].duplicate,false);
});
test('source deadline after the proved event is quarantined, retained verbatim and also blocks older proof reports',()=>{
  const doc=documentFixture(),bad={...doc,html:doc.html.replaceAll('2026-11-20','2030-11-20').replaceAll('Nov 20, 2026','Nov 20, 2030')};
  const result=verifyDocument(bad,{now:NOW});assert.equal(result.status,'quarantine');assert.equal(result.facts.application_deadline,'2030-11-20');assert.equal(result.facts.event_end,'2026-11-22');assert.ok(result.reasons.includes('contradictory_application_deadline_after_event'));
  const old={facts:result.facts,reasons:[]};assert.ok(compareProof({market:'US',edition:'2026'},old).includes('contradictory_application_deadline_after_event'));
  const oldTitle=verifyDocument(documentFixture({event:{name:'Riverfront Craft Fair 2025'}}),{now:NOW});assert.equal(oldTitle.status,'quarantine');assert.equal(oldTitle.facts.event_name,'Riverfront Craft Fair 2025');assert.ok(compareProof({},oldTitle).includes('contradictory_event_name_edition'));
  const winter=documentFixture({event:{name:'Winter Farmers Market 2026-2027',startDate:'2025-12-06T12:00:00Z',endDate:'2027-03-27T12:00:00Z'}});winter.html=winter.html.replace('Vendor Application | 2026','Outdoor Food Trucks');assert.equal(verifyDocument(winter,{now:NOW}).status,'verified');
});
test('reviewed resume retains the original ceiling, consumed reservations and expiry and cannot reopen an expired run',async t=>{
  const db=await configured(t),run=await startCatalogueRun(db,{max_candidates:2},NOW);await sql(db,'UPDATE catalogue_runs SET checked=1 WHERE id=?',run.id).run();await stopCatalogueRun(db,run.id,'application_deadline_quality_review');
  await assert.rejects(resumeReviewedCatalogueRun(db,{run_id:run.id},NOW),/operator_review_required/);
  const resumed=await resumeReviewedCatalogueRun(db,{run_id:run.id,review:'Contradictory source dates now held; durable queue settled.'},NOW);assert.equal(resumed.max_candidates,2);assert.equal(resumed.checked,1);assert.equal(resumed.expires_at,run.expires_at);assert.equal(resumed.reservations_refunded,0);
  assert.equal((await sql(db,"SELECT COUNT(*) AS n FROM source_documents WHERE json_extract(document_json,'$.document_kind')='bounded_catalogue_operator_resume'").first()).n,1);
  await stopCatalogueRun(db,run.id,'operator_stopped');await assert.rejects(resumeReviewedCatalogueRun(db,{run_id:run.id,review:'New day'},'2026-10-07T01:00:00.000Z'),/unexpired_bounded_paused/);
});
test('application-specific dated edition conflicts and age restrictions hold; historical dates and genuine unrestricted vendors remain eligible',()=>{
  const doc=documentFixture(),insert=description=>({...doc,html:doc.html.replace('</main>','<div><h2>About the application</h2><p>'+description+'</p></div></main>')});
  const conflict=verifyDocument(insert('This festival will be held Saturday, November 21st, 2025, and Sunday, November 22nd, 2025. Vendors can sell their products.'),{now:NOW});
  assert.equal(conflict.status,'quarantine');assert.ok(conflict.reasons.includes('contradictory_application_description_dates'));assert.equal(conflict.facts.event_start,'2026-11-21');assert.deepEqual(conflict.application_scope_proof.event_date_assertions,['2025-11-21','2025-11-22']);
  const good=verifyDocument(insert('Founded in 2012, our festival will take place November 21, 2026. Vendors sell handmade products. Upload a photo from November 21, 2025.'),{now:NOW});assert.equal(good.status,'verified');assert.deepEqual(good.application_scope_proof.event_date_assertions,['2026-11-21']);
  const young=verifyDocument(insert('This vendor opportunity is for business owners aged 21 and under.'),{now:NOW});assert.ok(young.reasons.includes('application_restricted_audience_requires_review'));
});
test('operator recovers a lost completed HTTP outcome from custody without re-fetching; pending or failed work cannot be replayed as success',async t=>{
  const db=await configured(t),run=await startCatalogueRun(db,{max_candidates:1},NOW),doc=documentFixture(),page=await discoverCataloguePage(db,{run_id:run.id,url:'https://www.eventeny.com/sitemap/event_elements.xml'},{now:NOW,fetcher:async()=>new Response('<urlset><url><loc>'+doc.url+'</loc></url></urlset>')});
  const id=page.candidates[0].id;assert.equal(await completedCatalogueOutcome(db,id),null);
  let fetches=0;const original=await verifyCatalogueCandidate(db,id,{now:NOW,fetcher:async()=>{fetches++;return new Response(doc.html,{headers:{'content-type':'text/html'}});}});
  const recovered=await completedCatalogueOutcome(db,id);assert.equal(recovered.entity_id,original.entity_id);assert.equal(recovered.readiness,'ready');assert.equal(recovered.source_refetches,0);assert.equal(fetches,1);assert.equal((await sql(db,'SELECT checked FROM catalogue_runs WHERE id=?',run.id).first()).checked,1);
  await sql(db,"UPDATE catalogue_progress SET status='failed' WHERE candidate_id=?",id).run();assert.equal(await completedCatalogueOutcome(db,id),null);
});
test('an unrelated Eventeny application cannot repair facts of a retained parent event; application redirects cannot silently change identity',async t=>{
  const db=await configured(t),{entity}=await seed(db,record({canonical_url:'https://www.eventeny.com/events/original-fair-10/'}),{producer:'city-search',environment:'shadow'}),before=await sql(db,'SELECT COUNT(*) AS n FROM source_facts').first();
  const wrong=documentFixture({event:{url:'https://www.eventeny.com/events/unrelated-fair-11/',name:'Different Actual Fair'}}),result=await recordVerification(db,entity.id,wrong,{now:NOW});
  assert.equal(result.report.status,'quarantine');assert.ok(result.report.reasons.includes('source_parent_event_identity_mismatch'));assert.equal(result.proposals.length,0);assert.equal((await sql(db,'SELECT COUNT(*) AS n FROM source_facts').first()).n,before.n);
  const moved=documentFixture({url:'https://www.eventeny.com/events/vendor/?id=52127'});moved.requested_url=record().application_url;assert.ok(verifyDocument(moved,{now:NOW}).reasons.includes('source_application_identity_mismatch'));
});
test('a known parent event cannot drift within the same country/year across repeated verification of the same vendor URL',async t=>{
  const db=await configured(t),{entity}=await seed(db,record(),{producer:'city-search',environment:'shadow'});
  await recordVerification(db,entity.id,documentFixture({event:{url:'https://www.eventeny.com/events/river-fair-10/'}}),{now:NOW});
  for(const at of ['2026-10-06T13:00:00.000Z','2026-10-06T14:00:00.000Z']) {
    const doc=documentFixture({event:{url:'https://www.eventeny.com/events/river-fair-11/'}});doc.fetched_at=at;const r=await recordVerification(db,entity.id,doc,{now:at});
    assert.equal(r.report.status,'quarantine');assert.equal(r.proposals.length,0);assert.ok(r.report.reasons.includes('source_parent_event_identity_mismatch'));
  }
});
test('artist participation and financial grants are not selling pitches; explicit artist sales and priced artist-alley tables qualify',()=>{
  const doc=documentFixture(),application=(heading,description)=>({...doc,html:doc.html.replace('Vendor Application | 2026',heading).replace('</main>','<div><h2>About the application</h2><p>'+description+'</p></div></main>')});
  for(const [heading,description] of [['CHALK ARTIST Application','Professionals create temporary visual art using chalk on sidewalks.'],['Commercial Business Relocation Assistance Grant Program','Financial assistance offsets eligible business relocation expenses.'],['Performances - Food Truck Rodeo','Musicians perform near food trucks and will receive payment.'],['MERCHANTS: Fall Fest','Your primary role will be to hand out candy. There is an optional booth rental.']]) {
    assert.ok(verifyDocument(application(heading,description),{now:NOW}).reasons.includes('application_is_not_a_trader_opportunity'));
  }
  assert.ok(verifyDocument(application('Artist Application','You may showcase your art. Selling is prohibited.'),{now:NOW}).reasons.includes('trader_application_purpose_not_proved'));
  assert.ok(verifyDocument(application('Commercial Application','Businesses may apply for assistance.'),{now:NOW}).reasons.includes('trader_application_purpose_not_proved'));
  assert.equal(verifyDocument(application('Artist Application','Upload images representing the work you would like to sell at the show.'),{now:NOW}).status,'verified');
  assert.equal(verifyDocument(application('Artists Alley','Artists can showcase their work and sell their unique creations.'),{now:NOW}).status,'verified');
  assert.equal(verifyDocument(application('Artist Application','Artist Alley Tables are six feet wide. Pricing for the table is $75.'),{now:NOW}).status,'verified');
  assert.equal(verifyDocument(application('Commercial/Nonprofit Vendor Application','Apply for a booth.'),{now:NOW}).status,'verified');
  assert.ok(verifyDocument(application('Shopping Center Merchants ONLY','Participating merchants can host a food sales booth.'),{now:NOW}).reasons.includes('application_restricted_audience_requires_review'));
  assert.equal(verifyDocument(application('Candy and Craft Vendors','Your primary role will be to hand out candy. You may also sell your products at your booth.'),{now:NOW}).status,'verified');
  assert.ok(verifyDocument(application('Application','For details contact vendors@example.org or https://example.org/vendors.'),{now:NOW}).reasons.includes('trader_application_purpose_not_proved'));
  assert.ok(verifyDocument(application('Volunteers','Volunteers will help vendors set up their booths.'),{now:NOW}).reasons.includes('application_is_not_a_trader_opportunity'));
});
test('truncated historical proof excerpts retain the parent-event binding through the immutable full source document',async t=>{
  const db=await configured(t),{entity}=await seed(db,record(),{producer:'city-search',environment:'shadow'}),old=documentFixture({event:{url:'https://www.eventeny.com/events/river-fair-10/'}}),oldReport=verifyDocument(old,{now:NOW});
  delete oldReport.event_source_url;oldReport.evidence.find(e=>e.kind==='event_json_ld').excerpt='{"truncated":';
  await sql(db,'INSERT INTO source_documents VALUES (?,?,NULL,?,?)','old-parent-doc',old.url,NOW,JSON.stringify(old)).run();
  await sql(db,"INSERT INTO source_verifications(id,entity_id,entity_revision,document_id,verifier_version,status,report_json,checked_at,expires_at) VALUES ('old-parent-proof',?,?,'old-parent-doc','source-proof-v1','verified',?,?,?)",entity.id,entity.revision,JSON.stringify(oldReport),NOW,'2026-10-07T12:00:00.000Z').run();
  const before=await sql(db,'SELECT COUNT(*) AS n FROM source_facts').first(),r=await recordVerification(db,entity.id,documentFixture({event:{url:'https://www.eventeny.com/events/river-fair-11/'}}),{now:NOW});
  assert.equal(r.report.status,'quarantine');assert.ok(r.report.reasons.includes('source_parent_event_identity_mismatch'));assert.equal(r.proposals.length,0);assert.equal((await sql(db,'SELECT COUNT(*) AS n FROM source_facts').first()).n,before.n);
});
