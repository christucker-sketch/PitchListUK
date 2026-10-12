import test from 'node:test';
import assert from 'node:assert/strict';
import {VENUE_COORDINATE_POLICY,validVenueCoordinates,eventVenueCoordinates,retainedVenueCoordinates} from '../../platform/findpitches-v3/source-coordinates.mjs';
import {verifyDocument} from '../../platform/findpitches-v3/verification.mjs';
import {recordVerification} from '../../platform/findpitches-v3/verification-store.mjs';
import {mapProof,present,search} from '../../platform/findpitches-v3/customer-catalogue.mjs';
import {stagingCatalogue} from '../../platform/findpitches-v3/staging.mjs';
import {evaluateReadiness} from '../../platform/findpitches-v3/pipeline.mjs';
import {database,seed,record,NOW} from './helpers.mjs';
import {sql} from '../../platform/findpitches-v3/store.mjs';
import {documentFixture} from './verification-fixture.mjs';

const base=documentFixture(),event=JSON.parse(base.html.match(/<script[^>]*>(.*?)<\/script>/)[1]);
const position={policy:VENUE_COORDINATE_POLICY,precision:'venue',country:'US',location:'River Hall, 1 River Street, Austin, TX',lat:30.27,lng:-97.74,source_url:base.url,method:'event_location_geo'};
function withGeo(geo={latitude:30.27,longitude:-97.74},duplicates=[]){return documentFixture({event:{location:{...event.location,geo:{'@type':'GeoCoordinates',...geo}}},duplicates});}

test('only an exact event venue geo supplies coordinates; query/footer/organisation positions cannot',()=>{
  const report=verifyDocument(withGeo(),{now:NOW});assert.equal(report.status,'verified');assert.equal(report.venue_coordinates.lat,30.27);assert.equal(report.venue_coordinates.location,report.facts.location);
  const noGeo=documentFixture();noGeo.html=noGeo.html.replace('</main>','<a href="https://maps.google.com/?q=30.27,-97.74">Venue map</a></main>');
  assert.equal(verifyDocument(noGeo,{now:NOW,lat:30.27,lng:-97.74}).venue_coordinates,null);
  assert.equal(eventVenueCoordinates([{...event,organizer:{geo:{latitude:30.27,longitude:-97.74}}}],report.facts,base.url),null);
  const altered={...event,location:{...event.location,address:{...event.location.address,addressCountry:'CA'},geo:{latitude:30.27,longitude:-97.74}}};
  assert.equal(eventVenueCoordinates([altered],report.facts,base.url),null);
});

test('invalid, approximate, mismatched, outside-country and nonnumeric positions remain unpinned',()=>{
  const facts={country:'US',location:position.location};assert.equal(validVenueCoordinates(position,facts).lng,-97.74);
  for(const change of [{lat:null},{lat:true},{lat:''},{lat:Infinity},{lat:'30 degrees'},{lng:181},{lat:90},{lat:0,lng:0},{lat:51.5,lng:-0.1},{country:'GB'},{location:'A different venue'},{precision:'postcode'},{precision:'town'},{policy:'unproved'},{source_url:'http://example.org/map'},{method:'search_query'}])assert.equal(validVenueCoordinates({...position,...change},facts),null,JSON.stringify(change));
  assert.equal(validVenueCoordinates({...position,lat:'30.27',lng:'-97.74'},facts).lat,30.27);
  assert.equal(eventVenueCoordinates([{...event,location:{...event.location,address:{...event.location.address,streetAddress:'TBA'},geo:{latitude:30.27,longitude:-97.74}}}],facts,base.url),null);
});

test('contradictory duplicate venue coordinates withhold pins without changing event identity or READY facts',()=>{
  const duplicate={...event,location:{...event.location,geo:{'@type':'GeoCoordinates',latitude:30.3,longitude:-97.7}}};
  const r=verifyDocument(withGeo(undefined,[duplicate]),{now:NOW});assert.equal(r.status,'verified');assert.equal(r.venue_coordinates,null);
  assert.deepEqual(r.facts,verifyDocument(documentFixture(),{now:NOW}).facts);
  assert.equal(retainedVenueCoordinates({...r,coordinate_evidence:[{kind:'event_json_ld',excerpt:JSON.stringify({...event,location:{...event.location,geo:{latitude:30.27,longitude:-97.74}}})}]}),null);
  assert.equal(verifyDocument(withGeo({latitude:'30.27',longitude:'-97.74'},[{...event,location:{...event.location,geo:{latitude:30.27,longitude:-97.74}}}]),{now:NOW}).venue_coordinates.lat,30.27);
});

