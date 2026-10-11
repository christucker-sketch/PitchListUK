// Canonically adopt Hal's existing V3-owned configuration. Create only the
// missing webhook on the reachable, stable native Worker hostname.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {liveSetupClient,secureProductionSettings,LIVE_EVENTS} from './configure-customer-production-stripe.mjs';
import {LIVE_PRICES,validateLivePrice} from '../../platform/findpitches-v3/customer-live-billing.mjs';
export const APPROVED_LIVE=JSON.parse(fs.readFileSync(new URL('./customer-production-stripe-handoff.json',import.meta.url)));
export async function adoptLiveStripe({key,productionDirectory,fetcher}){
 const handoff=APPROVED_LIVE,resources=JSON.parse(fs.readFileSync(path.join(productionDirectory,'resources.json')));
 if(resources.worker!=='findpitches-v3-customer-production'||!/^https:\/\/findpitches-v3-customer-production\.[a-z0-9-]+\.workers\.dev$/.test(resources.url??''))throw Error('owned_gated_production_required');
 const stripe=liveSetupClient(key,{fetcher}),product=await stripe('/products/'+handoff.product_id);
 if(product.id!==handoff.product_id||!product.active||product.metadata?.app!=='findpitches'||product.metadata?.version!=='v3'||product.metadata?.plan!=='pro'||product.metadata?.entitlement!=='global')throw Error('owned_global_product_required');
 for(const [currency,p] of Object.entries(LIVE_PRICES)){const price=await stripe('/prices/'+handoff.price_ids[currency]);validateLivePrice(price,{...p,id:handoff.price_ids[currency],product:handoff.product_id,currency});if(!price.active)throw Error('active_launch_price_required');}
 const portal=await stripe('/billing_portal/configurations/'+handoff.portal_id);if(portal.id!==handoff.portal_id||!portal.active||portal.is_default||!portal.features?.subscription_cancel?.enabled||portal.features.subscription_cancel.mode!=='at_period_end'||portal.features?.subscription_update?.enabled||portal.features?.customer_update?.enabled||!portal.features?.payment_method_update?.enabled||!portal.features?.invoice_history?.enabled)throw Error('dedicated_paid_through_portal_required');
 const file=path.join(productionDirectory,'stripe-live-private.json');let state=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):{...handoff,setup_id:crypto.randomUUID(),verified:false};
 if(state.account_id!==handoff.account_id||state.product_id!==handoff.product_id||state.portal_id!==handoff.portal_id||Object.keys(state.price_ids).length!==3||Object.keys(handoff.price_ids).some(c=>state.price_ids[c]!==handoff.price_ids[c]))throw Error('provider_configuration_changed');
 state.STRIPE_SECRET_KEY=key;state.verified=false;const save=()=>fs.writeFileSync(file,JSON.stringify(state,null,2)+'\n',{mode:0o600});save();
 // A restricted key may forbid /account. Exact globally unique approved LIVE
 // objects prove access to the operator's named account. No Connect header or
 // different-account fallback. The existing preview TEST account is separate.
 state.account_verification='approved LIVE objects independently reread; operator account custody';
 const endpoint=resources.url+'/api/v3/stripe/webhook';if(!state.webhook_id){const w=await stripe('/webhook_endpoints',{method:'POST',idempotencyKey:'v3-live-webhook-'+state.setup_id,params:{url:endpoint,api_version:'2024-06-20',description:'FindPitches V3 production native billing only',...Object.fromEntries(LIVE_EVENTS.map((v,i)=>['enabled_events['+i+']',v])),'metadata[app]':'findpitches','metadata[version]':'v3','metadata[findpitches_v3_setup]':state.setup_id}});if(!w.secret?.startsWith('whsec_'))throw Error('webhook_secret_required');state.webhook_id=w.id;state.STRIPE_WEBHOOK_SECRET=w.secret;save();}
 const w=await stripe('/webhook_endpoints/'+state.webhook_id);if(w.id!==state.webhook_id||w.url!==endpoint||w.status!=='enabled'||w.metadata?.findpitches_v3_setup!==state.setup_id||JSON.stringify([...w.enabled_events].sort())!==JSON.stringify([...LIVE_EVENTS].sort()))throw Error('owned_webhook_required');
 state.verified=true;state.verified_at=new Date().toISOString();save();return {account_id:state.account_id,account_verification:state.account_verification,product_id:state.product_id,price_ids:state.price_ids,portal_id:state.portal_id,webhook_id:state.webhook_id,webhook_url:endpoint,verified:true,verified_at:state.verified_at,trial_days:7,entitlement:'global',checkout_enabled:false,product_price_portal_objects_created:0,customer_objects_created:0,legacy_objects_modified:0};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const args=process.argv.slice(2),get=k=>args[args.indexOf(k)+1];try{const s=secureProductionSettings(get('--secure-env'));console.log(JSON.stringify(await adoptLiveStripe({key:s.STRIPE_SECRET_KEY,productionDirectory:get('--production-dir')})));}catch(e){console.error(/^[a-z0-9_]+$/.test(e.message)?e.message:'live_provider_verification_failed');process.exitCode=1;}}
