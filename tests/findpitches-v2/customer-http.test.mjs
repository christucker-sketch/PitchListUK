import test from 'node:test';
import assert from 'node:assert/strict';
import { routeCustomerApi } from '../../platform/findpitches-v2/customer/http.mjs';

function env(rows=[]){return {FINDPITCHES_DB:{prepare(){return {bind(){return this;},async all(){return {results:rows};},async first(){return rows[0]||null;}};}}};}

test('non customer paths are left untouched',async()=>{
 assert.equal(await routeCustomerApi(new Request('https://api.findpitches.com/status'),env()),null);
});
test('markets route returns v1 service response',async()=>{
 const r=await routeCustomerApi(new Request('https://api.findpitches.com/v1/markets'),env());
 assert.equal(r.status,200); assert.equal((await r.json()).api_version,'v1');
});
test('unknown v1 path is left for host worker 404 handling',async()=>{
 assert.equal(await routeCustomerApi(new Request('https://api.findpitches.com/v1/nope'),env()),null);
});
test('missing opportunity is a 404',async()=>{
 const r=await routeCustomerApi(new Request('https://api.findpitches.com/v1/opportunities/missing'),env());
 assert.equal(r.status,404);
});
