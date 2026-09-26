import test from 'node:test';
import assert from 'node:assert/strict';
import { promoteCustomerOpportunity } from '../../platform/findpitches-v2/customer/promote.mjs';

function dbSpy(){
 const calls=[];
 return {calls,prepare(sql){calls.push(sql);return {bind(){return this;},async run(){return {success:true};}};}};
}
const base={id:'x',market:'GB',region_code:'GB-ENG-KENT',event_name:'Food Fair',canonical_url:'https://x.test',application_url:'https://x.test/apply',last_checked:'2026-09-26',status:'validated',score:80};

test('customer-ready candidate is promoted into isolated customer store',async()=>{
 const db=dbSpy();
 const r=await promoteCustomerOpportunity(db,base,{offerings:{value:[{label:'Trinidadian doubles',kind:'food',cuisine:'Trinidadian'}],confidence:.8}});
 assert.equal(r.promoted,true);
 assert.ok(db.calls.some(sql=>/INSERT INTO customer_opportunities/.test(sql)));
 assert.equal(r.opportunity.offerings[0].cuisine,'Trinidadian');
});

test('incomplete candidate is retained but not promoted or rejected',async()=>{
 const db=dbSpy();
 const r=await promoteCustomerOpportunity(db,{...base,application_url:null},{organiser:'Kent Events'});
 assert.equal(r.promoted,false);
 assert.equal(r.reason,'not_customer_ready');
 assert.deepEqual(r.readiness.missing,['application_url']);
 assert.equal(db.calls.length,0);
 assert.equal(r.opportunity.organiser,'Kent Events');
});

test('optional enrichment absence does not narrow customer readiness gate',async()=>{
 const db=dbSpy();
 const r=await promoteCustomerOpportunity(db,base,{});
 assert.equal(r.promoted,true);
 assert.equal(r.opportunity.organiser,null);
 assert.equal(r.opportunity.offerings,null);
});
