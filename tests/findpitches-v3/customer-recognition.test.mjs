import test from 'node:test';
import assert from 'node:assert/strict';
import {openLocalD1} from '../../operations/findpitches-v3/local-d1.mjs';
import {issueChallenge,consumeChallenge} from '../../platform/findpitches-v3/customer-auth.mjs';
import {stmt} from '../../platform/findpitches-v3/customer-security.mjs';
import {reviewSubscriberAssociation} from '../../platform/findpitches-v3/customer-recognition.mjs';
import {stripeClient,syncSubscriptions,customerAccess,checkout,portal} from '../../platform/findpitches-v3/customer-billing.mjs';
import worker from '../../platform/findpitches-v3/customer-worker.mjs';

const clock='2099-01-01T00:00:00.000Z',end=Date.parse('2099-02-01T00:00:00Z')/1000;
async function setup(t) {
  const db=openLocalD1(':memory:',{migrationsDirectory:new URL('../../operations/findpitches-v3/customer-migrations/',import.meta.url)});t.after(()=>db.close());
  const customer=(await consumeChallenge(db,await issueChallenge(db,{email:'legacy-owner@example.com',now:clock}),clock)).customer;
  const price={id:'price_test',active:true,livemode:false,currency:'gbp',unit_amount:499,recurring:{interval:'month',interval_count:1}};
  const owner={id:'cus_legacyA',livemode:false,email:customer.email,metadata:{}};
  const sub={id:'sub_legacyA',customer:owner.id,livemode:false,status:'active',current_period_end:end,cancel_at_period_end:false,metadata:{product:'pitchlist_database',vendor_id:'vendor_original'},items:{data:[{quantity:1,price}]}};
  const calls=[];
  const fetcher=async(url,options={})=>{
    const u=new URL(url);calls.push({path:u.pathname,method:options.method??'GET'});
    if(u.pathname==='/v1/customers/'+owner.id)return Response.json(owner);
    if(u.pathname==='/v1/subscriptions/'+sub.id)return Response.json(sub);
    if(u.pathname==='/v1/subscriptions')return Response.json({object:'list',has_more:false,data:[sub]});
    if(u.pathname==='/v1/prices/'+price.id)return Response.json(price);
    throw Error('unexpected_provider_write_or_route');
  };
  const env={V3_STRIPE_MODE:'test',V3_CHECKOUT_ENABLED:'test',STRIPE_SECRET_KEY:'sk_test_fixture',STRIPE_PRICE_ID:price.id};
  const manifest={customer_id:customer.id,stripe_customer_id:owner.id,stripe_subscription_id:sub.id,price_id:price.id,market:'GB',legacy_vendor_id:'vendor_original',ownership_evidence_hash:'a'.repeat(64),scope:'synthetic_test',reviewed:true};
  const review=async()=>reviewSubscriberAssociation(db,env,manifest,{now:clock,stripe:stripeClient(env,fetcher)});
  const sync=(now=clock)=>syncSubscriptions(db,env,customer,{now,fetcher});
  return {db,customer,price,owner,sub,calls,fetcher,env,manifest,review,sync};
}

