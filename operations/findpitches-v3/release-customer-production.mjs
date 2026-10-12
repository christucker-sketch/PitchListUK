// Release code to the already-launched, owned V3 service with new Checkout
// closed. Preserve native configuration, secrets, routes and customer storage.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {cloudflareClient,readCredentials,proxyFetch} from './cloudflare-api.mjs';
import {productionConfig} from './deploy-customer-production.mjs';
import {assertOwnedRoutes} from './launch-customer-public.mjs';
import {assertRecoveryPreserved,pauseCustomerProduction} from './pause-customer-production.mjs';

const NAME='findpitches-v3-customer-production',ZONE='917f3fc02ac6a173d8cc32075c2f8d93';
export function customerSafeReleaseConfig({before,state,routes,schedules}) {
  const binding=n=>before.bindings.find(b=>b.name===n),plain=n=>binding(n)?.text;
  if(state.worker!==NAME||state.database_name!==NAME||binding('V3_CUSTOMER_DB')?.id!==state.database_id||binding('V3_READY_API')?.service!=='findpitches-v3-api-shadow'||plain('V3_CUSTOMER_MODE')!=='production_public'||plain('V3_STRIPE_MODE')!=='live')throw Error('owned_live_runtime_required');
  if(plain('V3_CHECKOUT_ENABLED')!=='disabled'||plain('V3_ACCOUNT_RECOVERY_ENABLED')!=='true'||!['true','false'].includes(plain('V3_PUBLIC_ENABLED')))throw Error('checkout_closed_recovery_enabled_required');
  if(!['STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET','V3_EMAIL_API_KEY','V3_SESSION_SECRET','V3_PRODUCTION_OPERATOR_TOKEN','V3_STAGING_TOKEN'].every(n=>binding(n)?.type==='secret_text'))throw Error('existing_native_secrets_required');
  assertOwnedRoutes(routes);if(routes.length!==2)throw Error('exact_existing_routes_required');
  if(schedules.length!==1||schedules[0].cron!=='*/5 * * * *')throw Error('existing_customer_schedule_required');
  const config=productionConfig({databaseId:state.database_id});
  config.vars=Object.fromEntries(before.bindings.filter(b=>b.type==='plain_text').map(b=>[b.name,b.text]));
  // Version uploads/deployments leave routes and schedules untouched. Do not
  // give the uploader a route declaration that a regular deploy could apply.
  delete config.routes;
  config.compatibility_date=before.compatibility_date;
  config.compatibility_flags=before.compatibility_flags;
  config.limits=before.limits;
  config.logpush=before.logpush;
  config.tail_consumers=before.tail_consumers;
  config.tags=before.tags;
  config.triggers={crons:schedules.map(s=>s.cron)};
  config.keep_vars=true;
  return config;
}

