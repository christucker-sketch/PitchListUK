// One bounded synthetic Stripe TEST fixture; no mail, live objects or legacy IO.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';
import {customerContext} from './customer-context.mjs';

export async function verifySubscriberRecognition({credentialsFile,customerDirectory}) {
  const ctx=await customerContext({credentialsFile,customerDirectory}),settings=JSON.parse(fs.readFileSync(path.join(customerDirectory,'stripe-test-private.json')));
  if(!settings.STRIPE_SECRET_KEY?.startsWith('sk_test_'))throw Error('stripe_test_key_required');
  const file=path.join(customerDirectory,'subscriber-recognition-private.json'),state=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):{generation:crypto.randomUUID()},checks=[];
  if(state.completed_at)throw Error('completed_test_fixture_use_retained_report');
  const save=()=>fs.writeFileSync(file,JSON.stringify(state,null,2)+'\n',{mode:0o600});save();
  const check=(name,ok)=>{if(!ok)throw Error('recognition_check_failed_'+name);checks.push(name);};
  let fixtureWrites=0;
  const stripe=async(route,{method='GET',params={},key}={})=>{
    if(!/^\/(prices|customers|payment_methods|subscriptions)(\/|$)/.test(route))throw Error('bounded_test_route_required');
    const form=new URLSearchParams(params),r=await ctx.fetcher('https://api.stripe.com/v1'+route+(method==='GET'&&form.size?'?'+form:''),{method,headers:{Authorization:'Bearer '+settings.STRIPE_SECRET_KEY,'Stripe-Version':'2024-06-20',...(method!=='GET'?{'Content-Type':'application/x-www-form-urlencoded'}:{}),...(key?{'Idempotency-Key':key}:{})},...(method==='GET'?{}:{body:form.toString()}),signal:AbortSignal.timeout(30000)}),data=await r.json();
    if(!r.ok)throw Error('stripe_test_fixture_http_'+r.status);if(data.livemode===true||data.data?.some(v=>v.livemode===true))throw Error('live_provider_object_refused');
    if(method!=='GET')fixtureWrites++;return data;
  };
  await ctx.call('/preview/access',{method:'POST',operator:true});await ctx.call('/api/v3/session');
  const email='v3-recognition-'+state.generation.slice(0,8)+'@example.com';
  const link=(await ctx.call('/preview/test-login',{method:'POST',operator:true,body:{email}})).data.dev_link;
  await ctx.call(link);state.native_customer_id=(await ctx.query('SELECT id FROM customers WHERE email=?',[email]))[0].id;save();
  const price=await stripe('/prices/'+settings.STRIPE_PRICE_ID);check('approved_test_price',price.livemode===false&&price.active&&price.currency==='gbp'&&price.unit_amount===499&&price.recurring?.interval==='month');
  state.vendor_id??='test_vendor_'+state.generation;save();
  if(!state.stripe_customer_id){const c=await stripe('/customers',{method:'POST',key:'v3-recognition-customer-'+state.generation,params:{email,'metadata[findpitches_v3_test_fixture]':'subscriber_recognition','metadata[vendor_id]':state.vendor_id}});check('synthetic_test_customer',c.livemode===false);state.stripe_customer_id=c.id;save();}
  if(!state.payment_method_id){const pm=await stripe('/payment_methods',{method:'POST',key:'v3-recognition-card-'+state.generation,params:{type:'card','card[token]':'tok_visa'}});state.payment_method_id=pm.id;save();}
  if(!state.payment_method_attached){await stripe('/payment_methods/'+state.payment_method_id+'/attach',{method:'POST',key:'v3-recognition-attach-'+state.generation,params:{customer:state.stripe_customer_id}});state.payment_method_attached=true;save();}
  if(!state.subscription_id){const sub=await stripe('/subscriptions',{method:'POST',key:'v3-recognition-subscription-'+state.generation,params:{customer:state.stripe_customer_id,'items[0][price]':settings.STRIPE_PRICE_ID,default_payment_method:state.payment_method_id,trial_period_days:7,'metadata[product]':'pitchlist_database','metadata[vendor_id]':state.vendor_id,'metadata[findpitches_v3_test_fixture]':'subscriber_recognition'}});check('synthetic_test_subscription',sub.livemode===false);state.subscription_id=sub.id;save();}
  const sub=await stripe('/subscriptions/'+state.subscription_id);if(sub.status==='canceled')throw Error('completed_test_fixture_use_retained_report');
  const beforeCustomer=await stripe('/customers/'+state.stripe_customer_id),beforeSubscriptions=await stripe('/subscriptions',{params:{customer:state.stripe_customer_id,status:'all',limit:100}});
  const manifest={customer_id:state.native_customer_id,stripe_customer_id:state.stripe_customer_id,stripe_subscription_id:state.subscription_id,price_id:settings.STRIPE_PRICE_ID,market:'GB',legacy_vendor_id:state.vendor_id,ownership_evidence_hash:crypto.createHash('sha256').update(JSON.stringify([state.generation,state.native_customer_id,state.stripe_customer_id,state.subscription_id,state.vendor_id])).digest('hex'),scope:'synthetic_test',reviewed:true};
  const recognize=async body=>(await ctx.call('/preview/subscribers/recognize',{method:'POST',operator:true,body:body??manifest})).data;
  const first=await recognize();
  const retainedTrial=(await ctx.query("SELECT COUNT(*) n FROM subscriber_recognition_decisions d JOIN subscriber_associations a ON a.id=d.association_id WHERE a.customer_id=? AND d.status='trialing'",[state.native_customer_id]))[0].n;
  check('canonical_legacy_trial_recognized',first.recognized&&first.livemode===false&&(first.access.tier==='trial'||sub.status==='active'&&retainedTrial>0));
  const repeats=await Promise.all([recognize(),recognize()]);check('concurrent_idempotent_association',repeats.every(r=>r.association_id===first.association_id));
  let wrong=false;try{await recognize({...manifest,legacy_vendor_id:'wrong_vendor'});}catch(e){wrong=e.message==='customer_http_403_forbidden';}check('wrong_original_owner_rejected',wrong);
  let blocked=false;try{await ctx.call('/api/v3/billing/checkout',{method:'POST',body:{market:'GB',plan_id:'pro_monthly'}});}catch(e){blocked=e.message==='customer_http_409_subscription_exists';}check('duplicate_checkout_denied',blocked);
  const afterCustomer=await stripe('/customers/'+state.stripe_customer_id),afterSubscriptions=await stripe('/subscriptions',{params:{customer:state.stripe_customer_id,status:'all',limit:100}});
  check('provider_customer_metadata_preserved',JSON.stringify(beforeCustomer.metadata)===JSON.stringify(afterCustomer.metadata));
  check('provider_subscription_metadata_preserved',JSON.stringify(sub.metadata)===JSON.stringify(afterSubscriptions.data.find(s=>s.id===sub.id)?.metadata));
  check('no_duplicate_provider_subscription',beforeSubscriptions.data.length===1&&afterSubscriptions.data.length===1);
  if(sub.status==='trialing')await stripe('/subscriptions/'+state.subscription_id,{method:'POST',key:'v3-recognition-activate-'+state.generation,params:{trial_end:'now'}});
  // Provider/webhook completion can overlap the request clock. Retry bounded
  // canonical reads; never relax the future-cache or paid-through checks.
  let active;for(let i=0;i<3;i++){active=await recognize();if(active.access.tier==='pro')break;}
  check('canonical_active_access',active.access.tier==='pro');
  await stripe('/subscriptions/'+state.subscription_id,{method:'POST',key:'v3-recognition-schedule-cancel-'+state.generation,params:{cancel_at_period_end:'true'}});
  let paid;for(let i=0;i<3;i++){paid=(await recognize()).access;if(paid.tier==='pro'&&paid.cancel_at_period_end)break;}
  check('canonical_paid_through_cancellation',paid.tier==='pro'&&paid.cancel_at_period_end&&Date.parse(paid.renews_on)>Date.now());
  const gb=(await ctx.call('/api/v3/opportunities?market=GB&page_size=1')).data;check('recognized_gb_application_access',gb.results.length===1&&!gb.results[0].access.locked);
  const us=(await ctx.call('/api/v3/opportunities?market=US&page_size=1')).data;check('market_scope_preserved',!us.results.length||us.results[0].access.locked);
  await stripe('/subscriptions/'+state.subscription_id,{method:'DELETE'});
  check('canonical_cancellation_removes_access',(await recognize()).access.tier==='free');
  const ended=(await ctx.call('/api/v3/opportunities?market=GB&page_size=1')).data;check('ended_access_redacts_application',ended.results.every(r=>r.access.locked&&!r.access.application_url));
  blocked=false;try{await ctx.call('/api/v3/billing/checkout',{method:'POST',body:{market:'GB',plan_id:'pro_monthly'}});}catch(e){blocked=e.message==='customer_http_409_subscription_exists';}check('expired_recognition_does_not_restart_trial',blocked);
  const counts=(await ctx.query('SELECT (SELECT COUNT(*) FROM subscriber_associations WHERE customer_id=?) associations,(SELECT COUNT(*) FROM stripe_customers WHERE customer_id=?) stripe_mappings,(SELECT COUNT(*) FROM checkout_attempts WHERE customer_id=?) checkout_attempts',[state.native_customer_id,state.native_customer_id,state.native_customer_id]))[0];
  check('one_mapping_zero_checkout_attempts',counts.associations===1&&counts.stripe_mappings===1&&counts.checkout_attempts===0);
  state.completed_at=new Date().toISOString();save();
  const report={schema:'findpitches-v3-subscriber-recognition-test-v1',as_of:state.completed_at,mode:'synthetic_stripe_test',passed:checks.length,checks,fixture_provider_writes_this_invocation:fixtureWrites,fixture_write_count_scope:'this invocation only; prior fixture setup/activation calls are not included',provider_customers_in_fixture:1,provider_subscriptions_in_fixture:1,recognition_provider_mutations:0,counts,real_customer_imports:0,real_charges:0,messages_sent:0,paid_acquisition_queries:0,publication_enabled:false,production_cutover_enabled:false,hosted_browser_journey:false,expiry_evidence:'canonical TEST cancellation plus exact paid-through end boundary in local tests'};
  fs.writeFileSync(path.join(customerDirectory,'subscriber-recognition-report.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const a=process.argv.slice(2),get=k=>a[a.indexOf(k)+1];try{console.log(JSON.stringify(await verifySubscriberRecognition({credentialsFile:get('--credentials'),customerDirectory:get('--customer-dir')})));}catch(e){console.error(/^[a-z0-9_]+$/.test(e.message)?e.message:'subscriber_recognition_verification_failed');process.exitCode=1;}
}
