import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCredentials,cloudflareClient,proxyFetch } from './cloudflare-api.mjs';
import { normalizeExport } from '../../platform/findpitches-v3/contract.mjs';

export async function validateRemote({credentialsFile,stateDirectory,inputFile}) {
  const state=JSON.parse(fs.readFileSync(path.join(stateDirectory,'resources.json'),'utf8')),secrets=JSON.parse(fs.readFileSync(path.join(stateDirectory,'worker-secrets.json'),'utf8'));
  const api=cloudflareClient(readCredentials(credentialsFile)),fetcher=proxyFetch();
  if(state.account_id!==api.account||!state.urls||!state.database_id)throw new Error('provisioned_v3_state_required');
  const payload=JSON.parse(fs.readFileSync(inputFile,'utf8')),records=payload.records??payload,recordIds=[];
  if(records.length!==100)throw new Error('100_record_control_required');
  async function call(role,route,body,token=secrets.V3_OPERATOR_TOKEN) {
    const response=await fetcher(state.urls[role]+route,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(60000)});
    const result=await response.json();if(!response.ok)throw new Error('remote_'+role+'_http_'+response.status);return result;
  }
  for(const role of Object.keys(state.urls)){const health=await call(role,'/health');if(health.publication_enabled!==false||health.mode!=='shadow')throw new Error('remote_health_scope_failed');}
  const batch=async parts=>{const results=[];for(let i=0;i<parts.length;i+=10)results.push(await call('ingest','/imports',{environment:'test',records:parts.slice(i,i+10)},secrets.V3_INGEST_TOKEN));return results;};
  for(const result of await batch(records)){if(result.rejected)throw new Error('remote_structured_import_rejected');recordIds.push(...result.record_ids);}
  const query=async(text,params=[])=>{
    const result=await api.accountRequest('/d1/database/'+state.database_id+'/query',{method:'POST',body:{sql:text,params}});return result[0].results;
  };
  const marks=recordIds.map(()=>'?').join(',');
  const deadline=Date.now()+300000;let entities=[];
  while(Date.now()<deadline) {
    entities=await query(`SELECT er.record_id,e.id FROM entity_records er JOIN entities e ON e.id=er.entity_id JOIN readiness r ON r.entity_id=e.id AND r.entity_revision=e.revision WHERE er.record_id IN (${marks})`,recordIds);
    if(entities.length===100)break;
    for(const role of ['reconcile','eligibility','enrichment','readiness'])await call(role,'/tick',{limit:10});
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  if(entities.length!==100)throw new Error('remote_pipeline_control_incomplete');
  const byId=new Map(entities.map(e=>[e.record_id,e.id]));
  for(let i=0;i<recordIds.length;i++) {
    const recordId=recordIds[i],baseline=normalizeExport(records[i],{environment:'test'}).normalized;
    const proposals=Object.entries({event_name:'Generic vendor application page',organiser:null,location:'restriction, or other reasons',application_url:'https://www.eventeny.com/events/applications/'}).filter(([field])=>baseline[field]!==null&&baseline[field]!==undefined).map(([field,value])=>({field,value,kind:'extracted_page',source_url:'https://www.eventeny.com/events/applications/',excerpt:'Generic page extraction must not replace precise producer-backed facts'}));
    await call('enrichment','/proposals',{entity_id:byId.get(recordId),proposals});
  }
  const report=await call('api','/control',{records,record_ids:recordIds});
  const replay=await batch(records);
  if(replay.reduce((n,r)=>n+r.inserted,0)!==0||report.destructive_mutations!==0||report.customer_projection_rows!==0||report.publication_rows!==0)throw new Error('remote_preservation_failed');
  const publication=await fetcher(state.urls.api+'/v1/opportunities');if(publication.status!==403)throw new Error('remote_publication_gate_failed');
  const result={...report,replay_duplicates:replay.reduce((n,r)=>n+r.duplicates,0),status:await call('api','/status')};
  fs.writeFileSync(path.join(stateDirectory,'remote-control-report.json'),JSON.stringify(result,null,2)+'\n',{mode:0o600});return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2),get=name=>args.includes(name)?args[args.indexOf(name)+1]:null;
  try{console.log(JSON.stringify(await validateRemote({credentialsFile:get('--credentials'),stateDirectory:get('--state-dir'),inputFile:get('--input')??fileURLToPath(new URL('../../tests/findpitches-v3/fixtures/structured-control-100.json',import.meta.url))}),null,2));}
  catch(error){console.error(error.message);process.exitCode=1;}
}
