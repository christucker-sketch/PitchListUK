import {customerLanguage,customerReturnPath} from './customer-localisation.mjs';
// D-014/D-016: isolated new-customer LIVE billing. Preview billing stays TEST-only.
import {hash} from './contract.mjs';
import {stmt,customerError,hmac,same,readText,noteCustomerEvent} from './customer-security.mjs';

export const LIVE_PRICES=Object.freeze({GBP:{amount:499,label:'£4.99'},USD:{amount:699,label:'$6.99'},EUR:{amount:599,label:'€5.99'}});
const blocking=s=>['active','trialing','past_due','unpaid','incomplete','paused'].includes(s.status);
const iso=n=>Number.isFinite(n)?new Date(n*1000).toISOString():null;
export function livePricePolicy(env) {
  let ids;try{ids=JSON.parse(env.V3_LIVE_PRICE_IDS??'{}');}catch{throw customerError('price_not_set',409);}
  if(!/^prod_[A-Za-z0-9]+$/.test(env.V3_LIVE_PRODUCT_ID??'')||Object.keys(ids).length!==3||Object.keys(LIVE_PRICES).some(c=>!/^price_[A-Za-z0-9]+$/.test(ids[c]??''))||new Set(Object.values(ids)).size!==3)throw customerError('price_not_set',409);
  return Object.entries(LIVE_PRICES).map(([currency,p])=>({...p,currency,id:ids[currency],product:env.V3_LIVE_PRODUCT_ID}));
}
export function validateLivePrice(price,policy) {
  if(!policy||price?.id!==policy.id||price.livemode!==true||price.product!==policy.product||price.currency!==policy.currency.toLowerCase()||price.unit_amount!==policy.amount||price.recurring?.interval!=='month'||price.recurring?.interval_count!==1||price.billing_scheme!=='per_unit'||price.type!=='recurring')throw customerError('price_not_set',409);
  return policy;
}
export function liveEntitlement(subs,{now=new Date().toISOString(),policy=[]}={}) {
  const current=subs.filter(s=>s.livemode===1&&s.market==='GLOBAL'&&policy.some(p=>p.id===s.price_id&&p.product===s.stripe_product_id&&p.currency===s.currency)&&['active','trialing'].includes(s.status)&&Date.parse(s.period_end)>Date.parse(now)&&Date.parse(s.checked_at)<=Date.parse(now)&&Date.parse(s.checked_at)>Date.parse(now)-900000).sort((a,b)=>b.period_end.localeCompare(a.period_end))[0];
  return current?{tier:current.status==='trialing'?'trial':'pro',status:current.status,plan_id:'pro_monthly',scope:'global',market:null,currency:current.currency,trial_ends:current.trial_end,renews_on:current.period_end,cancel_at_period_end:!!current.cancel_at_period_end,has_billing_account:true}:{tier:'free',status:subs.length?'expired':'none',has_billing_account:subs.length>0};
}
export function livePlans(market,env,currency) {
  currency??=market==='US'?'USD':market==='IE'?'EUR':'GBP';
  if(!LIVE_PRICES[currency])throw customerError('validation');
  let configured=false;try{livePricePolicy(env);configured=env.V3_CHECKOUT_ENABLED==='live';}catch{}
  const p=LIVE_PRICES[currency];
  return [{id:'free',name:'Free',market,scope:'global',price:0,price_label:'Free',currency,interval:null,trial_days:0,card_required:false,features:['Search checked opportunities','See event dates and locations']},
    {id:'pro_monthly',name:'Pro',market,scope:'global',currency,price:p.amount/100,price_label:p.label,interval:'month',trial_days:7,card_required:true,checkout_enabled:configured,billing_currencies:Object.keys(LIVE_PRICES),features:['Application and source links worldwide','Saved opportunities'],note:configured?'One Pro subscription covers all countries. Email alerts are coming later.':'Checkout is not available yet. Email alerts are coming later.'}];
}
export function liveStripeClient(env,fetcher=fetch) {
  if(env.V3_CUSTOMER_MODE!=='production_public'||env.V3_STRIPE_MODE!=='live'||! /^(sk|rk)_live_/.test(env.STRIPE_SECRET_KEY??''))throw customerError('service_unavailable',503);
  return async(path,{method='GET',params={},idempotencyKey}={})=>{
    if(!/^\/(prices|products|customers|subscriptions|checkout\/sessions|billing_portal\/sessions)(\/|$)/.test(path)&&!(method==='GET'&&/^\/billing_portal\/configurations\/bpc_[A-Za-z0-9]+$/.test(path)))throw customerError('forbidden',403);
    const form=new URLSearchParams();for(const [k,v] of Object.entries(params))if(v!==undefined&&v!==null)form.set(k,String(v));
    const r=await fetcher('https://api.stripe.com/v1'+path+(method==='GET'&&form.size?'?'+form:''),{method,headers:{Authorization:'Bearer '+env.STRIPE_SECRET_KEY,'Stripe-Version':'2024-06-20',...(method!=='GET'?{'Content-Type':'application/x-www-form-urlencoded'}:{}),...(idempotencyKey?{'Idempotency-Key':idempotencyKey}:{})},...(method==='GET'?{}:{body:form.toString()}),signal:AbortSignal.timeout(20000)});
    const value=await r.json();if(!r.ok){
      const e=customerError('service_unavailable',503);
      // Provider messages and request URLs can contain customer data or key
      // fragments. Retain only a fixed operation, known code and request ID.
      const family=path.startsWith('/checkout/sessions')?'checkout':path.startsWith('/billing_portal/')?'portal':path.split('/')[1];
      const codes=['more_permissions_required','permission_denied','resource_missing','parameter_missing','parameter_unknown','idempotency_key_in_use','rate_limit','api_key_expired'];
      e.stripeDiagnostic={operation:family+'_'+method.toLowerCase(),status:r.status,code:codes.includes(value.error?.code)?value.error.code:'provider_error',request_id:/^req_[A-Za-z0-9]{1,80}$/.test(r.headers.get('request-id')??'')?r.headers.get('request-id'):null};
      throw e;
    }
    if(value.object==='list'?(!Array.isArray(value.data)||value.data.some(o=>o.livemode!==true)):value.livemode!==true)throw customerError('forbidden',403);
    return value;
  };
}
export async function recordLiveStripeFailure(db,e,now) {
  const d=e.stripeDiagnostic;if(!d)return;
  await noteCustomerEvent(db,'stripe_live_error',[d.operation,d.status,d.code,d.request_id??'none'].join(':'),now);
}
function returnOrigin(origin,env) {if(origin!==env.V3_PUBLIC_ORIGIN||origin!=='https://findpitches.com')throw customerError('forbidden',403);return origin;}
async function productProof(stripe,env) {
  const p=await stripe('/products/'+encodeURIComponent(env.V3_LIVE_PRODUCT_ID));
  if(p.id!==env.V3_LIVE_PRODUCT_ID||!p.active||p.metadata?.app!=='findpitches'||p.metadata?.version!=='v3'||p.metadata?.plan!=='pro'||p.metadata?.entitlement!=='global')throw customerError('billing_review_required',409);
}
// Operator-only canonical reads using the actual deployed credential. Never
// create a customer/session/subscription just to demonstrate configuration.
export async function verifyLiveBillingSettings(env,{fetcher=fetch}={}) {
  const stripe=liveStripeClient(env,fetcher),policy=livePricePolicy(env);
  if(!/^bpc_[A-Za-z0-9]+$/.test(env.STRIPE_PORTAL_CONFIGURATION_ID??'')||!env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_')||env.STRIPE_WEBHOOK_SECRET.length<32)throw customerError('service_unavailable',503);
  await productProof(stripe,env);
  for(const p of policy){const price=await stripe('/prices/'+p.id);validateLivePrice(price,p);if(!price.active)throw customerError('price_not_set',409);}
  const portal=await stripe('/billing_portal/configurations/'+env.STRIPE_PORTAL_CONFIGURATION_ID);
  if(portal.id!==env.STRIPE_PORTAL_CONFIGURATION_ID||!portal.active||portal.is_default||!portal.features?.subscription_cancel?.enabled||portal.features.subscription_cancel.mode!=='at_period_end'||portal.features?.customer_update?.enabled||portal.features?.subscription_update?.enabled||!portal.features?.payment_method_update?.enabled||!portal.features?.invoice_history?.enabled)throw customerError('billing_review_required',409);
  return {provider:'stripe',mode:'live',credential_validated:true,product_id:env.V3_LIVE_PRODUCT_ID,prices:policy.map(({id,currency,amount})=>({id,currency,amount,interval:'month'})),portal_id:portal.id,portal_cancel_at_period_end:true,webhook_secret_configured:true,entitlement:'global',trial_days:7,checkout_enabled:env.V3_CHECKOUT_ENABLED==='live',customer_objects_created:0};
}
// Operator-only permission checks against deliberately nonexistent resources.
// Empty updates cannot create customers/Checkout; the Portal probe names a
// nonexistent customer. A missing-resource error proves only that the request
// passed permissions, not that a genuine hosted trial journey has succeeded.
export async function verifyLiveBillingCapabilities(env,{fetcher=fetch}={}) {
  await verifyLiveBillingSettings(env,{fetcher});
  const stripe=liveStripeClient(env,fetcher),customer='cus_FindPitchesV3CapabilityCheckNoSuchCustomer';
  const probes=[
    ['customers_read','/customers/'+customer,{}],
    ['customers_write','/customers/'+customer,{method:'POST'}],
    ['subscriptions_read','/subscriptions',{params:{customer,limit:1}}],
    ['checkout_write','/checkout/sessions/cs_live_FindPitchesV3CapabilityCheckNoSuchSession',{method:'POST'}],
    ['portal_write','/billing_portal/sessions',{method:'POST',params:{customer,configuration:env.STRIPE_PORTAL_CONFIGURATION_ID}}]
  ],checks=[];
  for(const [capability,path,options] of probes){
    try{await stripe(path,options);throw customerError('billing_review_required',409);}
    catch(e){if(!e.stripeDiagnostic)throw e;checks.push({capability,permitted:e.stripeDiagnostic.code==='resource_missing'&&[400,404].includes(e.stripeDiagnostic.status),...e.stripeDiagnostic});}
  }
  return {provider:'stripe',mode:'live',settings_validated:true,permissions_observed:checks.every(c=>c.permitted),checks,customer_objects_created:0,checkout_sessions_created:0,subscriptions_created:0,owned_trial_journey_proven:false};
}
async function nativeOwner(db,stripe,customer) {
  const link=await stmt(db,'SELECT * FROM stripe_customers WHERE customer_id=?',customer.id).first();
  if(!link)return null;
  const owner=await stripe('/customers/'+encodeURIComponent(link.stripe_id));
  if(link.livemode!==1||owner.id!==link.stripe_id||owner.deleted||owner.email?.toLowerCase()!==customer.email||owner.metadata?.findpitches_v3_customer_id!==customer.id||owner.metadata?.findpitches_v3_runtime!=='production_public')throw customerError('forbidden',403);
  return link;
}
export async function syncLiveSubscriptions(db,env,customer,{now,fetcher=fetch}={}) {
  const stripe=liveStripeClient(env,fetcher),link=await nativeOwner(db,stripe,customer);if(!link)return [];
  const policy=livePricePolicy(env);await productProof(stripe,env);
  const list=await stripe('/subscriptions',{params:{customer:link.stripe_id,status:'all',limit:100}});
  if(list.has_more||list.data.filter(blocking).length>1)throw customerError('billing_review_required',409);
  const checked=[];
  // Validate the entire canonical response before changing cached entitlement.
  for(const sub of list.data){
    const own=sub.customer===link.stripe_id&&sub.metadata?.findpitches_v3_customer_id===customer.id&&sub.metadata?.findpitches_v3_runtime==='production_public';
    if(!own){if(blocking(sub))throw customerError('billing_review_required',409);continue;}
    const price=sub.items?.data?.[0]?.price,p=policy.find(p=>p.id===price?.id);
    if(!p){if(blocking(sub))throw customerError('billing_review_required',409);continue;}
    if(sub.items?.data?.length!==1||sub.items.data[0].quantity!==1)throw customerError('billing_review_required',409);
    validateLivePrice(price,p);
    checked.push({sub,policy:p});
  }
  const writes=checked.map(({sub,policy:p})=>stmt(db,`INSERT INTO stripe_subscriptions(id,customer_id,stripe_customer_id,price_id,market,status,period_end,trial_end,cancel_at_period_end,livemode,checked_at,currency,stripe_product_id) VALUES (?,?,?,?,'GLOBAL',?,?,?,?,1,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,period_end=excluded.period_end,trial_end=excluded.trial_end,cancel_at_period_end=excluded.cancel_at_period_end,checked_at=excluded.checked_at WHERE stripe_subscriptions.customer_id=excluded.customer_id AND stripe_subscriptions.stripe_customer_id=excluded.stripe_customer_id AND stripe_subscriptions.price_id=excluded.price_id AND stripe_subscriptions.checked_at<=excluded.checked_at`,sub.id,customer.id,link.stripe_id,p.id,sub.status,iso(sub.current_period_end??sub.items.data[0].current_period_end),iso(sub.trial_end),sub.cancel_at_period_end?1:0,now,p.currency,p.product));
  writes.push(stmt(db,`UPDATE stripe_subscriptions SET status='canceled',checked_at=? WHERE customer_id=? AND checked_at<=? AND id NOT IN (SELECT value FROM json_each(?))`,now,customer.id,now,JSON.stringify(checked.map(v=>v.sub.id))));
  await db.batch(writes);
  return (await stmt(db,'SELECT * FROM stripe_subscriptions WHERE customer_id=?',customer.id).all()).results;
}
export async function liveCustomerAccess(db,env,customer,{now,refresh=false,fetcher=fetch}={}) {
  if(!customer)return {tier:'free',status:'none',scope:'global',has_billing_account:false};
  let subs=(await stmt(db,'SELECT * FROM stripe_subscriptions WHERE customer_id=?',customer.id).all()).results,unverified=false;
  if(refresh&&(subs.length===0||subs.some(s=>Date.parse(s.checked_at)<=Date.parse(now)-60000))){try{subs=await syncLiveSubscriptions(db,env,customer,{now,fetcher});}catch(e){unverified=true;await recordLiveStripeFailure(db,e,now);await noteCustomerEvent(db,'stripe_live_sync','failed',now);}}
  const link=await stmt(db,'SELECT * FROM stripe_customers WHERE customer_id=?',customer.id).first(),pending=subs.some(blocking);
  let policy=[];try{policy=livePricePolicy(env);}catch{if(subs.length)unverified=true;}
  const access=unverified?{tier:'free',status:'unverified',scope:'global'}:liveEntitlement(subs,{now,policy});
  return {...access,has_billing_account:!!link,checkout_allowed:!unverified&&!pending&&env.V3_CHECKOUT_ENABLED==='live',trial_eligible:subs.length===0,billing_review_required:unverified};
}
export async function liveCheckout(db,env,customer,body,{now,origin,fetcher=fetch}={}) {
  if(env.V3_CHECKOUT_ENABLED!=='live')throw customerError('service_unavailable',503);
  const locale=customerLanguage(body.locale);
  if(body.plan_id!=='pro_monthly'||!LIVE_PRICES[body.currency])throw customerError('validation');
  returnOrigin(origin,env);
  const p=livePricePolicy(env).find(p=>p.currency===body.currency),stripe=liveStripeClient(env,fetcher);await productProof(stripe,env);
  const price=await stripe('/prices/'+encodeURIComponent(p.id));validateLivePrice(price,p);if(!price.active)throw customerError('price_not_set',409);
  let link=await stmt(db,'SELECT * FROM stripe_customers WHERE customer_id=?',customer.id).first();
  if(!link){const created=await stripe('/customers',{method:'POST',params:{email:customer.email,'metadata[findpitches_v3_customer_id]':customer.id,'metadata[findpitches_v3_runtime]':'production_public'},idempotencyKey:'v3-live-customer-'+customer.id});
    await stmt(db,'INSERT OR IGNORE INTO stripe_customers VALUES (?,?,1,?)',customer.id,created.id,now).run();link=await stmt(db,'SELECT * FROM stripe_customers WHERE customer_id=?',customer.id).first();}
  const subs=await syncLiveSubscriptions(db,env,customer,{now,fetcher});if(subs.some(blocking))throw customerError('subscription_exists',409);
  const expires=new Date(Math.floor(Date.parse(now)/1000)*1000+23*3600000).toISOString();
  const reservation=await stmt(db,`INSERT INTO checkout_reservations VALUES (?,?,?) ON CONFLICT(customer_id) DO UPDATE SET attempt_id=excluded.attempt_id,expires_at=excluded.expires_at WHERE checkout_reservations.expires_at<=? RETURNING attempt_id,expires_at`,customer.id,'v3-live-checkout-'+crypto.randomUUID(),expires,now).first()??await stmt(db,'SELECT * FROM checkout_reservations WHERE customer_id=?',customer.id).first();
  await stmt(db,'INSERT OR IGNORE INTO checkout_attempts(id,customer_id,market,created_at,currency,price_id) VALUES (?, ?, ?, ?, ?, ?)',reservation.attempt_id,customer.id,'GLOBAL',now,p.currency,p.id).run();
  const attempt=await stmt(db,'SELECT * FROM checkout_attempts WHERE id=?',reservation.attempt_id).first();
  if(attempt.currency!==p.currency||attempt.price_id!==p.id)throw customerError('checkout_currency_locked',409);
  if(attempt.completed_at)throw customerError('subscription_exists',409);
  if(attempt.checkout_url)return {checkout_url:attempt.checkout_url};
  const r=await stripe('/checkout/sessions',{method:'POST',idempotencyKey:reservation.attempt_id,params:{mode:'subscription',customer:link.stripe_id,client_reference_id:customer.id,'line_items[0][price]':p.id,'line_items[0][quantity]':1,'subscription_data[metadata][findpitches_v3_customer_id]':customer.id,'subscription_data[metadata][findpitches_v3_runtime]':'production_public',...(subs.length?{}:{'subscription_data[trial_period_days]':7}),expires_at:Math.floor(Date.parse(reservation.expires_at)/1000),locale,success_url:origin+customerReturnPath('/account.html?checkout=success&session_id={CHECKOUT_SESSION_ID}',locale),cancel_url:origin+customerReturnPath('/pricing.html?checkout=cancelled',locale)}});
  if(!/^cs_live_[A-Za-z0-9]+$/.test(r.id??'')||r.customer!==link.stripe_id||r.client_reference_id!==customer.id||r.mode!=='subscription'||!r.url?.startsWith('https://checkout.stripe.com/'))throw customerError('forbidden',403);
  await stmt(db,'UPDATE checkout_attempts SET stripe_session_id=?,checkout_url=? WHERE id=?',r.id,r.url,attempt.id).run();await noteCustomerEvent(db,'checkout','live_created',now);return {checkout_url:r.url};
}
export async function liveConfirmCheckout(db,env,customer,body,{now,fetcher=fetch}={}) {
  if(!/^cs_live_[A-Za-z0-9]+$/.test(body.session_id??''))throw customerError('validation');
  const stripe=liveStripeClient(env,fetcher),link=await nativeOwner(db,stripe,customer),s=await stripe('/checkout/sessions/'+body.session_id);
  if(!link||s.customer!==link.stripe_id||s.client_reference_id!==customer.id||s.mode!=='subscription'||s.status!=='complete')throw customerError('forbidden',403);
  const subs=await syncLiveSubscriptions(db,env,customer,{now,fetcher});if(!subs.some(r=>r.id===s.subscription))throw customerError('forbidden',403);
  await stmt(db,'UPDATE checkout_attempts SET completed_at=? WHERE customer_id=? AND stripe_session_id=?',now,customer.id,s.id).run();return liveCustomerAccess(db,env,customer,{now});
}
export async function livePortal(db,env,customer,{origin,locale='en',fetcher=fetch}={}) {
  locale=customerLanguage(locale);
  returnOrigin(origin,env);const stripe=liveStripeClient(env,fetcher),link=await nativeOwner(db,stripe,customer);if(!link)throw customerError('not_found',404);
  // Cancellation stays available during catalogue/provider reconciliation faults
  // and when new Checkout is closed. Canonical customer ownership is sufficient.
  if(!/^bpc_[A-Za-z0-9]+$/.test(env.STRIPE_PORTAL_CONFIGURATION_ID??''))throw customerError('service_unavailable',503);
  const r=await stripe('/billing_portal/sessions',{method:'POST',params:{customer:link.stripe_id,configuration:env.STRIPE_PORTAL_CONFIGURATION_ID,locale,return_url:origin+customerReturnPath('/account.html',locale)}});
  if(!r.url?.startsWith('https://billing.stripe.com/'))throw customerError('service_unavailable',503);return {url:r.url};
}
export async function liveWebhook(request,env,{now=new Date().toISOString(),fetcher=fetch}={}) {
  if(env.V3_STRIPE_MODE!=='live'||!env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_'))throw customerError('service_unavailable',503);
  const parts=(request.headers.get('Stripe-Signature')??'').split(',').map(p=>p.split('=')),ts=parts.find(p=>p[0]==='t')?.[1];
  if(!/^\d+$/.test(ts??'')||Math.abs(Date.parse(now)/1000-Number(ts))>300)throw customerError('forbidden',403);
  const raw=await readText(request,262144),sig=await hmac(env.STRIPE_WEBHOOK_SECRET,ts+'.'+raw);if(!parts.some(([k,v])=>k==='v1'&&same(v,sig)))throw customerError('forbidden',403);
  let e;try{e=JSON.parse(raw);}catch{throw customerError('validation');}
  if(e.livemode!==true||!/^evt_[A-Za-z0-9_]+$/.test(e.id??'')||typeof e.type!=='string')throw customerError('forbidden',403);
  const db=env.V3_CUSTOMER_DB,digest=await hash(raw),old=await stmt(db,'SELECT * FROM stripe_webhook_receipts WHERE id=?',e.id).first();
  if(old&&old.payload_hash!==digest)throw customerError('forbidden',403);if(old?.processed_at)return {received:true,duplicate:true};
  await stmt(db,'INSERT OR IGNORE INTO stripe_webhook_receipts(id,type,livemode,payload_hash,received_at) VALUES (?,?,1,?,?)',e.id,e.type,digest,now).run();
  const stored=await stmt(db,'SELECT * FROM stripe_webhook_receipts WHERE id=?',e.id).first();if(stored.payload_hash!==digest)throw customerError('forbidden',403);
  try{const id=e.data?.object?.customer,customer=typeof id==='string'?await stmt(db,'SELECT c.* FROM stripe_customers s JOIN customers c ON c.id=s.customer_id WHERE s.stripe_id=? AND s.livemode=1',id).first():null;
    if(customer)await syncLiveSubscriptions(db,env,customer,{now,fetcher});
    await stmt(db,'UPDATE stripe_webhook_receipts SET processed_at=?,error_code=NULL WHERE id=?',now,e.id).run();return {received:true,unowned_ignored:!customer};
  }catch{await stmt(db,"UPDATE stripe_webhook_receipts SET error_code='canonical_sync_failed' WHERE id=?",e.id).run();throw customerError('service_unavailable',503);}
}
