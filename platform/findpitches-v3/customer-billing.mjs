import {hash} from './contract.mjs';
import {stmt,customerError,hmac,same,noteCustomerEvent,readText} from './customer-security.mjs';

export function entitlement(subscriptions,{now=new Date().toISOString(),market=null}={}) {
  const matches=subscriptions.filter(s=>s.livemode===0&&(!market||s.market===market)&&['active','trialing'].includes(s.status)&&Date.parse(s.period_end)>Date.parse(now)&&Date.parse(s.checked_at)<=Date.parse(now)&&Date.parse(s.checked_at)>Date.parse(now)-900000);
  const current=matches.sort((a,b)=>b.period_end.localeCompare(a.period_end))[0];
  if(!current)return {tier:'free',status:subscriptions.length?'expired':'none',has_billing_account:subscriptions.length>0};
  return {tier:current.status==='trialing'?'trial':'pro',status:current.status,plan_id:'pro_monthly',market:current.market,trial_ends:current.trial_end,renews_on:current.period_end,cancel_at_period_end:Boolean(current.cancel_at_period_end),has_billing_account:true};
}
export function plans(market,env) {
  const configured=market==='GB'&&env.STRIPE_PRICE_ID&&env.V3_STRIPE_MODE==='test';
  return [{id:'free',name:'Free',market,price:0,price_label:'Free',currency:market==='GB'?'GBP':'USD',interval:null,trial_days:0,card_required:false,features:['Search checked opportunities','See event dates and locations'],note:null},
    {id:'pro_monthly',name:'Pro',market,price:configured?4.99:null,price_label:configured?'£4.99':'To be confirmed',currency:market==='GB'?'GBP':'USD',interval:'month',trial_days:7,card_required:true,features:['Application and source links','Saved opportunities','Alerts'],note:configured?null:'Pricing is not confirmed for this market.'}];
}
export function stripeClient(env,fetcher=fetch) {
  if(env.V3_STRIPE_MODE!=='test'||!env.STRIPE_SECRET_KEY?.startsWith('sk_test_'))throw customerError('service_unavailable',503);
  return async (path,{method='GET',params={},idempotencyKey}={})=>{
    if(!/^\/(prices|customers|subscriptions|checkout\/sessions|billing_portal\/sessions|webhook_endpoints)(\/|$)/.test(path))throw customerError('forbidden',403);
    const form=new URLSearchParams();for(const [k,v] of Object.entries(params))if(v!==undefined&&v!==null)form.set(k,String(v));
    const response=await fetcher('https://api.stripe.com/v1'+path+(method==='GET'&&form.size?'?'+form:''),{method,headers:{Authorization:'Bearer '+env.STRIPE_SECRET_KEY,'Stripe-Version':'2024-06-20',...(method!=='GET'?{'Content-Type':'application/x-www-form-urlencoded'}:{}),...(idempotencyKey?{'Idempotency-Key':idempotencyKey}:{})},...(method==='GET'?{}:{body:form.toString()}),signal:AbortSignal.timeout(20000)});
    const result=await response.json();if(!response.ok)throw customerError('service_unavailable',503);
    if(result.livemode===true||result.object==='list'&&result.data?.some(s=>s.livemode===true))throw customerError('forbidden',403);
    return result;
  };
}
export async function syncSubscriptions(db,env,customer,{now,fetcher=fetch}={}) {
  const link=await stmt(db,'SELECT * FROM stripe_customers WHERE customer_id=?',customer.id).first();if(!link)return [];
  const stripe=stripeClient(env,fetcher),owner=await stripe('/customers/'+encodeURIComponent(link.stripe_id));
  if(owner.deleted||owner.livemode!==false||owner.metadata?.findpitches_v3_customer_id!==customer.id||owner.email?.toLowerCase()!==customer.email)throw customerError('forbidden',403);
  const list=await stripe('/subscriptions',{params:{customer:link.stripe_id,status:'all',limit:100}});
  if(list.has_more||!Array.isArray(list.data))throw customerError('service_unavailable',503);
  const ids=[];
  for(const sub of list.data) {
    if(sub.customer!==link.stripe_id||sub.livemode!==false||sub.metadata?.findpitches_v3_customer_id!==customer.id)continue;
    const price=sub.items?.data?.[0]?.price;if(sub.items?.data?.length!==1||price?.id!==env.STRIPE_PRICE_ID)continue;
    if(price.currency!=='gbp'||price.unit_amount!==499||price.recurring?.interval!=='month')throw customerError('price_not_set',409);
    const iso=value=>Number.isFinite(value)?new Date(value*1000).toISOString():null;ids.push(sub.id);
    await stmt(db,`INSERT INTO stripe_subscriptions VALUES (?,?,?,?,?,?,?,?,?,0,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,period_end=excluded.period_end,trial_end=excluded.trial_end,cancel_at_period_end=excluded.cancel_at_period_end,checked_at=excluded.checked_at WHERE stripe_subscriptions.customer_id=excluded.customer_id AND stripe_subscriptions.stripe_customer_id=excluded.stripe_customer_id AND stripe_subscriptions.checked_at<=excluded.checked_at`,sub.id,customer.id,link.stripe_id,price.id,'GB',sub.status,iso(sub.current_period_end??sub.items.data[0].current_period_end),iso(sub.trial_end),sub.cancel_at_period_end?1:0,now).run();
  }
  await stmt(db,`UPDATE stripe_subscriptions SET status='canceled',checked_at=? WHERE customer_id=? AND checked_at<=? AND id NOT IN (SELECT value FROM json_each(?))`,now,customer.id,now,JSON.stringify(ids)).run();
  return (await stmt(db,'SELECT * FROM stripe_subscriptions WHERE customer_id=?',customer.id).all()).results;
}
export async function customerAccess(db,env,customer,{now,market=null,refresh=false,fetcher=fetch}={}) {
  if(!customer)return {tier:'free',status:'none',has_billing_account:false};
  let subs=(await stmt(db,'SELECT * FROM stripe_subscriptions WHERE customer_id=?',customer.id).all()).results;
  if(refresh&&env.STRIPE_SECRET_KEY&&(subs.length===0||subs.some(s=>Date.parse(s.checked_at)<=Date.parse(now)-60000))) {
    try{subs=await syncSubscriptions(db,env,customer,{now,fetcher});}catch{await noteCustomerEvent(db,'stripe_sync','failed',now);return {tier:'free',status:'unverified',has_billing_account:Boolean(await stmt(db,'SELECT customer_id FROM stripe_customers WHERE customer_id=?',customer.id).first())};}
  }
  return {...entitlement(subs,{now,market}),has_billing_account:Boolean(await stmt(db,'SELECT customer_id FROM stripe_customers WHERE customer_id=?',customer.id).first())};
}
export async function checkout(db,env,customer,body,{now,origin,fetcher=fetch}={}) {
  if(body.market!=='GB'||body.plan_id!=='pro_monthly')throw customerError('price_not_set',409);
  if(env.V3_CHECKOUT_ENABLED!=='test')throw customerError('service_unavailable',503);
  const stripe=stripeClient(env,fetcher),price=await stripe('/prices/'+encodeURIComponent(env.STRIPE_PRICE_ID));
  if(price.livemode!==false||!price.active||price.currency!=='gbp'||price.unit_amount!==499||price.recurring?.interval!=='month')throw customerError('price_not_set',409);
  let link=await stmt(db,'SELECT * FROM stripe_customers WHERE customer_id=?',customer.id).first();
  if(!link) {const created=await stripe('/customers',{method:'POST',params:{email:customer.email,'metadata[findpitches_v3_customer_id]':customer.id},idempotencyKey:'v3-test-customer-'+customer.id});
    await stmt(db,'INSERT OR IGNORE INTO stripe_customers VALUES (?,?,0,?)',customer.id,created.id,now).run();link=await stmt(db,'SELECT * FROM stripe_customers WHERE customer_id=?',customer.id).first();}
  const subs=await syncSubscriptions(db,env,customer,{now,fetcher});
  if(subs.some(s=>['active','trialing','past_due','unpaid','incomplete','paused'].includes(s.status)))throw customerError('subscription_exists',409);
  const expiresAt=new Date(Math.floor(Date.parse(now)/1000)*1000+23*3600000).toISOString();
  const reservation=await stmt(db,`INSERT INTO checkout_reservations VALUES (?,?,?) ON CONFLICT(customer_id) DO UPDATE SET attempt_id=excluded.attempt_id,expires_at=excluded.expires_at WHERE checkout_reservations.expires_at<=? RETURNING attempt_id,expires_at`,customer.id,'v3-test-checkout-'+crypto.randomUUID(),expiresAt,now).first()
    ??await stmt(db,'SELECT attempt_id,expires_at FROM checkout_reservations WHERE customer_id=?',customer.id).first();
  const attemptId=reservation.attempt_id;
  let attempt=await stmt(db,'SELECT * FROM checkout_attempts WHERE id=?',attemptId).first();if(attempt?.checkout_url&&!attempt.completed_at)return {checkout_url:attempt.checkout_url};
  if(attempt?.completed_at)throw customerError('subscription_exists',409);
  await stmt(db,'INSERT OR IGNORE INTO checkout_attempts(id,customer_id,market,created_at) VALUES (?,?,?,?)',attemptId,customer.id,'GB',now).run();
  const result=await stripe('/checkout/sessions',{method:'POST',idempotencyKey:attemptId,params:{mode:'subscription',customer:link.stripe_id,client_reference_id:customer.id,'line_items[0][price]':env.STRIPE_PRICE_ID,'line_items[0][quantity]':1,'subscription_data[metadata][findpitches_v3_customer_id]':customer.id,
    ...(subs.length?{}:{'subscription_data[trial_period_days]':7}),expires_at:Math.floor(Date.parse(reservation.expires_at)/1000),success_url:origin+'/account.html?checkout=success&session_id={CHECKOUT_SESSION_ID}',cancel_url:origin+'/pricing.html?checkout=cancelled'}});
  if(!result.url?.startsWith('https://checkout.stripe.com/'))throw customerError('service_unavailable',503);
  await stmt(db,'UPDATE checkout_attempts SET stripe_session_id=?,checkout_url=? WHERE id=?',result.id,result.url,attemptId).run();await noteCustomerEvent(db,'checkout','test_created',now);return {checkout_url:result.url};
}
export async function confirmCheckout(db,env,customer,body,{now,fetcher=fetch}={}) {
  if(typeof body.session_id!=='string'||!/^cs_test_[A-Za-z0-9]+$/.test(body.session_id))throw customerError('validation');
  const link=await stmt(db,'SELECT * FROM stripe_customers WHERE customer_id=?',customer.id).first(),session=await stripeClient(env,fetcher)('/checkout/sessions/'+body.session_id);
  if(!link||session.livemode!==false||session.customer!==link.stripe_id||session.client_reference_id!==customer.id||session.mode!=='subscription'||session.status!=='complete')throw customerError('forbidden',403);
  const subs=await syncSubscriptions(db,env,customer,{now,fetcher});if(!subs.some(s=>s.id===session.subscription))throw customerError('forbidden',403);
  await stmt(db,'UPDATE checkout_attempts SET completed_at=? WHERE customer_id=? AND stripe_session_id=?',now,customer.id,session.id).run();return customerAccess(db,env,customer,{now});
}
export async function portal(db,env,customer,{origin,fetcher=fetch}={}) {
  const link=await stmt(db,'SELECT * FROM stripe_customers WHERE customer_id=?',customer.id).first();if(!link)throw customerError('not_found',404);
  await syncSubscriptions(db,env,customer,{now:new Date().toISOString(),fetcher});
  if(!env.STRIPE_PORTAL_CONFIGURATION_ID?.startsWith('bpc_'))throw customerError('service_unavailable',503);
  const result=await stripeClient(env,fetcher)('/billing_portal/sessions',{method:'POST',params:{customer:link.stripe_id,return_url:origin+'/account.html',configuration:env.STRIPE_PORTAL_CONFIGURATION_ID}});
  if(!result.url?.startsWith('https://billing.stripe.com/'))throw customerError('service_unavailable',503);return {url:result.url};
}
export async function webhook(request,env,{now=new Date().toISOString(),fetcher=fetch}={}) {
  // Raw payload signature; no session/CSRF. Only independently signed TEST events.
  const parts=(request.headers.get('Stripe-Signature')??'').split(',').map(p=>p.split('=')),timestamp=parts.find(p=>p[0]==='t')?.[1];
  if(!/^\d+$/.test(timestamp??'')||Math.abs(Date.parse(now)/1000-Number(timestamp))>300)throw customerError('forbidden',403);
  const text=await readText(request,262144);
  const signature=await hmac(env.STRIPE_WEBHOOK_SECRET,timestamp+'.'+text);if(!parts.some(([k,v])=>k==='v1'&&same(v,signature)))throw customerError('forbidden',403);
  let event;try{event=JSON.parse(text);}catch{throw customerError('validation');}
  if(env.V3_STRIPE_MODE!=='test'||event.livemode!==false||typeof event.id!=='string'||!/^evt_[A-Za-z0-9_]+$/.test(event.id)||typeof event.type!=='string')throw customerError('forbidden',403);
  const db=env.V3_CUSTOMER_DB,digest=await hash(text),old=await stmt(db,'SELECT * FROM stripe_webhook_receipts WHERE id=?',event.id).first();
  if(old?.payload_hash&&old.payload_hash!==digest)throw customerError('forbidden',403);if(old?.processed_at)return {received:true,duplicate:true};
  await stmt(db,'INSERT OR IGNORE INTO stripe_webhook_receipts(id,type,livemode,payload_hash,received_at) VALUES (?,?,0,?,?)',event.id,event.type,digest,now).run();
  try {
    const stripeId=event.data?.object?.customer,link=typeof stripeId==='string'?await stmt(db,'SELECT c.* FROM stripe_customers s JOIN customers c ON c.id=s.customer_id WHERE s.stripe_id=?',stripeId).first():null;
    if(link)await syncSubscriptions(db,env,link,{now,fetcher});
    await stmt(db,'UPDATE stripe_webhook_receipts SET processed_at=?,error_code=NULL WHERE id=?',now,event.id).run();await noteCustomerEvent(db,'stripe_webhook',link?'processed':'unowned_ignored',now);return {received:true};
  }catch{await stmt(db,"UPDATE stripe_webhook_receipts SET error_code='canonical_sync_failed' WHERE id=?",event.id).run();throw customerError('service_unavailable',503);}
}
