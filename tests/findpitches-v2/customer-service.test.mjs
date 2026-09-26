import test from 'node:test';
import assert from 'node:assert/strict';
import { createCustomerApiService } from '../../platform/findpitches-v2/customer/service.mjs';

function fakeDb(rows=[]){
 return {prepare(sql){return {bind(...args){this.args=args;return this;},async all(){return {results:rows};},async first(){return rows[0]||null;},async run(){return {success:true};}};}};
}

test('service returns canonical market catalogue',async()=>{
 const api=createCustomerApiService(fakeDb());
 const r=await api.markets();
 assert.equal(r.api_version,'v1');
 assert.ok(r.markets.some(x=>x.code==='GB'));
 assert.ok(r.markets.some(x=>x.code==='US'));
});

test('search hydrates adaptive offerings for customer responses',async()=>{
 const api=createCustomerApiService(fakeDb([{id:'1',market:'GB',region_code:'GB-ENG-KENT',title:'Food Fair',canonical_url:'https://x.test',application_url:'https://x.test/apply',offerings_json:'[{"label":"Jamaican jerk","cuisine":"Jamaican"}]',coordinates_json:'{"lat":51.2,"lng":0.5}',recurring:0,last_checked:'2026-09-26'}]));
 const r=await api.search({market:'gb',offering:'Jamaican'});
 assert.equal(r.count,1);
 assert.equal(r.opportunities[0].offerings[0].cuisine,'Jamaican');
 assert.equal(r.opportunities[0].recurring,false);
});

test('missing opportunity remains an explicit null result',async()=>{
 const api=createCustomerApiService(fakeDb());
 assert.equal(await api.opportunity('missing'),null);
});
