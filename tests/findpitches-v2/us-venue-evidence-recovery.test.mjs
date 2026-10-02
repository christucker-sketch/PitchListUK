import test from 'node:test';
import assert from 'node:assert/strict';
import { assessVenueEvidence, classifyVenueEvidence } from '../../platform/findpitches-v2/enrichment/venue-evidence.mjs';
import { extractNamedFields } from '../../platform/findpitches-v2/enrichment/named-fields.mjs';
import { projectCustomerOpportunity } from '../../platform/findpitches-v2/customer/project.mjs';
import { planUsVenueRecovery, inspectRefetchedVenuePages } from '../../platform/findpitches-v2/quality/us-venue-recovery.mjs';

test('explicit venue passes shared extractor and projection',()=>{
 const doc={url:'https://example.org/vendors',body:'<h2>Apply for a market stall</h2><p>Venue: Riverside Showground</p>'};
 const field=extractNamedFields([doc]).location;
 assert.equal(field.value,'Riverside Showground');
 assert.equal(classifyVenueEvidence(field).accepted,true);
 const candidate={id:'a',market:'US',event_name:'Riverside Fair',region_code:'CA',
  status:'validated',last_checked:'2026-09-29T12:00:00Z',
  canonical_url:'https://example.org/vendors',application_url:'https://example.org/apply'};
 const projected=projectCustomerOpportunity(candidate,{location:field});
 assert.equal(projected.opportunity.location,'Riverside Showground');
 assert.equal(projected.provenance.location.evidence[0].source,doc.url);
});

test('rejects nonvenue UI fragments, regulatory and booth placement text',()=>{
 const samples=[
  ['in real-time','Location: in real-time'],
  ['Booth placement','Event location: Booth placement'],
  ['the applicable law','Venue: the applicable law'],
  ['headquarters','Venue: headquarters'],
  ['Location services','Event location: Location services'],
  ['Vendor booth 8','Venue: Vendor booth 8. Contact office is elsewhere']
 ];
 for(const [value,excerpt] of samples){
  assert.equal(assessVenueEvidence(value,excerpt).accepted,false,excerpt);
 }
 assert.equal(assessVenueEvidence('The Showground','Event venue: The Showground').accepted,true);
});

test('rejects organiser office, unlabelled city, generic location lacking event context',()=>{
 const sources=[
  'Office location: 12 High Street',
  'Contact location: Town Hall',
  'Location: Central Park',
  'Venue: The Market Square, contact office at 22 Main Street'
 ];
 for (const body of sources) {
  assert.equal(extractNamedFields([{url:'https://example.org/vendors',body}]).location,null,body);
 }
 const result=extractNamedFields([{url:'https://example.org/vendors',body:'Summer festival event. Location: Central Park'}]);
 assert.equal(result.location.value,'Central Park');
 assert.equal(assessVenueEvidence('Central Park','Held at Central Park').accepted,true);
});

test('projection independently rejects misleading provenance even if extractor was bypassed',()=>{
 const candidate={id:'a',market:'US',region_code:'TX',event_name:'Fair',
  status:'validated',last_checked:'2026-09-29T12:00:00Z',
  canonical_url:'https://example.org/fair',application_url:'https://example.org/apply'};
 const bad=[
  'Location: in real-time',
  'Contact office: River Park is our mailing address',
  'Here at the River Park we sell booth allocations',
  'Event venue: River Park. Booth allocation and your booth location may vary'
 ];
 for(const excerpt of bad) {
  const projection=projectCustomerOpportunity(candidate,{location:{
    value:excerpt.includes('real-time')?'in real-time':'River Park',
    evidence:[{source:'https://example.org/fair',excerpt}]
  }});
  assert.equal(projection.opportunity.location,null,excerpt);
 }
});

test('bounded recovery preview never writes or assigns a GEOID',()=>{
 const inventory={snapshot_at:'2026-09-29T19:34:16.585Z',visible:[
  {id:'a',region_code:'TX',enrichment_json:JSON.stringify({location:{
    value:'River Park',evidence:[{source:'https://example.org/fair',excerpt:'Event venue: River Park'}]}}),
   canonical_url:'https://example.org/fair'},
  {id:'b',region_code:'CA',enrichment_json:JSON.stringify({location:{
    value:'in real-time',evidence:[{source:'https://example.org/fair',excerpt:'Location: in real-time'}]}})},
  {id:'c',region_code:'AL',enrichment_json:'garbled json'},
  {id:'d',region_code:'WA'}
 ]};
 const result=planUsVenueRecovery(inventory,{reviewedIds:['d'],limit:2});
 assert.equal(result.visible,4);
 assert.equal(result.already_reviewed,1);
 assert.equal(result.stored_evidence_strong,1);
 assert.equal(result.weak_evidence,2);
 assert.equal(result.invalid_enrichment_json,1);
 assert.equal(result.queued,2);
 assert.equal(result.queue[0].status,'stored_explicit_venue_candidate');
 assert.equal(result.queue[1].status,'needs_source_reinspection');
 assert.equal('venue_geoid' in result.queue[0],false);
 assert.throws(()=>planUsVenueRecovery({visible:[{id:'x'},{id:'x'}]}),/duplicate/);
});

test('refetched pages return possible venue for human review, never automatic verification',()=>{
 const result=inspectRefetchedVenuePages([
  {final_url:'https://example.org/application',body:'Market stall application\nEvent venue: River Park'}
 ]);
 assert.equal(result.status,'possible_event_venue_needs_independent_review');
 assert.equal(result.verified_venue_geoid,null);
 assert.equal(result.requires_manual_review,true);
 assert.equal(inspectRefetchedVenuePages([{url:'https://example.org/contact',body:'Office location: Company HQ'}]).status,'venue_not_proven');
 assert.throws(()=>inspectRefetchedVenuePages(Array.from({length:6},()=>({}))),/page_limit/);
});

