import test from 'node:test';
import assert from 'node:assert/strict';
import {projectPracticalOpportunity,assessPracticalReadiness} from '../../platform/findpitches-v2/customer/practical-readiness.mjs';

const candidate={
 id:'x',market:'GB',region_code:'GB-ENG-KENT',event_name:'Autumn Fair',
 canonical_url:'https://event.test/fair',application_url:'https://event.test/apply',
 last_checked:'2026-09-30T06:00:00Z',status:'validated'
};

test('exact venue remains highest precision and is customer-usable',()=>{
 const enrichment={location:{value:'Maidstone Market Square',
  evidence:[{source:'https://event.test/fair',excerpt:'Event venue: Maidstone Market Square'}],confidence:.9}};
 const r=projectPracticalOpportunity(candidate,enrichment,{now:new Date('2026-09-30T07:00:00Z')});
 assert.equal(r.opportunity.location,'Maidstone Market Square');
 assert.equal(r.opportunity.location_precision,'venue');
 assert.equal(r.opportunity.venue_verified,true);
 assert.equal(r.readiness.ready,true);
});

test('source-backed area is usable when exact venue is absent',()=>{
 const enrichment={location_area:{value:'Kent',precision:'area',
  evidence:[{source:'https://event.test/fair',excerpt:'Applications are open for vendors at our Autumn Fair in Kent.'}],confidence:.72}};
 const r=projectPracticalOpportunity(candidate,enrichment,{now:new Date('2026-09-30T07:00:00Z')});
 assert.equal(r.opportunity.location,'Kent');
 assert.equal(r.opportunity.location_precision,'area');
 assert.equal(r.opportunity.venue_verified,false);
 assert.equal(r.readiness.ready,true);
 assert.equal(r.readiness.completeness.event_date,false);
 assert.equal(r.readiness.completeness.application_deadline,false);
});

test('discovery-only geography is not enough for customer visibility',()=>{
 const r=projectPracticalOpportunity({...candidate,geography:{region:'Kent'}},{},{now:new Date('2026-09-30T07:00:00Z')});
 assert.equal(r.opportunity.location,null);
 assert.equal(r.readiness.ready,false);
 assert.ok(r.readiness.missing.includes('location'));
});

test('missing dates are partial information but expired deadlines still hard-block',()=>{
 const base={id:'x',market:'GB',title:'Fair',region_code:'KENT',location:'Kent',location_precision:'area',
  canonical_url:'https://event.test/fair',application_url:'https://event.test/apply',last_checked:'2026-09-30'};
 assert.equal(assessPracticalReadiness(base,{now:new Date('2026-09-30T07:00:00Z')}).ready,true);
 const expired={...base,application_deadline:'20 September 2026'};
 const r=assessPracticalReadiness(expired,{now:new Date('2026-09-30T07:00:00Z')});
 assert.equal(r.ready,false);
 assert.ok(r.blocked.some(x=>x.code==='application_deadline_passed'));
});

test('unsafe promotion URLs remain hard blockers',()=>{
 const r=assessPracticalReadiness({
  id:'x',market:'GB',title:'Fair',region_code:'KENT',location:'Kent',location_precision:'area',
  canonical_url:'https://event.test/fair',application_url:'https://facebook.com/vendors',last_checked:'2026-09-30'
 },{now:new Date('2026-09-30T07:00:00Z')});
 assert.equal(r.ready,false);
 assert.ok(r.blocked.some(x=>x.code==='social_url'));
});


test('stored place precision is preserved rather than guessed from the label text',()=>{
 const enrichment={location_area:{value:'Rochester',precision:'place',
  evidence:[{source:'https://event.test/fair',excerpt:'Applications are open for our Rochester market.'}],confidence:.8}};
 const r=projectPracticalOpportunity(candidate,enrichment,{now:new Date('2026-09-30T07:00:00Z')});
 assert.equal(r.opportunity.location,'Rochester');
 assert.equal(r.opportunity.location_precision,'place');
 assert.equal(r.readiness.ready,true);
});


