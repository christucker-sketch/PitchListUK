import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cloudflareClient,readCredentials,proxyFetch } from './cloudflare-api.mjs';
import {openRemoteD1} from './remote-d1.mjs';

export async function auditResources({credentialsFile,stateDirectory}) {
  const state=JSON.parse(fs.readFileSync(path.join(stateDirectory,'resources.json'),'utf8')),api=cloudflareClient(readCredentials(credentialsFile)),fetcher=proxyFetch();
  if(api.account!==state.account_id)throw new Error('cloudflare_account_mismatch');
  const roles=['ingest','reconcile','eligibility','enrichment','readiness','acquisition','watch','api'],workers=[];
  for(const role of roles) {
    const name='findpitches-v3-'+role+'-shadow';
    const [settings,schedule,response]=await Promise.all([api.accountRequest('/workers/scripts/'+name+'/settings'),api.accountRequest('/workers/scripts/'+name+'/schedules'),fetcher(state.urls[role]+'/health')]);
    const health=await response.json(),bindings=settings.bindings??[],databases=bindings.filter(b=>b.type==='d1');
    if(response.status!==200||health.role!==role||health.mode!=='shadow'||health.publication_enabled!==false)throw new Error('worker_health_failed_'+role);
    if(databases.length!==1||databases[0].name!=='FINDPITCHES_V3_DB'||databases[0].id!==state.database_id)throw new Error('worker_database_boundary_failed_'+role);
    const variables=Object.fromEntries(bindings.filter(b=>b.type==='plain_text'&&['V3_ROLE','V3_CITY_ENABLED','V3_DAILY_QUERY_LIMIT','V3_CANARY_RUN_ID','V3_CANARY_EXPIRES_AT'].includes(b.name)).map(b=>[b.name,b.text]));
    if(variables.V3_ROLE!==role||variables.V3_CITY_ENABLED!=='false'||variables.V3_DAILY_QUERY_LIMIT!=='1000')throw new Error('worker_safe_defaults_failed_'+role);
    if(variables.V3_CANARY_RUN_ID||variables.V3_CANARY_EXPIRES_AT)throw new Error('active_canary_grant_'+role);
    const queueBindings=bindings.filter(b=>b.type==='queue');
    if(queueBindings.some(b=>!b.queue_name?.startsWith('findpitches-v3-')||b.queue_name.includes('publication')))throw new Error('worker_queue_boundary_failed_'+role);
    const expected=JSON.parse(fs.readFileSync(new URL('./cloudflare/'+role+'.jsonc',import.meta.url),'utf8'));
    const crons=(schedule.schedules??[]).map(s=>s.cron).sort();
    if(JSON.stringify(crons)!==JSON.stringify([...(expected.triggers?.crons??[])].sort()))throw new Error('worker_cron_failed_'+role);
    workers.push({name,url:state.urls[role],database_id:databases[0].id,queue_bindings:queueBindings.map(b=>({name:b.name,queue_name:b.queue_name})),crons,health});
  }
  const queues=[];
  for(const [name,id] of Object.entries(state.queues)) {
    const [queue,consumers]=await Promise.all([api.accountRequest('/queues/'+id),api.accountRequest('/queues/'+id+'/consumers')]);
    if(queue.queue_name!==name)throw new Error('queue_identity_failed');
    if(name.includes('publication')&&(consumers.length||(queue.producers??[]).length))throw new Error('publication_queue_bound');
    const role=name.replace('findpitches-v3-','').replace('-shadow','');
    if(['reconcile','eligibility','enrichment','readiness','acquisition','watch'].includes(role)) {
      if(queue.settings?.delivery_paused===true)throw new Error('queue_delivery_paused_'+role);
      if(consumers.length!==1||consumers[0].script!=='findpitches-v3-'+role+'-shadow'||consumers[0].dead_letter_queue!=='findpitches-v3-dead-shadow'||consumers[0].settings.max_retries!==3||consumers[0].settings.max_concurrency!==1)throw new Error('queue_consumer_recovery_failed_'+role);
    } else if(consumers.length)throw new Error('reserved_queue_has_consumer');
    queues.push({name,id,delivery_paused:queue.settings?.delivery_paused??false,consumers:consumers.map(c=>({type:c.type,script:c.script??null,dead_letter_queue:c.dead_letter_queue??null,settings:c.settings})),producer_count:(queue.producers??[]).length});
  }
  const database=await api.accountRequest('/d1/database/'+state.database_id);
  if(database.name!=='findpitches-v3-shadow')throw new Error('database_name_failed');
  const db=await openRemoteD1(api,state),policy=await db.prepare('SELECT * FROM serper_policy WHERE id=1').first();
  if(!policy||policy.bulk_enabled!==0||policy.max_queries_per_day!==1000||policy.max_credits_per_day!==1000||policy.max_queries_per_hour!==100||policy.max_queries_per_run!==4)throw Error('serper_shadow_budget_policy_failed');
  const result={checked_at:new Date().toISOString(),database:{id:state.database_id,name:database.name},workers,queues,serper_policy:policy,publication_enabled:false,city_enabled:false};
  fs.writeFileSync(path.join(stateDirectory,'resource-audit.json'),JSON.stringify(result,null,2)+'\n',{mode:0o600});return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2),get=name=>args[args.indexOf(name)+1];
  try{console.log(JSON.stringify(await auditResources({credentialsFile:get('--credentials'),stateDirectory:get('--state-dir')}),null,2));}
  catch(error){console.error(error.message);process.exitCode=1;}
}
