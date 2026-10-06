import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cloudflareClient,readCredentials } from './cloudflare-api.mjs';
import { openRemoteD1 } from './remote-d1.mjs';
import { hash } from '../../platform/findpitches-v3/contract.mjs';

export async function remoteSnapshot({credentialsFile,stateDirectory,inputFile,environment='test'}) {
  if(!['test','shadow'].includes(environment))throw new Error('shadow_or_test_required');
  const input=JSON.parse(fs.readFileSync(inputFile,'utf8')),inputs=input.records??input;
  const state=JSON.parse(fs.readFileSync(path.join(stateDirectory,'resources.json'),'utf8')),api=cloudflareClient(readCredentials(credentialsFile)),db=await openRemoteD1(api,state),sql=(q,...p)=>db.prepare(q).bind(...p);
  const expected=new Map();for(const raw of inputs)expected.set(raw.opportunity_id??raw.producer_record_id,await hash(raw));
  const receipts=[];
  for(let offset=0;offset<inputs.length;offset+=90) {
    const ids=inputs.slice(offset,offset+90).map(r=>r.opportunity_id??r.producer_record_id),marks=ids.map(()=>'?').join(',');
    const rows=(await sql(`SELECT p.id,p.producer_record_id,p.content_hash,p.validation_status,p.received_at,er.entity_id,d.outcome AS identity,r.status AS readiness,
      (SELECT a.status FROM assessments a WHERE a.entity_id=er.entity_id ORDER BY a.assessed_at DESC LIMIT 1) AS eligibility
      FROM producer_records p LEFT JOIN entity_records er ON er.record_id=p.id LEFT JOIN reconciliation_decisions d ON d.record_id=p.id LEFT JOIN readiness r ON r.entity_id=er.entity_id
      WHERE p.producer_name='independent-structured' AND p.environment=? AND p.producer_record_id IN (${marks})`,environment,...ids).all()).results;
    receipts.push(...rows.filter(r=>r.content_hash===expected.get(r.producer_record_id)));
  }
  const fields=new Map(),entityIds=[...new Set(receipts.map(r=>r.entity_id).filter(Boolean))];
  for(let offset=0;offset<entityIds.length;offset+=90) {
    const ids=entityIds.slice(offset,offset+90),marks=ids.map(()=>'?').join(',');
    for(const fact of (await sql(`SELECT entity_id,field_name,value_json FROM selected_facts WHERE entity_id IN (${marks})`,...ids).all()).results) {
      if(!fields.has(fact.entity_id))fields.set(fact.entity_id,{});fields.get(fact.entity_id)[fact.field_name]=JSON.parse(fact.value_json);
    }
  }
  const byId=new Map(receipts.map(r=>[r.producer_record_id,r]));
  const records=inputs.map(raw=>{
    const id=raw.opportunity_id??raw.producer_record_id,row=byId.get(id);
    return row?{producer_record_id:id,input_hash:expected.get(id),validation:row.validation_status,entity_id:row.entity_id,identity:row.identity,eligibility:row.eligibility,readiness:row.readiness,fields:fields.get(row.entity_id)??{}}:{producer_record_id:id,input_hash:expected.get(id),validation:'not_processed'};
  });
  const queryCounts=await sql('SELECT COALESCE(SUM(queries_reserved),0) AS reserved,COALESCE(SUM(queries_completed),0) AS completed FROM acquisition_runs').first();
  const result={schema:'findpitches-shadow-evaluation-v1',implementation:'v3',runtime:'cloudflare',environment,as_of:new Date().toISOString(),inputs_hash:await hash(inputs),records,
    metrics:{elapsed_ms:null,provider_queries_reserved:queryCounts.reserved,provider_queries_completed:queryCounts.completed,provider_query_scope:'V3 database totals; not attributable to this dataset',total_cost_usd:null}};
  fs.writeFileSync(path.join(stateDirectory,'remote-snapshot-'+environment+'.json'),JSON.stringify(result,null,2)+'\n',{mode:0o600});return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2),get=name=>args.includes(name)?args[args.indexOf(name)+1]:null;
  try{const result=await remoteSnapshot({credentialsFile:get('--credentials'),stateDirectory:get('--state-dir'),inputFile:get('--input')??fileURLToPath(new URL('../../tests/findpitches-v3/fixtures/structured-control-100.json',import.meta.url)),environment:get('--environment')??'test'});console.log(JSON.stringify({runtime:result.runtime,records:result.records.length,input_hash:result.inputs_hash,as_of:result.as_of}));}
  catch(error){console.error(error.message);process.exitCode=1;}
}