test('source-backed place matching tolerates punctuation but still rejects contact context',()=>{
 const candidateUs={...candidate,market:'US',region_code:'CA'};
 const good=projectPracticalOpportunity(candidateUs,{location_area:{
  value:'Los Angeles CA',precision:'place',
  evidence:[{source:'https://event.test/fair',excerpt:'Vendor applications are open for our festival in Los Angeles, CA.'}],confidence:.8
 }},{now:new Date('2026-09-30T07:00:00Z')});
 assert.equal(good.opportunity.location,'Los Angeles CA');
 assert.equal(good.opportunity.location_precision,'place');
 assert.equal(good.readiness.ready,true);

 const bad=projectPracticalOpportunity(candidateUs,{location_area:{
  value:'Los Angeles CA',precision:'place',
  evidence:[{source:'https://event.test/contact',excerpt:'Our registered office address is Los Angeles, CA. Vendor enquiries welcome.'}],confidence:.8
 }},{now:new Date('2026-09-30T07:00:00Z')});
 assert.equal(bad.opportunity.location,null);
 assert.equal(bad.readiness.ready,false);
});


test('practical gate rejects explicit cross-market geography contradictions',()=>{
 const cases=[
  {candidate:{...candidate,market:'GB',region_code:'GB-ENG-KENT'},location:'Kent',excerpt:'Vendor applications are open for the annual fair in Kent, Ohio.'},
  {candidate:{...candidate,market:'IE',region_code:'SD'},location:'Yankton',excerpt:'Vendor spaces are available for this event in Yankton, South Dakota.'},
  {candidate:{...candidate,market:'US',region_code:'NJ'},location:'Toronto',excerpt:'Apply to vend at our event in Toronto, Ontario, Canada.'}
 ];
 for(const item of cases){
  const r=projectPracticalOpportunity(item.candidate,{location_area:{
   value:item.location,precision:'place',
   evidence:[{source:'https://event.test/vendors',excerpt:item.excerpt}],confidence:.8
  }},{now:new Date('2026-09-30T07:00:00Z')});
  assert.equal(r.readiness.ready,false,item.excerpt);
  assert.ok(r.readiness.blocked.some(x=>x.code==='cross_market_geography'),item.excerpt);
 }
});

test('practical gate rejects stale event editions found only in source text',()=>{
 const r=projectPracticalOpportunity(candidate,{location_area:{
  value:'Kent',precision:'area',
  evidence:[{source:'https://event.test/vendors',excerpt:'Applications for vendors at the 2023 Autumn Fair in Kent closed in August 2023.'}],confidence:.8
 }},{now:new Date('2026-09-30T07:00:00Z')});
 assert.equal(r.readiness.ready,false);
 assert.ok(r.readiness.blocked.some(x=>x.code==='stale_event_year'));
});

test('historic organisation year alone does not trigger stale event blocking',()=>{
 const r=projectPracticalOpportunity(candidate,{location_area:{
  value:'Kent',precision:'area',
  evidence:[{source:'https://event.test/vendors',excerpt:'Founded in 1988, we now welcome vendor applications for our Autumn Fair in Kent.'}],confidence:.8
 }},{now:new Date('2026-09-30T07:00:00Z')});
 assert.equal(r.readiness.ready,true);
 assert.ok(!r.readiness.blocked.some(x=>x.code==='stale_event_year'));
});

test('generic licensing, vendor-admin and marketplace pages are not practical opportunities',()=>{
 const excerpts=[
  'New Jersey food truck licensing guide. Vendor license application and permit guide for operators in Newark.',
  'Utah DABS vendor forms and alcoholic beverage services supplier registration in Salt Lake City.',
  'Kansas state employee discount program vendor application for businesses in Topeka.',
  'Beauty salon marketplace in Auckland. Browse salons and book an appointment with local vendors.'
 ];
 const markets=[
  {market:'US',region_code:'NJ',value:'Newark'},
  {market:'US',region_code:'UT',value:'Salt Lake City'},
  {market:'US',region_code:'KS',value:'Topeka'},
  {market:'NZ',region_code:'AUK',value:'Auckland'}
 ];
 for(let i=0;i<excerpts.length;i++){
  const item=markets[i];
  const r=projectPracticalOpportunity({...candidate,...item},{location_area:{
   value:item.value,precision:'place',
   evidence:[{source:'https://example.test/vendors',excerpt:excerpts[i]}],confidence:.8
  }},{now:new Date('2026-09-30T07:00:00Z')});
  assert.equal(r.readiness.ready,false,excerpts[i]);
  if(r.opportunity.location){
   assert.ok(r.readiness.blocked.some(x=>x.code==='generic_non_event_vendor_page'),excerpts[i]);
  } else {
   assert.ok(r.readiness.missing.includes('location'),excerpts[i]);
  }
 }
});

