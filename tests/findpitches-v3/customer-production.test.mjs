import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {openLocalD1} from '../../operations/findpitches-v3/local-d1.mjs';
import {stmt,hmac} from '../../platform/findpitches-v3/customer-security.mjs';
import {issueChallenge,consumeChallenge} from '../../platform/findpitches-v3/customer-auth.mjs';
import {livePricePolicy,livePlans,liveEntitlement,liveStripeClient,validateLivePrice,syncLiveSubscriptions,liveCustomerAccess,liveCheckout,livePortal,liveConfirmCheckout,liveWebhook,verifyLiveBillingSettings,verifyLiveBillingCapabilities} from '../../platform/findpitches-v3/customer-live-billing.mjs';
import {mapProof,present} from '../../platform/findpitches-v3/customer-catalogue.mjs';
import worker from '../../platform/findpitches-v3/customer-worker.mjs';
import {checkoutBranding} from '../../platform/findpitches-v3/customer-branding.mjs';

const now=()=>new Date().toISOString(),future=()=>new Date(Date.now()+86400000).toISOString();
function setup(t){const db=openLocalD1(':memory:',{migrationsDirectory:new URL('../../operations/findpitches-v3/customer-production-migrations/',import.meta.url)});t.after(()=>db.close());return db;}
function env(db){return {V3_CUSTOMER_DB:db,V3_CUSTOMER_MODE:'production_public',V3_STRIPE_MODE:'live',V3_CHECKOUT_ENABLED:'live',V3_PUBLIC_ENABLED:'true',V3_ACCOUNT_RECOVERY_ENABLED:'true',V3_PUBLIC_ORIGIN:'https://findpitches.com',V3_SESSION_SECRET:'fixture'.repeat(10),V3_PRODUCTION_OPERATOR_TOKEN:'operator_fixture'.repeat(5),STRIPE_SECRET_KEY:'sk_live_fixture',STRIPE_WEBHOOK_SECRET:'whsec_'+('fixture'.repeat(8)),V3_LIVE_PRODUCT_ID:'prod_fixture',V3_LIVE_PRICE_IDS:JSON.stringify({GBP:'price_GBP',USD:'price_USD',EUR:'price_EUR'}),STRIPE_PORTAL_CONFIGURATION_ID:'bpc_fixture',V3_STAGING_TOKEN:'fixture',
 V3_READY_API:{fetch:async()=>Response.json({schema:'findpitches-v3-customer-proof-snapshot-v1',as_of:now(),publication_enabled:false,production_cutover_enabled:false,items:[proof()],shadow_ready:1,producer_policy_withheld:0})},
 ASSETS:{fetch:async u=>{try{return new Response(fs.readFileSync(new URL('../../web/findpitches-v3-web/public/'+new URL(u).pathname.slice(1),import.meta.url)));}catch{return new Response('',{status:404});}}}};}
