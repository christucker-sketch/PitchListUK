import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {openLocalD1} from '../../operations/findpitches-v3/local-d1.mjs';
import {hash} from '../../platform/findpitches-v3/contract.mjs';
import {stmt,csrfValue,requireCsrf,rateLimit,safeNext,hmac,cookie,sessionCookie,readBody} from '../../platform/findpitches-v3/customer-security.mjs';
import {issueChallenge,consumeChallenge,signedCustomer,logout,updateProfile,requestLogin} from '../../platform/findpitches-v3/customer-auth.mjs';
import {entitlement,webhook,syncSubscriptions,customerAccess,checkout,confirmCheckout,portal} from '../../platform/findpitches-v3/customer-billing.mjs';
import {mapProof,present,search,inventory,recordInventoryChanges} from '../../platform/findpitches-v3/customer-catalogue.mjs';
import worker from '../../platform/findpitches-v3/customer-worker.mjs';

const now=()=>new Date().toISOString(),future=()=>new Date(Date.now()+86400000).toISOString();
function db(t){const d=openLocalD1(':memory:',{migrationsDirectory:new URL('../../operations/findpitches-v3/customer-migrations/',import.meta.url)});t.after(()=>d.close());return d;}
function proof(extra={}){return {id:'ent_'+('1'.repeat(32)),country:'GB',title:'River Craft Festival',organiser:'River Association',location:'Town Hall, Kent',event_start:'2099-11-03',event_end:'2099-11-04',application_url:'https://organiser.example.org/apply',application_state:'OPEN_NOW',source_url:'https://organiser.example.org/event',source_domain:'organiser.example.org',verified_at:now(),proof_expires_at:future(),entity_revision:1,verification_id:1,...extra};}
function environment(d,snapshot){return {V3_CUSTOMER_DB:d,V3_CUSTOMER_MODE:'restricted_shadow_preview',V3_SESSION_SECRET:'s'.repeat(64),V3_PREVIEW_OPERATOR_TOKEN:'operator'.repeat(8),V3_STAGING_TOKEN:'staging'.repeat(8),
  V3_READY_API:{fetch:async(_url,options)=>{assert.equal(options.headers.Authorization,'Bearer '+'staging'.repeat(8));return Response.json({schema:'findpitches-v3-customer-proof-snapshot-v1',as_of:now(),publication_enabled:false,production_cutover_enabled:false,shadow_ready:snapshot.items.length,producer_policy_withheld:0,...snapshot});}},
  ASSETS:{fetch:async url=>{const file=new URL(url).pathname.slice(1);try{return new Response(fs.readFileSync(new URL('../../web/findpitches-v3-web/public/'+file,import.meta.url)));}catch{return new Response('',{status:404});}}}};}
