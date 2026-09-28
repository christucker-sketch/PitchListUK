import test from 'node:test';
import assert from 'node:assert/strict';
import { routeCustomerApi } from '../../platform/findpitches-v2/customer/http.mjs';

// Customer API now requires the server-to-server token (see customer-api-protection.test.mjs).
const TOKEN='test-service-token-0123456789abcdef0123456789';
const auth={headers:{authorization:`Bearer ${TOKEN}`}};
function env(rows=[]){return {FINDPITCHES_CUSTOMER_API_TOKENS:TOKEN,FINDPITCHES_DB:{prepare(){return {bind(){return this;},async all(){return {results:rows};},async first(){return rows[0]||null;}};}}};}

test('non customer paths are left untouched',async()=>{
 assert.equal(await routeCustomerApi(new Request('https://api.findpitches.com/status'),env()),null);
});
test('markets route returns v1 service response',async()=>{
 const r=await routeCustomerApi(new Request('https://api.findpitches.com/v1/markets',auth),env());
 assert.equal(r.status,200); assert.equal((await r.json()).api_version,'v1');
});
test('unknown v1 path is left for host worker 404 handling',async()=>{
 assert.equal(await routeCustomerApi(new Request('https://api.findpitches.com/v1/nope'),env()),null);
});
test('missing opportunity is a 404',async()=>{
 const r=await routeCustomerApi(new Request('https://api.findpitches.com/v1/opportunities/missing',auth),env());
 assert.equal(r.status,404);
});
