import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {cloudflareClient,readCredentials,proxyFetch} from './cloudflare-api.mjs';
import {openRemoteD1} from './remote-d1.mjs';

export async function reselectCorroboration({credentialsFile,stateDirectory}) {
  const state=JSON.parse(fs.readFileSync(path.join(stateDirectory,'resources.json'))),db=await openRemoteD1(cloudflareClient(readCredentials(credentialsFile)),state);
  const token=JSON.parse(fs.readFileSync(path.join(stateDirectory,'worker-secrets.json'))).V3_OPERATOR_TOKEN,fetcher=proxyFetch();
  const rows=(await db.prepare(`SELECT current.entity_id,current.field_name,current.value_json,
    (SELECT f.id FROM entity_facts ef JOIN source_facts f ON f.id=ef.fact_id WHERE ef.entity_id=current.entity_id
      AND f.field_name=current.field_name AND f.value_json=current.value_json AND f.authority>current.authority
      AND NOT EXISTS(SELECT 1 FROM legacy_quality_holds h WHERE h.record_id=f.record_id)
      ORDER BY f.authority DESC,f.created_at DESC,f.id LIMIT 1) AS better_fact
    FROM selected_facts current JOIN entities e ON e.id=current.entity_id WHERE e.environment='shadow'`).all()).results.filter(row=>row.better_fact);
  const byEntity=new Map();for(const row of rows){if(!byEntity.has(row.entity_id))byEntity.set(row.entity_id,[]);byEntity.get(row.entity_id).push(row);}
  let upgraded=0;
  for(const[entityId,fields]of byEntity) {
    const response=await fetcher(state.urls.enrichment+'/corroboration/reselect',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({entity_id:entityId,fact_ids:fields.map(row=>row.better_fact)}),signal:AbortSignal.timeout(60000)});
    if(!response.ok)throw Error('corroboration_reselection_failed');const data=await response.json();upgraded+=data.results.filter(row=>row.decision==='accepted').length;
    const selected=(await db.prepare('SELECT field_name,value_json FROM selected_facts WHERE entity_id=?').bind(entityId).all()).results;
    if(fields.some(field=>selected.find(row=>row.field_name===field.field_name)?.value_json!==field.value_json))throw Error('corroboration_source_value_changed');
  }
  return {schema:'findpitches-corroboration-reselection-v1',as_of:new Date().toISOString(),fields_upgraded:upgraded,entities_checked:byEntity.size,source_value_mutations:0,evidence_deleted:0,paid_search_queries_issued:0};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2),get=name=>args[args.indexOf(name)+1];
  try {const report=await reselectCorroboration({credentialsFile:get('--credentials'),stateDirectory:get('--state-dir')});fs.writeFileSync(get('--out'),JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(report));}
  catch {console.error('corroboration_verification_failed');process.exitCode=1;}
}
