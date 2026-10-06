import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cloudflareClient,readCredentials,proxyFetch } from './cloudflare-api.mjs';
import { openRemoteD1 } from './remote-d1.mjs';
import { deliverExport,fetchRechecks,acknowledgeDeliveredRechecks } from './producer-delivery.mjs';
import { FIELDS,normalizeExport,stableJson } from '../../platform/findpitches-v3/contract.mjs';

export async function validateProducerRoundtrip({credentialsFile,stateDirectory,inputFile}) {
  const state=JSON.parse(fs.readFileSync(path.join(stateDirectory,'resources.json'),'utf8')),secrets=JSON.parse(fs.readFileSync(path.join(stateDirectory,'worker-secrets.json'),'utf8'));
  const api=cloudflareClient(readCredentials(credentialsFile)),db=await openRemoteD1(api,state),fetcher=proxyFetch(),sql=(q,...p)=>db.prepare(q).bind(...p);
  const gate=await sql("SELECT name FROM quality_gates WHERE name='structured-100-preservation' AND tested_records=100 AND destructive_mutations=0").first();if(!gate)throw new Error('remote_preservation_gate_required');
  const input=JSON.parse(fs.readFileSync(inputFile,'utf8')),source=input.records[0],baseline=normalizeExport(source).normalized;
  const canaryFile=path.join(stateDirectory,'shadow-source-canary.jsonl');fs.writeFileSync(canaryFile,JSON.stringify(source)+'\n',{mode:0o600});
  const started=Date.now(),delivery=await deliverExport({inputFile:canaryFile,ingestUrl:state.urls.ingest,token:secrets.V3_INGEST_TOKEN,checkpointFile:path.join(stateDirectory,'delivery-shadow-canary.json'),fetcher});
  const deadline=Date.now()+120000;let entity;
  while(Date.now()<deadline) {
    entity=await sql(`SELECT e.id,e.revision,r.status FROM producer_records p JOIN entity_records er ON er.record_id=p.id JOIN entities e ON e.id=er.entity_id JOIN readiness r ON r.entity_id=e.id AND r.entity_revision=e.revision
      WHERE p.producer_name='independent-structured' AND p.environment='shadow' AND p.producer_record_id=? LIMIT 1`,source.opportunity_id).first();
    if(entity)break;await new Promise(resolve=>setTimeout(resolve,1000));
  }
  if(!entity)throw new Error('automatic_delivery_pipeline_incomplete');
  const completed=Date.now(),facts=(await sql('SELECT field_name,value_json FROM selected_facts WHERE entity_id=?',entity.id).all()).results;
  const fields=Object.fromEntries(facts.map(f=>[f.field_name,JSON.parse(f.value_json)]));
  const changed=FIELDS.filter(f=>baseline[f]!==null&&baseline[f]!==undefined&&stableJson(baseline[f])!==stableJson(fields[f]));if(changed.length)throw new Error('shadow_canary_source_field_mutation');
  async function call(role,route,body,token=secrets.V3_OPERATOR_TOKEN) {
    const response=await fetcher(state.urls[role]+route,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw new Error('producer_roundtrip_http_'+response.status);return response.json();
  }
  const shadow=await call('api','/shadow?environment=shadow&limit=100');if(!shadow.items.some(i=>i.id===entity.id&&i.shadow_only===true&&i.promotion_eligible===false&&i.publication_eligible===false))throw new Error('shadow_canary_projection_failed');
  const probe='v3_probe_watch_'+crypto.randomUUID(),now=new Date().toISOString();
  await sql("INSERT INTO jobs(id,stage,dedupe_key,payload_json,available_at,created_at,updated_at) VALUES (?,'watch',?,?,?,?,?)",probe,probe,JSON.stringify({entity_id:entity.id,diagnostic:true}),now,now,now).run();
  await call('watch','/tick',{limit:1});
  const requests=await fetchRechecks({ingestUrl:state.urls.ingest,token:secrets.V3_INGEST_TOKEN,fetcher}),request=requests.find(r=>r.entity_id===entity.id&&r.producer_record_id===source.opportunity_id);
  if(!request)throw new Error('producer_recheck_not_addressable');
  const oldExport=await acknowledgeDeliveredRechecks({requests:[request],delivery,token:secrets.V3_INGEST_TOKEN,fetcher});
  if(oldExport.acknowledged!==0)throw new Error('stale_export_acknowledged');
  const directAck=await call('ingest','/rechecks/ack',{entity_id:request.entity_id,requested_at:request.requested_at},secrets.V3_INGEST_TOKEN);
  if(directAck.acknowledged!==false)throw new Error('server_accepted_stale_export_ack');
  const leakage=await sql('SELECT (SELECT COUNT(*) FROM customer_projections) AS customer_rows,(SELECT COUNT(*) FROM publication_queue) AS publication_rows').first();
  if(leakage.customer_rows||leakage.publication_rows)throw new Error('shadow_canary_leakage');
  const result={checked_at:new Date().toISOString(),producer_record_id:source.opportunity_id,entity_id:entity.id,environment:'shadow',readiness:entity.status,
    delivery:{accepted:delivery.accepted,inserted:delivery.inserted,duplicates:delivery.duplicates},automatic_pipeline_without_operator_ticks:true,pipeline_elapsed_ms:completed-started,
    destructive_mutations:changed.length,recheck:{producer_addressable:true,client_rejects_stale_ack:true,server_rejects_stale_ack:true,pending_fresh_producer_export:true},...leakage};
  fs.writeFileSync(path.join(stateDirectory,'producer-roundtrip-report.json'),JSON.stringify(result,null,2)+'\n',{mode:0o600});return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2),get=name=>args.includes(name)?args[args.indexOf(name)+1]:null;
  try{console.log(JSON.stringify(await validateProducerRoundtrip({credentialsFile:get('--credentials'),stateDirectory:get('--state-dir'),inputFile:get('--input')??fileURLToPath(new URL('../../tests/findpitches-v3/fixtures/structured-control-100.json',import.meta.url))}),null,2));}
  catch(error){console.error(error.message);process.exitCode=1;}
}
