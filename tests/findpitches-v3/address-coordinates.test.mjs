import test from'node:test';import assert from'node:assert/strict';
import {database,seed,record,NOW}from'./helpers.mjs';import {documentFixture}from'./verification-fixture.mjs';
import {verifyDocument}from'../../platform/findpitches-v3/verification.mjs';import {recordVerification}from'../../platform/findpitches-v3/verification-store.mjs';
import {censusAddressInput,censusPosition,fetchCensusPosition,CENSUS_ENDPOINT}from'../../platform/findpitches-v3/address-coordinates.mjs';
import {startVenueMap,resolveVenueAddress}from'../../platform/findpitches-v3/address-coordinate-store.mjs';
import {sql}from'../../platform/findpitches-v3/store.mjs';import {stagingCatalogue}from'../../platform/findpitches-v3/staging.mjs';import {mapProof,search}from'../../platform/findpitches-v3/customer-catalogue.mjs';
import {bindEvidenceArchive}from'../../platform/findpitches-v3/evidence-archive.mjs';import {archiveBucket}from'./storage-fixture.mjs';
const address={country:'US',location:'River Hall, 1 River Street, Austin, Texas',street:'1 River Street',city:'Austin',state:'TX',postal_code:null};
function receipt(a=address){const u=new URL(CENSUS_ENDPOINT);u.search=new URLSearchParams({address:censusAddressInput(a).query,benchmark:'Public_AR_Current',format:'json'});return {url:u.href,requested_url:u.href,http_status:200,fetched_at:NOW,json_text:JSON.stringify({result:{addressMatches:[{matchedAddress:'1 RIVER ST, AUSTIN, TX',coordinates:{x:-97.74,y:30.27},addressComponents:{fromAddress:'1',toAddress:'99',streetName:'RIVER',suffixType:'ST',city:'AUSTIN',state:'TX',zip:'78701'},tigerLine:{tigerLineId:'123456',side:'L'}}]}})};}
const fetcher=async()=>new Response(receipt().json_text,{status:200});
async function entityProof(t){const db=database(t),{entity}=await seed(db,record(),{environment:'shadow'});await recordVerification(db,entity.id,documentFixture(),{now:NOW});await sql(db,'UPDATE commercial_acquisition_policy SET manual_paused=1 WHERE id=1').run();return {db,id:entity.id};}
test('exact source street matching rejects city centres, guessed states, foreign or ambiguous results',()=>{
 assert.ok(censusPosition(address,receipt()).position);
 for(const a of [{...address,country:'CA'},{...address,street:'Austin'},{...address,state:'unknown'},{...address,street:'PO Box 1'},{...address,street:'1 River Street Suite 2'}])assert.equal(censusAddressInput(a),null);
 for(const mutate of [m=>m.addressComponents.city='DALLAS',m=>m.addressComponents.state='CA',m=>m.addressComponents.streetName='OTHER',m=>m.coordinates.x=-0.12,m=>m.tigerLine.tigerLineId=null]){const d=receipt(),data=JSON.parse(d.json_text);mutate(data.result.addressMatches[0]);d.json_text=JSON.stringify(data);assert.equal(censusPosition(address,d).position,null);}
 const d=receipt(),data=JSON.parse(d.json_text);data.result.addressMatches.push(data.result.addressMatches[0]);d.json_text=JSON.stringify(data);assert.equal(censusPosition(address,d).reason,'census_ambiguous_address');
 assert.equal(censusPosition({...address,street:'101 River Street'},receipt({...address,street:'101 River Street'})).reason,'census_house_range_not_proved');
 assert.equal(censusPosition({...address,postal_code:'99999'},receipt({...address,postal_code:'99999'})).reason,'census_address_components_disagree');
 assert.equal(censusPosition({...address,street:'2 River Street'},receipt()).reason,'census_request_not_bound_to_source_address');
});
test('bounded mapping adds immutable provenance, idempotent cache and never extends source proof',async t=>{
 const {db,id}=await entityProof(t),before=await sql(db,'SELECT checked_at,expires_at FROM source_verifications WHERE entity_id=?',id).first(),facts=(await sql(db,'SELECT * FROM source_facts ORDER BY id').all()).results;
 const run=await startVenueMap(db,{max_requests:1,max_entities:10},NOW);let requests=0;
 const result=await resolveVenueAddress(db,{run_id:run.id,entity_id:id},{now:NOW,clock:()=>NOW,fetcher:async()=>{requests++;return fetcher();}});assert.equal(result.status,'mapped');
 assert.equal((await resolveVenueAddress(db,{run_id:run.id,entity_id:id},{now:NOW,clock:()=>NOW,fetcher})).replay,true);assert.equal(requests,1);
 const r2=await startVenueMap(db,{max_requests:1,max_entities:10},NOW);assert.equal((await resolveVenueAddress(db,{run_id:r2.id,entity_id:id},{now:NOW,clock:()=>NOW,fetcher:()=>{throw Error('must reuse cache');}})).cached,true);
 assert.deepEqual(await sql(db,'SELECT checked_at,expires_at FROM source_verifications WHERE entity_id=?',id).first(),before);assert.deepEqual((await sql(db,'SELECT * FROM source_facts ORDER BY id').all()).results,facts);
 await assert.rejects(sql(db,'UPDATE venue_address_coordinates SET position_json=?','{}').run(),/immutable/);await assert.rejects(sql(db,'DELETE FROM address_coordinate_cache').run(),/immutable/);
 const position=JSON.parse((await sql(db,'SELECT position_json FROM venue_address_coordinates').first()).position_json),v=await sql(db,'SELECT * FROM source_verifications WHERE entity_id=? ORDER BY sequence DESC',id).first(),report=verifyDocument(documentFixture(),{now:NOW});
 const item={id,country:'US',title:report.facts.event_name,organiser:report.facts.organiser,location:report.facts.location,event_start:report.facts.event_start,event_end:report.facts.event_end,application_url:report.facts.application_url,application_state:'OPEN_NOW',verified_at:before.checked_at,proof_expires_at:before.expires_at,entity_revision:v.entity_revision,verification_id:v.sequence,address_coordinates:position};
 const row=mapProof(item,NOW);assert.equal(row.location.precision,'address');assert.equal(search([row],{market:'US'},{tier:'free'},NOW).map_points.length,1);
 assert.notEqual(mapProof({...item,verification_id:v.sequence+1},NOW).location.precision,'address');assert.notEqual(mapProof({...item,location:'Somewhere else'},NOW).location.precision,'address');
 const document={...documentFixture(),fetched_at:'2026-10-06T13:00:00.000Z'};await recordVerification(db,id,document,{now:document.fetched_at});assert.equal((await sql(db,'SELECT COUNT(*) n FROM venue_address_coordinates').first()).n,2);
});
test('source renewal reuses an archive-backed coordinate receipt without a provider request or source-clock extension',async t=>{
 const {db,id}=await entityProof(t),bucket=archiveBucket();bindEvidenceArchive(db,bucket,{writeEnabled:true});
 const run=await startVenueMap(db,{max_requests:1},NOW);let requests=0;
 await resolveVenueAddress(db,{run_id:run.id,entity_id:id},{now:NOW,clock:()=>NOW,fetcher:async()=>{requests++;return fetcher();}});
 const cache=await sql(db,'SELECT d.document_json FROM address_coordinate_cache c JOIN source_documents d ON d.id=c.document_id').first(),pointer=JSON.parse(cache.document_json);assert.equal(pointer.document_kind,'r2_source_custody_v1');
 const now='2026-10-06T13:00:00.000Z';await recordVerification(db,id,{...documentFixture(),fetched_at:now},{now});
 assert.equal(requests,1);assert.equal((await sql(db,'SELECT COUNT(*) n FROM venue_address_coordinates').first()).n,2);
 const proof=await sql(db,'SELECT checked_at,expires_at FROM source_verifications WHERE entity_id=? ORDER BY sequence DESC LIMIT 1',id).first();assert.equal(proof.checked_at,now);assert.equal(proof.expires_at,'2026-10-07T13:00:00.000Z');
 bucket.objects.delete(pointer.key);const later='2026-10-06T14:00:00.000Z';await assert.rejects(recordVerification(db,id,{...documentFixture(),fetched_at:later},{now:later}),/evidence_missing/);
 assert.equal((await sql(db,'SELECT COUNT(*) n FROM venue_address_coordinates').first()).n,2);assert.equal(requests,1);
});
test('provider refusal pauses without retries, fabricated points or refunded reservations',async t=>{
 const {db,id}=await entityProof(t),run=await startVenueMap(db,{max_requests:1},NOW);const r=await resolveVenueAddress(db,{run_id:run.id,entity_id:id},{now:NOW,clock:()=>NOW,fetcher:async()=>new Response('',{status:429})});
 assert.equal(r.status,'held');assert.equal(r.provider_requests,1);const state=await sql(db,'SELECT * FROM venue_map_runs WHERE id=?',run.id).first();assert.equal(state.status,'paused');assert.equal(state.requests_reserved,1);assert.equal((await sql(db,'SELECT COUNT(*) n FROM venue_address_coordinates').first()).n,0);
});
test('US state projection rejects street/city name substrings and accepts a literal address component',()=>{
 const report=verifyDocument(documentFixture(),{now:NOW}),item={id:'ent_'+'a'.repeat(32),country:'US',title:report.facts.event_name,organiser:report.facts.organiser,location:'Hall, 1 Pennsylvania Avenue, Washington, United States',event_start:report.facts.event_start,event_end:report.facts.event_end,application_url:report.facts.application_url,application_state:'OPEN_NOW',verified_at:NOW,proof_expires_at:'2026-10-07T12:00:00Z'};
 assert.equal(mapProof(item,NOW).location.region_id,null);assert.ok(mapProof({...item,region:'DC'},NOW).location.region_id?.includes('district'));
});
