// Operators may redeploy only owned V3 shadow scripts; no V2 or live routes.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { cloudflareClient,readCredentials } from './cloudflare-api.mjs';
import { openRemoteD1 } from './remote-d1.mjs';

export async function workerAdmin({credentialsFile,stateDirectory,role}) {
  if(!['ingest','reconcile','eligibility','enrichment','readiness','acquisition','watch','api'].includes(role))throw new Error('v3_role_required');
  const credentials=readCredentials(credentialsFile),api=cloudflareClient(credentials),state=JSON.parse(fs.readFileSync(path.join(stateDirectory,'resources.json'),'utf8'));
  const db=await openRemoteD1(api,state),config=JSON.parse(fs.readFileSync(path.join(stateDirectory,role+'.jsonc'),'utf8')),name='findpitches-v3-'+role+'-shadow';
  if(config.name!==name||!state.workers.includes(name)||config.routes?.length||config.d1_databases.length!==1||config.d1_databases[0].database_id!==state.database_id||config.vars.V3_CITY_ENABLED!=='false'||config.vars.V3_DAILY_QUERY_LIMIT!=='0')throw new Error('owned_shadow_worker_required');
  const settings=await api.accountRequest('/workers/scripts/'+name+'/settings'),bindings=settings.bindings.filter(b=>b.type==='d1');
  if(bindings.length!==1||bindings[0].id!==state.database_id)throw new Error('deployed_v3_binding_required');
  const require=createRequire(process.env.V3_TOOLING_ROOT?path.join(process.env.V3_TOOLING_ROOT,'package.json'):import.meta.url),wrangler=path.join(path.dirname(require.resolve('wrangler/package.json')),'bin/wrangler.js');
  function command(label,args) {
    const result=spawnSync(process.execPath,[wrangler,...args],{env:{...process.env,...credentials,WRANGLER_SEND_METRICS:'false'},encoding:'utf8',timeout:180000});
    const output=((result.stdout??'')+(result.stderr??'')).split(credentials.CLOUDFLARE_API_TOKEN).join('[redacted]');
    fs.writeFileSync(path.join(stateDirectory,label+'.log'),output,{mode:0o600});
    if(result.error||result.status!==0)throw new Error(label.replaceAll('-','_')+'_failed');
  }
  async function deploy({canaryRunId='',expiresAt=''}={}) {
    if(canaryRunId&&(role!=='acquisition'||!/^canary_[a-f0-9-]{36}$/.test(canaryRunId)||!Number.isFinite(Date.parse(expiresAt))||Date.parse(expiresAt)-Date.now()>600000))throw new Error('bounded_canary_grant_required');
    const generated={...config,vars:{...config.vars,V3_CANARY_RUN_ID:canaryRunId,V3_CANARY_EXPIRES_AT:expiresAt}};
    const file=path.join(stateDirectory,role+'-operator.jsonc');fs.writeFileSync(file,JSON.stringify(generated,null,2)+'\n',{mode:0o600});
    command('operator-bundle-'+role,['deploy','--dry-run','--config',file,'--outdir',path.join(stateDirectory,'operator-bundles',role)]);
    command('operator-deploy-'+role,['deploy','--config',file]);
  }
  async function installSerper(key) {
    if(role!=='acquisition'||typeof key!=='string'||key.length<20||key.length>256||/\s/.test(key))throw new Error('secure_serper_key_required');
    await api.accountRequest('/workers/scripts/'+name+'/secrets',{method:'PUT',body:{name:'SERPER_API_KEY',type:'secret_text',text:key}});
  }
  const hasSerper=settings.bindings.some(b=>b.type==='secret_text'&&b.name==='SERPER_API_KEY');
  return {api,state,db,deploy,installSerper,hasSerper};
}
