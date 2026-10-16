import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {openLocalD1} from '../../operations/findpitches-v3/local-d1.mjs';
import {stmt} from '../../platform/findpitches-v3/customer-security.mjs';
import {issueChallenge,consumeChallenge} from '../../platform/findpitches-v3/customer-auth.mjs';
import {nativeBillingSummary,nativeBillingChange,nativePaymentStart,nativePaymentConfirm} from '../../platform/findpitches-v3/customer-native-billing.mjs';
import worker from '../../platform/findpitches-v3/customer-worker.mjs';

async function fixture(t,currency='GBP'){
 const db=openLocalD1(':memory:',{migrationsDirectory:new URL('../../operations/findpitches-v3/customer-production-migrations/',import.meta.url)});t.after(()=>db.close());
 const time=new Date(),now=time.toISOString(),customer=(await consumeChallenge(db,await issueChallenge(db,{email:'native-fixture@example.org',now}),now)).customer;
 const env={V3_CUSTOMER_DB:db,V3_CUSTOMER_MODE:'production_public',V3_STRIPE_MODE:'live',V3_PUBLIC_ENABLED:'true',V3_ACCOUNT_RECOVERY_ENABLED:'true',V3_CHECKOUT_ENABLED:'disabled',V3_PUBLIC_ORIGIN:'https://findpitches.com',V3_SESSION_SECRET:'native-fixture'.repeat(6),STRIPE_SECRET_KEY:'rk_live_fixture',V3_LIVE_PRODUCT_ID:'prod_fixture',V3_LIVE_PRICE_IDS:JSON.stringify({GBP:'price_GBP',USD:'price_USD',EUR:'price_EUR'})};
 const price={id:'price_'+currency,livemode:true,product:'prod_fixture',currency:currency.toLowerCase(),unit_amount:({GBP:499,USD:699,EUR:599})[currency],billing_scheme:'per_unit',type:'recurring',recurring:{interval:'month',interval_count:1}},owner={id:'cus_owned',livemode:true,email:customer.email,metadata:{findpitches_v3_customer_id:customer.id,findpitches_v3_runtime:'production_public'},invoice_settings:{default_payment_method:'pm_original'}};
 const p={calls:[],fail:null,owner,sub:{id:'sub_owned',livemode:true,customer:owner.id,status:'trialing',trial_end:Math.floor(time/1000)+604800,current_period_end:Math.floor(time/1000)+604800,cancel_at_period_end:false,cancel_at:null,default_payment_method:null,metadata:{...owner.metadata},items:{data:[{quantity:1,price}]}},payment:{id:'pm_original',livemode:true,customer:owner.id,type:'card',card:{brand:'visa',last4:'4242',exp_month:12,exp_year:2030}},session:null,intent:null,extraSub:null};
 p.fetch=async(input,opt={})=>{const u=new URL(input),path=u.pathname.slice(3),body=new URLSearchParams(opt.body);p.calls.push({path,method:opt.method,body,key:opt.headers['Idempotency-Key'],version:opt.headers['Stripe-Version']});
  if(p.fail===path)return Response.json({error:{code:'more_permissions_required'}},{status:403});
  if(path==='/customers/cus_owned')return Response.json(p.owner);
  if(path==='/products/prod_fixture')return Response.json({id:'prod_fixture',active:true,livemode:true,metadata:{app:'findpitches',version:'v3',plan:'pro',entitlement:'global'}});
  if(path==='/subscriptions')return Response.json({object:'list',data:[p.sub,...(p.extraSub?[p.extraSub]:[])],has_more:false});
  if(path==='/subscriptions/sub_owned'){
   if(opt.method==='POST'){if(body.has('cancel_at_period_end')){p.sub.cancel_at_period_end=body.get('cancel_at_period_end')==='true';p.sub.cancel_at=p.sub.cancel_at_period_end?p.sub.current_period_end:null;}if(body.has('default_payment_method'))p.sub.default_payment_method=body.get('default_payment_method');}
   return Response.json(p.sub);
  }
  if(path.startsWith('/payment_methods/'))return Response.json({...p.payment,id:path.split('/').at(-1)});
  if(path==='/invoices')return Response.json({object:'list',has_more:false,data:[{livemode:true,customer:owner.id,subscription:p.sub.id,created:Math.floor(time/1000),currency:currency.toLowerCase(),amount_paid:0,status:'paid',hosted_invoice_url:'https://invoice.stripe.com/i/fixture'},{livemode:true,customer:owner.id,subscription:'sub_unrelated',created:1,hosted_invoice_url:'https://foreign.example'}]});
  if(path==='/checkout/sessions'){
   p.session={id:'cs_live_setupfixture',livemode:true,customer:owner.id,client_reference_id:customer.id,mode:'setup',status:'complete',metadata:{findpitches_v3_operation:body.get('metadata[findpitches_v3_operation]')},setup_intent:'seti_owned',url:'https://checkout.stripe.com/c/fixture'};
   p.intent={id:'seti_owned',livemode:true,status:'succeeded',customer:owner.id,payment_method:'pm_new',metadata:{findpitches_v3_operation:body.get('setup_intent_data[metadata][findpitches_v3_operation]'),findpitches_v3_customer_id:customer.id,findpitches_v3_runtime:'production_public'}};return Response.json(p.session);
  }
  if(path==='/checkout/sessions/cs_live_setupfixture')return Response.json(p.session);
  if(path==='/setup_intents/seti_owned')return Response.json(p.intent);
  throw Error('unexpected_route:'+path);
 };
 await stmt(db,'INSERT INTO stripe_customers VALUES (?,?,1,?)',customer.id,owner.id,now).run();return {db,env,customer,p,options:{now,origin:env.V3_PUBLIC_ORIGIN,fetcher:p.fetch}};
}
for(const currency of ['GBP','USD','EUR'])test(currency+' native summary uses canonical owner/price/trial and preserves global paid-through cancel/resume',async t=>{
 const {db,env,customer,p,options}=await fixture(t,currency);let b=await nativeBillingSummary(db,env,customer,options);
 assert.equal(b.subscription.currency,currency);assert.equal(b.access.tier,'trial');assert.equal(b.access.scope,'global');assert.equal(b.subscription.trial_end,b.subscription.period_end);assert.equal(b.payment_method.last4,'4242');assert.equal(b.invoices.length,1);
 const initialTrial=p.sub.trial_end,initialPeriod=p.sub.current_period_end,revision=b.subscription.revision;
 b=await nativeBillingChange(db,env,customer,{action:'cancel',revision},options);assert.equal(b.subscription.cancel_at_period_end,true);assert.equal(b.access.tier,'trial');assert.equal(b.subscription.can_resume,true);
 await nativeBillingChange(db,env,customer,{action:'cancel',revision},options);assert.equal(p.calls.filter(c=>c.method==='POST').length,1);
 b=await nativeBillingChange(db,env,customer,{action:'resume',revision:b.subscription.revision},options);assert.equal(b.subscription.cancel_at_period_end,false);assert.equal(b.access.tier,'trial');assert.equal(p.sub.trial_end,initialTrial);assert.equal(p.sub.current_period_end,initialPeriod);
 const writes=p.calls.filter(c=>c.method==='POST');assert.equal(writes.length,2);assert.ok(writes.every(c=>c.path==='/subscriptions/sub_owned'&&[...c.body.keys()].join()==='cancel_at_period_end'&&c.key.startsWith('v3-billing-')));
 assert.ok(p.calls.every(c=>c.version==='2024-06-20'));assert.equal((await stmt(db,'SELECT COUNT(*) AS n FROM billing_operations WHERE completed_at IS NOT NULL').first()).n,2);
});
test('native management rejects foreign owner/product, multiple subscriptions, tampered/stale state, and extra object IDs before provider writes',async t=>{
 const {db,env,customer,p,options}=await fixture(t);const b=await nativeBillingSummary(db,env,customer,options),revision=b.subscription.revision;
 for(const body of [{action:'delete',revision},{action:'cancel',revision,subscription_id:'sub_foreign'},{action:'cancel',revision:'broken'}])await assert.rejects(nativeBillingChange(db,env,customer,body,options));
 await assert.rejects(nativeBillingChange(db,env,customer,{action:'cancel',revision},{...options,now:new Date(Date.parse(options.now)+600001).toISOString()}),/billing_state_changed/);
 p.sub.items.data[0].price.unit_amount=1;await assert.rejects(nativeBillingSummary(db,env,customer,options),/price_not_set/);p.sub.items.data[0].price.unit_amount=499;
 p.owner.metadata.findpitches_v3_customer_id='other';await assert.rejects(nativeBillingChange(db,env,customer,{action:'cancel',revision},options),/forbidden/);p.owner.metadata.findpitches_v3_customer_id=customer.id;
 p.extraSub={...p.sub,id:'sub_duplicate'};await assert.rejects(nativeBillingSummary(db,env,customer,options),/billing_review_required/);p.extraSub=null;
 p.sub.cancel_at_period_end=true;p.sub.cancel_at=p.sub.current_period_end;await assert.rejects(nativeBillingChange(db,env,customer,{action:'resume',revision},options),/billing_state_changed/);
 assert.equal(p.calls.filter(c=>c.method==='POST').length,0);
});
test('optional payment/invoice faults do not block canonical cancellation; subscription faults fail closed',async t=>{
 const {db,env,customer,p,options}=await fixture(t);p.fail='/invoices';let b=await nativeBillingSummary(db,env,customer,options);assert.equal(b.optional.invoices,'unavailable');assert.equal(b.subscription.can_cancel,true);
 p.fail='/payment_methods/pm_original';b=await nativeBillingChange(db,env,customer,{action:'cancel',revision:b.subscription.revision},options);assert.equal(b.payment_method,null);assert.equal(b.access.tier,'trial');
 p.fail='/subscriptions';await assert.rejects(nativeBillingSummary(db,env,customer,options),/service_unavailable/);
});
test('Stripe-secure payment setup is branded, owned, idempotent and updates only the approved subscription without new trials',async t=>{
 const {db,env,customer,p,options}=await fixture(t),before=structuredClone(p.sub),b=await nativeBillingSummary(db,env,customer,options),body={revision:b.subscription.revision,locale:'fr'};
 const first=await nativePaymentStart(db,env,customer,body,options);assert.equal((await nativePaymentStart(db,env,customer,body,options)).checkout_url,first.checkout_url);
 const calls=p.calls.filter(c=>c.path==='/checkout/sessions');assert.equal(calls.length,1);assert.equal(calls[0].version,'2025-09-30.clover');assert.equal(calls[0].body.get('mode'),'setup');assert.equal(calls[0].body.get('branding_settings[display_name]'),'FindPitches');assert.equal(calls[0].body.get('payment_method_types[0]'),'card');assert.ok(calls[0].body.get('success_url').includes('/lang/fr/billing.html?payment=return'));assert.ok(![...calls[0].body.keys()].some(k=>k.startsWith('line_items')||k.startsWith('subscription_data')));
 const after=await nativePaymentConfirm(db,env,customer,{session_id:p.session.id},options);assert.equal(after.payment_method.last4,'4242');assert.equal(p.sub.default_payment_method,'pm_new');assert.equal(p.sub.trial_end,before.trial_end);assert.equal(p.sub.current_period_end,before.current_period_end);
 await nativePaymentConfirm(db,env,customer,{session_id:p.session.id},options);assert.equal(p.calls.filter(c=>c.method==='POST'&&c.path.startsWith('/subscriptions/')).length,1);
 assert.equal((await stmt(db,"SELECT COUNT(*) AS n FROM billing_operations WHERE kind='payment' AND completed_at IS NOT NULL").first()).n,1);
 assert.ok(!p.calls.some(c=>c.method==='POST'&&c.path.startsWith('/customers')));
});
test('payment confirmation rejects unknown/replayed-old setup, wrong customer/metadata and unattached card',async t=>{
 const {db,env,customer,p,options}=await fixture(t),b=await nativeBillingSummary(db,env,customer,options);
 await assert.rejects(nativePaymentConfirm(db,env,customer,{session_id:'cs_live_unknown'},options),/not_found/);
 await nativePaymentStart(db,env,customer,{revision:b.subscription.revision},options);
 const complete=()=>nativePaymentConfirm(db,env,customer,{session_id:p.session.id},options);
 p.intent.customer='cus_foreign';await assert.rejects(complete(),/forbidden/);p.intent.customer=p.owner.id;
 p.payment.customer='cus_foreign';await assert.rejects(complete(),/forbidden/);p.payment.customer=p.owner.id;
 p.session.client_reference_id='foreign';await assert.rejects(complete(),/forbidden/);p.session.client_reference_id=customer.id;
 const created=new Date(Date.parse(options.now)+1000).toISOString();await stmt(db,"INSERT INTO billing_operations(id,customer_id,subscription_id,kind,created_at,expires_at,completed_at) VALUES ('newer',?,?,'payment',?,?,?)",customer.id,p.sub.id,created,created,created).run();await assert.rejects(complete(),/billing_state_changed/);
 assert.equal(p.calls.filter(c=>c.method==='POST'&&c.path.startsWith('/subscriptions/')).length,0);
});
test('billing recovery shell/API requires signed ownership and CSRF independently of source/public/Checkout availability',async t=>{
 const {db,env,options}=await fixture(t);env.V3_PUBLIC_ENABLED='false';env.V3_READY_API={fetch:()=>{throw Error('no_catalogue_for_billing');}};env.ASSETS={fetch:async u=>new Response(fs.readFileSync(new URL('../../web/findpitches-v3-web/public/'+new URL(u).pathname.slice(1),import.meta.url)))};
 for(const lang of ['','/lang/fr','/lang/de']){const r=await worker.fetch(new Request(env.V3_PUBLIC_ORIGIN+lang+'/billing.html'),env);assert.equal(r.status,200);assert.match(r.headers.get('x-robots-tag'),/noindex/);}
 assert.equal((await worker.fetch(new Request(env.V3_PUBLIC_ORIGIN+'/api/v3/billing/summary'),env)).status,401);
 for(const path of ['change','payment','payment/confirm'])assert.equal((await worker.fetch(new Request(env.V3_PUBLIC_ORIGIN+'/api/v3/billing/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}),env)).status,403);
 assert.equal((await stmt(db,'SELECT COUNT(*) AS n FROM billing_operations').first()).n,0);
});
