import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {cloudflareClient,readCredentials,proxyFetch} from './cloudflare-api.mjs';
import {openRemoteD1} from './remote-d1.mjs';
import {hash,stableJson} from '../../platform/findpitches-v3/contract.mjs';
import {CITY} from '../../platform/findpitches-v3/acquisition.mjs';

export async function verifyLegacyPreservation({credentialsFile,stateDirectory,baselineFile}) {
  const state=JSON.parse(fs.readFileSync(path.join(stateDirectory,'resources.json'))),baseline=JSON.parse(fs.readFileSync(baselineFile));
  if(!Array.isArray(baseline.records)||!baseline.records.length||!Array.isArray(baseline.facts)||!baseline.facts.length)throw Error('nonempty_immutable_source_baseline_required');
  const secrets=JSON.parse(fs.readFileSync(path.join(stateDirectory,'worker-secrets.json')));
  const db=await openRemoteD1(cloudflareClient(readCredentials(credentialsFile)),state),fetcher=proxyFetch();
  let mutations=0,recordsVerified=0,factsVerified=0;
  for(let i=0;i<baseline.records.length;i+=50) {
    const part=baseline.records.slice(i,i+50),ids=part.map(row=>row.id),marks=ids.map(()=>'?').join(',');
    const [receipts,facts]=await Promise.all([
      db.prepare(`SELECT id,producer_record_id,content_hash,raw_json,normalized_json,received_at FROM producer_records WHERE id IN (${marks})`).bind(...ids).all(),
      db.prepare(`SELECT record_id,field_name,value_json FROM source_facts WHERE record_id IN (${marks}) ORDER BY record_id,field_name`).bind(...ids).all(),
    ]);
    for(const original of part) {
      const current=receipts.results.find(row=>row.id===original.id);
      if(!current||stableJson(current)!==stableJson(original)||await hash(current.raw_json)!==current.content_hash)mutations++;
      else recordsVerified++;
    }
    const expected=baseline.facts.filter(row=>ids.includes(row.record_id));
    if(stableJson(expected)!==stableJson(facts.results))mutations++;
    else factsVerified+=expected.length;
  }
  async function call(role,route,body,token=secrets.V3_OPERATOR_TOKEN) {
    const response=await fetcher(state.urls[role]+route,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(60000)});
    return {status:response.status,body:await response.json()};
  }
  const fixture=JSON.parse(fs.readFileSync(new URL('../../tests/findpitches-v3/fixtures/structured-control-100.json',import.meta.url))).records;
  const receipts=(await db.prepare("SELECT id,producer_record_id FROM producer_records WHERE producer_name='independent-structured' AND environment='test'").all()).results;
  const byId=new Map(receipts.map(row=>[row.producer_record_id,row.id]));
  const recordIds=fixture.map(record=>byId.get(record.opportunity_id??record.producer_record_id));
  if(recordIds.some(id=>!id))throw Error('deployed_structured_control_receipts_required');
  const control=await call('api','/control',{records:fixture,record_ids:recordIds});
  const status=await call('api','/status');
  if(status.status!==200||status.body.serper.bulk_enabled||status.body.publication_enabled)throw Error('shadow_guards_required_before_probes');
  const bulk=await call('acquisition','/acquisition',{city:CITY.id,query_limit:1});
  const canary=await call('acquisition','/acquisition/canary',{run_id:crypto.randomUUID()});
  const ingestOnly=await call('ingest','/legacy/refetch',{url:'https://example.org/'},secrets.V3_INGEST_TOKEN);
  const unsafe=await call('ingest','/legacy/refetch',{url:'https://127.0.0.1/'});
  const publication=await call('api','/v1/opportunities');
  const guards={publication_http:publication.status,bulk_http:bulk.status,bulk_error:bulk.body.error,
    ungranted_canary_http:canary.status,ingest_only_operator_route_http:ingestOnly.status,unsafe_source_reason:unsafe.body.reason};
  if(mutations||control.status!==200||control.body.destructive_mutations!==0||status.status!==200
    ||status.body.customer_rows||status.body.publication_rows||status.body.publication_enabled||status.body.serper.bulk_enabled
    ||publication.status!==403||bulk.status!==400||bulk.body.error!=='city_acquisition_disabled'
    ||canary.status!==400||canary.body.error!=='one_shot_canary_not_authorized'||ingestOnly.status!==401||unsafe.body.reason!=='unsafe_original_source_url')throw Error('legacy_preservation_or_boundary_check_failed');
  return {schema:'findpitches-legacy-preservation-audit-v1',as_of:new Date().toISOString(),original_live_records_verified:recordsVerified,
    original_live_source_fields_verified:factsVerified,destructive_source_mutations:mutations,control:control.body,guards,
    v3_serper_queries_completed:status.body.provider_queries_completed,serper:status.body.serper,
    customer_rows:status.body.customer_rows,publication_rows:status.body.publication_rows,publication_enabled:false,bulk_enabled:false,
    original_live_baseline_hash:await hash(baseline),paid_search_queries_issued_by_validation:0};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2),get=name=>args[args.indexOf(name)+1];
  try {const report=await verifyLegacyPreservation({credentialsFile:get('--credentials'),stateDirectory:get('--state-dir'),baselineFile:get('--baseline')});fs.writeFileSync(get('--out'),JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(JSON.stringify({live_records:report.original_live_records_verified,live_fields:report.original_live_source_fields_verified,control_records:report.control.tested_records,mutations:report.destructive_source_mutations,paid_searches:0}));}
  catch {console.error('legacy_preservation_verification_failed');process.exitCode=1;}
}