async function customer(d,email='tester@example.com'){const token=await issueChallenge(d,{email,next:'/account.html',now:now()});return (await consumeChallenge(d,token,now())).customer;}
test('one-use magic links, hashed cookies, revocation and safe redirects',async t=>{
  const d=db(t),token=await issueChallenge(d,{email:'Owner@example.com',next:'//evil.example.org',now:now()});
  const result=await consumeChallenge(d,token,now());assert.equal(result.next,'/account.html');assert.equal(result.customer.email,'owner@example.com');assert.match(result.cookie,/Secure; SameSite=Lax.*HttpOnly/);
  assert.ok(!d.sqlite.prepare('SELECT token_hash FROM login_challenges').get().token_hash.includes(token));await assert.rejects(consumeChallenge(d,token,now()),/invalid_link/);
  const request=new Request('https://preview.example.org/api/v3/session',{headers:{cookie:result.cookie.split(';')[0]}});assert.equal((await signedCustomer(request,d,now())).id,result.customer.id);
  await logout(request,d,now());assert.equal(await signedCustomer(request,d,now()),null);
  for(const path of ['//evil','/\\evil','https://evil','/\r\nLocation:evil'])assert.equal(safeNext(path),'/account.html');
  await assert.rejects(updateProfile(d,result.customer,{email:'attacker@example.com'}),/validation/);
  const expired=await issueChallenge(d,{email:'expired@example.com',now:'2020-01-01T00:00:00Z'});await assert.rejects(consumeChallenge(d,expired,now()),/invalid_link/);
});
test('CSRF requires a signed token and the same origin; rate caps are durable',async t=>{
  const d=db(t),env={V3_SESSION_SECRET:'s'.repeat(64)},token=await csrfValue(env),request=origin=>new Request('https://preview.example.org/api/v3/saved',{method:'POST',headers:{origin,cookie:'fp_csrf='+token,'x-csrf-token':token}});
  await requireCsrf(request('https://preview.example.org'),env);await assert.rejects(requireCsrf(request('https://evil.example.org'),env),/csrf_failed/);
  await assert.rejects(requireCsrf(new Request('https://preview.example.org/api/v3/saved',{method:'POST',headers:{origin:'https://preview.example.org',cookie:'fp_csrf=forged','x-csrf-token':'forged'}}),env),/csrf_failed/);
  await rateLimit(d,'user',{limit:1,now:now()});await assert.rejects(rateLimit(d,'user',{limit:1,now:now()}),/rate_limited/);
  assert.deepEqual(await readBody(new Request('https://preview.example.org/api/v3/session/logout',{method:'POST',body:''})),{});
});
test('invited one-use mail links grant a restricted preview in a fresh browser; invalid links grant nothing',async t=>{
  const d=db(t),env=environment(d,{items:[]}),origin='https://preview.example.org';
  const token=await issueChallenge(d,{email:'invited@example.org',next:'/account.html',now:now()});
  const verify=()=>worker.fetch(new Request(origin+'/api/v3/session/verify?token='+token),env);
  const result=await verify();assert.equal(result.status,303);assert.equal(result.headers.get('location'),'/account.html');
  const setCookies=result.headers.getSetCookie();assert.equal(setCookies.length,2);
  for(const c of setCookies)assert.match(c,/Path=\/; Secure; SameSite=Lax.*HttpOnly/);
  const cookieHeader=setCookies.map(c=>c.split(';')[0]).join('; ');
  const sessionResponse=await worker.fetch(new Request(origin+'/api/v3/session',{headers:{cookie:cookieHeader}}),env);
  assert.equal((await sessionResponse.json()).signed_in,true);
  const replay=await verify();assert.equal(replay.headers.get('location'),'/account.html?signin=expired');assert.equal(replay.headers.getSetCookie().length,0);
  const invalid=await worker.fetch(new Request(origin+'/api/v3/session/verify?token=invalid'),env);assert.equal(invalid.headers.getSetCookie().length,0);
  const unauthorised=await worker.fetch(new Request(origin+'/api/v3/opportunities?market=GB'),env);assert.equal(unauthorised.status,401);
  assert.equal(d.sqlite.prepare('SELECT COUNT(*) AS n FROM preview_access').get().n,1);
});
test('native mail failures cannot claim delivery; successful links remain one-use and secret-free in responses',async t=>{
  const d=db(t),env={V3_CUSTOMER_DB:d,V3_EMAIL_API_KEY:'mail_fixture'},request=new Request('https://preview.example.org/api/v3/session/link',{method:'POST'}),body={email:'reader@example.com',next:'//external.example.org'};
  await assert.rejects(requestLogin(request,env,body,{now:now(),fetcher:()=>{throw Error('must_not_send');}}),/service_unavailable/);assert.equal(d.sqlite.prepare('SELECT COUNT(*) AS n FROM login_challenges').get().n,0);
  env.V3_EMAIL_FROM='login@sender.example.org';env.V3_EMAIL_API_KEY='__SECRET_FIXTURE_REFERENCE__';
  await assert.rejects(requestLogin(request,env,body,{now:now(),fetcher:()=>{throw Error('must_not_send');}}),/service_unavailable/);assert.equal(d.sqlite.prepare('SELECT COUNT(*) AS n FROM login_challenges').get().n,0);
  env.V3_EMAIL_API_KEY='mail_fixture';await assert.rejects(requestLogin(request,env,body,{now:now(),fetcher:async()=>Response.json({data:{succeeded:0}})}),/service_unavailable/);assert.equal(d.sqlite.prepare('SELECT COUNT(*) AS n FROM login_challenges').get().n,0);
  let token;const response=await requestLogin(request,env,body,{now:now(),fetcher:async(url,options)=>{assert.equal(url,'https://api.smtp2go.com/v3/email/send');const mail=JSON.parse(options.body);assert.deepEqual(mail.to,[body.email]);token=new URL(mail.text_body.split('\n')[1]).searchParams.get('token');return Response.json({data:{succeeded:1}});}});
  assert.deepEqual(response,{sent:true});assert.equal((await consumeChallenge(d,token,now())).next,'/account.html');await assert.rejects(consumeChallenge(d,token,now()),/invalid_link/);
});
test('five subscriber states, paid-through cancellation, mode, market and expiry boundaries',()=>{
  const s={status:'active',market:'GB',livemode:0,period_end:future(),checked_at:now(),cancel_at_period_end:0,trial_end:null};
  assert.equal(entitlement([],{now:now()}).tier,'free');assert.equal(entitlement([s],{now:now()}).tier,'pro');assert.equal(entitlement([{...s,status:'trialing'}],{now:now()}).tier,'trial');
  assert.equal(entitlement([{...s,cancel_at_period_end:1}],{now:now()}).tier,'pro');assert.equal(entitlement([{...s,period_end:'2020-01-01'}],{now:now()}).tier,'free');
  for(const status of ['canceled','past_due','unpaid','incomplete','paused','unknown'])assert.equal(entitlement([{...s,status}],{now:now()}).tier,'free');
  assert.equal(entitlement([s],{now:now(),market:'US'}).tier,'free');assert.equal(entitlement([{...s,livemode:1}],{now:now()}).tier,'free');assert.equal(entitlement([{...s,checked_at:'2020-01-01'}],{now:now()}).tier,'free');
});
test('proof projection is redacted on the server; filters never create geography or categories',()=>{
  const p=proof(),row=mapProof(p,now());assert.equal(row.location.region_id,'gb/kent');assert.equal(row.type,null);assert.deepEqual(row.sells,[]);
  assert.ok(!JSON.stringify(present(row,{tier:'free'})).includes('https://organiser'));assert.equal(present(row,{tier:'pro',market:'GB'}).access.application_url,p.application_url);assert.equal(present(row,{tier:'pro',market:'US'}).access.locked,true);
  assert.equal(mapProof({...p,proof_expires_at:'2020-01-01'},now()),null);assert.equal(mapProof({...p,application_state:'CLOSED'},now()),null);assert.equal(mapProof({...p,application_state:'UNKNOWN'},now()),null);
  assert.equal(mapProof({...p,proof_expires_at:'invalid'},now()),null);
  assert.equal(search([row],{market:'GB',q:'US city'},null,now()).total,0);assert.equal(search([row],{market:'GB',q_text:'craft'},null,now()).total,1);assert.equal(search([row],{market:'GB',types:'market'},null,now()).total,0);assert.equal(search([row],{market:'GB',region:'gb/south-east'},null,now()).total,1);
  assert.throws(()=>search([row],{market:'GB',page_size:0},null,now()),/validation/);assert.throws(()=>search([row],{market:'GB',radius_km:50},null,now()),/radius_unavailable/);
  assert.throws(()=>search([row],{market:'GB',sort:'nearest'},null,now()),/radius_unavailable/);
  const unclassified=search([row],{market:'GB'},null,now());assert.deepEqual(unclassified.facets.types,{});assert.equal(unclassified.facets.unclassified_types,1);assert.equal(unclassified.total,1);assert.equal(unclassified.results[0].type,null);
  const literal=search([row],{market:'GB',q:'Town Hall'},null,now());assert.equal(literal.location.kind,'unresolved');assert.equal(literal.total,1);assert.equal(literal.results[0].location.region_id,'gb/kent');
  assert.equal(inventory([row],'GB',[{key:'craft',filters:{sells:'craft'}}],now()).intents.craft,0);
});
test('inventory change log is bounded, replayable and records proof-expiry removals',async t=>{
  const d=db(t),row=mapProof(proof(),now());await recordInventoryChanges(d,[row],now());await recordInventoryChanges(d,[row],now());assert.equal(d.sqlite.prepare('SELECT COUNT(*) AS n FROM preview_inventory_changes').get().n,1);
  await recordInventoryChanges(d,[],now());assert.equal(d.sqlite.prepare('SELECT kind FROM preview_inventory_changes ORDER BY sequence DESC').get().kind,'removed');await recordInventoryChanges(d,[],now());assert.equal(d.sqlite.prepare('SELECT COUNT(*) AS n FROM preview_inventory_changes').get().n,2);
  const many=Array.from({length:150},(_,i)=>mapProof(proof({id:'ent_'+i.toString(16).padStart(32,'0')}),now()));const first=await recordInventoryChanges(d,many,now());assert.equal(first.pending,50);await recordInventoryChanges(d,many,now());assert.equal(d.sqlite.prepare('SELECT COUNT(*) AS n FROM preview_inventory_state WHERE visible=1').get().n,150);
});
test('native API and clean SEO routes use only real proof snapshots behind preview access',async t=>{
  const d=db(t),snapshot={items:[proof()]},env=environment(d,snapshot),origin='https://preview.example.org';
  const call=(path,options={})=>worker.fetch(new Request(origin+path,options),env);
  assert.equal((await call('/api/v3/opportunities?market=GB')).status,401);
  const gate=await call('/preview/access',{method:'POST',headers:{Authorization:'Bearer '+env.V3_PREVIEW_OPERATOR_TOKEN}}),gateCookie=gate.headers.get('set-cookie').split(';')[0],h={cookie:gateCookie};
  const list=await call('/api/v3/opportunities?market=GB',{headers:h}),data=await list.json();assert.equal(data.total,1);assert.equal(data.results[0].access.locked,true);assert.ok(!JSON.stringify(data).includes('organiser.example.org'));
  const finder=await call('/us/find-pitches/',{headers:h});assert.equal(finder.status,200);assert.match(await finder.text(),/fp-route-query.*cc=us/);assert.match(finder.headers.get('x-robots-tag'),/noindex/);
  const detail=await call('/uk/opportunity/'+snapshot.items[0].id+'/',{headers:h});assert.equal(detail.status,200);assert.match(await detail.text(),/application\/ld\+json/);
  const seoPage=await call('/uk/',{headers:h});assert.equal(seoPage.status,200);assert.match(await seoPage.text(),/<title>.*United Kingdom|<title>.*UK/);
  assert.equal((await call('/gb/',{headers:h})).status,301);assert.equal((await call('/unknown/',{headers:h})).status,404);assert.equal((await call('/dev/fixtures/opportunities.json',{headers:h})).status,404);
  snapshot.items=[];assert.equal((await call('/api/v3/opportunities/'+proof().id,{headers:h})).status,404);
  const login=await consumeChallenge(d,await issueChallenge(d,{email:'saved@example.com',now:now()}),now());await stmt(d,'INSERT INTO saved_opportunities VALUES (?,?,?)',login.customer.id,proof().id,now()).run();
  const signed={cookie:gateCookie+'; '+login.cookie.split(';')[0]};env.V3_READY_API.fetch=async()=>{throw Error('source_service_unavailable');};
  assert.deepEqual((await (await call('/api/v3/saved',{headers:signed})).json()).ids,[proof().id]);assert.ok((await call('/api/v3/saved?expand=1',{headers:signed})).status>=500);
});
test('webhook signatures, durable deduplication, mode rejection and canonical rereads',async t=>{
  const d=db(t),c=await customer(d);await stmt(d,'INSERT INTO stripe_customers VALUES (?,?,0,?)',c.id,'cus_test',now()).run();
  const env={V3_CUSTOMER_DB:d,V3_STRIPE_MODE:'test',STRIPE_SECRET_KEY:'sk_test_fixture',STRIPE_PRICE_ID:'price_test',STRIPE_WEBHOOK_SECRET:'whsec_'+'s'.repeat(64)};
  let reads=0,status='active';const fetcher=async url=>{reads++;if(url.includes('/customers/'))return Response.json({id:'cus_test',livemode:false,email:c.email,metadata:{findpitches_v3_customer_id:c.id}});return Response.json({object:'list',has_more:false,data:[{id:'sub_test',customer:'cus_test',livemode:false,status,current_period_end:Math.floor(Date.now()/1000)+86400,cancel_at_period_end:true,metadata:{findpitches_v3_customer_id:c.id},items:{data:[{price:{id:'price_test',currency:'gbp',unit_amount:499,recurring:{interval:'month'}}}]}}]});};
  const event={id:'evt_test_one',type:'customer.subscription.updated',livemode:false,data:{object:{customer:'cus_test',status:'trialing'}}},payload=JSON.stringify(event),ts=String(Math.floor(Date.now()/1000)),signature=await hmac(env.STRIPE_WEBHOOK_SECRET,ts+'.'+payload),request=()=>new Request('https://preview.example.org/api/v3/stripe/webhook',{method:'POST',headers:{'Stripe-Signature':`t=${ts},v1=${signature}`},body:payload});
  await webhook(request(),env,{now:now(),fetcher});assert.equal(reads,2);assert.equal(d.sqlite.prepare('SELECT status FROM stripe_subscriptions').get().status,'active');assert.equal((await webhook(request(),env,{now:now(),fetcher})).duplicate,true);assert.equal(reads,2);
  const invalid=new Request('https://preview.example.org/api/v3/stripe/webhook',{method:'POST',headers:{'Stripe-Signature':`t=${ts},v1=wrong`},body:payload});await assert.rejects(webhook(invalid,env,{now:now(),fetcher}),/forbidden/);
  const live=JSON.stringify({...event,id:'evt_live_test',livemode:true}),sig=await hmac(env.STRIPE_WEBHOOK_SECRET,ts+'.'+live);await assert.rejects(webhook(new Request('https://preview.example.org/api/v3/stripe/webhook',{method:'POST',headers:{'Stripe-Signature':`t=${ts},v1=${sig}`},body:live}),env,{now:now(),fetcher}),/forbidden/);
  status='canceled';await syncSubscriptions(d,env,c,{now:now(),fetcher});assert.equal(entitlement((await stmt(d,'SELECT * FROM stripe_subscriptions').all()).results,{now:now()}).tier,'free');
  status='active';await syncSubscriptions(d,env,c,{now:'2020-01-01T00:00:00Z',fetcher});assert.equal(d.sqlite.prepare('SELECT status FROM stripe_subscriptions').get().status,'canceled');
});
test('Checkout replays one test session and rejects wrong-owner confirmation or duplicate subscriptions',async t=>{
  const d=db(t),c=await customer(d),env={V3_STRIPE_MODE:'test',V3_CHECKOUT_ENABLED:'test',STRIPE_SECRET_KEY:'sk_test_fixture',STRIPE_PRICE_ID:'price_test'};let created=0;
  const price={id:'price_test',livemode:false,active:true,currency:'gbp',unit_amount:499,recurring:{interval:'month'}};
  const fetcher=async(url,options)=>{if(url.includes('/prices/'))return Response.json(price);if(url.endsWith('/customers')&&options.method==='POST')return Response.json({id:'cus_test',livemode:false});if(url.includes('/customers/'))return Response.json({id:'cus_test',email:c.email,livemode:false,metadata:{findpitches_v3_customer_id:c.id}});if(url.includes('/subscriptions'))return Response.json({object:'list',data:[],has_more:false});if(url.endsWith('/checkout/sessions')){created++;return Response.json({id:'cs_test_abc',livemode:false,url:'https://checkout.stripe.com/c/test'});}return Response.json({id:'cs_test_abc',livemode:false,customer:'cus_other',client_reference_id:c.id,mode:'subscription',status:'complete'});};
  const options={now:now(),origin:'https://preview.example.org',fetcher};const a=await checkout(d,env,c,{market:'GB',plan_id:'pro_monthly'},options),b=await checkout(d,env,c,{market:'GB',plan_id:'pro_monthly'},options);assert.equal(a.checkout_url,b.checkout_url);assert.equal(created,1);await assert.rejects(confirmCheckout(d,env,c,{session_id:'cs_test_abc'},options),/forbidden/);
  const crossing={...options,now:new Date(Date.parse(options.now)+3600000).toISOString()};assert.equal((await checkout(d,env,c,{market:'GB',plan_id:'pro_monthly'},crossing)).checkout_url,a.checkout_url);assert.equal(created,1);
});
test('billing portal requires canonical ownership and its own TEST configuration',async t=>{
  const d=db(t),c=await customer(d);await stmt(d,'INSERT INTO stripe_customers VALUES (?,?,0,?)',c.id,'cus_portal',now()).run();
  const env={V3_STRIPE_MODE:'test',STRIPE_SECRET_KEY:'sk_test_fixture',STRIPE_PRICE_ID:'price_test'};let owner=c.id,sessions=0;
  const fetcher=async(url,options)=>{
    if(url.includes('/customers/'))return Response.json({id:'cus_portal',livemode:false,email:c.email,metadata:{findpitches_v3_customer_id:owner}});
    if(url.includes('/subscriptions'))return Response.json({object:'list',data:[],has_more:false});
    assert.ok(url.endsWith('/billing_portal/sessions'));sessions++;const p=new URLSearchParams(options.body);assert.equal(p.get('configuration'),'bpc_owned');assert.equal(p.get('customer'),'cus_portal');return Response.json({livemode:false,url:'https://billing.stripe.com/p/session/test'});
  };
  const options={origin:'https://preview.example.org',fetcher};await assert.rejects(portal(d,env,c,options),/service_unavailable/);assert.equal(sessions,0);
  env.STRIPE_PORTAL_CONFIGURATION_ID='bpc_owned';assert.match((await portal(d,env,c,options)).url,/^https:\/\/billing.stripe.com\//);owner='wrong_owner';await assert.rejects(portal(d,env,c,options),/forbidden/);assert.equal(sessions,1);
});
test('a returning native subscriber sees Subscribe and Checkout omits a second trial',async t=>{
  const d=db(t),c=await customer(d),env={V3_STRIPE_MODE:'test',V3_CHECKOUT_ENABLED:'test',STRIPE_SECRET_KEY:'sk_test_fixture',STRIPE_PRICE_ID:'price_test'};
  assert.equal((await customerAccess(d,env,c,{now:now()})).trial_eligible,true);
  await stmt(d,'INSERT INTO stripe_customers VALUES (?,?,0,?)',c.id,'cus_returning',now()).run();
  const price={id:'price_test',livemode:false,active:true,currency:'gbp',unit_amount:499,recurring:{interval:'month'}};
  let starts=0;
  const fetcher=async(url,options)=>{
    if(url.includes('/prices/'))return Response.json(price);
    if(url.includes('/customers/'))return Response.json({id:'cus_returning',email:c.email,livemode:false,metadata:{findpitches_v3_customer_id:c.id}});
    if(url.includes('/subscriptions'))return Response.json({object:'list',has_more:false,data:[{id:'sub_returning',customer:'cus_returning',livemode:false,status:'canceled',current_period_end:1,metadata:{findpitches_v3_customer_id:c.id},items:{data:[{price}]}}]});
    assert.equal(url,'https://api.stripe.com/v1/checkout/sessions');starts++;
    assert.equal(new URLSearchParams(options.body).has('subscription_data[trial_period_days]'),false);
    return Response.json({id:'cs_test_returning',livemode:false,url:'https://checkout.stripe.com/c/test'});
  };
  await syncSubscriptions(d,env,c,{now:now(),fetcher});
  const access=await customerAccess(d,env,c,{now:now()});assert.equal(access.tier,'free');assert.equal(access.checkout_allowed,true);assert.equal(access.trial_eligible,false);assert.equal(access.billing_review_required,false);
  await checkout(d,env,c,{market:'GB',plan_id:'pro_monthly'},{now:now(),origin:'https://preview.example.org',fetcher});assert.equal(starts,1);
});
