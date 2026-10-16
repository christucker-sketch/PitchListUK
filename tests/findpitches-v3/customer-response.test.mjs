import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {seoResponseData} from '../../platform/findpitches-v3/customer-response.mjs';

const now='2026-10-16T22:59:58.000Z';
const page=()=>({as_of:now,search:{results:[{id:'public',access:{locked:true,application_url:null,source_url:null}}]}});
const rows=()=>[{_proof:{expires_at:'2026-10-17T00:00:00Z'},application:{}}];
const initial=()=>seoResponseData({path:'/uk/',page:page(),rows:rows(),now});
function client(payload,{instant=now,signedIn=false}={}){
  let node=payload===undefined?null:{textContent:typeof payload==='string'?payload:JSON.stringify(payload),remove(){node=null;}};
  const requests=[],FP={i18n:{tr:s=>s,html:s=>s},state:{session:{signed_in:signedIn}}};
  const ctx={window:{FP},document:{cookie:'',getElementById:()=>node},URLSearchParams,Intl,
    Date:class extends Date{static now(){return Date.parse(instant);}},
    fetch:async(path,options)=>{requests.push({path,method:options.method});return {ok:true,json:async()=>({ok:true,page:{live:true}})};}};
  vm.createContext(ctx);vm.runInContext(fs.readFileSync(new URL('../../web/findpitches-v3-web/public/assets/js/v3-api.js',import.meta.url),'utf8'),ctx);
  return {api:FP.v3Api,requests};
}
test('anonymous response cannot outlive any global source proof or explicit application close',()=>{
  const a=initial();assert.equal(a.expires_at,'2026-10-16T23:00:08.000Z');assert.equal(a.london_day,'2026-10-16');
  const input=[...rows(),{_proof:{expires_at:'2026-10-16T23:00:02Z'},application:{closes_at:'2026-10-16T23:00:01Z'}}];
  assert.equal(seoResponseData({path:'/uk/',page:page(),rows:input,now}).expires_at,'2026-10-16T23:00:01.000Z');
  for(const bad of [null,'bad','2020-01-01'])assert.equal(seoResponseData({path:'/uk/',page:page(),rows:[{_proof:{expires_at:bad},application:{}}],now}),null);
  assert.equal(seoResponseData({path:'/uk/',page:{...page(),as_of:'2020-01-01'},rows:rows(),now}),null);
});
test('fresh anonymous response is single-use and subsequent reads use the live API',async()=>{
  const c=client(initial());assert.equal((await c.api.seo.page('/uk/')).search.results[0].id,'public');assert.equal(c.requests.length,0);
  assert.equal((await c.api.seo.page('/uk/')).live,true);assert.equal(c.requests.length,1);
});
test('expiry, London midnight, wrong path, future clock, signed-in state and malformed responses fall back live',async()=>{
  const variants=[['expired',initial(),{instant:'2026-10-16T23:00:08Z'}],
    ['London day changed',initial(),{instant:'2026-10-16T23:00:00Z'}],
    ['future',initial(),{instant:'2026-10-16T22:59:57Z'}],['signed in',initial(),{signedIn:true}],
    ['wrong path',{...initial(),path:'/us/'},{}],['oversized lifetime',{...initial(),expires_at:'2027-01-01'},{}],
    ['malformed','{bad',{}],['missing',undefined,{}],
    ['unredacted',{...initial(),page:{search:{results:[{access:{locked:false,application_url:'https://private.example.org'}}]}}},{}]];
  for(const [name,payload,options] of variants){const c=client(payload,options);assert.equal((await c.api.seo.page('/uk/')).live,true,name);assert.equal(c.requests.length,1,name);}
});