test('recovery preview flags possible duplicate sources and old-year URLs for review',()=>{
 const source='https://example.org/vendors/event-2022';
 const inventory={snapshot_at:'2026-09-29T19:34:16Z',visible:[
  {id:'a',canonical_url:source},
  {id:'b',canonical_url:source+'#apply'},
  {id:'c',canonical_url:'https://example.org/vendors/event-2026'}
 ]};
 const report=planUsVenueRecovery(inventory);
 assert.equal(report.queue[0].review_flags[0].code,'stale_year_in_source_url');
 assert.ok(report.queue[1].review_flags.some(f=>f.code==='possible_duplicate_source'&&f.other_opportunity_id==='a'));
 assert.ok(report.queue[1].review_flags.some(f=>f.code==='stale_year_in_source_url'));
 assert.equal(report.queue[2].review_flags.length,0);
});


test('regression: real private-audit boilerplate must never masquerade as event venue',()=>{
 const falsePositives=[
  ['overnight','STORAGE: As this is a two-day market, vendors are permitted to leave their vending materials within the venue overnight.'],
  ['restriction, or other reasons','Event information may change due to weather condition, construction, venue restriction, or other reasons. Please confirm details with event organizers.'],
  ['is convenient and centrally located to the entire northern Gulf Coast','The venue is convenient and centrally located to the entire northern Gulf Coast.'],
  ['is closely monitored by police beginning at 6PM Friday evening','The venue is closely monitored by police beginning at 6PM Friday evening.'],
  ['& Hours','Venue & Hours'],
  ['map to choose your space','Once your application is accepted, you will receive a link to our venue map to choose your space.'],
  ['Tour','Schedule a Venue Tour'],
  ['are not responsible for any lost, stolen, or damaged merchandise','The hosting venue are not responsible for any lost, stolen, or damaged merchandise.'],
  ['availability, event planning, vendor opportunities','Ask about venue availability, event planning, vendor opportunities or anything else related to the Convention Center.'],
  ['Rentals, &#038','Leasing, Venue Rentals, &#038; Performance Requests'],
  ['noon each day at the market, must be present to win','Drawing will be held at noon each day at the market, must be present to win.'],
  ['the Vineyard','Check their lineup of exciting summer events held at the Vineyard.']
 ];
 for(const [value,excerpt] of falsePositives){
  assert.equal(assessVenueEvidence(value,excerpt).accepted,false,excerpt);
  const r=extractNamedFields([{url:'https://example.org/vendor-application',body:excerpt}]);
  assert.equal(r.location,null,excerpt);
 }
});

test('regression: real specific event venue and street address remain eligible for independent review',()=>{
 const excerpt='This is an outdoor event to be held at Rancho San Rafael Regional Park at 1595 North Sierra Street, in Reno.';
 const value='Rancho San Rafael Regional Park at 1595 North Sierra Street, in Reno';
 assert.equal(assessVenueEvidence(value,excerpt).accepted,true);
 assert.equal(extractNamedFields([{url:'https://example.org/fair',body:excerpt}]).location.value,value);
 assert.equal(assessVenueEvidence('Maidstone Market Square','Venue: Maidstone Market Square').accepted,true);
 assert.equal(assessVenueEvidence('Riverfront Park','Event location: Riverfront Park').accepted,true);
 assert.equal(assessVenueEvidence('Central Park','Summer festival event. Location: Central Park').accepted,true);
});


test('regression: batch-3 source excerpts reject venue policy text and incomplete place phrases',()=>{
 const rejected=[
  ["operators never check — until it's their name on the flyer",
   "Florida DBPR orders emergency closures every week. Most venue operators never check — until it's their name on the flyer."],
  ['with a myriad of outdoor and indoor spaces and elegant, professional services',
   'Host your special day of any size and occasion at a peaceful, private, unique event venue with a myriad of outdoor and indoor spaces and elegant, professional services.'],
  ['Policies','Venue Policies'],
  ['or the','Vendor is liable for any damage caused by Vendor or any of its Representatives to the Event venue or the'],
  ['the Bonneville County','The Bonneville County Fair is a growing, community-centered event held at the Bonneville County'],
  ['Information','Grandstand Venue Information'],
  ['restriction, or other reasons','Event information may change due to weather condition, construction, venue restriction, or other reasons.']
 ];
 for(const [value,excerpt] of rejected){
  assert.equal(assessVenueEvidence(value,excerpt).accepted,false,excerpt);
  assert.equal(extractNamedFields([{url:'https://example.org/vendors',body:excerpt}]).location,null,excerpt);
 }
});

test('regression: explicit venue preceded by the still qualifies for independent verification',()=>{
 const excerpt='The next Washington State Summer Con will be in June 2027. The event is held at the Washington State Fair and Events Center in Puyallup, WA.';
 const value='the Washington State Fair and Events Center in Puyallup, WA';
 assert.equal(assessVenueEvidence(value,excerpt).accepted,true);
 const named=extractNamedFields([{url:'https://example.org/vendors',body:excerpt}]);
 assert.equal(named.location?.value,value);
});


test('real recovery excerpt cannot accept a venue name cut off after an ampersand',()=>{
 const excerpt='The 2027 Missouri Oral Health Policy Conference will be held at Capitol Plaza Hotel &';
 assert.equal(assessVenueEvidence('Capitol Plaza Hotel &',excerpt).accepted,false);
 assert.equal(extractNamedFields([{url:'https://example.org/vendors',body:excerpt}]).location,null);
 assert.equal(assessVenueEvidence('Riverside Showground','Venue: Riverside Showground').accepted,true);
});
