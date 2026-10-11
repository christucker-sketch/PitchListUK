import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {configureLiveStripe,LIVE_EVENTS,secureProductionSettings} from '../../operations/findpitches-v3/configure-customer-production-stripe.mjs';
import {productionConfig} from '../../operations/findpitches-v3/deploy-customer-production.mjs';
import {adoptLiveStripe,APPROVED_LIVE} from '../../operations/findpitches-v3/verify-customer-production-stripe.mjs';
function directory(t){const d=fs.mkdtempSync(path.join(os.tmpdir(),'v3-live-setup-test-'));t.after(()=>fs.rmSync(d,{recursive:true,force:true}));fs.writeFileSync(path.join(d,'resources.json'),JSON.stringify({worker:'findpitches-v3-customer-production',url:'https://findpitches-v3-customer-production.fixture.workers.dev'}));return d;}
test('fresh LIVE setup creates only owned global configuration; replay performs zero additional writes',async t=>{
 const d=directory(t),objects=new Map(),calls=[];let count=0;
 const fetcher=async(url,options)=>{const p=new URL(url).pathname.replace('/v1',''),params=Object.fromEntries(new URLSearchParams(options.body));calls.push([options.method,p]);if(p==='/account')return Response.json({id:'acct_existing'});
  if(options.method==='GET')return Response.json(objects.get(p));
  assert.ok(['/products','/prices','/webhook_endpoints','/billing_portal/configurations'].includes(p));const prefixes={'/products':'prod_','/prices':'price_','/webhook_endpoints':'we_','/billing_portal/configurations':'bpc_'};
  const o={id:prefixes[p]+(++count),livemode:true,active:true,metadata:Object.fromEntries(Object.entries(params).filter(([k])=>k.startsWith('metadata[')).map(([k,v])=>[k.slice(9,-1),v]))};
  if(p==='/prices')Object.assign(o,{product:params.product,currency:params.currency,unit_amount:Number(params.unit_amount),recurring:{interval:params['recurring[interval]'],interval_count:Number(params['recurring[interval_count]'])},type:'recurring',billing_scheme:'per_unit'});
  if(p==='/billing_portal/configurations')o.features={subscription_cancel:{enabled:true,mode:'at_period_end'},customer_update:{enabled:false},subscription_update:{enabled:false}};
  if(p==='/webhook_endpoints')Object.assign(o,{url:params.url,status:'enabled',enabled_events:[...LIVE_EVENTS],secret:'whsec_fixture_setup'});
  objects.set(p+'/'+o.id,o);return Response.json(o);
 };
 const options={key:'sk_live_fixture',expectedAccount:'acct_existing',productionDirectory:d,fetcher,allowFreshSetup:true};const first=await configureLiveStripe(options);assert.equal(first.verified,true);assert.equal(first.entitlement,'global');assert.equal(first.customer_objects_created,0);assert.equal(first.checkout_enabled,false);assert.equal(calls.filter(([m])=>m==='POST').length,6);
 const posts=calls.filter(([m])=>m==='POST').length;assert.deepEqual((await configureLiveStripe(options)).price_ids,first.price_ids);assert.equal(calls.filter(([m])=>m==='POST').length,posts);assert.equal(fs.statSync(path.join(d,'stripe-live-private.json')).mode&0o077,0);
 const privateState=JSON.parse(fs.readFileSync(path.join(d,'stripe-live-private.json')));objects.get('/products/'+privateState.product_id).metadata.entitlement='GB';await assert.rejects(configureLiveStripe(options),/owned_global_product_required/);
});
test('wrong Stripe account stops before any write; provisioning client cannot touch customers or legacy configuration',async t=>{
 const d=directory(t);let calls=0;await assert.rejects(configureLiveStripe({key:'rk_live_fixture',expectedAccount:'acct_expected',productionDirectory:d,allowFreshSetup:true,fetcher:async(_url,options)=>{calls++;assert.equal(options.method,'GET');return Response.json({id:'acct_foreign'});}}),/wrong_stripe_account/);assert.equal(calls,1);assert.equal(fs.existsSync(path.join(d,'stripe-live-private.json')),false);
});
test('gated deploy config isolates LIVE schema and never enables routes/access/Checkout; credential parser is data-only',t=>{
 const d=directory(t),config=productionConfig({databaseId:'owned-production'});assert.equal(config.vars.V3_CUSTOMER_MODE,'production_public');assert.equal(config.vars.V3_PUBLIC_ENABLED,'false');assert.equal(config.vars.V3_CHECKOUT_ENABLED,'disabled');assert.deepEqual(config.routes,[]);assert.match(config.d1_databases[0].migrations_dir,/customer-production-migrations$/);
 const file=path.join(d,'settings.env');fs.writeFileSync(file,'STRIPE_SECRET_KEY="sk_live_fixture"\nSMTP2GO_API_KEY=fixture\nCLOUDFLARE_API_TOKEN=must_not_transfer\nD1_PASSWORD=must_not_transfer\n',{mode:0o600});assert.deepEqual(secureProductionSettings(file),{STRIPE_SECRET_KEY:'sk_live_fixture',SMTP2GO_API_KEY:'fixture'});fs.chmodSync(file,0o644);assert.throws(()=>secureProductionSettings(file),/permissions_must_be_0600/);
});
test('operator LIVE handoff is independently checked; adoption creates only one webhook and never recreates configuration',async t=>{
 const d=directory(t),a=APPROVED_LIVE;let writes=0,webhook;const calls=[];
 const fetcher=async(url,options)=>{const p=new URL(url).pathname.replace('/v1','');calls.push(p);
  if(p==='/products/'+a.product_id)return Response.json({id:a.product_id,livemode:true,active:true,metadata:{app:'findpitches',version:'v3',plan:'pro',entitlement:'global'}});
  for(const [c,amount] of Object.entries({GBP:499,USD:699,EUR:599}))if(p==='/prices/'+a.price_ids[c])return Response.json({id:a.price_ids[c],product:a.product_id,livemode:true,active:true,currency:c.toLowerCase(),unit_amount:amount,recurring:{interval:'month',interval_count:1},billing_scheme:'per_unit',type:'recurring'});
  if(p==='/billing_portal/configurations/'+a.portal_id)return Response.json({id:a.portal_id,livemode:true,active:true,is_default:false,features:{subscription_cancel:{enabled:true,mode:'at_period_end'},customer_update:{enabled:false},subscription_update:{enabled:false},invoice_history:{enabled:true},payment_method_update:{enabled:true}}});
  if(p==='/webhook_endpoints'){assert.equal(options.method,'POST');writes++;const b=new URLSearchParams(options.body);webhook={id:'we_fixture',livemode:true,status:'enabled',url:b.get('url'),metadata:{findpitches_v3_setup:b.get('metadata[findpitches_v3_setup]')},enabled_events:[...LIVE_EVENTS],secret:'whsec_fixture_setup'};return Response.json(webhook);}
  if(p==='/webhook_endpoints/we_fixture')return Response.json(webhook);throw Error('unexpected_route');};
 const options={key:'rk_live_fixture',productionDirectory:d,fetcher};const first=await adoptLiveStripe(options);assert.equal(first.verified,true);assert.equal(first.product_price_portal_objects_created,0);assert.equal(writes,1);await adoptLiveStripe(options);assert.equal(writes,1);assert.ok(!calls.includes('/account'));assert.equal(calls.filter(p=>p==='/products'||p==='/prices'||p==='/billing_portal/configurations').length,0);
});