function proof(country='US'){return {id:'ent_'+('1'.repeat(32)),country,title:'River Festival',organiser:'River Association',location:country==='GB'?'Kent Town Hall':'Oregon Park',event_start:'2099-11-03',event_end:'2099-11-04',application_url:'https://organiser.example.org/apply',application_state:'OPEN_NOW',source_url:'https://organiser.example.org/event',verified_at:new Date(Date.now()-1000).toISOString(),proof_expires_at:future(),entity_revision:1,verification_id:1};}
test('combined SEO read produces results and true cross-market/region counts from one fresh proof snapshot, with Free redaction and no stale fallback',async t=>{
 const db=setup(t),e=env(db);let reads=0,failed=false;
 e.V3_READY_API.fetch=async()=>{reads++;if(failed)throw Error('source_down');return Response.json({schema:'findpitches-v3-customer-proof-snapshot-v1',as_of:now(),publication_enabled:false,production_cutover_enabled:false,items:[proof('GB'),{...proof('US'),id:'ent_'+'2'.repeat(32)},{...proof('GB'),id:'ent_'+'3'.repeat(32),proof_expires_at:'2020-01-01T00:00:00Z'}]});};
 const call=path=>worker.fetch(new Request(e.V3_PUBLIC_ORIGIN+'/api/v3/seo/page?path='+encodeURIComponent(path)),e),r=await call('/uk/'),b=await r.json();
 assert.equal(r.status,200);assert.equal(reads,1);assert.equal(r.headers.get('cache-control'),'private, no-store');assert.equal(b.page.inventory.market_total,1);assert.equal(b.page.inventories.US.market_total,1);assert.equal(b.page.search.total,1);assert.equal(b.page.search.results[0].access.locked,true);assert.equal(b.page.markets.find(m=>m.code==='GB').opportunity_count,1);assert.ok(!JSON.stringify(b).includes('organiser.example.org'));
 assert.equal((await call('https://foreign.example/')).status,400);assert.equal((await call('/account.html')).status,404);
 failed=true;assert.equal((await call('/uk/')).status,500);assert.equal((await stmt(db,'SELECT COUNT(*) AS n FROM customers').first()).n,0);assert.equal((await stmt(db,'SELECT COUNT(*) AS n FROM stripe_customers').first()).n,0);
});
test('brand and Finder shells do not read inventory; homepage data still fails closed and uses one fresh snapshot',async t=>{
 const db=setup(t),e=env(db);let reads=0,failed=false;
 e.V3_READY_API.fetch=async()=>{reads++;if(failed)throw Error('source_unavailable');return Response.json({schema:'findpitches-v3-customer-proof-snapshot-v1',as_of:now(),publication_enabled:false,production_cutover_enabled:false,items:[proof('GB'),{...proof('US'),id:'ent_'+'2'.repeat(32),proof_expires_at:'2020-01-01T00:00:00Z'}]});};
 const call=p=>worker.fetch(new Request('https://findpitches.com'+p),e);
 for(const p of ['/','/index.html','/finder.html','/us/find-pitches/','/organisers.html'])assert.equal((await call(p)).status,200);
 assert.equal(reads,0);const home=await (await call('/api/v3/home')).json();assert.equal(reads,1);assert.equal(home.stats.total,1);assert.equal(home.upcoming.GB.length,1);assert.ok(!JSON.stringify(home).includes('organiser.example.org'));
 failed=true;assert.equal((await call('/')).status,200);assert.ok((await call('/api/v3/home')).status>=500);assert.ok((await call('/api/v3/opportunities?market=GB')).status>=500);assert.ok((await call('/uk/')).status>=500);
 const prior=reads,registry=await (await call('/api/v3/markets?registry_only=true')).json(),states=await (await call('/api/v3/regions?market=US&registry_only=true')).json();assert.equal(reads,prior);assert.ok(registry.markets.every(m=>m.opportunity_count===null));assert.ok(states.regions.every(r=>r.opportunity_count===null));assert.ok(states.regions.some(r=>r.code==='US-TX'));assert.equal((await call('/api/v3/regions?market=INVALID&registry_only=true')).status,404);
});
test('bare-domain HTTP frontend navigation redirects to the owned HTTPS site before reading catalogue evidence',async t=>{
 const db=setup(t),e=env(db);let catalogueReads=0;
 e.V3_READY_API={fetch:async()=>{catalogueReads++;throw Error('source_unavailable');}};
 for(const host of ['findpitches.com','www.findpitches.com'])for(const method of ['GET','HEAD'])for(const path of ['/','/index.html','/pricing.html','/uk/find-pitches/?q=York','/assets/js/shell.js','/account.html']){
  const r=await worker.fetch(new Request('http://'+host+path,{method}),e);
  assert.equal(r.status,301,method+' '+host+path);assert.equal(r.headers.get('location'),'https://findpitches.com'+path);assert.equal(await r.text(),'');
 }
 assert.equal(catalogueReads,0);
});
test('HTTP public-navigation redirect never opens API, operator, webhook, preview or unsafe request surfaces',async t=>{
 const db=setup(t),e=env(db);
 for(const [path,method,status] of [['/api/v3/session','GET',403],['/api/v3/session/link','POST',403],['/api/v3/billing/checkout','POST',403],['/ops/preflight','GET',403],['/api/v3/stripe/webhook','POST',403],['/preview/test-login','POST',404],['/','POST',403],['/index.html','DELETE',403]]){
  const r=await worker.fetch(new Request('http://findpitches.com'+path,{method}),e);assert.equal(r.status,status,path);assert.equal(r.headers.get('location'),null);
 }
 for(const origin of ['http://foreign.example','https://foreign.example','http://findpitches.com:8080'])assert.equal((await worker.fetch(new Request(origin+'/'),e)).status,403);
 assert.equal((await stmt(db,'SELECT COUNT(*) AS n FROM customers').first()).n,0);
 assert.equal((await stmt(db,'SELECT COUNT(*) AS n FROM stripe_webhook_receipts').first()).n,0);
});
async function native(db){return (await consumeChallenge(db,await issueChallenge(db,{email:'live-fixture@example.org',now:now()}),now())).customer;}
function provider(e,c,currency='GBP'){
 const p=livePricePolicy(e).find(p=>p.currency===currency),state={price:{id:p.id,object:'price',livemode:true,active:true,product:p.product,currency:currency.toLowerCase(),unit_amount:p.amount,recurring:{interval:'month',interval_count:1},billing_scheme:'per_unit',type:'recurring'},owner:{id:'cus_owned',object:'customer',email:c.email,livemode:true,metadata:{findpitches_v3_customer_id:c.id,findpitches_v3_runtime:'production_public'}},product:{id:p.product,object:'product',active:true,livemode:true,metadata:{app:'findpitches',version:'v3',plan:'pro',entitlement:'global',findpitches_v3_runtime:'production_public'}},subs:[],sessions:new Map(),calls:[],failure:false};
 state.fetch=async(url,options={})=>{const u=new URL(url),path=u.pathname.replace('/v1',''),body=new URLSearchParams(options.body);state.calls.push({path,method:options.method,body,key:options.headers?.['Idempotency-Key']});if(state.failure)return Response.json({error:{}},{status:503});
  if(path.startsWith('/products/'))return Response.json(state.product);
  if(path.startsWith('/prices/'))return Response.json(state.price);
  if(path.startsWith('/customers'))return Response.json(state.owner);
  if(path==='/subscriptions')return Response.json({object:'list',has_more:false,data:state.subs});
  if(path==='/checkout/sessions'){
   const k=options.headers['Idempotency-Key'];if(!state.sessions.has(k))state.sessions.set(k,{id:'cs_live_owned',livemode:true,customer:state.owner.id,client_reference_id:c.id,mode:'subscription',url:'https://checkout.stripe.com/c/fixture'});
   return Response.json(state.sessions.get(k));}
  if(path.startsWith('/checkout/sessions/'))return Response.json({...state.sessions.values().next().value,status:'complete',subscription:'sub_owned'});
  if(path==='/billing_portal/sessions')return Response.json({object:'billing_portal.session',livemode:true,url:'https://billing.stripe.com/p/fixture'});
  throw Error('unexpected_provider_route');};
 state.sub=(patch={})=>({id:'sub_owned',object:'subscription',customer:state.owner.id,livemode:true,status:'active',current_period_end:Math.floor(Date.now()/1000)+86400,cancel_at_period_end:false,metadata:{...state.owner.metadata},items:{data:[{quantity:1,price:state.price}]},...patch});return state;
}
async function link(db,c,p){await stmt(db,'INSERT INTO stripe_customers VALUES (?,?,1,?)',c.id,p.owner.id,now()).run();}
for(const locale of ['de','fr'])test(locale+' hosted billing language keeps approved GBP price, global ownership and one checkout reservation',async t=>{
 const db=setup(t),e=env(db),c=await native(db),p=provider(e,c);await link(db,c,p);
 const options={now:now(),origin:e.V3_PUBLIC_ORIGIN,fetcher:p.fetch},body={plan_id:'pro_monthly',currency:'GBP',locale};
 const first=await liveCheckout(db,e,c,body,options),calls=p.calls.filter(c=>c.path==='/checkout/sessions');
 assert.equal(calls.length,1);const params=calls[0].body;assert.equal(params.get('locale'),locale);assert.equal(params.get('line_items[0][price]'),'price_GBP');assert.equal(params.get('subscription_data[trial_period_days]'),'7');
 assert.equal(params.get('success_url'),e.V3_PUBLIC_ORIGIN+'/lang/'+locale+'/account.html?checkout=success&session_id={CHECKOUT_SESSION_ID}');
 assert.equal(params.get('cancel_url'),e.V3_PUBLIC_ORIGIN+'/lang/'+locale+'/pricing.html?checkout=cancelled');
 assert.equal((await liveCheckout(db,e,c,{...body,locale:'en'},options)).checkout_url,first.checkout_url);assert.equal(p.calls.filter(c=>c.path==='/checkout/sessions').length,1);
 e.V3_CHECKOUT_ENABLED='disabled';await livePortal(db,e,c,{origin:e.V3_PUBLIC_ORIGIN,locale,fetcher:p.fetch});const portal=p.calls.find(c=>c.path==='/billing_portal/sessions').body;assert.equal(portal.get('locale'),locale);assert.equal(portal.get('return_url'),e.V3_PUBLIC_ORIGIN+'/lang/'+locale+'/account.html');
 e.V3_CHECKOUT_ENABLED='live';const count=p.calls.length;await assert.rejects(liveCheckout(db,e,c,{...body,locale:'zz'},options),/validation/);assert.equal(p.calls.length,count);
});
test('production language opt-out and account recovery remain independent of inventory',async t=>{
 const db=setup(t),e=env(db);const request=path=>new Request(e.V3_PUBLIC_ORIGIN+path);
 e.V3_LOCALISATION_ENABLED='false';assert.equal((await worker.fetch(request('/lang/de/account.html'),e)).status,404);
 e.V3_LOCALISATION_ENABLED='true';e.V3_PUBLIC_ENABLED='false';e.V3_READY_API.fetch=()=>{throw Error('source_down');};
 const r=await worker.fetch(request('/lang/fr/account.html'),e);assert.equal(r.status,200);assert.equal(r.headers.get('Content-Language'),'fr');
 assert.ok((await r.text()).includes('Votre compte'));assert.equal((await worker.fetch(request('/account.html'),e)).status,200);
});
test('production database rejects TEST objects, wrong customer ownership and mode conversion',async t=>{
 const db=setup(t),c=await native(db);
 assert.throws(()=>db.sqlite.prepare('INSERT INTO stripe_customers VALUES (?,?,0,?)').run(c.id,'cus_bad',now()),/CHECK/);
 assert.throws(()=>db.sqlite.prepare("UPDATE customer_runtime SET mode='restricted_shadow_preview'").run(),/immutable_runtime/);
 assert.equal((await worker.fetch(new Request('https://findpitches.com/health'),{...env(db),V3_STRIPE_MODE:'test'})).status,503);
 const preview=openLocalD1(':memory:',{migrationsDirectory:new URL('../../operations/findpitches-v3/customer-migrations/',import.meta.url)});t.after(()=>preview.close());
 assert.equal((await worker.fetch(new Request('https://findpitches.com/health'),env(preview))).status,503);
});
for(const currency of ['GBP','USD','EUR'])test(currency+' LIVE subscription unlocks global Pro, paid-through cancellation and expiry',async t=>{
 const db=setup(t),e=env(db),c=await native(db),p=provider(e,c,currency);await link(db,c,p);p.subs=[p.sub({cancel_at_period_end:true})];
 await syncLiveSubscriptions(db,e,c,{now:now(),fetcher:p.fetch});const a=await liveCustomerAccess(db,e,c,{now:now()});assert.equal(a.tier,'pro');assert.equal(a.scope,'global');assert.equal(a.currency,currency);
 for(const cc of ['GB','US','AU','NZ','CA','IE']){assert.equal(present(mapProof(proof(cc),now()),a).access.locked,false);assert.equal(present(mapProof(proof(cc),now()),{tier:'free',scope:'global'}).access.locked,true);}
 p.subs=[p.sub({status:'trialing',trial_end:Math.floor(Date.now()/1000)+3600})];await syncLiveSubscriptions(db,e,c,{now:now(),fetcher:p.fetch});assert.equal((await liveCustomerAccess(db,e,c,{now:now()})).tier,'trial');
 p.subs=[p.sub({current_period_end:1})];await syncLiveSubscriptions(db,e,c,{now:now(),fetcher:p.fetch});assert.equal((await liveCustomerAccess(db,e,c,{now:now()})).tier,'free');
 const plans=livePlans('CA',e,currency);assert.equal(plans[1].scope,'global');assert.equal(plans[1].price,{GBP:4.99,USD:6.99,EUR:5.99}[currency]);assert.equal(plans[1].trial_days,7);
});
test('LIVE client rejects TEST key/objects, wrong mode, owner, product, price and quantities before cache writes',async t=>{
 const db=setup(t),e=env(db),c=await native(db),p=provider(e,c);await link(db,c,p);
 assert.throws(()=>liveStripeClient({...e,STRIPE_SECRET_KEY:'sk_test_fixture'}),/service_unavailable/);
 assert.throws(()=>liveStripeClient({...e,V3_CUSTOMER_MODE:'restricted_shadow_preview'}),/service_unavailable/);
 await assert.rejects(liveStripeClient(e,async()=>Response.json({...p.price,livemode:false}))('/prices/price_GBP'),/forbidden/);
 const policy=livePricePolicy(e)[0];for(const patch of [{product:'prod_foreign'},{currency:'usd'},{unit_amount:1},{livemode:false},{recurring:{interval:'year',interval_count:1}},{billing_scheme:'tiered'}])assert.throws(()=>validateLivePrice({...p.price,...patch},policy),/price_not_set/);
 for(const sub of [p.sub({metadata:{}}),p.sub({customer:'cus_foreign'}),p.sub({items:{data:[{quantity:2,price:p.price}]}}),p.sub({items:{data:[{quantity:1,price:{...p.price,id:'price_other'}}]}}),p.sub({items:{data:[{quantity:1,price:{...p.price,product:'prod_other'}}]}})]){
  p.subs=[sub];await assert.rejects(syncLiveSubscriptions(db,e,c,{now:now(),fetcher:p.fetch}));assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM stripe_subscriptions').get().n,0);}
 p.subs=[p.sub(),p.sub({id:'sub_duplicate'})];await assert.rejects(syncLiveSubscriptions(db,e,c,{now:now(),fetcher:p.fetch}),/billing_review_required/);
 p.owner.metadata={};await assert.rejects(syncLiveSubscriptions(db,e,c,{now:now(),fetcher:p.fetch}),/forbidden/);
});
test('concurrent LIVE Checkout retries share reservation/provider key; currency switch and repeat trial are blocked',async t=>{
 const db=setup(t),e=env(db),c=await native(db),p=provider(e,c);await link(db,c,p);const n=now(),options={now:n,origin:e.V3_PUBLIC_ORIGIN,fetcher:p.fetch},body={plan_id:'pro_monthly',currency:'GBP'};
 const sessions=await Promise.all([liveCheckout(db,e,c,body,options),liveCheckout(db,e,c,body,options)]);assert.equal(sessions[0].checkout_url,sessions[1].checkout_url);
 assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM checkout_attempts').get().n,1);assert.equal(new Set(p.calls.filter(c=>c.path==='/checkout/sessions').map(c=>c.key)).size,1);
 assert.ok(p.calls.find(c=>c.path==='/checkout/sessions').key.startsWith('v3-live-checkout-'));assert.equal(p.calls.find(c=>c.path==='/checkout/sessions').body.get('subscription_data[trial_period_days]'),'7');
 p.price={...p.price,...{id:'price_USD',currency:'usd',unit_amount:699}};await assert.rejects(liveCheckout(db,e,c,{...body,currency:'USD'},options),/checkout_currency_locked/);
 p.price={...p.price,id:'price_GBP',currency:'gbp',unit_amount:499};p.subs=[p.sub()];await assert.rejects(liveCheckout(db,e,c,body,options),/subscription_exists/);
 p.subs=[p.sub({status:'canceled'})];await syncLiveSubscriptions(db,e,c,{now:now(),fetcher:p.fetch});
 db.sqlite.prepare('UPDATE checkout_reservations SET expires_at=?').run('2000-01-01');await liveCheckout(db,e,c,body,{...options,now:now()});
 assert.equal(p.calls.filter(c=>c.path==='/checkout/sessions').at(-1).body.has('subscription_data[trial_period_days]'),false);
});
test('confirmation requires owned canonical LIVE subscription; Portal survives closed Checkout and catalogue failure',async t=>{
 const db=setup(t),e=env(db),c=await native(db),p=provider(e,c);await link(db,c,p);await liveCheckout(db,e,c,{plan_id:'pro_monthly',currency:'GBP'},{now:now(),origin:e.V3_PUBLIC_ORIGIN,fetcher:p.fetch});p.subs=[p.sub()];
 await assert.rejects(liveConfirmCheckout(db,e,c,{session_id:'cs_test_fixture'},{now:now(),fetcher:p.fetch}),/validation/);
 assert.equal((await liveConfirmCheckout(db,e,c,{session_id:'cs_live_owned'},{now:now(),fetcher:p.fetch})).scope,'global');
 e.V3_CHECKOUT_ENABLED='disabled';e.V3_READY_API.fetch=()=>{throw Error('catalogue_down');};
 assert.equal((await livePortal(db,e,c,{origin:e.V3_PUBLIC_ORIGIN,fetcher:p.fetch})).url,'https://billing.stripe.com/p/fixture');
 await assert.rejects(livePortal(db,e,c,{origin:'https://evil.example.org',fetcher:p.fetch}),/forbidden/);
});
test('LIVE webhook signature/mode, replay, out-of-order canonical reads, unknown ownership and failure retry',async t=>{
 const db=setup(t),e=env(db),c=await native(db),p=provider(e,c);await link(db,c,p);p.subs=[p.sub()];
 async function event(id,{customer='cus_owned',livemode=true,status='active'}={}){const raw=JSON.stringify({id,type:'customer.subscription.updated',livemode,data:{object:{customer,status}}}),timestamp=String(Math.floor(Date.now()/1000)),signature=await hmac(e.STRIPE_WEBHOOK_SECRET,timestamp+'.'+raw);return new Request(e.V3_PUBLIC_ORIGIN+'/api/v3/stripe/webhook',{method:'POST',headers:{'Stripe-Signature':`t=${timestamp},v1=${signature}`},body:raw});}
 assert.equal((await liveWebhook(await event('evt_current'),e,{now:now(),fetcher:p.fetch})).received,true);
 assert.equal((await liveWebhook(await event('evt_current'),e,{now:now(),fetcher:p.fetch})).duplicate,true);
 p.subs=[p.sub({status:'canceled'})];await liveWebhook(await event('evt_old',{status:'trialing'}),e,{now:now(),fetcher:p.fetch});assert.equal((await liveCustomerAccess(db,e,c,{now:now()})).tier,'free');
 await assert.rejects(liveWebhook(await event('evt_test',{livemode:false}),e,{now:now(),fetcher:p.fetch}),/forbidden/);
 await assert.rejects(liveWebhook(new Request(e.V3_PUBLIC_ORIGIN,{method:'POST',body:'{}'}),e,{now:now(),fetcher:p.fetch}),/forbidden/);
 const calls=p.calls.length;assert.equal((await liveWebhook(await event('evt_pitchlist',{customer:'cus_pitchlist'}),e,{now:now(),fetcher:p.fetch})).unowned_ignored,true);assert.equal(p.calls.length,calls);
 p.failure=true;await assert.rejects(liveWebhook(await event('evt_retry'),e,{now:now(),fetcher:p.fetch}),/service_unavailable/);assert.equal(db.sqlite.prepare("SELECT processed_at FROM stripe_webhook_receipts WHERE id='evt_retry'").get().processed_at,null);
 p.failure=false;assert.equal((await liveWebhook(await event('evt_retry'),e,{now:now(),fetcher:p.fetch})).received,true);
 await assert.rejects(liveWebhook(await event('evt_current',{status:'different'}),e,{now:now(),fetcher:p.fetch}),/forbidden/);
});
test('public proof reads are anonymous/redacted, SEO eligible only; preview provisioning never exists',async t=>{
 const db=setup(t),e=env(db),call=(p,init)=>worker.fetch(new Request(e.V3_PUBLIC_ORIGIN+p,init),e);
 const r=await call('/api/v3/opportunities?market=US'),data=await r.json();assert.equal(r.status,200);assert.equal(data.total,1);assert.equal(data.results[0].access.locked,true);assert.ok(!JSON.stringify(data).includes('organiser.example.org'));
 for(const p of ['/preview/access','/preview/test-login','/preview/subscribers/recognize'])assert.equal((await call(p,{method:'POST'})).status,404);
 const detail=await call('/us/opportunity/'+proof().id+'/');assert.equal(detail.status,200);assert.equal(detail.headers.get('x-robots-tag'),'index,follow');assert.ok(!(await detail.text()).includes('organiser.example.org'));
 const account=await call('/account.html');assert.equal(account.status,200);assert.match(account.headers.get('x-robots-tag'),/noindex/);
 const sm=await call('/sitemap.xml');assert.match(await sm.text(),new RegExp(proof().id));
 assert.ok(!(await (await call('/robots.txt')).text()).includes('Disallow: /\n'));
 assert.equal((await worker.fetch(new Request('https://www.findpitches.com/us/'),e)).headers.get('location'),'https://findpitches.com/us/');
 assert.equal((await worker.fetch(new Request('https://foreign.example.org/api/v3/session'),e)).status,403);
 e.V3_READY_API.fetch=async()=>Response.json({schema:'findpitches-v3-customer-proof-snapshot-v1',as_of:now(),publication_enabled:false,production_cutover_enabled:false,items:[proof(),proof()]});assert.equal((await call('/api/v3/opportunities?market=US')).status,503);
});
test('gated deployment and rollback retain account recovery without evidence reads or indexability',async t=>{
 const db=setup(t),e=env(db);e.V3_PUBLIC_ENABLED='false';e.V3_ACCOUNT_RECOVERY_ENABLED='false';e.V3_CHECKOUT_ENABLED='disabled';
 const call=p=>worker.fetch(new Request(e.V3_PUBLIC_ORIGIN+p),e);assert.equal((await call('/index.html')).status,503);assert.equal((await call('/account.html')).status,503);assert.equal((await call('/health')).status,200);
 e.V3_ACCOUNT_RECOVERY_ENABLED='true';e.V3_READY_API.fetch=()=>{throw Error('catalogue_down');};assert.equal((await call('/account.html')).status,200);assert.equal((await call('/api/v3/session')).status,200);assert.equal((await call('/api/v3/markets?registry_only=true')).status,200);assert.equal((await call('/api/v3/opportunities?market=US')).status,503);
 const plans=await (await call('/api/v3/billing/plans?market=GB&currency=EUR')).json();assert.equal(plans.plans[1].checkout_enabled,false);
 assert.match((await call('/account.html')).headers.get('x-robots-tag'),/noindex/);
});
test('production billing preflight checks all canonical LIVE variants and Portal without customer writes',async t=>{
 const db=setup(t),e=env(db),calls=[],policy=livePricePolicy(e);let wrongPrice=false,unsafePortal=false;
 const fetcher=async(url,options)=>{assert.equal(options.method,'GET');const p=new URL(url).pathname.slice(3);calls.push(p);
  if(p==='/products/'+e.V3_LIVE_PRODUCT_ID)return Response.json({id:e.V3_LIVE_PRODUCT_ID,active:true,livemode:true,metadata:{app:'findpitches',version:'v3',plan:'pro',entitlement:'global'}});
  const price=policy.find(v=>p==='/prices/'+v.id);if(price)return Response.json({id:price.id,active:true,livemode:true,product:price.product,currency:price.currency.toLowerCase(),unit_amount:price.amount+(wrongPrice?1:0),recurring:{interval:'month',interval_count:1},billing_scheme:'per_unit',type:'recurring'});
  assert.equal(p,'/billing_portal/configurations/'+e.STRIPE_PORTAL_CONFIGURATION_ID);return Response.json({id:e.STRIPE_PORTAL_CONFIGURATION_ID,active:true,livemode:true,is_default:false,features:{subscription_cancel:{enabled:true,mode:'at_period_end'},subscription_update:{enabled:unsafePortal},customer_update:{enabled:false},invoice_history:{enabled:true},payment_method_update:{enabled:true}}});
 };
 const r=await verifyLiveBillingSettings(e,{fetcher});assert.equal(r.credential_validated,true);assert.equal(r.entitlement,'global');assert.deepEqual(r.prices.map(p=>p.currency),['GBP','USD','EUR']);assert.equal(calls.length,5);assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM customers').get().n,0);assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM stripe_customers').get().n,0);
 wrongPrice=true;await assert.rejects(verifyLiveBillingSettings(e,{fetcher}),/price_not_set/);wrongPrice=false;unsafePortal=true;await assert.rejects(verifyLiveBillingSettings(e,{fetcher}),/billing_review_required/);
 await assert.rejects(liveStripeClient(e,fetcher)('/billing_portal/configurations/'+e.STRIPE_PORTAL_CONFIGURATION_ID,{method:'POST'}),/forbidden/);
 const req=new Request('https://findpitches-v3-customer-production.fixture.workers.dev/ops/billing/verify',{method:'POST'});assert.equal((await worker.fetch(req,e)).status,403);
 unsafePortal=false;t.mock.method(globalThis,'fetch',fetcher);const allowed=new Request(req.url,{method:'POST',headers:{Authorization:'Bearer '+e.V3_PRODUCTION_OPERATOR_TOKEN}});assert.equal((await worker.fetch(allowed,e)).status,200);
 assert.equal((await worker.fetch(allowed,{...e,V3_CUSTOMER_MODE:'restricted_shadow_preview'})).status,401);
});
test('real-link shaped GET consumes once, sets a secure session and returns an authenticated pricing continuation without starting billing',async t=>{
 const db=setup(t),e=env(db),token=await issueChallenge(db,{email:'journey-fixture@example.org',next:'/pricing.html?from=trial',now:now()});
 const r=await worker.fetch(new Request(e.V3_PUBLIC_ORIGIN+'/api/v3/session/verify?token='+token),e);
 assert.equal(r.status,303);assert.equal(r.headers.get('location'),'/pricing.html?from=trial');
 const cookie=r.headers.get('set-cookie');assert.match(cookie,/^__Host-fp_v3_session=[a-f0-9]{64}; Path=\/; Secure; SameSite=Lax; Max-Age=604800; HttpOnly$/);
 const session=await (await worker.fetch(new Request(e.V3_PUBLIC_ORIGIN+'/api/v3/session',{headers:{Cookie:cookie.split(';')[0]}}),e)).json();
 assert.equal(session.signed_in,true);assert.equal(session.access.tier,'free');assert.equal(session.access.checkout_allowed,true);
 assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM stripe_customers').get().n,0);assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM checkout_attempts').get().n,0);
 const replay=await worker.fetch(new Request(e.V3_PUBLIC_ORIGIN+'/api/v3/session/verify?token='+token),e);assert.match(replay.headers.get('location'),/signin=expired/);assert.equal(replay.headers.get('set-cookie'),null);
});
test('missing Stripe Customer permission fails before reservation, records safe provider diagnostics and never exposes provider text',async t=>{
 const db=setup(t),e=env(db),login=await consumeChallenge(db,await issueChallenge(db,{email:'permission-fixture@example.org',now:now()}),now()),p=provider(e,login.customer);
 const providerFetch=p.fetch,keys=[];
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  if(new URL(url).pathname==='/v1/customers'&&options.method==='POST'){keys.push(options.headers['Idempotency-Key']);return Response.json({error:{code:'more_permissions_required',message:'unsafe provider text '+e.STRIPE_SECRET_KEY+' '+login.customer.email}},{status:403,headers:{'Request-Id':'req_permissionfixture'}});}
  return providerFetch(url,options);
 });
 const session=await worker.fetch(new Request(e.V3_PUBLIC_ORIGIN+'/api/v3/session',{headers:{Cookie:login.cookie.split(';')[0]}}),e),csrf=session.headers.get('set-cookie').split(';')[0],csrfValue=csrf.slice('fp_csrf='.length);
 for(let i=0;i<2;i++){
  const r=await worker.fetch(new Request(e.V3_PUBLIC_ORIGIN+'/api/v3/billing/checkout',{method:'POST',headers:{Origin:e.V3_PUBLIC_ORIGIN,Cookie:login.cookie.split(';')[0]+'; '+csrf,'x-csrf-token':csrfValue,'Content-Type':'application/json'},body:JSON.stringify({plan_id:'pro_monthly',currency:'GBP'})}),e);
  assert.equal(r.status,503);assert.deepEqual(await r.json(),{ok:false,error:'service_unavailable',message:'This service is temporarily unavailable.'});
 }
 assert.equal(new Set(keys).size,1);assert.equal(keys.length,2);
 for(const table of ['stripe_customers','checkout_attempts','checkout_reservations'])assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM '+table).get().n,0);
 const events=db.sqlite.prepare("SELECT outcome FROM customer_operation_events WHERE kind='stripe_live_error'").all();assert.deepEqual(events.map(v=>v.outcome),Array(2).fill('customers_post:403:more_permissions_required:req_permissionfixture'));
 assert.ok(!JSON.stringify(events).includes(login.customer.email));assert.ok(!JSON.stringify(events).includes(e.STRIPE_SECRET_KEY));
});
test('native capability checks expose missing Customer read/write despite valid products, without creating provider objects',async t=>{
 const db=setup(t),e=env(db),c=await native(db),p=provider(e,c),calls=[];let denied=true,missingReads=false;
 const fetcher=async(url,options)=>{
  const u=new URL(url),path=u.pathname.slice(3);calls.push({path,method:options.method,body:new URLSearchParams(options.body)});
  if(path.startsWith('/products/')||path.startsWith('/prices/')){
   const price=livePricePolicy(e).find(v=>path==='/prices/'+v.id);
   return Response.json(price?{...p.price,id:price.id,currency:price.currency.toLowerCase(),unit_amount:price.amount}:p.product);
  }
  if(path.startsWith('/billing_portal/configurations/'))return Response.json({id:e.STRIPE_PORTAL_CONFIGURATION_ID,active:true,livemode:true,is_default:false,features:{subscription_cancel:{enabled:true,mode:'at_period_end'},subscription_update:{enabled:false},customer_update:{enabled:false},payment_method_update:{enabled:true},invoice_history:{enabled:true}}});
  if(options.method==='GET'&&['/customers','/subscriptions'].includes(path)){
   assert.equal(u.searchParams.get('created[lte]'),'0');assert.equal(u.searchParams.get('limit'),'1');
   if(missingReads)return Response.json({error:{code:'resource_missing'}},{status:404});
   return denied&&path==='/customers'?Response.json({error:{code:'more_permissions_required'}},{status:403}):Response.json({object:'list',data:[],has_more:false});
  }
  assert.ok(path.includes('NoSuch')||new URLSearchParams(options.body).get('customer')?.includes('NoSuch'));
  const forbidden=denied&&path.startsWith('/customers/');return Response.json({error:{code:forbidden?'more_permissions_required':'resource_missing',message:'never disclose this'}},{status:forbidden?403:404,headers:{'Request-Id':'req_capabilityfixture'}});
 };
 let r=await verifyLiveBillingCapabilities(e,{fetcher});assert.equal(r.settings_validated,true);assert.equal(r.permissions_observed,false);assert.deepEqual(r.checks.filter(c=>!c.permitted).map(c=>c.capability),['customers_read','customers_write']);assert.equal(r.customer_objects_created,0);assert.equal(r.checkout_sessions_created,0);assert.equal(r.owned_trial_journey_proven,false);
 assert.ok(calls.filter(c=>c.method==='POST'&&c.path.startsWith('/customers/')).every(c=>c.body.size===0));assert.ok(!calls.some(c=>c.method==='POST'&&(c.path==='/customers'||c.path==='/checkout/sessions')));
 denied=false;r=await verifyLiveBillingCapabilities(e,{fetcher});assert.equal(r.permissions_observed,true);assert.equal(r.owned_trial_journey_proven,false);
 missingReads=true;r=await verifyLiveBillingCapabilities(e,{fetcher});assert.equal(r.permissions_observed,false);assert.deepEqual(r.checks.filter(c=>!c.permitted).map(c=>c.capability),['customers_read','subscriptions_read']);missingReads=false;
 t.mock.method(globalThis,'fetch',fetcher);
 assert.equal((await worker.fetch(new Request(e.V3_PUBLIC_ORIGIN+'/ops/billing/capabilities',{method:'POST'}),e)).status,403);
 const request=()=>new Request(e.V3_PUBLIC_ORIGIN+'/ops/billing/capabilities',{method:'POST',headers:{Authorization:'Bearer '+e.V3_PRODUCTION_OPERATOR_TOKEN}});
 denied=true;assert.equal((await worker.fetch(request(),e)).status,503);denied=false;assert.equal((await worker.fetch(request(),e)).status,200);
});
test('new Checkout carries owned FindPitches branding while canonical reads and Portal retain the original API contract',async t=>{
 const db=setup(t),e=env(db),c=await native(db),p=provider(e,c),calls=[];
 const fetcher=async(url,options)=>{calls.push({path:new URL(url).pathname.slice(3),method:options.method,version:options.headers['Stripe-Version'],body:new URLSearchParams(options.body)});return p.fetch(url,options);};
 const options={now:now(),origin:e.V3_PUBLIC_ORIGIN,fetcher};
 const body={plan_id:'pro_monthly',currency:'GBP',branding_settings:{display_name:'untrusted',logo:'https://foreign.example/logo.png'},on_behalf_of:'acct_foreign'};
 const first=await liveCheckout(db,e,c,body,options);assert.equal((await liveCheckout(db,e,c,body,options)).checkout_url,first.checkout_url);
 const creates=calls.filter(r=>r.path==='/checkout/sessions'&&r.method==='POST');assert.equal(creates.length,1);
 const params=creates[0].body;assert.equal(creates[0].version,'2025-09-30.clover');assert.equal(params.get('adaptive_pricing[enabled]'),'false');assert.equal(params.get('branding_settings[display_name]'),'FindPitches');assert.equal(params.get('branding_settings[background_color]'),'#F3F5F0');assert.equal(params.get('branding_settings[button_color]'),'#0E4B2C');
 for(const name of ['logo','icon']){
  assert.equal(params.get('branding_settings['+name+'][type]'),'url');assert.equal(params.get('branding_settings['+name+'][url]'),'https://findpitches.com/assets/brand/findpitches-'+name+'.png');
  const png=fs.readFileSync(new URL('../../web/findpitches-v3-web/public/assets/brand/findpitches-'+name+'.png',import.meta.url));assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.ok(png.length<512000);assert.ok(png.readUInt32BE(16)>=128&&png.readUInt32BE(20)>=128);
 }
 assert.equal(params.get('on_behalf_of'),null);assert.equal(params.get('customer'),'cus_owned');assert.equal(params.get('client_reference_id'),c.id);assert.equal(params.get('line_items[0][price]'),'price_GBP');assert.equal(params.get('subscription_data[trial_period_days]'),'7');assert.ok(!params.toString().includes('foreign.example'));
 await liveStripeClient(e,fetcher)('/checkout/sessions/cs_live_owned');await livePortal(db,e,c,{origin:e.V3_PUBLIC_ORIGIN,fetcher});
 assert.ok(calls.filter(r=>r!==creates[0]).every(r=>r.version==='2024-06-20'));assert.ok(!calls.some(r=>r.path.startsWith('/accounts')));
 const portal=calls.find(r=>r.path==='/billing_portal/sessions');assert.equal(portal.body.get('configuration'),'bpc_fixture');assert.equal(portal.body.get('return_url'),'https://findpitches.com/account.html');assert.ok(![...portal.body.keys()].some(k=>k.startsWith('branding_settings')));
 assert.throws(()=>checkoutBranding('https://foreign.example'),/owned_checkout_brand_origin_required/);
});
