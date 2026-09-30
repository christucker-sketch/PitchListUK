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
  assert.ok(r.readiness.blocked.some(x=>x.code==='generic_non_event_vendor_page'),excerpts[i]);
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