function legacyMynt(){return {profile:'myntimage',source_url:'https://www.myntimage.co.uk/events/lyndhurst/',facts:{country:'GB',location:'Lyndhurst Community Centre, Lyndhurst, England'},coordinate_evidence:[{kind:'venue_coordinate_country_proof',source_url:'https://api.postcodes.io/postcodes?lon=-1.57&lat=50.87&radius=100&limit=1',excerpt:JSON.stringify({country:'England',postcode:'SO43 7NY',distance_metres:0,official_venue_pin:{lat:50.87,lon:-1.57}})}]};}
test('retained Mynt venue-country pin is recovered conservatively, with original directions provenance',()=>{
  const report=legacyMynt(),before=JSON.stringify(report),pin=retainedVenueCoordinates(report);assert.equal(pin.lat,50.87);assert.equal(pin.source_url,'https://www.myntimage.co.uk/directions/lyndhurst/');assert.equal(JSON.stringify(report),before);
  for(const mutate of [r=>r.facts.country='US',r=>r.profile='generic',r=>r.source_url='https://example.org/events/lyndhurst/',r=>r.coordinate_evidence.push(r.coordinate_evidence[0]),r=>r.coordinate_evidence[0].source_url='https://api.postcodes.io/postcodes?lon=-1.57&lat=51.5&radius=100&limit=1',r=>r.coordinate_evidence[0].excerpt=r.coordinate_evidence[0].excerpt.replace('"distance_metres":0','"distance_metres":200'),r=>r.venue_coordinate_policy=VENUE_COORDINATE_POLICY]){const r=legacyMynt();mutate(r);assert.equal(retainedVenueCoordinates(r),null);}
  assert.equal(retainedVenueCoordinates({profile:'generic',facts:{country:'US',location:position.location},evidence:[{kind:'event_json_ld',excerpt:JSON.stringify(event)}]}),null,'old truncated first-block proof must be replayed');
});

test('fresh source coordinates reach Free search without paid URLs, original fact writes or silent identity changes',async t=>{
  const db=database(t),{entity}=await seed(db,record(),{environment:'shadow'});
  const before=JSON.stringify((await sql(db,'SELECT * FROM source_facts ORDER BY id').all()).results);
  await recordVerification(db,entity.id,withGeo(),{now:NOW,addEvidence:false});await evaluateReadiness(db,entity.id,{now:NOW});
  const snapshot=await stagingCatalogue(db,{now:NOW});assert.equal(snapshot.items.length,1);assert.equal(snapshot.items[0].venue_coordinates.lat,30.27);
  const mapped=mapProof(snapshot.items[0],NOW);assert.equal(mapped.id,entity.id);assert.equal(mapped.location.precision,'venue');
  const free=present(mapped),result=search([mapped],{market:'US'},null,NOW);assert.equal(result.map_points.length,1);assert.equal(free.access.application_url,null);assert.equal(free.access.source_url,null);assert.equal(JSON.stringify(result).includes(base.url),false);
  assert.equal(JSON.stringify((await sql(db,'SELECT * FROM source_facts ORDER BY id').all()).results),before);
  assert.equal((await stagingCatalogue(db,{now:'2026-10-08T12:00:00Z'})).items.length,0);
  assert.equal(mapProof({...snapshot.items[0],proof_expires_at:'2020-01-01'},NOW),null);
  assert.equal(mapProof({...snapshot.items[0],venue_coordinates:{...snapshot.items[0].venue_coordinates,country:'GB'}},NOW).location.lat,null);
  await sql(db,'UPDATE entities SET revision=revision+1 WHERE id=?',entity.id).run();assert.equal((await stagingCatalogue(db,{now:NOW})).items.length,0);
});

test('compact SQL recovers an old Mynt pin without replaying, refreshing or mutating the retained receipt',async t=>{
  const db=database(t),r=legacyMynt(),input=record({country_code:'GB',canonical_url:r.source_url,source_platform:'myntimage',organiser:'Mynt Image',location:r.facts.location,application_url:'https://www.emailmeform.com/builder/form/Fixture',event_name:'Lyndhurst Craft Market'}),{entity}=await seed(db,input,{environment:'shadow'});
  r.status='verified';r.reasons=[];r.application_scope_proof={trader_application:true};r.facts={...r.facts,event_name:input.event_name,organiser:input.organiser,event_start:input.event_start,event_end:input.event_end,application_url:input.application_url,application_state:'OPEN_NOW'};r.evidence=r.coordinate_evidence;delete r.coordinate_evidence;
  const original=JSON.stringify(r);await sql(db,"INSERT INTO source_documents VALUES ('retained-map-doc',?,NULL,?,'{}')",r.source_url,NOW).run();
  await sql(db,"INSERT INTO source_verifications(id,entity_id,entity_revision,document_id,verifier_version,status,report_json,checked_at,expires_at) VALUES ('retained-map',?,?,'retained-map-doc','source-proof-v1','verified',?,?,'2026-10-07T12:00:00Z')",entity.id,entity.revision,original,NOW).run();
  await evaluateReadiness(db,entity.id,{now:NOW});const snapshot=await stagingCatalogue(db,{now:NOW});assert.equal(snapshot.items.length,1);assert.equal(snapshot.items[0].venue_coordinates.lat,50.87);assert.equal(snapshot.items[0].verified_at,NOW);
  assert.equal((await sql(db,"SELECT report_json FROM source_verifications WHERE id='retained-map'").first()).report_json,original);
  assert.equal((await sql(db,'SELECT COUNT(*) n FROM source_verifications').first()).n,1);
});
