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
 const enrichment={location_area:{value:'Kent',
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
