// Configure and verify only the owned V3 Stripe TEST portal. No live changes.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {customerContext} from './customer-context.mjs';
export async function verifyCustomerPortal({credentialsFile,customerDirectory,configureOnly=false}) {
  const ctx=await customerContext({credentialsFile,customerDirectory}),file=path.join(customerDirectory,'stripe-test-private.json'),settings=JSON.parse(fs.readFileSync(file,'utf8'));
  if(!settings.STRIPE_SECRET_KEY?.startsWith('sk_test_'))throw Error('stripe_test_key_required');
  const stripe=async(route,{method='GET',params={}}={})=>{
    if(!/^\/billing_portal\/configurations(?:\/bpc_[a-zA-Z0-9]+)?$/.test(route))throw Error('owned_test_portal_route_required');
    const r=await ctx.fetcher('https://api.stripe.com/v1'+route,{method,headers:{Authorization:'Bearer '+settings.STRIPE_SECRET_KEY,'Stripe-Version':'2024-06-20',...(method==='POST'?{'Content-Type':'application/x-www-form-urlencoded','Idempotency-Key':'findpitches-v3-preview-portal-v1'}:{})},...(method==='POST'?{body:new URLSearchParams(params).toString()}:{}),signal:AbortSignal.timeout(30000)}),body=await r.json();
    if(!r.ok)throw Error('stripe_test_portal_http_'+r.status);if(body.livemode!==false)throw Error('test_portal_required');return body;
  };
  let config;
  if(settings.STRIPE_PORTAL_CONFIGURATION_ID)config=await stripe('/billing_portal/configurations/'+settings.STRIPE_PORTAL_CONFIGURATION_ID);
  else {
    config=await stripe('/billing_portal/configurations',{method:'POST',params:{'metadata[findpitches_v3_preview]':'true','features[subscription_cancel][enabled]':'true','features[subscription_cancel][mode]':'at_period_end','features[payment_method_update][enabled]':'true','features[invoice_history][enabled]':'true'}});
    settings.STRIPE_PORTAL_CONFIGURATION_ID=config.id;
    fs.writeFileSync(file,JSON.stringify(settings),{mode:0o600});
  }
  if(!config.id?.startsWith('bpc_')||!config.active||config.metadata?.findpitches_v3_preview!=='true'||config.features?.subscription_cancel?.mode!=='at_period_end'||!config.features?.subscription_cancel?.enabled)throw Error('owned_test_portal_configuration_required');
  if(configureOnly)return {test_portal_configured:true,live_changes:0};
  const fixture=JSON.parse(fs.readFileSync(path.join(customerDirectory,'test-journey-state-private.json'),'utf8')),email=fixture.accounts?.active?.email;
  if(!/^[a-z0-9.+_-]+@example\.(com|org|net)$/.test(email??''))throw Error('existing_reserved_test_customer_required');
  await ctx.call('/preview/access',{method:'POST',operator:true});await ctx.call('/api/v3/session');
  const link=(await ctx.call('/preview/test-login',{method:'POST',operator:true,body:{email}})).data.dev_link;await ctx.call(link);
  const session=(await ctx.call('/api/v3/session')).data;if(!session.signed_in||session.access.tier!=='pro'||!session.access.cancel_at_period_end)throw Error('existing_cancelled_paid_through_test_customer_required');
  const portal=(await ctx.call('/api/v3/billing/portal',{method:'POST'})).data;if(!portal.url?.startsWith('https://billing.stripe.com/'))throw Error('native_test_portal_failed');
  await ctx.call('/api/v3/session/logout',{method:'POST'});if((await ctx.call('/api/v3/session')).data.signed_in)throw Error('native_logout_failed');
  const report={schema:'findpitches-v3-test-portal-verification-v1',as_of:new Date().toISOString(),test_portal_configured:true,native_owner_portal_passed:true,scheduled_cancellation_retains_access:true,logout_revocation_passed:true,new_customer_accounts:0,new_subscriptions:0,live_changes:0,real_charges:0};
  fs.writeFileSync(path.join(customerDirectory,'portal-report.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const a=process.argv.slice(2),get=k=>a[a.indexOf(k)+1];try{console.log(JSON.stringify(await verifyCustomerPortal({credentialsFile:get('--credentials'),customerDirectory:get('--customer-dir'),configureOnly:a.includes('--configure-only')})));}catch(e){console.error(/^[a-z0-9_]+$/.test(e.message)?e.message:'test_portal_verification_failed');process.exitCode=1;}}
