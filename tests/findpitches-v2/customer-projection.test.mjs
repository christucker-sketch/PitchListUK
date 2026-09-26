import test from 'node:test';
import assert from 'node:assert/strict';
import { projectCustomerOpportunity } from '../../platform/findpitches-v2/customer/project.mjs';

const candidate={
 id:'fpv2_1',market:'GB',region_code:'GB-ENG-KENT',event_name:'Town Market',
 canonical_url:'https://example.test/market',application_url:'https://example.test/apply',
 organiser:null,status:'validated',score:75,last_checked:'2026-09-26T14:00:00Z',
 geography:{location:'Kent'},event_start:null,event_end:null,deadline:null
};

test('projects classifier data without inventing enrichment',()=>{
 const {opportunity,readiness}=projectCustomerOpportunity(candidate);
 assert.equal(opportunity.title,'Town Market');
 assert.equal(opportunity.organiser,null);
 assert.equal(opportunity.recurring,null);
 assert.equal(opportunity.sells,null);
 assert.equal(opportunity.coordinates,null);
 assert.equal(readiness.ready,true);
});

test('enrichment overlays customer fields without mutating candidate',()=>{
 const {opportunity}=projectCustomerOpportunity(candidate,{organiser:'Town Council',sells:['food','craft','food'],recurring:false,coordinates:{lat:51.2,lng:0.5}});
 assert.equal(opportunity.organiser,'Town Council');
 assert.deepEqual(opportunity.sells,['food','craft']);
 assert.equal(opportunity.recurring,false);
 assert.deepEqual(opportunity.coordinates,{lat:51.2,lng:0.5});
 assert.equal(candidate.organiser,null);
});

test('projection cannot hide malformed enrichment coordinates',()=>{
 const {readiness}=projectCustomerOpportunity(candidate,{coordinates:{lat:999,lng:0}});
 assert.equal(readiness.ready,false);
 assert.ok(readiness.invalid.includes('coordinates'));
});