test('reviewed legacy TEST ownership is recognized without changing provider metadata or creating objects',async t=>{
  const s=await setup(t),result=await s.review();await s.sync();
  assert.match(result.association_id,/^assoc_/);assert.equal((await customerAccess(s.db,s.env,s.customer,{now:clock,market:'GB'})).tier,'pro');
  assert.equal((await customerAccess(s.db,s.env,s.customer,{now:clock,market:'US'})).tier,'free');
  assert.equal(s.db.sqlite.prepare('SELECT COUNT(*) n FROM stripe_customers').get().n,1);
  assert.equal(s.db.sqlite.prepare('SELECT COUNT(*) n FROM subscriber_recognition_decisions').get().n,1);
  assert.ok(s.calls.every(c=>c.method==='GET'));assert.deepEqual(s.owner.metadata,{});assert.equal(s.sub.metadata.findpitches_v3_customer_id,undefined);
});
test('concurrent and repeated association review converges to one immutable mapping and decision',async t=>{
  const s=await setup(t),results=await Promise.all([s.review(),s.review(),s.review()]);await Promise.all([s.sync(),s.sync()]);
  assert.equal(new Set(results.map(r=>r.association_id)).size,1);
  for(const table of ['subscriber_associations','stripe_customers','stripe_subscriptions','subscriber_recognition_decisions'])assert.equal(s.db.sqlite.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n,1);
  await assert.rejects(stmt(s.db,"UPDATE subscriber_associations SET legacy_vendor_id='changed'").run(),/immutable/);
  await assert.rejects(stmt(s.db,'DELETE FROM subscriber_associations').run(),/immutable/);
  await assert.rejects(stmt(s.db,'DELETE FROM subscriber_recognition_decisions').run(),/immutable/);
  await assert.rejects(stmt(s.db,"UPDATE stripe_customers SET stripe_id='cus_other'").run(),/immutable/);
  await assert.rejects(stmt(s.db,'DELETE FROM stripe_customers').run(),/immutable/);
  s.manifest.ownership_evidence_hash='b'.repeat(64);await assert.rejects(s.review(),/subscriber_mapping_conflict/);
});
test('matching email alone, wrong original vendor and another native owner cannot establish recognition',async t=>{
  const s=await setup(t);s.sub.metadata.vendor_id='different_vendor';await assert.rejects(s.review(),/forbidden/);
  s.sub.metadata.vendor_id='vendor_original';s.owner.metadata.findpitches_v3_customer_id='cusv3_other';await assert.rejects(s.review(),/forbidden/);
  delete s.owner.metadata.findpitches_v3_customer_id;s.owner.email='another@example.com';await assert.rejects(s.review(),/forbidden/);
  assert.equal(s.db.sqlite.prepare('SELECT COUNT(*) n FROM subscriber_associations').get().n,0);
  s.owner.email=s.customer.email;await stmt(s.db,'INSERT INTO stripe_customers VALUES (?,?,0,?)',s.customer.id,s.owner.id,clock).run();
  await assert.rejects(s.sync(),/forbidden/);assert.equal((await customerAccess(s.db,s.env,s.customer,{now:clock})).tier,'free');
});
test('unreviewed, non-synthetic, live, cross-market and incompatible-price manifests fail closed',async t=>{
  const s=await setup(t);
  for(const patch of [{reviewed:false},{scope:'live'},{market:'US'},{price_id:'price_other'},{ownership_evidence_hash:'missing'}])await assert.rejects(reviewSubscriberAssociation(s.db,s.env,{...s.manifest,...patch},{now:clock,stripe:stripeClient(s.env,s.fetcher)}),/validation/);
  s.sub.livemode=true;await assert.rejects(s.review(),/forbidden/);s.sub.livemode=false;
  s.price.currency='usd';await assert.rejects(s.review(),/price_not_set/);s.price.currency='gbp';
  s.price.recurring.interval_count=2;await assert.rejects(s.review(),/price_not_set/);s.price.recurring.interval_count=1;
  s.sub.items.data[0].quantity=2;await assert.rejects(s.review(),/price_not_set/);s.sub.items.data[0].quantity=1;
  s.env.V3_STRIPE_MODE='live';await assert.rejects(s.review(),/service_unavailable/);
  assert.equal(s.db.sqlite.prepare('SELECT COUNT(*) n FROM subscriber_associations').get().n,0);
});
test('a consumed native challenge and reserved TEST identity are required even for an operator review',async t=>{
  const s=await setup(t),other=(await consumeChallenge(s.db,await issueChallenge(s.db,{email:'real@customer.invalid',now:clock}),clock)).customer;
  await assert.rejects(reviewSubscriberAssociation(s.db,s.env,{...s.manifest,customer_id:other.id},{now:clock,stripe:stripeClient(s.env,s.fetcher)}),/forbidden/);
  const unverified='cusv3_00000000-0000-0000-0000-000000000000';await stmt(s.db,'INSERT INTO customers(id,email,created_at) VALUES (?,?,?)',unverified,'unverified@example.com',clock).run();
  await assert.rejects(reviewSubscriberAssociation(s.db,s.env,{...s.manifest,customer_id:unverified},{now:clock,stripe:stripeClient(s.env,s.fetcher)}),/forbidden/);
  assert.equal(s.calls.length,0);
});
test('one provider subscription cannot be rebound to a different verified native account',async t=>{
  const s=await setup(t);await s.review();
  const other=(await consumeChallenge(s.db,await issueChallenge(s.db,{email:'second@example.com',now:clock}),clock)).customer;s.owner.email=other.email;
  await assert.rejects(reviewSubscriberAssociation(s.db,s.env,{...s.manifest,customer_id:other.id},{now:clock,stripe:stripeClient(s.env,s.fetcher)}),/subscriber_mapping_conflict/);
  assert.equal(s.db.sqlite.prepare('SELECT customer_id FROM stripe_customers').get().customer_id,s.customer.id);
});
test('recognized subscribers never receive duplicate Checkout, including after cancellation or expiry',async t=>{
  const s=await setup(t);await s.review();await s.sync();const before=s.calls.length;
  for(const status of ['active','trialing','past_due','unpaid','incomplete','paused','canceled']) {
    s.sub.status=status;await assert.rejects(checkout(s.db,s.env,s.customer,{market:'GB',plan_id:'pro_monthly'},{now:clock,origin:'https://preview.example.org',fetcher:s.fetcher}),/subscription_exists/);
  }
  assert.equal(s.calls.length,before);assert.equal(s.db.sqlite.prepare('SELECT COUNT(*) n FROM checkout_attempts').get().n,0);
});
test('recognized ended and unverified owners are not offered another trial or ordinary Checkout',async t=>{
  const s=await setup(t);await s.review();s.sub.status='canceled';await s.sync();
  const ended=await customerAccess(s.db,s.env,s.customer,{now:clock});
  assert.equal(ended.tier,'free');assert.equal(ended.trial_eligible,false);assert.equal(ended.checkout_allowed,false);assert.equal(ended.billing_review_required,true);
  s.owner.email='wrong@example.com';const failed=await customerAccess(s.db,s.env,s.customer,{now:'2099-01-01T00:04:00.000Z',refresh:true,fetcher:s.fetcher});
  assert.equal(failed.status,'unverified');assert.equal(failed.checkout_allowed,false);assert.equal(failed.trial_eligible,false);
  assert.ok(s.calls.every(c=>c.method==='GET'));
});
test('DB guards serialize recognition versus outstanding or concurrent Checkout reservations',async t=>{
  const s=await setup(t);await stmt(s.db,'INSERT INTO checkout_reservations VALUES (?,?,?)',s.customer.id,'attempt_test','2099-02-01T00:00:00.000Z').run();
  await assert.rejects(s.review(),/subscriber_mapping_conflict/);assert.equal(s.db.sqlite.prepare('SELECT COUNT(*) n FROM subscriber_associations').get().n,0);
  await stmt(s.db,'DELETE FROM checkout_reservations').run();await s.review();
  await assert.rejects(stmt(s.db,'INSERT INTO checkout_reservations VALUES (?,?,?)',s.customer.id,'attempt_other','2099-02-01T00:00:00.000Z').run(),/recognized_subscriber_checkout_forbidden/);
});
test('canonical status supports trial, paid-through cancellation and actual expiry without another trial',async t=>{
  const s=await setup(t);await s.review();s.sub.status='trialing';s.sub.trial_end=end;await s.sync();assert.equal((await customerAccess(s.db,s.env,s.customer,{now:clock})).tier,'trial');
  s.sub.status='active';s.sub.cancel_at_period_end=true;await s.sync();const access=await customerAccess(s.db,s.env,s.customer,{now:clock});assert.equal(access.tier,'pro');assert.equal(access.cancel_at_period_end,true);
  assert.equal((await customerAccess(s.db,s.env,s.customer,{now:'2098-12-31T23:59:59.999Z'})).tier,'free');
  // Keep the canonical cache fresh across the exact period boundary so stale
  // cache denial cannot make an incorrect period-end check appear to pass.
  const justBefore='2099-01-31T23:59:59.999Z',atEnd='2099-02-01T00:00:00.000Z';await s.sync(justBefore);
  assert.equal((await customerAccess(s.db,s.env,s.customer,{now:justBefore})).tier,'pro');
  assert.equal((await customerAccess(s.db,s.env,s.customer,{now:atEnd})).tier,'free');
  assert.equal((await customerAccess(s.db,s.env,s.customer,{now:'2099-02-01T00:00:00.001Z'})).tier,'free');
  s.sub.current_period_end=end+86400;
  for(const status of ['past_due','unpaid','incomplete','paused','canceled']){s.sub.status=status;await s.sync(atEnd);assert.equal((await customerAccess(s.db,s.env,s.customer,{now:atEnd})).tier,'free');}
  assert.ok(s.calls.every(c=>c.method==='GET'));
});
test('changed canonical ownership or missing subscriptions revoke access on refresh; old writes cannot restore it',async t=>{
  const s=await setup(t);await s.review();await s.sync();s.sub.status='canceled';const later='2099-01-01T00:02:00.000Z';await s.sync(later);
  s.sub.status='active';await s.sync(clock);assert.equal((await customerAccess(s.db,s.env,s.customer,{now:later})).tier,'free');
  s.owner.email='wrong@example.com';const denied=await customerAccess(s.db,s.env,s.customer,{now:'2099-01-01T00:04:00.000Z',refresh:true,fetcher:s.fetcher});assert.equal(denied.tier,'free');assert.equal(denied.status,'unverified');
  s.owner.email=s.customer.email;await assert.rejects(syncSubscriptions(s.db,s.env,s.customer,{now:later,fetcher:async(url,options)=>url.includes('/subscriptions?')?Response.json({object:'list',data:[],has_more:false}):s.fetcher(url,options)}),/billing_review_required/);
});
test('operator recognition route cannot be invoked by an uninvited browser or ordinary session',async t=>{
  const s=await setup(t),env={...s.env,V3_CUSTOMER_DB:s.db,V3_CUSTOMER_MODE:'restricted_shadow_preview',V3_PREVIEW_OPERATOR_TOKEN:'operator'.repeat(8)};
  const r=await worker.fetch(new Request('https://preview.example.org/preview/subscribers/recognize',{method:'POST',body:JSON.stringify(s.manifest)}),env);
  assert.equal(r.status,403);assert.equal(s.db.sqlite.prepare('SELECT COUNT(*) n FROM subscriber_associations').get().n,0);assert.equal(s.calls.length,0);
});
test('native customer with an unapproved active product cannot silently buy a second subscription',async t=>{
  const s=await setup(t);s.owner.metadata.findpitches_v3_customer_id=s.customer.id;s.sub.metadata.findpitches_v3_customer_id=s.customer.id;s.price.id='price_other';
  await stmt(s.db,'INSERT INTO stripe_customers VALUES (?,?,0,?)',s.customer.id,s.owner.id,clock).run();
  await assert.rejects(checkout(s.db,s.env,s.customer,{market:'GB',plan_id:'pro_monthly'},{now:clock,origin:'https://preview.example.org',fetcher:async(url,options)=>url.includes('/prices/')?Response.json({...s.price,id:'price_test'}):s.fetcher(url,options)}),/billing_review_required/);
  assert.ok(s.calls.every(c=>c.method==='GET'));assert.equal(s.db.sqlite.prepare('SELECT COUNT(*) n FROM checkout_attempts').get().n,0);
});
test('recognized subscriber portal uses the owned configuration and canonical legacy ownership',async t=>{
  const s=await setup(t);await s.review();s.env.STRIPE_PORTAL_CONFIGURATION_ID='bpc_testowned';let portals=0;
  const result=await portal(s.db,s.env,s.customer,{origin:'https://preview.example.org',fetcher:async(url,options)=>{
    if(url.endsWith('/billing_portal/sessions')){portals++;const body=new URLSearchParams(options.body);assert.equal(body.get('customer'),s.owner.id);assert.equal(body.get('configuration'),'bpc_testowned');return Response.json({url:'https://billing.stripe.com/p/session/test'});}
    return s.fetcher(url,options);
  }});
  assert.match(result.url,/^https:\/\/billing.stripe.com\//);assert.equal(portals,1);
});