test('real event vendor pages remain usable despite ordinary permit wording',()=>{
 const r=projectPracticalOpportunity({...candidate,market:'US',region_code:'OR'},{location_area:{
  value:'Portland',precision:'place',
  evidence:[{source:'https://event.test/vendors',excerpt:'Vendor applications for the Portland Spring Festival are open. Food vendors must obtain the usual temporary permit.'}],confidence:.82
 }},{now:new Date('2026-09-30T07:00:00Z')});
 assert.equal(r.readiness.ready,true);
 assert.ok(!r.readiness.blocked.some(x=>x.code==='generic_non_event_vendor_page'));
});


test('ordinary pronoun us is not treated as United States evidence',()=>{
 const r=projectPracticalOpportunity({...candidate,market:'GB',region_code:'GB-ENG-LONDON'},{location_area:{
  value:'London',precision:'area',
  evidence:[{source:'https://event.test/vendors',excerpt:"A huge thank you to everyone who joined us for the London Jamaican Jerk Festival."}],confidence:.8
 }},{now:new Date('2026-09-30T07:00:00Z')});
 assert.equal(r.readiness.ready,true);
 assert.ok(!r.readiness.blocked.some(x=>x.code==='cross_market_geography'));
});

test('recent founding year near an event name is not treated as a stale event edition',()=>{
 const r=projectPracticalOpportunity({...candidate,market:'US',region_code:'WI'},{location_area:{
  value:'Wisconsin',precision:'area',
  evidence:[{source:'https://event.test/about',excerpt:'Founded by Ava Winstin in May of 2021, the Green Bay Vintage Market was created to bring together a community of small businesses and vintage lovers local to Green Bay, Wisconsin.'}],confidence:.8
 }},{now:new Date('2026-09-30T07:00:00Z')});
 assert.equal(r.readiness.ready,true);
 assert.ok(!r.readiness.blocked.some(x=>x.code==='stale_event_year'));
});

test('US state names in an overseas town name do not contradict market unless the projected location is US-shaped',()=>{
 const r=projectPracticalOpportunity({...candidate,market:'IE',region_code:'CN'},{location_area:{
  value:'Cavan',precision:'area',
  evidence:[{source:'https://event.test/show',excerpt:'The show takes place at Showgrounds, Virginia Co. Cavan.'}],confidence:.8
 }},{now:new Date('2026-09-30T07:00:00Z')});
 assert.equal(r.readiness.ready,true);
 assert.ok(!r.readiness.blocked.some(x=>x.code==='cross_market_geography'));
});


test('structured Event venue evidence remains customer-usable',()=>{
 const enrichment={location:{value:'Mote Park',
  evidence:[{source:'https://event.test/',kind:'schema_event_location',excerpt:'"location":{"@type":"Place","name":"Mote Park","address":{"addressLocality":"Maidstone"}}'}],confidence:.94},
  location_area:{value:'Maidstone',precision:'place',
  evidence:[{source:'https://event.test/',kind:'schema_event_location',excerpt:'"location":{"@type":"Place","name":"Mote Park","address":{"addressLocality":"Maidstone"}}'}],confidence:.9}};
 const r=projectPracticalOpportunity(candidate,enrichment,{now:new Date('2026-09-30T07:00:00Z')});
 assert.equal(r.opportunity.location,'Mote Park');
 assert.equal(r.opportunity.location_precision,'venue');
 assert.equal(r.opportunity.venue_verified,true);
 assert.equal(r.readiness.ready,true);
});


