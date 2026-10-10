// Own isolated V3 resources only. No domain routes, live billing or publication.
import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {cloudflareClient,readCredentials} from './cloudflare-api.mjs';
import {mailCredentialIsProxyReference} from '../../platform/findpitches-v3/customer-mail.mjs';
const ROOT=fileURLToPath(new URL('../../',import.meta.url));
const NAME='findpitches-v3-customer-preview',DBNAME='findpitches-v3-customer-preview';
export async function deployCustomerPreview({credentialsFile,stateDirectory,customerDirectory}) {
  const credentials=readCredentials(credentialsFile),api=cloudflareClient(credentials),source=JSON.parse(fs.readFileSync(path.join(stateDirectory,'resources.json'),'utf8'));
  if(source.account_id!==api.account||!source.workers.includes('findpitches-v3-api-shadow'))throw Error('owned_v3_resource_state_required');
  const evidence=await api.accountRequest('/d1/database/'+source.database_id);if(evidence.name!=='findpitches-v3-shadow')throw Error('v3_shadow_database_required');
  fs.mkdirSync(customerDirectory,{recursive:true,mode:0o700});const resourceFile=path.join(customerDirectory,'resources.json');let state=fs.existsSync(resourceFile)?JSON.parse(fs.readFileSync(resourceFile,'utf8')):null;
  if(!state){const databases=await api.accountRequest('/d1/database');if(databases.some(d=>d.name===DBNAME))throw Error('existing_customer_database_requires_owned_state');
    const created=await api.accountRequest('/d1/database',{method:'POST',body:{name:DBNAME}});state={account_id:api.account,database_id:created.uuid,database_name:DBNAME,worker:NAME,source_api:'findpitches-v3-api-shadow',created_at:new Date().toISOString()};fs.writeFileSync(resourceFile,JSON.stringify(state,null,2)+'\n',{mode:0o600});}
  const target=await api.accountRequest('/d1/database/'+state.database_id);if(state.account_id!==api.account||target.name!==DBNAME||state.worker!==NAME||state.database_id===source.database_id)throw Error('isolated_customer_preview_required');
  const secretFile=path.join(customerDirectory,'secrets-private.json'),existing=JSON.parse(fs.readFileSync(path.join(stateDirectory,'worker-secrets.json'),'utf8'));
  let secrets=fs.existsSync(secretFile)?JSON.parse(fs.readFileSync(secretFile,'utf8')):{V3_SESSION_SECRET:crypto.randomUUID()+crypto.randomUUID(),V3_PREVIEW_OPERATOR_TOKEN:crypto.randomUUID()+crypto.randomUUID(),STRIPE_WEBHOOK_SECRET:'whsec_'+crypto.randomUUID()+crypto.randomUUID(),V3_STAGING_TOKEN:existing.V3_STAGING_TOKEN};
  if(!secrets.V3_STAGING_TOKEN||secrets.V3_STAGING_TOKEN!==existing.V3_STAGING_TOKEN)throw Error('source_projection_secret_mismatch');
  const stripeFile=path.join(customerDirectory,'stripe-test-private.json');let price=null,portalConfiguration=null;
  if(fs.existsSync(stripeFile)){const stripe=JSON.parse(fs.readFileSync(stripeFile,'utf8'));if(!stripe.STRIPE_SECRET_KEY?.startsWith('sk_test_')||!stripe.STRIPE_PRICE_ID?.startsWith('price_'))throw Error('stripe_test_credentials_required');secrets.STRIPE_SECRET_KEY=stripe.STRIPE_SECRET_KEY;price=stripe.STRIPE_PRICE_ID;portalConfiguration=stripe.STRIPE_PORTAL_CONFIGURATION_ID??null;}
  const mailFile=path.join(customerDirectory,'mail-private.json'),pendingMailFile=path.join(customerDirectory,'mail-pending.json');let sender=null;
  if(mailCredentialIsProxyReference(secrets.V3_EMAIL_API_KEY))delete secrets.V3_EMAIL_API_KEY;
  if(fs.existsSync(pendingMailFile)){const pending=JSON.parse(fs.readFileSync(pendingMailFile,'utf8'));if(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(pending.V3_EMAIL_FROM??''))sender=pending.V3_EMAIL_FROM;}
  if(fs.existsSync(mailFile)){const mail=JSON.parse(fs.readFileSync(mailFile,'utf8'));if(!mail.V3_EMAIL_API_KEY||mailCredentialIsProxyReference(mail.V3_EMAIL_API_KEY)||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail.V3_EMAIL_FROM??''))throw Error('raw_worker_mail_credential_required');secrets.V3_EMAIL_API_KEY=mail.V3_EMAIL_API_KEY;sender=mail.V3_EMAIL_FROM;}
  fs.writeFileSync(secretFile,JSON.stringify(secrets),{mode:0o600});
  const config={name:NAME,main:path.join(ROOT,'platform/findpitches-v3/customer-worker.mjs'),compatibility_date:'2026-10-01',workers_dev:true,preview_urls:false,routes:[],limits:{cpu_ms:30000},
    assets:{directory:path.join(ROOT,'web/findpitches-v3-web/public'),binding:'ASSETS',run_worker_first:true,html_handling:'none',not_found_handling:'none'},
    d1_databases:[{binding:'V3_CUSTOMER_DB',database_name:DBNAME,database_id:state.database_id,migrations_dir:path.join(ROOT,'operations/findpitches-v3/customer-migrations')}],
    services:[{binding:'V3_READY_API',service:'findpitches-v3-api-shadow'}],triggers:{crons:['*/5 * * * *']},
    vars:{V3_CUSTOMER_MODE:'restricted_shadow_preview',V3_STRIPE_MODE:price?'test':'unconfigured',V3_CHECKOUT_ENABLED:price?'test':'disabled',...(price?{STRIPE_PRICE_ID:price}:{}),...(portalConfiguration?{STRIPE_PORTAL_CONFIGURATION_ID:portalConfiguration}:{}),...(sender?{V3_EMAIL_FROM:sender}:{})}};
  const configFile=path.join(customerDirectory,'wrangler.jsonc');fs.writeFileSync(configFile,JSON.stringify(config,null,2)+'\n',{mode:0o600});
  const require=createRequire(import.meta.url),wrangler=path.join(path.dirname(require.resolve('wrangler/package.json')),'bin/wrangler.js');
  const run=(label,args)=>{const r=spawnSync(process.execPath,[wrangler,...args],{env:{...process.env,...credentials,WRANGLER_SEND_METRICS:'false'},encoding:'utf8',timeout:180000});let output=(r.stdout??'')+(r.stderr??'');for(const value of [credentials.CLOUDFLARE_API_TOKEN,...Object.values(secrets)])output=output.split(value).join('[redacted]');fs.writeFileSync(path.join(customerDirectory,label+'.log'),output,{mode:0o600});if(r.error||r.status!==0)throw Error(label+'_failed');};
  run('customer_bundle',['deploy','--dry-run','--config',configFile,'--outdir',path.join(customerDirectory,'bundle')]);
  run('customer_migrate',['d1','migrations','apply',DBNAME,'--remote','--config',configFile]);
  run('customer_deploy',['deploy','--config',configFile]);
  for(const [name,text] of Object.entries(secrets))await api.accountRequest('/workers/scripts/'+NAME+'/secrets',{method:'PUT',body:{name,type:'secret_text',text}});
  const deployed=await api.accountRequest('/workers/scripts/'+NAME+'/settings'),bindings=deployed.bindings;
  if(bindings.filter(b=>b.type==='d1').length!==1||bindings.find(b=>b.name==='V3_CUSTOMER_DB')?.id!==state.database_id||bindings.find(b=>b.name==='V3_READY_API')?.service!=='findpitches-v3-api-shadow')throw Error('customer_binding_verification_failed');
  const subdomain=await api.accountRequest('/workers/subdomain');state.url='https://'+NAME+'.'+subdomain.subdomain+'.workers.dev';state.deployed_at=new Date().toISOString();fs.writeFileSync(resourceFile,JSON.stringify(state,null,2)+'\n',{mode:0o600});
  return {worker:NAME,database:DBNAME,url:state.url,publication_enabled:false,production_cutover_enabled:false,billing_mode:config.vars.V3_STRIPE_MODE,email_sender_configured:Boolean(sender),email_credential_written:Boolean(secrets.V3_EMAIL_API_KEY),native_email_verification_required:true};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2),get=k=>args[args.indexOf(k)+1];try{console.log(JSON.stringify(await deployCustomerPreview({credentialsFile:get('--credentials'),stateDirectory:get('--state-dir'),customerDirectory:get('--customer-dir')})));}catch(e){console.error(/^[a-z_]+$/.test(e.message)?e.message:'customer_preview_deploy_failed');process.exitCode=1;}
}
