import test from 'node:test';import assert from 'node:assert/strict';
import {parseMyntVenue,UK_ADAPTER_VERSION} from '../../platform/findpitches-v3/uk-sources.mjs';
import {verifyDocument,compareProof,applicationScope,country} from '../../platform/findpitches-v3/verification.mjs';
import {startUKRun,discoverUKSource,importUKCandidate} from '../../platform/findpitches-v3/uk-store.mjs';
import {stagingReady} from '../../platform/findpitches-v3/staging.mjs';
import {verifyStructuredControl} from '../../platform/findpitches-v3/control.mjs';
import {sql} from '../../platform/findpitches-v3/store.mjs';
import {database,NOW} from './helpers.mjs';
import worker from '../../platform/findpitches-v3/worker.mjs';
import {ukGrowthStop} from '../../operations/findpitches-v3/uk-growth.mjs';
import {recordVerification,reverifyRetainedSource} from '../../platform/findpitches-v3/verification-store.mjs';
import {enqueue} from '../../platform/findpitches-v3/jobs.mjs';
import {record,seed} from './helpers.mjs';
import {documentFixture} from './verification-fixture.mjs';
import {evaluateReadiness} from '../../platform/findpitches-v3/pipeline.mjs';

const URL='https://www.myntimage.co.uk/events/lyndhurst/',FORM='https://www.emailmeform.com/builder/form/FixtureForm';
function documents({capacity='12',formDate='21st November 2026',title='Lyndhurst Craft and Gift market',disabled='',country=true}={}) {
  const venue={requested_url:URL,url:URL,fetched_at:NOW,html:`<div id="content_area"><h1>Lyndhurst Community Centre</h1><p>Mynt Image welcomes traders to Lyndhurst${country?' in England':''}.</p><p>To make a booking please check the availability below and fill our application form.</p><h2>Availability - 2026</h2><table><tr><th>Date</th><th>Stall Spaces</th><th>Candle Spaces</th><th>Footfall</th></tr><tr><td>21st November</td><td>${capacity}</td><td>0</td><td>900</td></tr><tr><td>22nd November</td><td>5</td><td>0</td><td>900</td></tr></table><h2>Application Form</h2><script src="https://www.emailmeform.com/builder/forms/jsform/FixtureForm"></script></div>`};
  const form={requested_url:FORM,url:FORM,fetched_at:NOW,html:`<form method="post" action="${FORM}"><div id="emf-form-title">${title}</div><label for="business">Business Name</label><input id="business"><label for="products">Product Description</label><textarea id="products"></textarea><label for="date">${formDate}</label><input type="checkbox" id="date" value="${formDate}" ${disabled}><label for="date2">22nd November 2026</label><input type="checkbox" id="date2" value="22nd November 2026"><input type="submit" value="Submit"></form>`};
  return [venue,form];
}
const bundle=(options={})=>({document_kind:'uk_official_bundle',adapter_version:UK_ADAPTER_VERSION,requested_url:URL,url:URL,source_identifier:'lyndhurst:2026-11-21',fetched_at:NOW,documents:documents(options)});
test('dated capacity and exact active trader form prove one real edition',()=>{
  for(const value of ['England','Scotland','Wales','Northern Ireland'])assert.equal(country(value),'GB');assert.equal(country('Ireland'),'IE');assert.equal(country('London'),null);
  const r=verifyDocument(bundle(),{now:NOW});assert.equal(r.status,'verified');assert.equal(r.facts.country,'GB');assert.equal(r.facts.application_state,'OPEN_NOW');assert.equal(r.facts.event_start,'2026-11-21');assert.equal(r.facts.application_url,FORM);
  assert.ok(compareProof({source_platform:'myntimage',source_identifier:'lyndhurst:2026-11-22'},r).includes('source_event_identity_mismatch'));
  assert.ok(applicationScope({...r,application_scope_proof:{}}).reasons.includes('trader_application_purpose_not_proved'));
});
test('generic/footer country is never event geography and unrelated date is held',()=>{
  const b=bundle({country:false});b.documents[0].html+='<footer>United Kingdom</footer>';
  assert.ok(verifyDocument(b,{now:NOW}).reasons.includes('verified_country_missing'));
  assert.ok(verifyDocument(bundle({formDate:'21st November 2025'}),{now:NOW}).reasons.includes('exact_event_date_missing_from_application'));
});
test('capacity, edition, form audience and redirect controls fail closed',()=>{
  for(const opts of [{capacity:'0'},{capacity:'Fully Booked'},{title:'Belfast Craft and Gift market'},{disabled:'disabled'}])assert.notEqual(verifyDocument(bundle(opts),{now:NOW}).status,'verified');
  const b=bundle();b.documents[1].url='https://www.emailmeform.com/builder/form/AnotherEvent';assert.notEqual(verifyDocument(b,{now:NOW}).status,'verified');
  const staleValue=bundle();staleValue.documents[1].html=staleValue.documents[1].html.replace('value="21st November 2026"','value="21st November 2025"');assert.ok(verifyDocument(staleValue,{now:NOW}).reasons.includes('exact_event_date_missing_from_application'));
  const restricted=bundle();restricted.documents[1].html=restricted.documents[1].html.replace('</form>','<p>Members only</p></form>');assert.equal(verifyDocument(restricted,{now:NOW}).status,'quarantine');
  assert.ok(verifyDocument(bundle(),{now:'2027-01-01T12:00:00.000Z'}).reasons.includes('stale_edition'));
});
test('missing capacity stays unknown, and the real venue booking title still needs trader fields',()=>{
  const absent=verifyDocument(bundle({capacity:''}),{now:NOW});assert.equal(absent.facts.application_state,'UNKNOWN');assert.ok(absent.reasons.includes('dated_capacity_not_proved'));
  assert.equal(verifyDocument(bundle({title:'Lyndhurst Community Centre Booking Form'}),{now:NOW}).status,'verified');
  const b=bundle({title:'Lyndhurst Community Centre Booking Form'});b.documents[1].html=b.documents[1].html.replace('Product Description','Performer Biography');assert.notEqual(verifyDocument(b,{now:NOW}).status,'verified');
  assert.equal(ukGrowthStop(Array.from({length:50},()=>({status:'held'}))),'zero_ready_after_warmup');
  assert.equal(ukGrowthStop([],{customer_rows:1}),'shadow_scope_leakage');assert.equal(ukGrowthStop([],{source_mutations:1}),'source_integrity_failure');assert.equal(ukGrowthStop([],{due_jobs:41}),'verification_backlog');
});
test('footfall is not capacity; date/table structure changes are rejected',()=>{
  const b=bundle();b.documents[0].html=b.documents[0].html.replace('Stall Spaces','Footfall');assert.throws(()=>parseMyntVenue(b.documents[0]),/structure_changed/);
  const bad=bundle();bad.documents[0].html=bad.documents[0].html.replace('21st November','31st November');assert.throws(()=>parseMyntVenue(bad.documents[0]),/requires_review/);
});
test('country join binds the official venue pin and checks distance independently',()=>{
  const b=bundle({country:false}),direction='https://www.myntimage.co.uk/directions/lyndhurst/';
  b.documents[0].html=b.documents[0].html.replace('<h2>Availability','<a href="'+direction+'">Finding the venue</a><h2>Availability');
  b.documents.push({requested_url:direction,url:direction,fetched_at:NOW,html:'<div id="content_area"><h1>How to find the Lyndhurst Community Centre</h1><div class="module-type-googlemaps"><a href="https://www.google.com/maps/search/?query=50.87,-1.57">Map</a></div></div>'});
  const geoUrl='https://api.postcodes.io/postcodes?lon=-1.57&lat=50.87&radius=100&limit=1';
  b.documents.push({requested_url:geoUrl,url:geoUrl,fetched_at:NOW,json_text:JSON.stringify({status:200,result:[{latitude:50.87,longitude:-1.57,distance:0,postcode:'SO43 7NY',country:'England',region:'South East'}]})});
  assert.equal(verifyDocument(b,{now:NOW}).status,'verified');
  const conflict=structuredClone(b);conflict.documents[0].html=conflict.documents[0].html.replace('Lyndhurst.','Lyndhurst in England.');conflict.documents[3].json_text=conflict.documents[3].json_text.replace('England','Scotland');assert.equal(verifyDocument(conflict,{now:NOW}).status,'quarantine');
  b.documents[3].json_text=b.documents[3].json_text.replace('50.87','40.87');assert.ok(verifyDocument(b,{now:NOW}).reasons.includes('verified_country_missing'));
});
test('normal pipeline, immutable custody, idempotence and staging isolation',async t=>{
  const db=database(t);await sql(db,"INSERT INTO quality_gates VALUES ('structured-100-preservation',100,0,'{}','fixture_gate',?)",NOW).run();await sql(db,"UPDATE commercial_acquisition_policy SET manual_paused=1").run();
  const run=await startUKRun(db,{max_visits:5,max_candidates:5},NOW),docs=documents(),fetcher=async url=>new Response(docs.find(d=>d.url===url)?.html??'',{headers:{'content-type':'text/html'}});
  const found=await discoverUKSource(db,{run_id:run.id,url:URL},{fetcher,now:NOW});assert.equal(found.candidates.length,2);
  const result=await importUKCandidate(db,found.candidates[0].id,{now:NOW});assert.equal(result.readiness,'ready');
  const next=await importUKCandidate(db,found.candidates[1].id,{now:NOW});assert.equal(next.readiness,'ready');assert.notEqual(next.entity_id,result.entity_id);
  const again=await startUKRun(db,{max_visits:5,max_candidates:5},NOW),rediscovered=await discoverUKSource(db,{run_id:again.id,url:URL},{fetcher,now:NOW});
  const linked=await importUKCandidate(db,rediscovered.candidates[0].id,{now:NOW});assert.equal(linked.entity_id,result.entity_id);assert.equal(linked.identity_outcome,'IDEMPOTENT_REPLAY');assert.equal((await sql(db,'SELECT COUNT(*) AS n FROM entities').first()).n,2);
  assert.equal((await importUKCandidate(db,found.candidates[0].id,{now:NOW})).replay,true);
  assert.equal((await discoverUKSource(db,{run_id:run.id,url:URL},{fetcher,now:NOW})).replay,true);
  const preview=await stagingReady(db,{market:'GB',now:NOW});assert.equal(preview.items.length,2);assert.equal(preview.publication_enabled,false);assert.equal(preview.items[0].evidence,undefined);assert.equal(preview.items[0].verification,undefined);
  assert.equal((await sql(db,'SELECT COUNT(*) AS n FROM customer_projections').first()).n,0);assert.equal((await sql(db,'SELECT COUNT(*) AS n FROM publication_queue').first()).n,0);
  await assert.rejects(sql(db,"UPDATE uk_source_candidates SET source_identifier='other'").run(),/immutable/);await assert.rejects(sql(db,'DELETE FROM uk_source_visits').run(),/immutable/);
  await assert.rejects(reverifyRetainedSource(db,result.entity_id,{now:'2026-10-07T12:00:01.000Z'}),/document_expired/);
  const denied=await worker.fetch(new Request('https://shadow.test/staging/ready'),{FINDPITCHES_V3_DB:db,V3_ROLE:'api',V3_OPERATOR_TOKEN:'operator-private-fixture-token'});assert.equal(denied.status,401);
  const stagingToken='private-read-only-staging-fixture-token',env={FINDPITCHES_V3_DB:db,V3_ROLE:'api',V3_STAGING_TOKEN:stagingToken,V3_OPERATOR_TOKEN:'separate-private-operator-fixture-token'};
  const previewResponse=await worker.fetch(new Request('https://shadow.test/staging/ready?market=GB',{headers:{Authorization:'Bearer '+stagingToken}}),env);assert.equal(previewResponse.status,200);
  assert.ok(Array.isArray((await previewResponse.json()).items));
  const write=await worker.fetch(new Request('https://shadow.test/uk/start',{method:'POST',headers:{Authorization:'Bearer '+stagingToken,'Content-Type':'application/json'},body:'{}'}),env);assert.equal(write.status,401);
});
test('UK inline work still honours and actually fetches a due existing proof renewal',async t=>{
  const db=database(t);await sql(db,"INSERT INTO quality_gates VALUES ('structured-100-preservation',100,0,'{}','fixture',?)",NOW).run();await sql(db,'UPDATE commercial_acquisition_policy SET manual_paused=1').run();
  const {entity}=await seed(db,record(),{environment:'shadow'}),old=documentFixture();old.fetched_at='2026-10-05T13:00:00.000Z';const proof=await recordVerification(db,entity.id,old,{now:NOW});
  await enqueue(db,'enrichment','uk-due-proof',{entity_id:entity.id,refresh_verification_id:proof.verification_id},NOW);
  const run=await startUKRun(db,{max_visits:5},NOW),docs=documents(),fetcher=async u=>new Response(docs.find(d=>d.url===u)?.html??'',{headers:{'content-type':'text/html'}}),discovered=await discoverUKSource(db,{run_id:run.id,url:URL},{fetcher,now:NOW});
  const visited=[];await importUKCandidate(db,discovered.candidates[0].id,{now:NOW,fetcher:async u=>{visited.push(u);return new Response(old.html,{headers:{'content-type':'text/html'}});}});
  assert.deepEqual(visited,[old.url]);assert.equal((await sql(db,'SELECT checked_at FROM source_verifications WHERE entity_id=? ORDER BY sequence DESC LIMIT 1',entity.id).first()).checked_at,NOW);
});
test('staging never presents a discovery-only region as verified geography',async t=>{
  const db=database(t),{entity}=await seed(db,record({region_code:'query-only-region'}),{environment:'shadow'});
  await recordVerification(db,entity.id,documentFixture(),{now:NOW});await evaluateReadiness(db,entity.id,{now:NOW});
  const page=await stagingReady(db,{market:'US',now:NOW});assert.equal(page.items.length,1);assert.equal(page.items[0].region,null);
  assert.equal((await stagingReady(db,{market:'US',region:'query-only-region',now:NOW})).items.length,0);
  assert.equal(JSON.parse((await sql(db,"SELECT value_json FROM selected_facts WHERE entity_id=? AND field_name='region_code'",entity.id).first()).value_json),'query-only-region');
});
test('visit reservation is enforced before a network request',async t=>{
  const db=database(t);await sql(db,"INSERT INTO quality_gates VALUES ('structured-100-preservation',100,0,'{}','fixture_gate',?)",NOW).run();await sql(db,"UPDATE commercial_acquisition_policy SET manual_paused=1").run();const run=await startUKRun(db,{max_visits:1},NOW);let calls=0;
  await assert.rejects(discoverUKSource(db,{run_id:run.id,url:URL},{now:NOW,fetcher:async()=>{calls++;return new Response(documents()[0].html,{headers:{'content-type':'text/html'}});}}),/visit_limit/);
  assert.equal(calls,1);assert.equal((await sql(db,'SELECT visits_reserved FROM uk_source_runs WHERE id=?',run.id).first()).visits_reserved,1);
});