export async function releaseCustomerProduction({credentialsFile,productionDirectory}) {
  const credentials=readCredentials(credentialsFile),fetcher=proxyFetch(),api=cloudflareClient(credentials,{fetcher});
  const read=n=>JSON.parse(fs.readFileSync(path.join(productionDirectory,n))),state=read('resources.json'),plan=read('routing-plan.json');
  if(state.account_id!==api.account||state.worker!==NAME||state.database_name!==NAME||plan.zone_id!==ZONE)throw Error('owned_production_required');
  const database=await api.accountRequest('/d1/database/'+state.database_id);if(database.name!==NAME)throw Error('isolated_production_required');
  const runtime=await api.accountRequest('/d1/database/'+state.database_id+'/query',{method:'POST',body:{sql:'SELECT mode,schema_version FROM customer_runtime WHERE id=1',params:[]}});
  if(runtime[0]?.results[0]?.mode!=='production_public'||runtime[0].results[0].schema_version!==1)throw Error('live_schema_required');
  const endpoint='/workers/scripts/'+NAME,before=await api.accountRequest(endpoint+'/settings'),routes=await api.request('/zones/'+ZONE+'/workers/routes'),schedule=await api.accountRequest(endpoint+'/schedules');
  const config=customerSafeReleaseConfig({before,state,routes,schedules:schedule.schedules});
  const pages=await api.accountRequest('/pages/projects/pitchlistuk'),dns=await api.request('/zones/'+ZONE+'/dns_records?type=CNAME');
  if(pages.canonical_deployment.id!==plan.protected_pages.deployment_id||!isDeepStrictEqual([...pages.domains].sort(),[...plan.protected_pages.domains].sort()))throw Error('protected_pages_baseline_changed');
  const deployed=await api.accountRequest(endpoint+'/deployments'),versions=await api.accountRequest(endpoint+'/versions'),active=deployed.deployments[0].versions,latest=(versions.items??versions.versions??versions)[0];
  if(active.length!==1||active[0].percentage!==100||active[0].version_id!==latest.id)throw Error('single_current_version_required');
  const journal={started_at:new Date().toISOString(),before_settings:before,routes_before:routes,previous_deployment_id:deployed.deployments[0].id,previous_version_id:active[0].version_id,completed:false};
  const journalFile=path.join(productionDirectory,'customer-release-private.json'),save=()=>fs.writeFileSync(journalFile,JSON.stringify(journal,null,2)+'\n',{mode:0o600});save();
  const configFile=path.join(productionDirectory,'customer-release.jsonc');fs.writeFileSync(configFile,JSON.stringify(config,null,2)+'\n',{mode:0o600});
  const require=createRequire(import.meta.url),wrangler=path.join(path.dirname(require.resolve('wrangler/package.json')),'bin/wrangler.js');
  const redact=[credentials.CLOUDFLARE_API_TOKEN,...Object.values(read('secrets-private.json'))].filter(v=>typeof v==='string'&&v);
  const run=(label,args)=>{const r=spawnSync(process.execPath,[wrangler,...args],{env:{...process.env,...credentials,WRANGLER_SEND_METRICS:'false'},encoding:'utf8',timeout:240000});let output=(r.stdout??'')+(r.stderr??'');for(const secret of redact)output=output.split(secret).join('[redacted]');fs.writeFileSync(path.join(productionDirectory,label+'.log'),output,{mode:0o600});if(r.error||r.status!==0)throw Error(label+'_failed');return output;};
  run('customer_release_bundle',['versions','upload','--dry-run','--config',configFile,'--outdir',path.join(productionDirectory,'customer-release-bundle')]);
  try {
    const annotations=[];if(Object.hasOwn(before.annotations??{},'workers/message'))annotations.push('--message',before.annotations['workers/message']);
    const output=run('customer_release_upload',['versions','upload','--keep-vars','--config',configFile,...annotations]),versionId=output.match(/Worker Version ID:\s*([a-f0-9-]{36})/i)?.[1];
    if(!versionId)throw Error('uploaded_version_id_required');
    const version=await api.accountRequest(endpoint+'/versions/'+versionId),sorted=bindings=>[...bindings].sort((a,b)=>a.name.localeCompare(b.name));
    if(!isDeepStrictEqual(sorted(before.bindings),sorted(version.resources.bindings)))throw Error('uploaded_bindings_changed');
    journal.uploaded_version_id=versionId;save();
    run('customer_release_deploy',['versions','deploy',versionId+'@100%','--yes','--config',configFile]);
    const after=await api.accountRequest(endpoint+'/settings');assertRecoveryPreserved(before,after,{});
    const afterRoutes=await api.request('/zones/'+ZONE+'/workers/routes');if(!isDeepStrictEqual(routes,afterRoutes))throw Error('existing_routes_changed');
    if(!isDeepStrictEqual(dns,await api.request('/zones/'+ZONE+'/dns_records?type=CNAME')))throw Error('existing_dns_changed');
    const afterSchedule=await api.accountRequest(endpoint+'/schedules');if(!isDeepStrictEqual(schedule.schedules.map(s=>s.cron),afterSchedule.schedules.map(s=>s.cron)))throw Error('customer_schedule_changed');
    const afterPages=await api.accountRequest('/pages/projects/pitchlistuk'),home=await fetcher('https://pitchlist.uk/',{signal:AbortSignal.timeout(30000)});
    if(afterPages.canonical_deployment.id!==pages.canonical_deployment.id||home.status!==200||!/pitchlist/i.test(await home.text()))throw Error('protected_pitchlist_changed');
    const result=await api.accountRequest(endpoint+'/deployments');if(result.deployments[0].versions.length!==1||result.deployments[0].versions[0].version_id!==versionId||result.deployments[0].versions[0].percentage!==100)throw Error('exact_uploaded_version_deployment_required');journal.completed=true;journal.completed_at=new Date().toISOString();save();
    return {as_of:journal.completed_at,worker:NAME,release_method:'version_upload_and_deploy',deployment_id:result.deployments[0].id,version_ids:result.deployments[0].versions.map(v=>v.version_id),checkout_enabled:false,public_enabled:config.vars.V3_PUBLIC_ENABLED==='true',account_recovery_enabled:true,all_native_bindings_and_settings_preserved:true,routes_unchanged:true,dns_unchanged:true,pitchlist_unchanged:true,database_migrations:0,secret_values_replaced:false,source_identity_writes:0};
  } catch(error) {
    journal.error=/^[a-z_]+$/.test(error.message)?error.message:'customer_release_failed';save();
    try{journal.pause=await pauseCustomerProduction({credentialsFile,productionDirectory,fetcher});save();}catch{journal.manual_pause_required=true;save();throw Error('release_failed_manual_pause_required');}
    throw Error('release_failed_customer_safe_pause_applied');
  }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const a=process.argv.slice(2),get=n=>a[a.indexOf(n)+1];try{console.log(JSON.stringify(await releaseCustomerProduction({credentialsFile:get('--credentials'),productionDirectory:get('--production-dir')})));}catch(e){console.error(/^[a-z_]+$/.test(e.message)?e.message:'customer_release_failed');process.exitCode=1;}}