test('explicit GB county mismatch blocks practical visibility',()=>{
 const r=projectPracticalOpportunity({...candidate,region_code:'GB-ENG-DURHAM'},{location:{
  value:'Melton Mowbray Market',
  evidence:[{source:'https://event.test/location',excerpt:'The Beef Expo will be held at Melton Mowbray Market, Scalford Road, Melton Mowbray, Leicestershire.'}],confidence:.9
 }},{now:new Date('2026-09-30T07:00:00Z')});
 assert.equal(r.readiness.ready,false);
 assert.ok(r.readiness.blocked.some(x=>x.code==='region_evidence_conflict'));
});

test('matching GB county evidence remains usable',()=>{
 const r=projectPracticalOpportunity(candidate,{location:{
  value:'Maidstone Market Square',
  evidence:[{source:'https://event.test/location',excerpt:'Event venue: Maidstone Market Square, Kent.'}],confidence:.9
 }},{now:new Date('2026-09-30T07:00:00Z')});
 assert.equal(r.readiness.ready,true);
 assert.ok(!r.readiness.blocked.some(x=>x.code==='region_evidence_conflict'));
});

test('US state code in a non-US location statement is cross-market evidence',()=>{
 const r=projectPracticalOpportunity({...candidate,market:'GB',region_code:'GB-ENG-DEVON'},{location_area:{
  value:'Dorset Road',precision:'place',
  evidence:[{source:'https://event.test/visit',excerpt:'The show grounds are at 23 Dorset Road in Devon, PA.'}],confidence:.8
 }},{now:new Date('2026-09-30T07:00:00Z')});
 assert.equal(r.readiness.ready,false);
 assert.ok(r.readiness.blocked.some(x=>x.code==='cross_market_geography'));
});


test('freshly verified locality hint is practical but not venue-verified',()=>{
 const enrichment={location_area:{value:'Northampton Racecourse, Northampton',precision:'place',
  evidence:[{source:'https://event.test/apply',kind:'verified_location_hint',excerpt:'Food vendor applications are open. Northampton Racecourse, Northampton is the site for this year.'}],confidence:.84}};
 const r=projectPracticalOpportunity({...candidate,region_code:'GB-ENG-NHANTS'},enrichment,{now:new Date('2026-09-30T07:00:00Z')});
 assert.equal(r.opportunity.location,'Northampton Racecourse, Northampton');
 assert.equal(r.opportunity.location_precision,'place');
 assert.equal(r.opportunity.venue_verified,false);
 assert.equal(r.readiness.ready,true);
});


test('event-page location heading is accepted as source-backed practical place evidence',()=>{
 const r=projectPracticalOpportunity(candidate,{location_area:{
  value:'Stroud',precision:'place',
  evidence:[{source:'https://event.test/',excerpt:'Stroud, Gloucestershire',kind:'event_page_location_heading'}],confidence:.78
 }},{now:new Date('2026-09-30T07:00:00Z')});
 assert.equal(r.readiness.ready,true);
 assert.equal(r.opportunity.location,'Stroud');
 assert.equal(r.opportunity.location_precision,'place');
});

test('search-result snippet still requires event context before practical use',()=>{
 const good=projectPracticalOpportunity(candidate,{location_area:{
  value:'Maidstone',precision:'place',
  evidence:[{source:'https://event.test/vendors',excerpt:'Vendor applications are open for the Autumn Fair in Maidstone, Kent.',kind:'search_result_snippet'}],confidence:.66
 }},{now:new Date('2026-09-30T07:00:00Z')});
 const bad=projectPracticalOpportunity(candidate,{location_area:{
  value:'Maidstone',precision:'place',
  evidence:[{source:'https://event.test/vendors',excerpt:'Maidstone, Kent',kind:'search_result_snippet'}],confidence:.66
 }},{now:new Date('2026-09-30T07:00:00Z')});
 assert.equal(good.readiness.ready,true);
 assert.equal(bad.readiness.ready,false);
 assert.ok(bad.readiness.missing.includes('location'));
});
