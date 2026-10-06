// Adapt an already captured historical audit. Unobserved columns stay unobserved.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hash,normalizeExport,stableJson } from '../../platform/findpitches-v3/contract.mjs';

export async function pilotSnapshot({captureFile,datasetDirectory}) {
  const read=file=>JSON.parse(fs.readFileSync(file,'utf8')),capture=read(captureFile),manifest=read(path.join(datasetDirectory,'manifest.json'));
  if(!capture.read_only||!capture.historical_audit||capture.records_hash!==await hash(capture.records)||capture.as_of!==manifest.as_of)throw new Error('verified_historical_pilot_capture_required');
  const inputs=read(path.join(datasetDirectory,'inputs.json')).records;
  if(manifest.inputs_hash!==await hash(inputs))throw new Error('evaluation_manifest_mismatch');
  const rows=new Map(capture.records.map(r=>[r.producer_id,r]));
  if(rows.size!==manifest.records.length||manifest.records.some(r=>!rows.has(r.producer_record_id)))throw new Error('pilot_dataset_ids_differ');
  for(const raw of inputs) {
    const value=normalizeExport(raw,{environment:'test'}).normalized,row=rows.get(raw.opportunity_id??raw.producer_record_id);
    if(!value||!row)throw new Error('pilot_source_baseline_mismatch');
    for(const field of ['event_name','organiser','location','event_start','event_end','application_deadline','canonical_url','application_url','application_state'])if(stableJson(value[field])!==stableJson(row['baseline_'+field]))throw new Error('pilot_source_baseline_mismatch');
    for(const field of ['evidence','provenance'])if(stableJson(value[field])!==stableJson(JSON.parse(row['baseline_'+field+'_json']??'[]')))throw new Error('pilot_source_baseline_mismatch');
  }
  const records=manifest.records.map(input=>{
    const row=rows.get(input.producer_record_id);
    return {producer_record_id:input.producer_record_id,input_hash:input.input_hash,validation:'accepted',entity_id:row.candidate_id,
      identity:'pilot_candidate_inserted',eligibility:row.after_status==='validated'?'eligible':row.after_status,
      readiness:null,observed_fields:['event_name','organiser','application_url'],
      fields:{event_name:row.after_event_name,organiser:row.after_organiser,application_url:row.after_application_url},
      rejection_reason:row.after_rejection_reason,audited_at:row.audited_at,source_revision_hash:row.staged_content_hash};
  });
  const result={schema:'findpitches-shadow-evaluation-v1',implementation:'v2',environment:'historical-shadow-pilot',as_of:capture.as_of,inputs_hash:manifest.inputs_hash,readiness_measured:false,
    source:{historical_audit:true,read_only:true,records_hash:capture.records_hash,captured_at:capture.captured_at,pilot_batch:capture.pilot_batch},records,
    limitations:['Source inputs are reconstructed from verified staged revisions and preserved pilot baselines; original export-file bytes are unavailable','Only audited title, organiser and application URL are measured; other historical selected fields are unobserved','Historical readiness, replay and costs were not captured','V2 shadow isolation was implicit; this capture makes no claim of successful customer isolation'],metrics:{elapsed_ms:null,total_cost_usd:null,replay:null}};
  fs.writeFileSync(path.join(datasetDirectory,'v2-snapshot.json'),JSON.stringify(result,null,2)+'\n',{mode:0o600});return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2),get=name=>args[args.indexOf(name)+1];
  try{const result=await pilotSnapshot({captureFile:get('--capture'),datasetDirectory:get('--dataset')});console.log(JSON.stringify({records:result.records.length,as_of:result.as_of,observed_fields:result.records[0].observed_fields}));}
  catch(error){console.error(error.message);process.exitCode=1;}
}
