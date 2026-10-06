import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCredentials,cloudflareClient } from './cloudflare-api.mjs';

const ROLES=['ingest','reconcile','eligibility','enrichment','readiness','acquisition','watch','api'];
const QUEUES=['reconcile','eligibility','enrichment','readiness','acquisition','watch','dead','publication'].map(s=>'findpitches-v3-'+s+'-shadow');
export async function provision({credentialsFile,stateDirectory,apply=false,client=null}) {
  if(!stateDirectory)throw new Error('state_directory_required');
  const api=client??cloudflareClient(readCredentials(credentialsFile));
  await api.request('/user/tokens/verify');
  const [databases,queuesResult,workers]=await Promise.all([api.accountRequest('/d1/database?per_page=100'),api.accountRequest('/queues?per_page=100'),api.accountRequest('/workers/scripts')]);
  const queues=Array.isArray(queuesResult)?queuesResult:queuesResult.queues??[];
  const stateFile=path.join(stateDirectory,'resources.json'),state=fs.existsSync(stateFile)?JSON.parse(fs.readFileSync(stateFile,'utf8')):{account_id:api.account,workers:[],queues:{}};
  if(state.account_id!==api.account)throw new Error('cloudflare_account_mismatch');
  const database=databases.find(d=>d.name==='findpitches-v3-shadow');
  if(database&&state.database_id!==database.uuid)throw new Error('existing_database_requires_ownership_review');
  for(const name of QUEUES){const q=queues.find(q=>q.queue_name===name);if(q&&state.queues[name]!==q.queue_id)throw new Error('existing_queue_requires_ownership_review');}
  for(const role of ROLES){const name='findpitches-v3-'+role+'-shadow';if(workers.some(w=>w.id===name)&&!state.workers.includes(name))throw new Error('existing_worker_requires_ownership_review');}
  if(!apply)return {verified:true,new_database:!database,new_queues:QUEUES.filter(n=>!state.queues[n]),workers:ROLES.map(r=>'findpitches-v3-'+r+'-shadow'),publication_enabled:false};
  fs.mkdirSync(stateDirectory,{recursive:true,mode:0o700});
  const save=()=>fs.writeFileSync(stateFile,JSON.stringify(state,null,2)+'\n',{mode:0o600});
  if(!database){const d=await api.accountRequest('/d1/database',{method:'POST',body:{name:'findpitches-v3-shadow'}});state.database_id=d.uuid;save();}
  for(const name of QUEUES)if(!state.queues[name]){const q=await api.accountRequest('/queues',{method:'POST',body:{queue_name:name}});state.queues[name]=q.queue_id;save();}
  const directory=path.dirname(fileURLToPath(import.meta.url));
  for(const role of ROLES){
    const config=JSON.parse(fs.readFileSync(path.join(directory,'cloudflare',role+'.jsonc'),'utf8'));
    config.account_id=api.account;config.d1_databases[0].database_id=state.database_id;
    config.main=path.resolve(directory,'../../platform/findpitches-v3/worker.mjs');config.d1_databases[0].migrations_dir=path.join(directory,'migrations');
    fs.writeFileSync(path.join(stateDirectory,role+'.jsonc'),JSON.stringify(config,null,2)+'\n',{mode:0o600});
  }
  return {verified:true,database_id:state.database_id,queues:QUEUES,configs:stateDirectory,publication_enabled:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2),get=name=>args[args.indexOf(name)+1];
  if(!args.includes('--credentials')||!args.includes('--state-dir'))throw new Error('credentials_and_state_dir_required');
  try{console.log(JSON.stringify(await provision({credentialsFile:get('--credentials'),stateDirectory:get('--state-dir'),apply:args.includes('--apply')}),null,2));}
  catch(error){console.error(error.message);process.exitCode=1;}
}
