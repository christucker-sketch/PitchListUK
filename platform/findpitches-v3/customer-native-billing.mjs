// Native management of V3-owned subscriptions only. Stripe handles every card field.
import {liveStripeClient,nativeOwner,syncLiveSubscriptions,livePricePolicy,validateLivePrice,liveEntitlement} from './customer-live-billing.mjs';
import {stmt,customerError,hmac,same,noteCustomerEvent} from './customer-security.mjs';
import {hash} from './contract.mjs';
import {checkoutBranding} from './customer-branding.mjs';
import {customerLanguage,customerReturnPath} from './customer-localisation.mjs';

const iso=n=>Number.isFinite(n)?new Date(n*1000).toISOString():null;
const objectId=(o,prefix)=>typeof o==='string'&&new RegExp('^'+prefix+'_[A-Za-z0-9]+$').test(o);
const mutable=s=>['active','trialing'].includes(s.status)&&(s.cancel_at==null||(s.cancel_at_period_end&&s.cancel_at===s.current_period_end));
function ownedSub(sub,link,customer,env) {
  const p=livePricePolicy(env).find(p=>p.id===sub.items?.data?.[0]?.price?.id);
  if(sub.livemode!==true||sub.customer!==link.stripe_id||sub.metadata?.findpitches_v3_customer_id!==customer.id||sub.metadata?.findpitches_v3_runtime!=='production_public'||sub.items?.data?.length!==1||sub.items.data[0].quantity!==1)throw customerError('billing_review_required',409);
  validateLivePrice(sub.items.data[0].price,p);return p;
}
async function canonical(db,env,customer,options) {
  const stripe=liveStripeClient(env,options.fetcher),link=await nativeOwner(db,stripe,customer);
  if(!link)return {stripe,link,sub:null,rows:[]};
  const rows=await syncLiveSubscriptions(db,env,customer,options);
  const current=rows.filter(s=>['active','trialing','past_due','unpaid','incomplete','paused'].includes(s.status));
  if(current.length>1)throw customerError('billing_review_required',409);
  const row=current[0]??rows.sort((a,b)=>(b.period_end??'').localeCompare(a.period_end??''))[0];
  if(!row)return {stripe,link,sub:null,rows};
  const sub=await stripe('/subscriptions/'+encodeURIComponent(row.id));
  if(sub.id!==row.id)throw customerError('forbidden',403);
  const price=ownedSub(sub,link,customer,env);return {stripe,link,sub,rows,price};
}
const state=s=>JSON.stringify([s.id,s.status,s.cancel_at_period_end,s.cancel_at,s.current_period_end,s.trial_end,s.default_payment_method]);
async function revision(env,customer,sub,now){const stamp=String(Date.parse(now));return stamp+'.'+await hmac(env.V3_SESSION_SECRET,customer.id+'|'+stamp+'|'+state(sub));}
async function requireRevision(env,customer,sub,value,now) {
  const [stamp]=String(value??'').split('.');
  if(!/^\d{13}$/.test(stamp)||Number(stamp)>Date.parse(now)||Number(stamp)<Date.parse(now)-600000||!same(value,await revision(env,customer,sub,new Date(Number(stamp)).toISOString())))throw customerError('billing_state_changed',409);
}
function bodyOnly(body,keys){if(!body||Object.keys(body).some(k=>!keys.includes(k)))throw customerError('validation');}
function cardSummary(pm,customer) {
  if(!pm||pm.livemode!==true||pm.customer!==customer||!objectId(pm.id,'pm'))throw customerError('forbidden',403);
  if(pm.type!=='card')return {type:pm.type==='us_bank_account'?'bank':'other'};
  if(!/^\d{4}$/.test(pm.card?.last4??'')||!Number.isInteger(pm.card.exp_month)||pm.card.exp_month<1||pm.card.exp_month>12||!Number.isInteger(pm.card.exp_year))throw customerError('billing_review_required',409);
  return {type:'card',brand:['visa','mastercard','amex','discover','diners','jcb','unionpay'].includes(pm.card.brand)?pm.card.brand:'card',last4:pm.card.last4,exp_month:pm.card.exp_month,exp_year:pm.card.exp_year};
}
const receiptURL=u=>{if(!u)return null;try{const p=new URL(u);return p.protocol==='https:'&&!p.username&&!p.password&&['invoice.stripe.com','pay.stripe.com'].includes(p.hostname)?u:null;}catch{return null;}};
async function summary(db,env,customer,c,{now,extras=true}={}) {
  const {stripe,link,sub,rows,price}=c;
  if(!link)return {has_billing_account:false,subscription:null,payment_method:null,invoices:[],access:{tier:'free',status:'none',scope:'global'}};
  const access=liveEntitlement(rows,{now,policy:livePricePolicy(env)}),result={has_billing_account:true,subscription:sub?{plan:'FindPitches Pro',scope:'global',status:sub.status,currency:price.currency,amount:price.amount,interval:'month',trial_end:iso(sub.trial_end),period_end:iso(sub.current_period_end),cancel_at_period_end:!!sub.cancel_at_period_end,canceled_at:iso(sub.canceled_at),access_until:['active','trialing'].includes(sub.status)?iso(sub.current_period_end):null,can_cancel:mutable(sub)&&!sub.cancel_at_period_end,can_resume:mutable(sub)&&!!sub.cancel_at_period_end,can_update_payment:mutable(sub),revision:await revision(env,customer,sub,now)}:null,access,payment_method:null,invoices:[],optional:{payment_method:'unavailable',invoices:'unavailable'}};
  if(!extras)return result;
  // Ancillary permissions/provider failures cannot block cancellation or claim stale entitlement.
  const pmId=sub?.default_payment_method;
  if(pmId){try{if(!objectId(pmId,'pm'))throw customerError('billing_review_required',409);result.payment_method=cardSummary(await stripe('/payment_methods/'+pmId),link.stripe_id);result.optional.payment_method='available';}catch{}}
  else {try{const owner=await stripe('/customers/'+link.stripe_id),id=owner.invoice_settings?.default_payment_method;if(id){if(!objectId(id,'pm'))throw customerError('billing_review_required',409);result.payment_method=cardSummary(await stripe('/payment_methods/'+id),link.stripe_id);}result.optional.payment_method='available';}catch{}}
  try{const invoices=await stripe('/invoices',{params:{customer:link.stripe_id,limit:12}});
    if(invoices.data.some(i=>i.customer!==link.stripe_id))throw customerError('forbidden',403);
    result.invoices=invoices.data.filter(i=>rows.some(s=>s.id===i.subscription)).map(i=>({date:iso(i.created),currency:i.currency?.toUpperCase(),amount_paid:i.amount_paid,status:['paid','open','void','uncollectible','draft'].includes(i.status)?i.status:'unknown',url:receiptURL(i.hosted_invoice_url)}));result.optional.invoices='available';result.invoices_has_more=!!invoices.has_more;
  }catch{}
  return result;
}
export async function nativeBillingSummary(db,env,customer,options={}) {return summary(db,env,customer,await canonical(db,env,customer,options),options);}
export async function nativeBillingChange(db,env,customer,body,options={}) {
  bodyOnly(body,['action','revision']);if(!['cancel','resume'].includes(body.action))throw customerError('validation');
  const c=await canonical(db,env,customer,options),s=c.sub;
  if(!s||!mutable(s))throw customerError('billing_review_required',409);
  const desired=body.action==='cancel';
  // Completed retries are state reads; they never issue a second provider write.
  const id='v3-billing-'+await hash(customer.id+'|'+body.action+'|'+body.revision),old=await stmt(db,'SELECT * FROM billing_operations WHERE id=? AND customer_id=?',id,customer.id).first();
  if(old?.completed_at)return summary(db,env,customer,c,options);
  await requireRevision(env,customer,s,body.revision,options.now);
  if(!!s.cancel_at_period_end!==desired){
    await stmt(db,'INSERT OR IGNORE INTO billing_operations(id,customer_id,subscription_id,kind,created_at,expires_at) VALUES (?,?,?,?,?,?)',id,customer.id,s.id,body.action,options.now,new Date(Date.parse(options.now)+600000).toISOString()).run();
    const changed=await c.stripe('/subscriptions/'+s.id,{method:'POST',params:{cancel_at_period_end:desired},idempotencyKey:id});ownedSub(changed,c.link,customer,env);
    if(changed.id!==s.id||!!changed.cancel_at_period_end!==desired)throw customerError('billing_review_required',409);
    await stmt(db,'UPDATE billing_operations SET completed_at=? WHERE id=? AND completed_at IS NULL',options.now,id).run();await noteCustomerEvent(db,'billing_management',body.action,options.now);
  }
  return nativeBillingSummary(db,env,customer,options);
}
export async function nativePaymentStart(db,env,customer,body,options={}) {
  bodyOnly(body,['revision','locale']);const locale=customerLanguage(body.locale),origin=options.origin;
  if(origin!=='https://findpitches.com'||origin!==env.V3_PUBLIC_ORIGIN)throw customerError('forbidden',403);
  const c=await canonical(db,env,customer,options);if(!c.sub||!mutable(c.sub))throw customerError('billing_review_required',409);
  const id='v3-payment-'+await hash(customer.id+'|'+body.revision),old=await stmt(db,'SELECT * FROM billing_operations WHERE id=? AND customer_id=?',id,customer.id).first();
  if(old?.completed_at)throw customerError('billing_state_changed',409);
  if(old?.checkout_url&&Date.parse(old.expires_at)>Date.parse(options.now))return {checkout_url:old.checkout_url};
  await requireRevision(env,customer,c.sub,body.revision,options.now);
  const expires=new Date(Math.floor(Date.parse(options.now)/1000)*1000+1860000).toISOString();
  await stmt(db,'INSERT OR IGNORE INTO billing_operations(id,customer_id,subscription_id,kind,created_at,expires_at) VALUES (?,?,?,\'payment\',?,?)',id,customer.id,c.sub.id,options.now,expires).run();
  const operation=await stmt(db,'SELECT * FROM billing_operations WHERE id=? AND customer_id=?',id,customer.id).first();
  if(!operation||operation.subscription_id!==c.sub.id||Date.parse(operation.expires_at)<=Date.parse(options.now))throw customerError('billing_state_changed',409);
  const r=await c.stripe('/checkout/sessions',{method:'POST',idempotencyKey:id,params:{...checkoutBranding(origin),mode:'setup',customer:c.link.stripe_id,client_reference_id:customer.id,'payment_method_types[0]':'card','metadata[findpitches_v3_operation]':id,'setup_intent_data[metadata][findpitches_v3_operation]':id,'setup_intent_data[metadata][findpitches_v3_customer_id]':customer.id,'setup_intent_data[metadata][findpitches_v3_runtime]':'production_public',locale,expires_at:Math.floor(Date.parse(operation.expires_at)/1000),success_url:origin+customerReturnPath('/billing.html?payment=return&session_id={CHECKOUT_SESSION_ID}',locale),cancel_url:origin+customerReturnPath('/billing.html?payment=cancelled',locale)}});
  if(!objectId(r.id,'cs_live')||r.customer!==c.link.stripe_id||r.client_reference_id!==customer.id||r.mode!=='setup'||!r.url?.startsWith('https://checkout.stripe.com/'))throw customerError('forbidden',403);
  await stmt(db,'UPDATE billing_operations SET stripe_session_id=?,checkout_url=? WHERE id=? AND stripe_session_id IS NULL',r.id,r.url,id).run();return {checkout_url:r.url};
}
export async function nativePaymentConfirm(db,env,customer,body,options={}) {
  bodyOnly(body,['session_id']);if(!objectId(body.session_id,'cs_live'))throw customerError('validation');
  const op=await stmt(db,"SELECT * FROM billing_operations WHERE stripe_session_id=? AND customer_id=? AND kind='payment'",body.session_id,customer.id).first();if(!op)throw customerError('not_found',404);
  const c=await canonical(db,env,customer,options);if(op.completed_at)return summary(db,env,customer,c,options);
  if(!c.sub||c.sub.id!==op.subscription_id||!mutable(c.sub))throw customerError('billing_state_changed',409);
  // Older completed forms must never replace a newer chosen card on replay.
  const newer=await stmt(db,"SELECT id FROM billing_operations WHERE customer_id=? AND kind='payment' AND completed_at IS NOT NULL AND created_at>? LIMIT 1",customer.id,op.created_at).first();if(newer)throw customerError('billing_state_changed',409);
  const s=await c.stripe('/checkout/sessions/'+body.session_id);
  if(s.id!==body.session_id||s.mode!=='setup'||s.status!=='complete'||s.customer!==c.link.stripe_id||s.client_reference_id!==customer.id||s.metadata?.findpitches_v3_operation!==op.id||!objectId(s.setup_intent,'seti'))throw customerError('forbidden',403);
  const si=await c.stripe('/setup_intents/'+s.setup_intent);
  if(si.id!==s.setup_intent||si.status!=='succeeded'||si.customer!==c.link.stripe_id||si.metadata?.findpitches_v3_operation!==op.id||si.metadata?.findpitches_v3_customer_id!==customer.id||si.metadata?.findpitches_v3_runtime!=='production_public'||!objectId(si.payment_method,'pm'))throw customerError('forbidden',403);
  cardSummary(await c.stripe('/payment_methods/'+si.payment_method),c.link.stripe_id);
  const changed=await c.stripe('/subscriptions/'+c.sub.id,{method:'POST',idempotencyKey:op.id+'-apply',params:{default_payment_method:si.payment_method}});ownedSub(changed,c.link,customer,env);
  if(changed.id!==c.sub.id||changed.default_payment_method!==si.payment_method)throw customerError('billing_review_required',409);
  await stmt(db,'UPDATE billing_operations SET completed_at=? WHERE id=? AND completed_at IS NULL',options.now,op.id).run();await noteCustomerEvent(db,'billing_management','payment_updated',options.now);return nativeBillingSummary(db,env,customer,options);
}
