// Code/assets only for the existing restricted preview. No provisioning,
// migrations, secret replacement, route, schedule or production changes.
import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';import {isDeepStrictEqual} from 'node:util';
import {cloudflareClient,readCredentials} from './cloudflare-api.mjs';
const ROOT=fileURLToPath(new URL('../../',import.meta.url)),NAME='findpitches-v3-customer-preview';
export function previewReleaseConfig(before,state,schedules) {
 const binding=n=>before.bindings.find(b=>b.name===n);
 if(state.worker!==NAME||state.database_name!==NAME||binding('V3_CUSTOMER_MODE')?.text!=='restricted_shadow_preview'||binding('V3_CUSTOMER_DB')?.id!==state.database_id||binding('V3_READY_API')?.service!=='findpitches-v3-api-shadow')throw Error('existing_restricted_preview_required');
 if(before.bindings.some(b=>!['plain_text','secret_text','d1','service','assets'].includes(b.type)))throw Error('unhandled_preview_binding');
 return {name:NAME,main:path.join(ROOT,'platform/findpitches-v3/customer-worker.mjs'),compatibility_date:before.compatibility_date,compatibility_flags:before.compatibility_flags,limits:before.limits,logpush:before.logpush,tail_consumers:before.tail_consumers,tags:before.tags,
  assets:{directory:path.join(ROOT,'web/findpitches-v3-web/public'),binding:'ASSETS',run_worker_first:true,html_handling:'none',not_found_handling:'none'},
  d1_databases:[{binding:'V3_CUSTOMER_DB',database_id:state.database_id,database_name:NAME}],
  services:[{binding:'V3_READY_API',service:'findpitches-v3-api-shadow'}],triggers:{crons:schedules.map(s=>s.cron)},
  vars:Object.fromEntries(before.bindings.filter(b=>b.type==='plain_text').map(b=>[b.name,b.text])),keep_vars:true};
}
export async function releaseCustomerPreview({credentialsFile,customerDirectory,outputDirectory}) {
 const credentials=readCredentials(credentialsFile),api=cloudflareClient(credentials),state=JSON.parse(fs.readFileSync(path.join(customerDirectory,'resources.json'))),endpoint='/workers/scripts/'+NAME;
 if(state.account_id!==api.account)throw Error('owned_account_required');const database=await api.accountRequest('/d1/database/'+state.database_id);if(database.name!==NAME)throw Error('owned_preview_database_required');
 const before=await api.accountRequest(endpoint+'/settings'),schedule=await api.accountRequest(endpoint+'/schedules'),deployments=await api.accountRequest(endpoint+'/deployments');
 const prior=deployments.deployments[0].versions;if(prior.length!==1||prior[0].percentage!==100)throw Error('single_preview_version_required');
 const config=previewReleaseConfig(before,state,schedule.schedules);fs.mkdirSync(outputDirectory,{recursive:true,mode:0o700});
 fs.writeFileSync(path.join(outputDirectory,'preview-before-private.json'),JSON.stringify({before,schedule,prior}),{mode:0o600});
 const configFile=path.join(outputDirectory,'preview-release.jsonc');fs.writeFileSync(configFile,JSON.stringify(config),{mode:0o600});
 const require=createRequire(import.meta.url),wrangler=path.join(path.dirname(require.resolve('wrangler/package.json')),'bin/wrangler.js');
 const run=(name,args)=>{const r=spawnSync(process.execPath,[wrangler,...args],{env:{...process.env,...credentials,WRANGLER_SEND_METRICS:'false'},encoding:'utf8',timeout:240000});let output=(r.stdout||'')+(r.stderr||'');for(const value of Object.values(credentials))if(typeof value==='string'&&value)output=output.split(value).join('[redacted]');fs.writeFileSync(path.join(outputDirectory,name+'.log'),output,{mode:0o600});if(r.status!==0||r.error)throw Error(name+'_failed');return output;};
 run('preview-bundle',['versions','upload','--dry-run','--config',configFile,'--outdir',path.join(outputDirectory,'preview-bundle')]);
 const output=run('preview-upload',['versions','upload','--keep-vars','--config',configFile]),version=output.match(/Worker Version ID:\s*([a-f0-9-]{36})/i)?.[1];if(!version)throw Error('uploaded_preview_version_required');
 const uploaded=await api.accountRequest(endpoint+'/versions/'+version),sort=items=>[...items].sort((a,b)=>a.name.localeCompare(b.name));if(!isDeepStrictEqual(sort(before.bindings),sort(uploaded.resources.bindings)))throw Error('preview_bindings_changed');
 try{run('preview-deploy',['versions','deploy',version+'@100%','--yes','--config',configFile]);
  const after=await api.accountRequest(endpoint+'/settings'),afterSchedule=await api.accountRequest(endpoint+'/schedules');
  if(!isDeepStrictEqual(sort(before.bindings),sort(after.bindings))||!isDeepStrictEqual(schedule,afterSchedule))throw Error('preview_native_configuration_changed');
  const report={as_of:new Date().toISOString(),worker:NAME,version_id:version,previous_version_id:prior[0].version_id,bindings_preserved:true,schedules_preserved:true,migrations:0,secret_values_replaced:false,production_changes:0};fs.writeFileSync(path.join(outputDirectory,'preview-release.json'),JSON.stringify(report,null,2),{mode:0o600});return report;
 }catch(e){run('preview-rollback',['versions','deploy',prior[0].version_id+'@100%','--yes','--config',configFile]);throw e;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const a=process.argv.slice(2),get=k=>a[a.indexOf(k)+1];try{console.log(JSON.stringify(await releaseCustomerPreview({credentialsFile:get('--credentials'),customerDirectory:get('--customer-dir'),outputDirectory:get('--output-dir')})));}catch(e){console.error(/^[a-z_]+$/.test(e.message)?e.message:'preview_release_failed');process.exitCode=1;}}
