// The only permitted legacy mutation is a reversible acquisition-only stop.
// No V1/V2 script, data, routes, schedule, secret or publication setting is changed.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {cloudflareClient,readCredentials,proxyFetch} from './cloudflare-api.mjs';

export const LEGACY_PAID_SCRIPT='findpitches-global-acquisition-shadow';
export const LEGACY_STOP_FLAGS=['GLOBAL_ACQUISITION_EXECUTION_ENABLED','GLOBAL_CONTROLLER_CUTOVER_ENABLED','GLOBAL_UK_CONTROLLER_CUTOVER_ENABLED','GLOBAL_CA_CONTROLLER_CUTOVER_ENABLED'];
export function stopSettings(before,latestVersion) {
  for(const name of LEGACY_STOP_FLAGS)if(!before.bindings?.some(b=>b.name===name&&b.type==='plain_text'))throw Error('legacy_stop_binding_missing');
  return {exports:{ControllerStateDurableObject:{type:'durable-object',storage:'sqlite'},UkControllerStateDurableObject:{type:'durable-object',storage:'sqlite'},CaControllerStateDurableObject:{type:'durable-object',storage:'sqlite'}},
    annotations:{'workers/message':'V3 commercial preparation: stop legacy paid acquisition; preserve code, state and publication'},
    bindings:before.bindings.map(b=>LEGACY_STOP_FLAGS.includes(b.name)?{name:b.name,type:'plain_text',text:'false'}:{name:b.name,type:'inherit',version_id:latestVersion})};
}
export function assertStopPreserved(before,after) {
  if(before.bindings.length!==after.bindings.length)throw Error('legacy_binding_count_changed');
  for(const binding of before.bindings) {
    const next=after.bindings.find(b=>b.name===binding.name);
    if(LEGACY_STOP_FLAGS.includes(binding.name)) {if(next?.type!=='plain_text'||next.text!=='false')throw Error('legacy_stop_not_enforced');}
    else if(!isDeepStrictEqual(binding,next))throw Error('unrelated_legacy_binding_changed');
  }
  for(const key of Object.keys(before).filter(k=>!['bindings','annotations'].includes(k)))if(!isDeepStrictEqual(before[key],after[key]))throw Error('unrelated_legacy_setting_changed');
}
export async function auditLegacyPaid(api) {
  const [settings,schedules,deployments,instances]=await Promise.all([
    api.accountRequest('/workers/scripts/'+LEGACY_PAID_SCRIPT+'/settings'),
    api.accountRequest('/workers/scripts/'+LEGACY_PAID_SCRIPT+'/schedules'),
    api.accountRequest('/workers/scripts/'+LEGACY_PAID_SCRIPT+'/deployments'),
    api.accountRequest('/workflows/'+LEGACY_PAID_SCRIPT+'/instances?per_page=100&page=1')
  ]);
  const flags=Object.fromEntries(settings.bindings.filter(b=>LEGACY_STOP_FLAGS.includes(b.name)).map(b=>[b.name,b.type==='plain_text'?b.text:'invalid_type']));
  const active=(Array.isArray(instances)?instances:instances.instances??[]).filter(i=>['queued','running','waiting','waitingForPause'].includes(i.status)).map(i=>({id:i.id,status:i.status}));
  return {settings,schedules,deployments,flags,active_recent_workflows:active,all_flags_disabled:LEGACY_STOP_FLAGS.every(n=>flags[n]==='false'),workflow_observation_scope:'Most recent 100 instances; not proof of no older in-flight workflows or external/Pi spend.'};
}
export async function auditLegacyWorkflowHistory(api,{maxPages=50}={}) {
  const active=[];let inspected=0;
  for(let page=1;page<=maxPages;page++) {
    const result=await api.accountRequest('/workflows/'+LEGACY_PAID_SCRIPT+'/instances?per_page=100&page='+page),instances=Array.isArray(result)?result:result.instances??[];
    inspected+=instances.length;
    active.push(...instances.filter(i=>['queued','running','waiting','waitingForPause'].includes(i.status)).map(i=>({id:i.id,status:i.status})));
    if(instances.length<100)return {instances_inspected:inspected,active_workflows:active,complete:true};
  }
  return {instances_inspected:inspected,active_workflows:active,complete:false};
}
export async function stopLegacyPaid({api,credentials,fetcher=proxyFetch(),stateDirectory}) {
  const before=await auditLegacyPaid(api),record={requested_at:new Date().toISOString(),before};
  const save=()=>fs.writeFileSync(path.join(stateDirectory,'legacy-all-paid-stop-private.json'),JSON.stringify(record,null,2)+'\n',{mode:0o600});save();
  const scriptPath='/workers/scripts/'+LEGACY_PAID_SCRIPT;
  async function codeHash() {
    const response=await fetcher('https://api.cloudflare.com/client/v4/accounts/'+api.account+scriptPath,{headers:{Authorization:'Bearer '+credentials.CLOUDFLARE_API_TOKEN},signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw Error('legacy_code_read_failed');
    if((response.headers.get('content-type')??'').includes('multipart/')) {
      const form=await response.formData(),parts=[];
      for(const [name,value] of form)if(/\.(?:js|mjs|wasm|html|txt|bin)$/.test(name))parts.push([name,createHash('sha256').update(typeof value==='string'?value:new Uint8Array(await value.arrayBuffer())).digest('hex')]);
      if(!parts.length)throw Error('legacy_code_parts_missing');
      return createHash('sha256').update(JSON.stringify(parts.sort((a,b)=>a[0].localeCompare(b[0])))).digest('hex');
    }
    return createHash('sha256').update(new Uint8Array(await response.arrayBuffer())).digest('hex');
  }
  record.code_hash_before=await codeHash();save();
  if(!before.all_flags_disabled) {
    const active=before.deployments.deployments?.[0]?.versions;
    if(active?.length!==1||active[0].percentage!==100)throw Error('single_active_legacy_version_required');
    const versions=await api.accountRequest(scriptPath+'/versions'),latest=(versions.items??versions.versions??versions)[0];
    if(latest.id!==active[0].version_id)throw Error('latest_legacy_version_not_deployed');
    const {FormData}=createRequire(import.meta.url)('undici'),form=new FormData();
    form.set('settings',new Blob([JSON.stringify(stopSettings(before.settings,'latest'))],{type:'application/json'}),'settings.json');
    const response=await fetcher('https://api.cloudflare.com/client/v4/accounts/'+api.account+scriptPath+'/settings',{method:'PATCH',headers:{Authorization:'Bearer '+credentials.CLOUDFLARE_API_TOKEN},body:form,signal:AbortSignal.timeout(30000)});
    const result=await response.json();if(!response.ok||!result.success)throw Error('legacy_stop_patch_failed_'+response.status);
    record.patch_completed_at=new Date().toISOString();save();
  }
  record.after=await auditLegacyPaid(api);save();
  for(let attempt=0;!record.after.all_flags_disabled&&attempt<10;attempt++) {
    await new Promise(resolve=>setTimeout(resolve,2000));
    record.after=await auditLegacyPaid(api);save();
  }
  assertStopPreserved(before.settings,record.after.settings);
  if(!isDeepStrictEqual(before.schedules,record.after.schedules))throw Error('legacy_schedule_changed');
  record.code_hash_after=await codeHash();save();
  if(record.code_hash_before!==record.code_hash_after)throw Error('legacy_code_changed');
  record.completed_at=new Date().toISOString();save();
  return {completed_at:record.completed_at,script:LEGACY_PAID_SCRIPT,flags:record.after.flags,code_unchanged:true,unrelated_bindings_preserved:true,schedules_unchanged:true,active_recent_workflows:record.after.active_recent_workflows,workflow_observation_scope:record.after.workflow_observation_scope,
    account_wide_lock:false,external_paid_clients:'Independent/Pi and other externally held Serper credentials are outside this Worker stop; paid acquisition remains blocked until accounted for.'};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2),get=n=>args[args.indexOf(n)+1];
  try {
    if(!args.includes('--credentials')||!args.includes('--state-dir'))throw Error('credentials_and_state_directory_required');
    const credentials=readCredentials(get('--credentials')),api=cloudflareClient(credentials);
    const result=args.includes('--apply-stop')?await stopLegacyPaid({api,credentials,stateDirectory:get('--state-dir')}):await auditLegacyPaid(api);
    console.log(JSON.stringify(args.includes('--apply-stop')?result:{flags:result.flags,all_flags_disabled:result.all_flags_disabled,active_recent_workflows:result.active_recent_workflows,workflow_observation_scope:result.workflow_observation_scope},null,2));
  }catch(error){console.error(/^[a-z][a-z0-9_]+$/.test(error.message)?error.message:'legacy_paid_safety_failed');process.exitCode=1;}
}
