// Fresh D-016 objects in the existing account. No customer, Checkout, subscription,
// legacy object, default Portal or account setting is created/modified here.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {proxyFetch} from './cloudflare-api.mjs';
import {LIVE_PRICES,validateLivePrice} from '../../platform/findpitches-v3/customer-live-billing.mjs';
export const LIVE_EVENTS=['checkout.session.completed','customer.subscription.created','customer.subscription.updated','customer.subscription.deleted','invoice.payment_failed','invoice.paid'];
export function secureProductionSettings(file){
 const values={};if(file){if((fs.statSync(file).mode&0o077)!==0)throw Error('credential_file_permissions_must_be_0600');
  for(const line of fs.readFileSync(file,'utf8').split(/\r?\n/)){const m=line.match(/^\s*(STRIPE_SECRET_KEY|V3_EMAIL_API_KEY|SMTP2GO_API_KEY)\s*=\s*(.*?)\s*$/);if(m){let v=m[2];if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);values[m[1]]=v;}}}
 return values;
}
export function liveSetupClient(key,{fetcher=proxyFetch()}={}){
 if(!/^(sk|rk)_live_/.test(key??''))throw Error('secure_live_stripe_key_required');
 return async(p,{method='GET',params={},idempotencyKey}={})=>{
  if(!/^\/(account|products|prices|webhook_endpoints|billing_portal\/configurations)(\/|$)/.test(p)||method!=='GET'&&!['/products','/prices','/webhook_endpoints','/billing_portal/configurations'].includes(p))throw Error('owned_setup_scope_required');
  const form=new URLSearchParams();for(const [k,v] of Object.entries(params))form.set(k,String(v));
  const r=await fetcher('https://api.stripe.com/v1'+p+(method==='GET'&&form.size?'?'+form:''),{method,headers:{Authorization:'Bearer '+key,'Stripe-Version':'2024-06-20',...(method!=='GET'?{'Content-Type':'application/x-www-form-urlencoded'}:{}),...(idempotencyKey?{'Idempotency-Key':idempotencyKey}:{})},...(method==='GET'?{}:{body:form.toString()}),signal:AbortSignal.timeout(20000)});
  const body=await r.json();if(!r.ok)throw Error('stripe_setup_http_'+r.status);
  if(p!=='/account'&&body.livemode!==true)throw Error('live_object_required');return body;
 };
}
export async function configureLiveStripe({key,expectedAccount,productionDirectory,fetcher,allowFreshSetup=false}){
 if(!allowFreshSetup)throw Error('fresh_setup_requires_explicit_no_existing_configuration');
 if(!/^acct_[A-Za-z0-9]+$/.test(expectedAccount??''))throw Error('existing_stripe_account_id_required');
 const resources=JSON.parse(fs.readFileSync(path.join(productionDirectory,'resources.json')));
 if(resources.worker!=='findpitches-v3-customer-production'||!/^https:\/\/findpitches-v3-customer-production\.[a-z0-9-]+\.workers\.dev$/.test(resources.url??''))throw Error('owned_gated_production_required');
 const stripe=liveSetupClient(key,{fetcher}),account=await stripe('/account');if(account.id!==expectedAccount)throw Error('wrong_stripe_account');
 const file=path.join(productionDirectory,'stripe-live-private.json');let state=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):{account_id:account.id,setup_id:crypto.randomUUID(),price_ids:{},verified:false};
 if(state.account_id!==account.id)throw Error('stripe_account_changed');
 state.STRIPE_SECRET_KEY=key;state.verified=false;const save=()=>fs.writeFileSync(file,JSON.stringify(state,null,2)+'\n',{mode:0o600});save();
 const metadata={'metadata[app]':'findpitches','metadata[version]':'v3','metadata[plan]':'pro','metadata[entitlement]':'global','metadata[findpitches_v3_runtime]':'production_public','metadata[findpitches_v3_setup]':state.setup_id};
 if(!state.product_id){const product=await stripe('/products',{method:'POST',idempotencyKey:'v3-live-product-'+state.setup_id,params:{name:'FindPitches Pro',...metadata}});state.product_id=product.id;save();}
 const product=await stripe('/products/'+state.product_id);if(!product.active||product.metadata?.findpitches_v3_runtime!=='production_public'||product.metadata?.findpitches_v3_setup!==state.setup_id||product.metadata?.entitlement!=='global')throw Error('owned_global_product_required');
 for(const [currency,p] of Object.entries(LIVE_PRICES)){
  if(!state.price_ids[currency]){const price=await stripe('/prices',{method:'POST',idempotencyKey:'v3-live-price-'+state.setup_id+'-'+currency,params:{product:state.product_id,currency:currency.toLowerCase(),unit_amount:p.amount,'recurring[interval]':'month','recurring[interval_count]':1,lookup_key:'findpitches_v3_pro_'+currency.toLowerCase()+'_monthly',...metadata}});state.price_ids[currency]=price.id;save();}
  const price=await stripe('/prices/'+state.price_ids[currency]);validateLivePrice(price,{...p,id:state.price_ids[currency],product:state.product_id,currency});if(!price.active||price.metadata?.findpitches_v3_setup!==state.setup_id)throw Error('owned_active_price_required');
 }
 if(!state.portal_id){const portal=await stripe('/billing_portal/configurations',{method:'POST',idempotencyKey:'v3-live-portal-'+state.setup_id,params:{'business_profile[headline]':'Manage your FindPitches Pro subscription','features[invoice_history][enabled]':true,'features[payment_method_update][enabled]':true,'features[customer_update][enabled]':false,'features[subscription_update][enabled]':false,'features[subscription_cancel][enabled]':true,'features[subscription_cancel][mode]':'at_period_end',...metadata}});state.portal_id=portal.id;save();}
 const portal=await stripe('/billing_portal/configurations/'+state.portal_id);if(!portal.active||portal.metadata?.findpitches_v3_setup!==state.setup_id||!portal.features?.subscription_cancel?.enabled||portal.features.subscription_cancel.mode!=='at_period_end'||portal.features?.customer_update?.enabled||portal.features?.subscription_update?.enabled)throw Error('owned_paid_through_portal_required');
 const endpoint=resources.url+'/api/v3/stripe/webhook';
 if(!state.webhook_id){const webhook=await stripe('/webhook_endpoints',{method:'POST',idempotencyKey:'v3-live-webhook-'+state.setup_id,params:{url:endpoint,api_version:'2024-06-20',description:'FindPitches V3 production native billing only',...Object.fromEntries(LIVE_EVENTS.map((v,i)=>['enabled_events['+i+']',v])),...metadata}});if(!webhook.secret?.startsWith('whsec_'))throw Error('webhook_secret_required');state.webhook_id=webhook.id;state.STRIPE_WEBHOOK_SECRET=webhook.secret;save();}
 const webhook=await stripe('/webhook_endpoints/'+state.webhook_id);if(webhook.url!==endpoint||webhook.status!=='enabled'||webhook.metadata?.findpitches_v3_setup!==state.setup_id||JSON.stringify([...webhook.enabled_events].sort())!==JSON.stringify([...LIVE_EVENTS].sort()))throw Error('owned_webhook_required');
 state.verified=true;state.verified_at=new Date().toISOString();save();
 return {account_id:account.id,product_id:state.product_id,price_ids:state.price_ids,portal_id:state.portal_id,webhook_id:state.webhook_id,webhook_url:endpoint,verified_at:state.verified_at,verified:true,trial_days:7,entitlement:'global',checkout_enabled:false,customer_objects_created:0,legacy_objects_modified:0};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){console.error('use_verify_customer_production_stripe_to_adopt_existing_operator_objects');process.exitCode=1;}
