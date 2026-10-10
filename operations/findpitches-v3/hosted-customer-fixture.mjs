// Bounded companion to the real hosted browser journey. Never creates a
// subscription by API, writes a customer cache, sends mail or reads legacy IO.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';
import {customerContext} from './customer-context.mjs';

export async function hostedFixture({action,credentialsFile,customerDirectory}) {
  const ctx=await customerContext({credentialsFile,customerDirectory}),file=path.join(customerDirectory,'hosted-journey-private.json');
  const state=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):{generation:crypto.randomUUID(),schema:'findpitches-v3-hosted-fixture-v1'};
  const save=()=>fs.writeFileSync(file,JSON.stringify(state,null,2)+'\n',{mode:0o600});
  if(state.schema!=='findpitches-v3-hosted-fixture-v1')throw Error('owned_hosted_fixture_required');
  if(state.completed_at&&action!=='inspect')throw Error('completed_hosted_fixture_use_retained_report');
  const settings=JSON.parse(fs.readFileSync(path.join(customerDirectory,'stripe-test-private.json')));
  if(!settings.STRIPE_SECRET_KEY?.startsWith('sk_test_'))throw Error('stripe_test_key_required');
  const stripe=async(route,{method='GET',params={},key}={})=>{
    if(!/^\/(prices\/price_[A-Za-z0-9]+|customers\/cus_[A-Za-z0-9]+|subscriptions(?:\/sub_[A-Za-z0-9]+)?|checkout\/sessions\/cs_test_[A-Za-z0-9]+|test_helpers\/test_clocks(?:\/clock_[A-Za-z0-9]+(?:\/advance)?)?)$/.test(route))throw Error('bounded_test_route_required');
    if(method!=='GET'&&!(route==='/test_helpers/test_clocks'||route==='/test_helpers/test_clocks/'+state.clock_id+'/advance'))throw Error('clock_fixture_writes_only');
    const form=new URLSearchParams(params),r=await ctx.fetcher('https://api.stripe.com/v1'+route+(method==='GET'&&form.size?'?'+form:''),{method,headers:{Authorization:'Bearer '+settings.STRIPE_SECRET_KEY,'Stripe-Version':'2024-06-20',...(method==='GET'?{}:{'Content-Type':'application/x-www-form-urlencoded','Idempotency-Key':key})},...(method==='GET'?{}:{body:form.toString()}),signal:AbortSignal.timeout(30000)}),body=await r.json();
    if(!r.ok)throw Error('stripe_test_http_'+r.status+'_'+String(body.error?.code??body.error?.type??'failed').replace(/[^a-z_]/g,''));
    if(body.livemode===true||body.data?.some(x=>x.livemode===true))throw Error('live_provider_object_refused');return body;
  };
  const price=await stripe('/prices/'+settings.STRIPE_PRICE_ID);
  if(price.livemode!==false||!price.active||price.currency!=='gbp'||price.unit_amount!==499||price.recurring?.interval!=='month')throw Error('approved_test_price_required');
  state.email??='v3-hosted-'+state.generation.slice(0,8)+'@example.com';
  if(!/^v3-hosted-[a-f0-9]{8}@example\.com$/.test(state.email))throw Error('reserved_fixture_owner_required');
  if(action==='prepare'){
    const health=(await ctx.call('/health')).data;if(health.publication_enabled!==false||health.production_cutover_enabled!==false)throw Error('shadow_gate_required');
    state.dev_link=new URL((await ctx.call('/preview/test-login',{method:'POST',operator:true,body:{email:state.email,next:'/pricing.html'}})).data.dev_link,ctx.state.url).href;state.origin=ctx.state.url;save();
    return {prepared:true,fixture_accounts:1,real_charges:0,messages_sent:0};
  }
  const customers=await ctx.query('SELECT id FROM customers WHERE email=?',[state.email]);if(customers.length!==1)throw Error('one_native_test_owner_required');state.native_customer_id=customers[0].id;
  const links=await ctx.query('SELECT stripe_id,livemode FROM stripe_customers WHERE customer_id=?',[state.native_customer_id]);if(links.length!==1||links[0].livemode!==0)throw Error('one_test_provider_mapping_required');
  const owner=await stripe('/customers/'+links[0].stripe_id);
  if(owner.livemode!==false||owner.deleted||owner.email!==state.email||owner.metadata?.findpitches_v3_customer_id!==state.native_customer_id)throw Error('canonical_fixture_owner_required');
  state.stripe_customer_id=owner.id;
  const attempts=await ctx.query('SELECT stripe_session_id,completed_at FROM checkout_attempts WHERE customer_id=?',[state.native_customer_id]);
  if(attempts.length!==1||!/^cs_test_[A-Za-z0-9]+$/.test(attempts[0].stripe_session_id??''))throw Error('one_native_test_checkout_required');state.checkout_session_id=attempts[0].stripe_session_id;
  const session=await stripe('/checkout/sessions/'+state.checkout_session_id);
  if(session.livemode!==false||session.customer!==owner.id||session.client_reference_id!==state.native_customer_id)throw Error('canonical_test_checkout_owner_required');
  if(session.url?.startsWith('https://checkout.stripe.com/'))state.checkout_url=session.url;
  const list=await stripe('/subscriptions',{params:{customer:owner.id,status:'all',limit:100}});
  if(list.has_more||list.data.length>1)throw Error('duplicate_fixture_subscription_refused');
  const sub=list.data[0];if(sub){if(sub.customer!==owner.id||sub.livemode!==false||sub.metadata?.findpitches_v3_customer_id!==state.native_customer_id||sub.items?.data?.length!==1||sub.items.data[0].price.id!==price.id)throw Error('canonical_fixture_subscription_required');state.subscription_id=sub.id;state.period_end=sub.current_period_end??sub.items.data[0].current_period_end;}
  save();
  if(action==='attach-clock'){
    if(session.status!=='complete'||!sub||sub.status!=='trialing')throw Error('completed_trial_clock_candidate_required');
    if(owner.test_clock){
      // An initial attach can return `advancing` before it becomes ready. Keep
      // custody of that same clock on retries; never create a replacement.
      if(state.clock_id&&state.clock_id!==owner.test_clock)throw Error('foreign_fixture_clock_refused');
      const clock=await stripe('/test_helpers/test_clocks/'+owner.test_clock);
      if(clock.livemode!==false||clock.name!=='FindPitches V3 hosted TEST fixture')throw Error('owned_fixture_clock_required');
      state.clock_id=clock.id;save();
    }else if(!state.clock_id){
      state.clock_initial_time??=Math.ceil(Date.now()/1000)+60;save();
      const clock=await stripe('/test_helpers/test_clocks',{method:'POST',params:{customer:owner.id,frozen_time:state.clock_initial_time,name:'FindPitches V3 hosted TEST fixture'},key:'v3-hosted-clock-'+state.generation});
      if(clock.livemode!==false)throw Error('test_clock_required');state.clock_id=clock.id;save();
    }else throw Error('fixture_clock_owner_mismatch');
  }else if(action==='advance-trial'||action==='advance-end'){
    if(!state.clock_id||owner.test_clock!==state.clock_id||!sub)throw Error('owned_clock_fixture_required');
    if(action==='advance-trial'&&(sub.status!=='trialing'||!sub.trial_end))throw Error('trial_clock_state_required');
    if(action==='advance-end'&&(sub.status!=='active'||!sub.cancel_at_period_end))throw Error('scheduled_paid_through_state_required');
    const target=(action==='advance-trial'?sub.trial_end:state.period_end)+1;
    const clock=await stripe('/test_helpers/test_clocks/'+state.clock_id+'/advance',{method:'POST',params:{frozen_time:target},key:'v3-hosted-'+action+'-'+state.generation});
    state.last_clock_target=target;save();return {clock_advance_requested:true,clock_status:clock.status,target_phase:action};
  }else if(action!=='inspect'&&action!=='complete')throw Error('bounded_fixture_action_required');
  const clock=state.clock_id?await stripe('/test_helpers/test_clocks/'+state.clock_id):null;
  if(action==='complete'){if(session.status!=='complete'||sub?.status!=='canceled')throw Error('completed_ended_fixture_required');state.completed_at=new Date().toISOString();save();}
  return {checkout_status:session.status,provider_subscription_count:list.data.length,provider_status:sub?.status??null,cancel_at_period_end:sub?.cancel_at_period_end??false,period_end:state.period_end?new Date(state.period_end*1000).toISOString():null,clock_status:clock?.status??null,clock_frozen_time:clock?.frozen_time??null,native_checkout_completed:Boolean(attempts[0].completed_at),owner_verified:true,test_mode:true};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),get=k=>args[args.indexOf(k)+1];try{console.log(JSON.stringify(await hostedFixture({action:get('--action'),credentialsFile:get('--credentials'),customerDirectory:get('--customer-dir')})));}catch(e){console.error(/^[a-z0-9_]+$/.test(e.message)?e.message:'hosted_test_fixture_failed');process.exitCode=1;}
}
