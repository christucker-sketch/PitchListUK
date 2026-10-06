// Freeze real inputs for an offline, equivalent-input comparison. No V2 execution.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIELDS,hash,normalizeExport } from '../../platform/findpitches-v3/contract.mjs';
import { readExport } from './producer-delivery.mjs';

export async function buildDataset({inputFile,outputDirectory,asOf=new Date().toISOString(),sourceDescription='User supplied producer export'}) {
  if(!Number.isFinite(Date.parse(asOf)))throw new Error('evaluation_timestamp_required');
  const input=readExport(inputFile),ids=input.records.map(r=>r.opportunity_id??r.producer_record_id);
  if(new Set(ids).size!==ids.length)throw new Error('evaluation_inputs_must_have_unique_producer_ids');
  const records=[];
  for(const raw of input.records) {
    const validated=normalizeExport(raw,{environment:'test'});if(!validated.normalized)throw new Error('evaluation_requires_valid_source_records');
    records.push({producer_record_id:raw.opportunity_id??raw.producer_record_id,input_hash:await hash(raw),source_platform:validated.normalized.source_platform,market:validated.normalized.market,source_fields:FIELDS.filter(f=>validated.normalized[f]!==null&&validated.normalized[f]!==undefined&&validated.normalized[f]!==''),source_checked_at:validated.normalized.last_checked});
  }
  const manifest={schema:'findpitches-evaluation-dataset-v1',as_of:new Date(asOf).toISOString(),inputs_hash:await hash(input.records),source_file_hash:input.file_hash,source_description:sourceDescription,
    environment:'test',records,operations:['baseline','unchanged_replay'],requirements:['Exact raw inputs and per-record hashes','Frozen evaluation clock','Read-only V2 result files or an external isolated offline V2 evaluation','Independent reviewed eligibility, field and duplicate labels'],gold_is_independent_of_source_baseline:true};
  const gold={schema:'findpitches-evaluation-gold-v1',as_of:manifest.as_of,inputs_hash:manifest.inputs_hash,
    instructions:'Fill eligible and fields only after independent review. Fields use {value,alternatives?}. Every labelled record/pair needs reviewed_by, reviewed_at and references. Do not infer gold labels from V3 outcomes or source states.',
    records:records.map(r=>({producer_record_id:r.producer_record_id,eligible:null,fields:{},reviewed_by:null,reviewed_at:null,references:[]})),duplicate_pairs:[]};
  const template={schema:'findpitches-shadow-evaluation-v1',implementation:'v2',environment:'test',as_of:manifest.as_of,inputs_hash:manifest.inputs_hash,
    instructions:'Template only: replace unmeasured rows with independently captured V2 results on these exact inputs and clock. Do not relabel historical outputs with this timestamp. Never import into live V2.',
    records:records.map(r=>({producer_record_id:r.producer_record_id,input_hash:r.input_hash,validation:'unmeasured',entity_id:null,identity:null,eligibility:null,readiness:null,fields:null})),metrics:{elapsed_ms:null,total_cost_usd:null,replay:null}};
  fs.mkdirSync(outputDirectory,{recursive:true});
  for(const file of ['manifest.json','inputs.json','gold-template.json','v2-snapshot-template.json'])if(fs.existsSync(path.join(outputDirectory,file)))throw new Error('evaluation_dataset_already_exists');
  for(const [file,value] of Object.entries({'manifest.json':manifest,'inputs.json':{schema:'findpitches-evaluation-inputs-v1',records:input.records},'gold-template.json':gold,'v2-snapshot-template.json':template})) {
    const target=path.join(outputDirectory,file);fs.writeFileSync(target,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
  }
  return manifest;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2),get=name=>args.includes(name)?args[args.indexOf(name)+1]:null;
  try{const result=await buildDataset({inputFile:get('--input'),outputDirectory:get('--out'),asOf:get('--as-of')??undefined,sourceDescription:get('--source-description')??undefined});console.log(JSON.stringify({inputs:result.records.length,inputs_hash:result.inputs_hash,as_of:result.as_of}));}
  catch(error){console.error(error.message);process.exitCode=1;}
}
