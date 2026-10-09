// Bounded real Stripe TEST objects and native customer journeys. No live key,
// customer migration, public route, acquisition query or real email delivery.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';
import {customerContext} from './customer-context.mjs';

export async function verifyCustomerPreview({credentialsFile,customerDirectory}) {
  const contexts=()=>customerContext({credentialsFile,customerDirectory}),admin=await contexts(),checks=[];
  const check=(name,condition)=>{if(!condition)throw Error('preview_check_failed_'+name);checks.push(name);console.log('PASS '+name);};
  const health=(await admin.call('/health')).data;check('shadow_health',health.publication_enabled===false&&health.production_cutover_enabled===false);
  let refused=false;try{await admin.call('/api/v3/opportunities?market=GB');}catch(e){refused=e.message==='customer_http_401_preview_access_required';}check('unauthorised_inventory_denied',refused);
  const price=(await admin.call('/preview/stripe/validate',{method:'POST',operator:true})).data;check('existing_test_price',price.test_mode&&price.price_valid);
  const stripe=async(route,{method='GET',params={},key}={})=>{
    if(!admin.secrets.STRIPE_SECRET_KEY?.startsWith('sk_test_')||!/^\/(customers|payment_methods|subscriptions|webhook_endpoints)(\/|$)/.test(route))throw Error('bounded_stripe_test_only');
    const form=new URLSearchParams(params),r=await admin.fetcher('https://api.stripe.com/v1'+route+(method==='GET'&&form.size?'?'+form:''),{method,headers:{Authorization:'Bearer '+admin.secrets.STRIPE_SECRET_KEY,'Stripe-Version':'2024-06-20',...(method!=='GET'?{'Content-Type':'application/x-www-form-urlencoded'}:{}),...(key?{'Idempotency-Key':key}:{})},...(method==='GET'?{}:{body:form.toString()}),signal:AbortSignal.timeout(30000)}),d=await r.json();
    if(!r.ok)throw Error('stripe_test_http_'+r.status+'_'+String(d.error?.code??d.error?.type??'failed').replace(/[^a-z_]/g,''));if(d.livemode===true)throw Error('live_stripe_object_refused');return d;
  };
  const stateFile=path.join(customerDirectory,'test-journey-state-private.json'),state=fs.existsSync(stateFile)?JSON.parse(fs.readFileSync(stateFile,'utf8')):{generation:crypto.randomUUID(),accounts:{}};
  const save=()=>fs.writeFileSync(stateFile,JSON.stringify(state),{mode:0o600});
  if(!state.webhook_id){const endpoint=await stripe('/webhook_endpoints',{method:'POST',key:'v3-preview-endpoint-'+state.generation,params:{url:admin.state.url+'/api/v3/stripe/webhook','enabled_events[0]':'customer.subscription.updated','enabled_events[1]':'customer.subscription.deleted','enabled_events[2]':'checkout.session.completed','enabled_events[3]':'invoice.payment_failed','enabled_events[4]':'invoice.payment_succeeded',description:'FindPitches V3 isolated TEST preview'}});if(!endpoint.secret?.startsWith('whsec_')||endpoint.livemode!==false)throw Error('test_endpoint_required');state.webhook_id=endpoint.id;state.webhook_secret=endpoint.secret;save();}
  admin.secrets.STRIPE_WEBHOOK_SECRET=state.webhook_secret;fs.writeFileSync(path.join(customerDirectory,'secrets-private.json'),JSON.stringify(admin.secrets),{mode:0o600});
  await admin.api.accountRequest('/workers/scripts/findpitches-v3-customer-preview/secrets',{method:'PUT',body:{name:'STRIPE_WEBHOOK_SECRET',type:'secret_text',text:state.webhook_secret}});
  // Publication of a new secret binding can take seconds. Proceed with native
  // login and canonical Stripe reads before testing its signature handler.
  async function signIn(kind) {
    const c=await contexts();await c.call('/preview/access',{method:'POST',operator:true});await c.call('/api/v3/session');
    const email='v3-'+kind+'-'+state.generation.slice(0,8)+'@example.com',link=(await c.call('/preview/test-login',{method:'POST',operator:true,body:{email}})).data.dev_link;
    check(kind+'_login_redirect',(await c.call(link)).status===303);check(kind+'_native_session',(await c.call('/api/v3/session')).data.signed_in);
    const [{id}]=await c.query('SELECT id FROM customers WHERE email=?',[email]);state.accounts[kind]??={email,customer_id:id};save();return c;
  }
  const free=await signIn('free'),list=(await free.call('/api/v3/opportunities?market=GB&page_size=2')).data;
  check('real_gb_inventory',list.total>0&&list.results.length>0&&list.results.every(r=>/^ent_[a-f0-9]{32}$/.test(r.id)));
  check('free_server_redaction',list.results.every(r=>r.access.locked&&!r.access.source_url&&!r.access.application_url));
  const id=list.results[0].id;await free.call('/api/v3/saved',{method:'POST',body:{id}});check('saved_native_storage',(await free.call('/api/v3/saved')).data.ids.includes(id));
  const trial=await signIn('trial'),active=await signIn('active');
  const config=JSON.parse(fs.readFileSync(path.join(customerDirectory,'stripe-test-private.json'),'utf8'));
  for(const [kind,c] of [['trial',trial],['active',active]]) {
    const a=state.accounts[kind];if(!a.subscription_id){const first=(await c.call('/api/v3/billing/checkout',{method:'POST',body:{market:'GB',plan_id:'pro_monthly'}})).data,repeat=(await c.call('/api/v3/billing/checkout',{method:'POST',body:{market:'GB',plan_id:'pro_monthly'}})).data;check(kind+'_checkout_idempotent',first.checkout_url===repeat.checkout_url&&first.checkout_url.startsWith('https://checkout.stripe.com/'));
      const [link]=await c.query('SELECT stripe_id FROM stripe_customers WHERE customer_id=?',[a.customer_id]);a.stripe_customer_id=link.stripe_id;
      const pm=await stripe('/payment_methods',{method:'POST',key:'v3-test-card-'+a.customer_id,params:{type:'card','card[token]':'tok_visa'}});await stripe('/payment_methods/'+pm.id+'/attach',{method:'POST',key:'v3-test-attach-'+a.customer_id,params:{customer:link.stripe_id}});
      const subscription=await stripe('/subscriptions',{method:'POST',key:'v3-test-subscription-'+a.customer_id,params:{customer:link.stripe_id,'items[0][price]':config.STRIPE_PRICE_ID,default_payment_method:pm.id,'metadata[findpitches_v3_customer_id]':a.customer_id,...(kind==='trial'?{trial_period_days:'7'}:{})}});
      a.subscription_id=subscription.id;save();
    }
    if(kind==='trial')await stripe('/subscriptions/'+a.subscription_id,{method:'GET'}).then(s=>{if(s.status==='canceled')throw Error('completed_test_state_use_new_generation');});
    await c.query("UPDATE stripe_subscriptions SET checked_at='2020-01-01T00:00:00Z' WHERE customer_id=?",[a.customer_id]);const session=(await c.call('/api/v3/session')).data;
    check(kind+'_canonical_entitlement',session.access.tier===(kind==='trial'?'trial':'pro'));
    const detail=(await c.call('/api/v3/opportunities/'+id)).data.opportunity;check(kind+'_real_application_route',!detail.access.locked&&/^https:\/\//.test(detail.access.application_url??''));
    const us=(await c.call('/api/v3/opportunities?market=US&page_size=1')).data;check(kind+'_market_scope',!us.results.length||us.results[0].access.locked);
  }
  await active.call('/api/v3/alerts',{method:'POST',body:{name:'UK preview',query:{market:'GB'},frequency:'daily'}});check('alerts_native_storage',(await active.call('/api/v3/alerts')).data.alerts.length>0);
  const activeAccount=state.accounts.active;await stripe('/subscriptions/'+activeAccount.subscription_id,{method:'POST',params:{cancel_at_period_end:'true'}});await active.query("UPDATE stripe_subscriptions SET checked_at='2020-01-01T00:00:00Z' WHERE customer_id=?",[activeAccount.customer_id]);const cancelled=(await active.call('/api/v3/session')).data;
  check('cancelled_paid_through_access',cancelled.access.tier==='pro'&&cancelled.access.cancel_at_period_end);
  const payload=JSON.stringify({id:'evt_v3_preview_'+state.generation.replaceAll('-',''),type:'customer.subscription.updated',livemode:false,data:{object:{customer:activeAccount.stripe_customer_id}}}),timestamp=Math.floor(Date.now()/1000),signature=crypto.createHmac('sha256',state.webhook_secret).update(timestamp+'.'+payload).digest('hex');
  const signed=async()=>{const r=await admin.fetcher(admin.state.url+'/api/v3/stripe/webhook',{method:'POST',headers:{'Stripe-Signature':`t=${timestamp},v1=${signature}`},body:payload,signal:AbortSignal.timeout(30000)});return {status:r.status,data:await r.json()};};
  const receipt=await signed();check('remote_signed_webhook',receipt.status===200&&receipt.data.received);check('remote_webhook_replay',(await signed()).data.duplicate===true);
  // Keep this account as active/cancel-at-period-end for a browser journey.
  // Expiry is tested with the separate trial account; no live objects exist.
  await stripe('/subscriptions/'+state.accounts.trial.subscription_id,{method:'DELETE'});await trial.query("UPDATE stripe_subscriptions SET checked_at='2020-01-01T00:00:00Z' WHERE customer_id=?",[state.accounts.trial.customer_id]);const expired=(await trial.call('/api/v3/session')).data;
  check('expired_native_entitlement',expired.access.tier==='free');check('expired_application_redacted',(await trial.call('/api/v3/opportunities/'+id)).data.opportunity.access.locked);
  await free.call('/api/v3/session/logout',{method:'POST'});check('logout_revocation',(await free.call('/api/v3/session')).data.signed_in===false);
  let sync;for(let i=0;i<30;i++){sync=(await admin.call('/preview/sync',{method:'POST',operator:true})).data;if(!sync.pending)break;}check('bounded_inventory_log_converged',sync.pending===0);
  fs.writeFileSync(path.join(customerDirectory,'browser-access-private.json'),JSON.stringify({base:active.state.url,cookies:[...active.cookieJar].map(([name,value])=>({name,value,url:active.state.url,secure:true,httpOnly:name.startsWith('__Host-'),sameSite:'Lax'}))}),{mode:0o600});
  const status=(await admin.call('/preview/status',{operator:true})).data,report={schema:'findpitches-v3-customer-preview-verification-v1',as_of:new Date().toISOString(),passed:checks.length,checks,real_gb_ready:list.total,test_mode_only:true,test_accounts:3,test_subscriptions:2,source_mutations_by_this_runner:0,serper_queries:0,publication_enabled:false,production_cutover_enabled:false,status};
  fs.writeFileSync(path.join(customerDirectory,'journey-report.json'),JSON.stringify(report,null,2),{mode:0o600});return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {const a=process.argv.slice(2),get=k=>a[a.indexOf(k)+1];try{const r=await verifyCustomerPreview({credentialsFile:get('--credentials'),customerDirectory:get('--customer-dir')});console.log(JSON.stringify({...r,status:undefined,checks:undefined}));}catch(e){console.error(/^[a-z0-9_]+$/.test(e.message)?e.message:'customer_preview_verification_failed',e.route??'');process.exitCode=1;}}
