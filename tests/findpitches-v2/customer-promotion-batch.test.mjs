import test from 'node:test';
import assert from 'node:assert/strict';
import { runCustomerPromotionBatch } from '../../platform/findpitches-v2/customer/run-batch.mjs';

function db(candidate){
 const writes=[];
 return {writes,prepare(sql){return {args:[],bind(...a){this.args=a;return this;},async all(){return {results:candidate?[candidate]:[]};},async run(){writes.push(sql);return {success:true};}};}};
}
test('shadow batch only selects validated candidates and promotes ready records',async()=>{
 const db=db({id:'x',market:'GB',region_code:'GB-ENG-KENT',canonical_url:'https://x.test',application_url:'https://x.test/apply',event_name:'Fair',organiser:null,geography_json:'{}',score:80,status:'validated',last_checked:'2026-09-26'});
 const r=await runCustomerPromotionBatch(db,{limit:1});
 assert.equal(r.inspected,1); assert.equal(r.promoted,1);
 assert.ok(db.writes.some(sql=>/INSERT INTO customer_opportunities/.test(sql)));
});
