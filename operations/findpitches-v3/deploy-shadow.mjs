import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { provision } from './provision.mjs';
import { readCredentials,cloudflareClient } from './cloudflare-api.mjs';

const directory=fileURLToPath(new URL('.',import.meta.url)),root=path.resolve(directory,'../..');
export async function deployShadow({credentialsFile,stateDirectory}) {
  const credentials=readCredentials(credentialsFile),api=cloudflareClient(credentials);
  const require=createRequire(process.env.V3_TOOLING_ROOT?path.join(process.env.V3_TOOLING_ROOT,'package.json'):import.meta.url);
  const wrangler=path.join(path.dirname(require.resolve('wrangler/package.json')),'bin/wrangler.js');
  const env={...process.env,...credentials,WRANGLER_SEND_METRICS:'false'};
  function command(label,args,secretValues=[]) {
    const result=spawnSync(process.execPath,args,{cwd:root,env,encoding:'utf8',timeout:300000});
    let output=(result.stdout??'')+(result.stderr??'');
    for(const value of [credentials.CLOUDFLARE_API_TOKEN,...secretValues])if(value)output=output.split(value).join('[redacted]');
    if(fs.existsSync(stateDirectory))fs.writeFileSync(path.join(stateDirectory,label+'.log'),output,{mode:0o600});
    if(result.error||result.status!==0)throw new Error(label+'_failed');
  }
  // Finish local validation before the first Cloudflare mutation.
  command('boundaries',[path.join(directory,'verify-boundaries.mjs')]);
  command('tests',['--test',...fs.readdirSync(path.join(root,'tests/findpitches-v3')).filter(n=>n.endsWith('.test.mjs')).map(n=>path.join(root,'tests/findpitches-v3',n))]);
  for(const role of ['ingest','reconcile','eligibility','enrichment','readiness','acquisition','watch','api'])command('bundle-'+role,[wrangler,'deploy','--dry-run','--config',path.join(directory,'cloudflare',role+'.jsonc'),'--outdir',path.join(stateDirectory,'bundles',role)]);
  const resources=await provision({credentialsFile,stateDirectory,apply:true,client:api});
  const stateFile=path.join(stateDirectory,'resources.json'),state=JSON.parse(fs.readFileSync(stateFile,'utf8'));
  command('migrations',[wrangler,'d1','migrations','apply','findpitches-v3-shadow','--remote','--config',path.join(stateDirectory,'api.jsonc')]);
  const secretsFile=path.join(stateDirectory,'worker-secrets.json');
  const secrets=fs.existsSync(secretsFile)?JSON.parse(fs.readFileSync(secretsFile,'utf8')):{V3_INGEST_TOKEN:crypto.randomUUID()+crypto.randomUUID(),V3_OPERATOR_TOKEN:crypto.randomUUID()+crypto.randomUUID()};
  fs.writeFileSync(secretsFile,JSON.stringify(secrets),{mode:0o600});
  for(const role of ['reconcile','eligibility','enrichment','readiness','watch','acquisition','api','ingest']) {
    const config=path.join(stateDirectory,role+'.jsonc'),name='findpitches-v3-'+role+'-shadow';
    // Inventory was checked before provisioning. Persist creation intent for safe resumption.
    if(!state.workers.includes(name)){state.workers.push(name);fs.writeFileSync(stateFile,JSON.stringify(state,null,2)+'\n',{mode:0o600});}
    command('deploy-'+role,[wrangler,'deploy','--config',config]);
    const roleSecrets=role==='ingest'?secrets:{V3_OPERATOR_TOKEN:secrets.V3_OPERATOR_TOKEN};
    const roleFile=path.join(stateDirectory,'secrets-'+role+'.json');fs.writeFileSync(roleFile,JSON.stringify(roleSecrets),{mode:0o600});
    command('secrets-'+role,[wrangler,'secret','bulk',roleFile,'--config',config],Object.values(secrets));
  }
  const subdomain=(await api.accountRequest('/workers/subdomain')).subdomain;
  state.urls=Object.fromEntries(state.workers.map(name=>[name.replace('findpitches-v3-','').replace('-shadow',''),'https://'+name+'.'+subdomain+'.workers.dev']));
  fs.writeFileSync(stateFile,JSON.stringify(state,null,2)+'\n',{mode:0o600});
  return {...resources,urls:state.urls,publication_enabled:false,city_enabled:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2),get=name=>args[args.indexOf(name)+1];
  if(!args.includes('--credentials')||!args.includes('--state-dir'))throw new Error('credentials_and_state_dir_required');
  try {console.log(JSON.stringify(await deployShadow({credentialsFile:get('--credentials'),stateDirectory:get('--state-dir')}),null,2));}
  catch(error){console.error(error.message);process.exitCode=1;}
}
