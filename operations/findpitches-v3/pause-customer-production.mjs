// D-014 rollback: close new Checkout first, then browsing/indexability. Keep
// FindPitches routes, LIVE storage, signing keys, auth and Portal/cancellation.
import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';import {isDeepStrictEqual} from 'node:util';
import {cloudflareClient,readCredentials,proxyFetch} from './cloudflare-api.mjs';
const WORKER='findpitches-v3-customer-production',FLAGS=['V3_CHECKOUT_ENABLED','V3_PUBLIC_ENABLED','V3_ACCOUNT_RECOVERY_ENABLED'];
export function recoverySettings(before,changes) {
  if(Object.keys(changes).some(n=>!FLAGS.includes(n))||Object.entries(changes).some(([n,v])=>n==='V3_CHECKOUT_ENABLED'?v!=='disabled':v!==(n==='V3_PUBLIC_ENABLED'?'false':'true')))throw Error('close_only_flags_required');
  for(const n of Object.keys(changes))if(!before.bindings?.some(b=>b.name===n&&b.type==='plain_text'))throw Error('production_flag_missing');
  return {annotations:Object.fromEntries(Object.entries(before.annotations??{}).filter(([k])=>k!=='workers/triggered_by')),bindings:before.bindings.map(b=>Object.hasOwn(changes,b.name)?{name:b.name,type:'plain_text',text:changes[b.name]}:{name:b.name,type:'inherit',version_id:'latest'})};
}
export function assertRecoveryPreserved(before,after,changes) {
  if(before.bindings.length!==after.bindings.length)throw Error('production_binding_count_changed');
  for(const b of before.bindings){const expected=Object.hasOwn(changes,b.name)?{...b,text:changes[b.name]}:b;if(!isDeepStrictEqual(expected,after.bindings.find(v=>v.name===b.name)))throw Error('unrelated_production_binding_changed');}
  // Cloudflare recomputes the version's actor on an API settings update.
  // Preserve user annotations; only this generated actor is allowed to change.
  const annotations=s=>Object.fromEntries(Object.entries(s.annotations??{}).filter(([k])=>k!=='workers/triggered_by'));
  if(!isDeepStrictEqual(annotations(before),annotations(after)))throw Error('production_user_annotation_changed');
  for(const k of Object.keys(before).filter(k=>!['bindings','annotations'].includes(k)))if(!isDeepStrictEqual(before[k],after[k]))throw Error('unrelated_production_setting_changed');
}
export async function pauseCustomerProduction({credentialsFile,productionDirectory,fetcher=proxyFetch()}) {
  const credentials=readCredentials(credentialsFile),api=cloudflareClient(credentials,{fetcher}),state=JSON.parse(fs.readFileSync(path.join(productionDirectory,'resources.json')));
  if(state.account_id!==api.account||state.worker!==WORKER||state.database_name!==WORKER)throw Error('owned_production_required');
  const database=await api.accountRequest('/d1/database/'+state.database_id);if(database.name!==WORKER)throw Error('isolated_live_database_required');
  const runtime=await api.accountRequest('/d1/database/'+state.database_id+'/query',{method:'POST',body:{sql:'SELECT mode,schema_version FROM customer_runtime WHERE id=1',params:[]}});
  if(!runtime[0]?.success||runtime[0].results[0]?.mode!=='production_public'||runtime[0].results[0]?.schema_version!==1)throw Error('live_runtime_schema_required');
  const record={requested_at:new Date().toISOString(),worker:WORKER,stages:[]},file=path.join(productionDirectory,'pause-private.json'),save=()=>fs.writeFileSync(file,JSON.stringify(record,null,2)+'\n',{mode:0o600});save();
  for(const changes of [{V3_CHECKOUT_ENABLED:'disabled'},{V3_PUBLIC_ENABLED:'false',V3_ACCOUNT_RECOVERY_ENABLED:'true'}]) {
    const endpoint='/workers/scripts/'+WORKER, before=await api.accountRequest(endpoint+'/settings');
    if(before.bindings.find(b=>b.name==='V3_CUSTOMER_DB')?.id!==state.database_id||before.bindings.find(b=>b.name==='V3_CUSTOMER_MODE')?.text!=='production_public'||before.bindings.find(b=>b.name==='V3_STRIPE_MODE')?.text!=='live'||!['STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET','V3_SESSION_SECRET'].every(n=>before.bindings.some(b=>b.name===n&&b.type==='secret_text')))throw Error('live_binding_custody_required');
    const stage={changes,before,started_at:new Date().toISOString()};record.stages.push(stage);save();
    if(Object.entries(changes).some(([n,v])=>before.bindings.find(b=>b.name===n)?.text!==v)) {
      const deployed=await api.accountRequest(endpoint+'/deployments'),versions=await api.accountRequest(endpoint+'/versions'),active=deployed.deployments?.[0]?.versions,latest=(versions.items??versions.versions??versions)[0];
      if(active?.length!==1||active[0].percentage!==100||latest.id!==active[0].version_id)throw Error('single_current_production_version_required');
      const {FormData}=createRequire(import.meta.url)('undici'),form=new FormData();form.set('settings',new Blob([JSON.stringify(recoverySettings(before,changes))],{type:'application/json'}),'settings.json');
      const r=await fetcher('https://api.cloudflare.com/client/v4/accounts/'+api.account+endpoint+'/settings',{method:'PATCH',headers:{Authorization:'Bearer '+credentials.CLOUDFLARE_API_TOKEN},body:form,signal:AbortSignal.timeout(30000)}),body=await r.json();
      if(!r.ok||!body.success)throw Error('production_pause_patch_failed');
    }
    let after;for(let i=0;i<10;i++){after=await api.accountRequest(endpoint+'/settings');if(Object.entries(changes).every(([n,v])=>after.bindings.find(b=>b.name===n)?.text===v))break;await new Promise(resolve=>setTimeout(resolve,1000));}
    assertRecoveryPreserved(before,after,changes);stage.completed_at=new Date().toISOString();save();
  }
  record.completed_at=new Date().toISOString();save();return {as_of:record.completed_at,worker:WORKER,checkout_enabled:false,public_enabled:false,account_recovery_enabled:true,unrelated_settings_preserved:true,routes_changed:false,live_storage_and_secrets_preserved:true,customers_deleted:0,pitchlist_changed:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const a=process.argv.slice(2),get=n=>a[a.indexOf(n)+1];try{if(!a.includes('--pause'))throw Error('explicit_pause_action_required');console.log(JSON.stringify(await pauseCustomerProduction({credentialsFile:get('--credentials'),productionDirectory:get('--production-dir')})));}catch(e){console.error(/^[a-z_]+$/.test(e.message)?e.message:'production_pause_failed');process.exitCode=1;}}
