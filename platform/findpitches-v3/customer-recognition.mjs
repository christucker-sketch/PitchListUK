import {hash} from './contract.mjs';
import {stmt,customerError} from './customer-security.mjs';

const synthetic=email=>typeof email==='string'&&/^[a-z0-9.+_-]+@example\.(com|org|net)$/.test(email);
export const subscriberAssociation=(db,customerId)=>stmt(db,'SELECT * FROM subscriber_associations WHERE customer_id=?',customerId).first();

// Operator custody plus an exact canonical legacy vendor/customer/subscription
// binding is required. Email alone never authorizes a provider association.
export function validateRecognizedSubscriber(a,customer,owner,sub,env) {
  if(env.V3_STRIPE_MODE!=='test'||a.scope!=='synthetic_test'||a.livemode!==0||!synthetic(customer.email)||a.customer_id!==customer.id||a.market!=='GB'||a.price_id!==env.STRIPE_PRICE_ID)throw customerError('forbidden',403);
  if(owner.id!==a.stripe_customer_id||owner.deleted||owner.livemode!==false||owner.email?.toLowerCase()!==customer.email||owner.metadata?.findpitches_v3_customer_id&&owner.metadata.findpitches_v3_customer_id!==customer.id)throw customerError('forbidden',403);
  if(sub.id!==a.stripe_subscription_id||sub.customer!==owner.id||sub.livemode!==false||sub.metadata?.product!=='pitchlist_database'||sub.metadata?.vendor_id!==a.legacy_vendor_id||sub.metadata?.findpitches_v3_customer_id&&sub.metadata.findpitches_v3_customer_id!==customer.id)throw customerError('forbidden',403);
  const price=sub.items?.data?.[0]?.price;
  if(sub.items?.data?.length!==1||price?.id!==a.price_id||price.currency!=='gbp'||price.unit_amount!==499||price.recurring?.interval!=='month'||(price.recurring.interval_count??1)!==1||(sub.items.data[0].quantity??1)!==1)throw customerError('price_not_set',409);
  return price;
}

export async function reviewSubscriberAssociation(db,env,body,{now,stripe}={}) {
  if(env.V3_STRIPE_MODE!=='test'||!env.STRIPE_SECRET_KEY?.startsWith('sk_test_'))throw customerError('service_unavailable',503);
  const allowed=['customer_id','stripe_customer_id','stripe_subscription_id','price_id','market','legacy_vendor_id','ownership_evidence_hash','scope','reviewed'];
  if(Object.keys(body).some(k=>!allowed.includes(k))||body.scope!=='synthetic_test'||body.reviewed!==true||body.market!=='GB'||body.price_id!==env.STRIPE_PRICE_ID||!/^cus_[A-Za-z0-9]+$/.test(body.stripe_customer_id??'')||!/^sub_[A-Za-z0-9]+$/.test(body.stripe_subscription_id??'')||!/^cusv3_[a-f0-9-]{36}$/.test(body.customer_id??'')||! /^[A-Za-z0-9_:-]{1,100}$/.test(body.legacy_vendor_id??'')||! /^[a-f0-9]{64}$/.test(body.ownership_evidence_hash??'')||!Number.isFinite(Date.parse(now)))throw customerError('validation');
  const customer=await stmt(db,'SELECT * FROM customers WHERE id=?',body.customer_id).first();
  if(!customer||!synthetic(customer.email)||!await stmt(db,'SELECT token_hash FROM login_challenges WHERE email=? AND consumed_at IS NOT NULL LIMIT 1',customer.email).first())throw customerError('forbidden',403);
  const association={...Object.fromEntries(allowed.filter(k=>k!=='reviewed').map(k=>[k,body[k]])),livemode:0};
  association.id='assoc_'+(await hash(association)).slice(0,40);
  const [owner,sub]=await Promise.all([stripe('/customers/'+association.stripe_customer_id),stripe('/subscriptions/'+association.stripe_subscription_id)]);
  validateRecognizedSubscriber(association,customer,owner,sub,env);
  try {
    await db.batch([
      stmt(db,`INSERT OR IGNORE INTO subscriber_associations VALUES (?,?,?,?,?,?,?,?,?,0,?)`,association.id,association.customer_id,association.stripe_customer_id,association.stripe_subscription_id,association.price_id,association.market,association.legacy_vendor_id,association.ownership_evidence_hash,association.scope,now),
      stmt(db,`INSERT OR IGNORE INTO stripe_customers(customer_id,stripe_id,livemode,created_at) SELECT customer_id,stripe_customer_id,0,? FROM subscriber_associations WHERE id=?`,now,association.id),
    ]);
  }catch {throw customerError('subscriber_mapping_conflict',409);}
  const saved=await subscriberAssociation(db,customer.id),link=await stmt(db,'SELECT * FROM stripe_customers WHERE customer_id=?',customer.id).first();
  if(saved?.id!==association.id||link?.stripe_id!==association.stripe_customer_id||link?.livemode!==0)throw customerError('subscriber_mapping_conflict',409);
  return {association_id:saved.id,customer_id:customer.id,scope:saved.scope};
}

export async function recordRecognitionDecision(db,a,sub,now) {
  const period=sub.current_period_end??sub.items.data[0].current_period_end;
  const facts={association_id:a.id,status:sub.status,period_end:Number.isFinite(period)?new Date(period*1000).toISOString():null,cancel_at_period_end:Boolean(sub.cancel_at_period_end),trial_end:sub.trial_end??null};
  const canonicalHash=await hash(facts),id='recognition_'+(await hash([a.id,canonicalHash,now])).slice(0,40);
  await stmt(db,'INSERT OR IGNORE INTO subscriber_recognition_decisions VALUES (?,?,?,?,?,?,?)',id,a.id,canonicalHash,facts.status,facts.period_end,facts.cancel_at_period_end?1:0,now).run();
  return facts;
}
