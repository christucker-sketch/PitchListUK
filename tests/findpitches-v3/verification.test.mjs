import test from 'node:test';
import assert from 'node:assert/strict';
import {database,record,seed,NOW} from './helpers.mjs';
import {documentFixture} from './verification-fixture.mjs';
import {verifyDocument,compareProof} from '../../platform/findpitches-v3/verification.mjs';
import {recordVerification,verificationGate} from '../../platform/findpitches-v3/verification-store.mjs';
import {fetchSourceDocument} from '../../platform/findpitches-v3/source-document.mjs';
import {evaluateReadiness} from '../../platform/findpitches-v3/pipeline.mjs';
import {loadEntity,sql} from '../../platform/findpitches-v3/store.mjs';
import {parseHtml,nodes,text} from '../../platform/findpitches-v3/source-dom.mjs';

test('Eventeny proof binds vendor ID, dates, geography, organiser and offer window',()=>{
  const report=verifyDocument(documentFixture(),{now:NOW});assert.equal(report.status,'verified');assert.equal(report.facts.country,'US');assert.equal(report.facts.application_state,'OPEN_NOW');
  assert.equal(compareProof({...record(),market:'CA'},report).includes('source_country_market_mismatch'),true);
});
test('search market cannot supply absent source country',()=>{
  const d=documentFixture({event:{location:{name:'River Hall',address:{streetAddress:'1 River Street',addressLocality:'Austin'}}}});
  const r=verifyDocument(d,{now:NOW,market:'US',city:'Austin'});assert.equal(r.facts.country,null);assert.notEqual(r.status,'verified');
});
test('duplicate Eventeny JSON-LD calendar dates agree despite offsets; different editions do not',()=>{
  const d=documentFixture(),event=JSON.parse(d.html.match(/<script[^>]*>(.*?)<\/script>/)[1]);
  const same={...event,startDate:'2026-11-21T10:00:00-05:00',endDate:'2026-11-22T10:00:00-06:00'};
  assert.equal(verifyDocument(documentFixture({duplicates:[same]}),{now:NOW}).status,'verified');
  assert.equal(verifyDocument(documentFixture({duplicates:[{...same,startDate:'2027-11-21'}]}),{now:NOW}).status,'quarantine');
});
test('stale, contradictory, cancelled events and TBA venues cannot be ready',()=>{
  for(const event of [{startDate:'2025-11-21',endDate:'2025-11-22'},{startDate:'2026-11-25',endDate:'2026-11-22'},{eventStatus:'https://schema.org/EventCancelled'},{location:{name:'TBA',address:{streetAddress:'TBA',addressLocality:'Austin',addressCountry:'US'}}}])assert.notEqual(verifyDocument(documentFixture({event}),{now:NOW}).status,'verified');
});
test('waitlist and closed controls override stock offers; conditional terms do not',()=>{
  for(const body of ['<button>Join waitlist</button>','<p>Applications closed</p>'])assert.notEqual(verifyDocument(documentFixture({body}),{now:NOW}).status,'verified');
  assert.equal(verifyDocument(documentFixture({body:'<p>If you are waitlisted or not accepted, your fee is refunded.</p>'}),{now:NOW}).status,'verified');
  const d=documentFixture();d.html=d.html.replace('<h1>Vendor Application | 2026</h1>','<h1>WAITLIST - Youth Vendor, Non Profits, &amp; other</h1>');
  const r=verifyDocument(d,{now:NOW});assert.equal(r.facts.application_state,'WATCH');assert.ok(r.reasons.includes('waitlist_only'));assert.notEqual(r.status,'verified');
});
test('LocalStalls uses the event application, never footer registration',()=>{
  const d=documentFixture({profile:'localstalls',url:'https://localstalls.com/au/event/laidley/river-market',event:{location:{name:'River Hall',address:{streetAddress:'1 River Street',addressLocality:'Laidley',addressCountry:'AU'}}}});
  const r=verifyDocument(d,{now:NOW});assert.equal(r.status,'verified');assert.match(r.facts.application_url,/\/application\/.*\?event=/);assert.doesNotMatch(r.facts.application_url,/registration/);
  d.html=d.html.replace(/<main>[\s\S]*?<\/main>/,'<main><h1>River Lantern Autumn Craft Market</h1></main>');assert.notEqual(verifyDocument(d,{now:NOW}).status,'verified');
});
test('Eventbrite visitor tickets and UKCraftFairs enquiry do not prove open vendor applications',()=>{
  for(const url of ['https://www.eventbrite.com/e/river-market-tickets-123','https://www.ukcraftfairs.com/craft-events/123/river-market']) {
    const r=verifyDocument(documentFixture({profile:'generic',url,body:'<a href="/contact">Contact organiser</a>'}),{now:NOW});assert.notEqual(r.status,'verified');assert.notEqual(r.facts.application_state,'OPEN_NOW');
  }
});
test('social, editorial, directory and unrelated event pages are discovery only',()=>{
  for(const url of ['https://facebook.com/events/123','https://example.org/blog/river','https://www.eventeny.com/events/applications/','https://example.org/directory','https://example.org/'])assert.equal(verifyDocument(documentFixture({url}),{now:NOW}).status,'quarantine');
  const r=verifyDocument(documentFixture({profile:'generic',url:'https://example.org/event/river',event:{url:'https://example.org/event/unrelated'}}),{now:NOW});assert.equal(r.status,'quarantine');
});
test('fresh verification is mandatory; proof and documents are immutable and expire',async t=>{
  const db=database(t),{entity}=await seed(db);
  assert.notEqual((await evaluateReadiness(db,entity.id,{now:NOW})).status,'ready');
  await assert.rejects(sql(db,"UPDATE readiness SET status='ready' WHERE entity_id=?",entity.id).run(),/proof_required/);
  const stored=await recordVerification(db,entity.id,documentFixture(),{now:NOW});
  assert.equal((await evaluateReadiness(db,entity.id,{now:NOW})).status,'ready');
  for(const q of ['UPDATE source_verifications SET status=\'verified\'','DELETE FROM source_verifications','UPDATE source_documents SET document_json=\'{}\'','DELETE FROM source_documents'])await assert.rejects(sql(db,q).run(),/immutable/);
  await sql(db,"INSERT OR REPLACE INTO source_verifications SELECT sequence,id,entity_id,entity_revision,document_id,verifier_version,'quarantine',report_json,checked_at,expires_at FROM source_verifications WHERE id=?",stored.verification_id).run();
  assert.equal((await verificationGate(db,await loadEntity(db,entity.id),{now:NOW})).status,'verified');
  await assert.rejects(recordVerification(db,entity.id,{...documentFixture(),fetched_at:'2026-10-05T12:00:00.000Z'},{now:NOW}),/older_verification/);
  assert.notEqual((await evaluateReadiness(db,entity.id,{now:'2026-10-07T13:00:00.000Z'})).status,'ready');
});
test('stronger proof repairs discovery fields additively; country mismatch never changes identity',async t=>{
  const db=database(t);await sql(db,"INSERT INTO quality_gates VALUES ('structured-100-preservation',100,0,'{}','gate',?)",NOW).run();
  const {entity,recordId}=await seed(db,record({event_name:'Vendor Application',organiser:'Eventeny'}),{producer:'city-search'});
  const before=await sql(db,'SELECT * FROM source_facts WHERE record_id=?',recordId).all();
  const r=await recordVerification(db,entity.id,documentFixture(),{now:NOW});assert.equal(r.report.status,'verified');assert.equal((await loadEntity(db,entity.id)).event_name,record().event_name);
  assert.deepEqual(await sql(db,'SELECT * FROM source_facts WHERE record_id=?',recordId).all(),before);
  const ca=await seed(db,record({country_code:'CA',opportunity_id:'wrong-country'}),{producer:'city-search'});
  const bad=await recordVerification(db,ca.entity.id,documentFixture(),{now:NOW});assert.equal(bad.report.status,'quarantine');assert.equal(bad.proposals.length,0);assert.equal((await loadEntity(db,ca.entity.id)).market,'CA');
});
test('strong source disagreements remain blocked; later failure invalidates earlier readiness',async t=>{
  const db=database(t),{entity}=await seed(db,record({organiser:'Wrong organiser'}));
  const r=await recordVerification(db,entity.id,documentFixture(),{now:NOW});assert.equal(r.report.status,'quarantine');assert.equal((await loadEntity(db,entity.id)).organiser,'Wrong organiser');
  assert.notEqual((await evaluateReadiness(db,entity.id,{now:NOW})).status,'ready');
  const good=await seed(db,record({opportunity_id:'good',application_url:'https://www.eventeny.com/events/vendor/?id=777',canonical_url:'https://www.eventeny.com/events/vendor/?id=777'}));
  await recordVerification(db,good.entity.id,documentFixture({url:good.entity.application_url}),{now:NOW});assert.equal((await evaluateReadiness(db,good.entity.id,{now:NOW})).status,'ready');
  await recordVerification(db,good.entity.id,{requested_url:good.entity.application_url,fetched_at:NOW,reason:'source_http_429'},{now:NOW});assert.equal(await sql(db,'SELECT * FROM readiness WHERE entity_id=?',good.entity.id).first(),null);
});
test('fetching checks every redirect, size, MIME type and rate limit without leaking credentials',async()=>{
  let calls=0;const d=await fetchSourceDocument('https://example.org/event',{now:NOW,fetcher:async(u,init)=>{calls++;assert.equal(init.headers.Authorization,undefined);return new Response('',{status:302,headers:{location:'https://127.0.0.1/private'}});}});assert.equal(d.reason,'unsafe_original_source_url');assert.equal(calls,1);
  for(const [response,reason] of [[new Response('x'.repeat(1048577),{headers:{'content-type':'text/html'}}),'source_response_size_limit'],[new Response('{}',{headers:{'content-type':'application/json'}}),'source_format_requires_review'],[new Response('',{status:429,headers:{'retry-after':'120'}}),'source_http_429']])assert.equal((await fetchSourceDocument('https://example.org/event',{fetcher:async()=>response})).reason,reason);
});
test('inert bounded HTML reader excludes navigation, footer and executable data',()=>{
  const r=parseHtml('<main><h1>Market &amp; Fair</h1><script>throw secret()</script><nav><a href="/bad">Apply</a></nav><footer>Footer</footer></main>');assert.equal(text(r),'Market & Fair');assert.equal(nodes(r,n=>n.tag==='a',{scoped:true}).length,0);
  assert.throws(()=>parseHtml('<div>'.repeat(125)),/structure_limit/);assert.throws(()=>parseHtml('<script>unclosed'),/unclosed/);
});
test('visible application deadline disagreement remains quarantined',()=>{
  const r=verifyDocument(documentFixture({body:'<p>Deadline: Nov 19, 2026 11:59pm</p>'}),{now:NOW});assert.equal(r.status,'quarantine');assert.ok(r.reasons.includes('contradictory_visible_application_deadline'));
});
