import test from 'node:test';
import assert from 'node:assert/strict';
import { upsertCustomerOpportunity, searchCustomerOpportunities } from '../../platform/findpitches-v2/customer/store.mjs';

function dbSpy(){
 const calls=[];
 return {calls,prepare(sql){const call={sql,args:null};calls.push(call);return {bind(...args){call.args=args;return this;},async run(){return {success:true};},async all(){return {results:[]};},async first(){return null;}};}};
}
test('upsert writes only the customer projection table',async()=>{
 const db=dbSpy();
 await upsertCustomerOpportunity(db,{id:'1',market:'GB',region_code:'GB-ENG-KENT',title:'Food Fair',canonical_url:'https://x.test',application_url:'https://x.test/apply',offerings:[{label:'Jerk chicken'}],last_checked:'2026-09-26T00:00:00Z'},{search_text:'Food Fair Jerk chicken'});
 assert.match(db.calls[0].sql,/customer_opportunities/);
 assert.doesNotMatch(db.calls[0].sql,/INSERT INTO candidates/);
});
test('search combines customer market region and adaptive terms',async()=>{
 const db=dbSpy();
 await searchCustomerOpportunities(db,{market:'GB',region_code:'GB-ENG-KENT',offering:'jerk chicken',limit:20});
 assert.match(db.calls[0].sql,/market = \?/);
 assert.match(db.calls[0].sql,/region_code = \?/);
 assert.match(db.calls[0].sql,/LOWER\(search_text\) LIKE \?/);
 assert.ok(db.calls[0].args.includes('%jerk chicken%'));
});
