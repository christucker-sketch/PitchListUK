// Release code only to an existing V3 source Worker. Configuration comes from
// its active version, never a restored draft. No provisioning or migrations.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createRequire} from 'node:module';import {spawnSync} from 'node:child_process';import {isDeepStrictEqual} from 'node:util';
import {shadowContext} from './shadow-context.mjs';import {readCredentials} from './cloudflare-api.mjs';
const ROOT=fileURLToPath(new URL('../../',import.meta.url)),ROLES=['ingest','reconcile','eligibility','enrichment','readiness','watch','api'];
const sorted=bindings=>[...bindings].sort((a,b)=>a.name.localeCompare(b.name));
export function sourceReleaseConfig(version,{role,databaseId}){
 if(!ROLES.includes(role)||!version?.resources?.script_runtime||!Array.isArray(version.resources.bindings))throw Error('owned_source_worker_required');
 const b=version.resources.bindings,variable=name=>b.find(x=>x.name===name)?.text;
 if(variable('V3_ROLE')!==role||variable('V3_CITY_ENABLED')!=='false'||variable('V3_DAILY_QUERY_LIMIT')!=='1000'||b.filter(x=>x.type==='d1').length!==1||!b.some(x=>x.name==='FINDPITCHES_V3_DB'&&x.type==='d1'&&x.id===databaseId)||b.some(x=>!['plain_text','secret_text','d1','r2_bucket','queue'].includes(x.type)))throw Error('source_binding_scope_required');
 const runtime=version.resources.script_runtime;
 return {name:'findpitches-v3-'+role+'-shadow',main:path.join(ROOT,'platform/findpitches-v3/worker.mjs'),compatibility_date:runtime.compatibility_date,...runtime.compatibility_flags?{compatibility_flags:runtime.compatibility_flags}:{},...runtime.limits?{limits:runtime.limits}:{},
  vars:Object.fromEntries(b.filter(x=>x.type==='plain_text').map(x=>[x.name,x.text])),keep_vars:true,
  d1_databases:[{binding:'FINDPITCHES_V3_DB',database_id:databaseId,database_name:'findpitches-v3-shadow'}],
  r2_buckets:b.filter(x=>x.type==='r2_bucket').map(x=>({binding:x.name,bucket_name:x.bucket_name,...x.jurisdiction?{jurisdiction:x.jurisdiction}:{}})),
  queues:{producers:b.filter(x=>x.type==='queue').map(x=>({binding:x.name,queue:x.queue_name,...x.delivery_delay?{delivery_delay:x.delivery_delay}:{}}))}};
}
export async function releaseSourceWorker({credentialsFile,stateDirectory,outputDirectory,role}){
 const ctx=await shadowContext({credentialsFile,stateDirectory}),endpoint='/workers/scripts/findpitches-v3-'+role+'-shadow';if(!ROLES.includes(role))throw Error('owned_source_worker_required');
 const safety=await ctx.db.prepare('SELECT (SELECT publication_enabled FROM runtime_policy WHERE id=1) publication,(SELECT bulk_enabled FROM serper_policy WHERE id=1) bulk,(SELECT manual_paused FROM commercial_acquisition_policy WHERE id=1) paused,(SELECT COUNT(*) FROM customer_projections)+(SELECT COUNT(*) FROM publication_queue) leakage').first();if(safety.publication||safety.bulk||safety.paused!==1||safety.leakage)throw Error('paused_source_scope_required');
 const deployments=await ctx.api.accountRequest(endpoint+'/deployments'),prior=deployments.deployments[0];if(prior.versions.length!==1||prior.versions[0].percentage!==100)throw Error('single_source_version_required');
 const activeId=prior.versions[0].version_id,version=await ctx.api.accountRequest(endpoint+'/versions/'+activeId),settings=await ctx.api.accountRequest(endpoint+'/settings'),schedules=await ctx.api.accountRequest(endpoint+'/schedules'),config=sourceReleaseConfig(version,{role,databaseId:ctx.state.database_id});
 fs.mkdirSync(outputDirectory,{recursive:true,mode:0o700});const save=(name,value)=>fs.writeFileSync(path.join(outputDirectory,name),JSON.stringify(value,null,2)+'\n',{mode:0o600});save('before-private.json',{prior,version,settings,schedules});save('release.jsonc',config);
 const credentials=readCredentials(credentialsFile),require=createRequire(process.env.V3_TOOLING_ROOT?path.join(process.env.V3_TOOLING_ROOT,'package.json'):import.meta.url),wrangler=path.join(path.dirname(require.resolve('wrangler/package.json')),'bin/wrangler.js'),file=path.join(outputDirectory,'release.jsonc');
 const run=(label,args)=>{const result=spawnSync(process.execPath,[wrangler,...args],{env:{...process.env,...credentials,WRANGLER_SEND_METRICS:'false'},encoding:'utf8',timeout:180000});let log=(result.stdout??'')+(result.stderr??'');for(const value of Object.values(credentials))log=log.split(value).join('[redacted]');fs.writeFileSync(path.join(outputDirectory,label+'.log'),log,{mode:0o600});if(result.error||result.status!==0)throw Error('source_'+label+'_failed');return log;};
 run('bundle',['versions','upload','--dry-run','--config',file,'--outdir',path.join(outputDirectory,'bundle')]);
 const uploaded=run('upload',['versions','upload','--keep-vars','--config',file]),id=uploaded.match(/Worker Version ID:\s*([a-f0-9-]{36})/i)?.[1];if(!id)throw Error('uploaded_source_version_required');
 const candidate=await ctx.api.accountRequest(endpoint+'/versions/'+id);if(!isDeepStrictEqual(sorted(version.resources.bindings),sorted(candidate.resources.bindings))||!isDeepStrictEqual(version.resources.script_runtime,candidate.resources.script_runtime))throw Error('source_candidate_native_config_changed');
 const current=await ctx.api.accountRequest(endpoint+'/deployments');if(!isDeepStrictEqual(current.deployments[0].versions,prior.versions))throw Error('source_active_version_changed');
 let activating=false;
 try{activating=true;run('activate',['versions','deploy',id+'@100%','--yes','--config',file]);const after=await ctx.api.accountRequest(endpoint+'/settings'),afterSchedules=await ctx.api.accountRequest(endpoint+'/schedules'),deployed=await ctx.api.accountRequest(endpoint+'/deployments');
  if(deployed.deployments[0].versions.length!==1||deployed.deployments[0].versions[0].version_id!==id||deployed.deployments[0].versions[0].percentage!==100||!isDeepStrictEqual(schedules,afterSchedules)||!isDeepStrictEqual(sorted(version.resources.bindings),sorted(after.bindings)))throw Error('source_deployed_config_changed');
  const omit=({bindings,annotations,...s})=>s;if(!isDeepStrictEqual(omit(settings),omit(after)))throw Error('source_script_settings_changed');
  const report={as_of:new Date().toISOString(),worker:config.name,version_id:id,previous_version_id:activeId,deployment_id:deployed.deployments[0].id,bindings_and_runtime_preserved:true,schedules_and_settings_preserved:true,secret_values_replaced:false,migrations:0,customer_or_legacy_changes:0};save('release-report.json',report);return report;
 }catch(e){if(activating)run('rollback',['versions','deploy',activeId+'@100%','--yes','--config',file]);throw e;}
}
