import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIELDS,hash,normalizeExport,stableJson } from '../../platform/findpitches-v3/contract.mjs';

function summarize(inputs,snapshot,gold) {
  if(!snapshot)return null;
  const byId=new Map(snapshot.records.map(r=>[r.producer_record_id,r]));
  const hist={validation:{},eligibility:{},readiness:{},identity:{}};
  let retained=0,provided=0,missing=0,knownFields=0,possibleFields=0;const mutations=[],ids=new Set();
  for(const raw of inputs) {
    const id=raw.opportunity_id??raw.producer_record_id,row=byId.get(id);
    if(!row){missing++;continue;}
    for(const key of Object.keys(hist)){const value=row[key]??'unavailable';hist[key][value]=(hist[key][value]??0)+1;}
    if(row.entity_id)ids.add(row.entity_id);
    const baseline=normalizeExport(raw).normalized;if(!baseline)throw new Error('baseline_export_invalid');
    if(!row.fields)continue;
    for(const field of FIELDS) {
      possibleFields++;if(row.fields[field]!==null&&row.fields[field]!==undefined&&row.fields[field]!=='')knownFields++;
      if(baseline[field]===null||baseline[field]===undefined||baseline[field]==='')continue;
      provided++;if(stableJson(baseline[field])===stableJson(row.fields[field]))retained++;else mutations.push({producer_record_id:id,field,source_value:baseline[field],selected_value:row.fields[field]??null});
    }
  }
  const extra=snapshot.records.filter(r=>!inputs.some(i=>(i.opportunity_id??i.producer_record_id)===r.producer_record_id)).length;
  const duplicateInputIds=snapshot.records.length-byId.size;
  let eligibleGold=0,falseRejects=0;
  for(const label of gold?.records??[])if(label.eligible===true&&byId.has(label.producer_record_id)) {
    eligibleGold++;if(['rejected','closed'].includes(byId.get(label.producer_record_id).eligibility))falseRejects++;
  }
  const labelComparable=gold?.as_of===snapshot.as_of&&gold?.inputs_hash===snapshot.inputs_hash;
  return {observed_records:snapshot.records.length,missing_input_records:missing,unexpected_records:extra,duplicate_input_ids:duplicateInputIds,states:hist,
    unique_entities:ids.size,linked_records:snapshot.records.filter(r=>r.entity_id).length,
    source_fields_evaluated:provided,source_fields_retained:retained,source_field_retention:provided?retained/provided:null,source_field_mutations:mutations,
    field_completeness:possibleFields?knownFields/possibleFields:null,
    false_rejections:labelComparable&&eligibleGold?falseRejects:null,false_rejection_rate:labelComparable&&eligibleGold?falseRejects/eligibleGold:null,
    readiness_yield:snapshot.records.length?(hist.readiness.ready??0)/snapshot.records.length:null,metrics:snapshot.metrics??null};
}
export async function compareSnapshots(inputs,{v2=null,v3,gold=null}={}) {
  if(!v3)throw new Error('v3_snapshot_required');
  const inputHash=await hash(inputs),sameInputs=v3.inputs_hash===inputHash&&v2?.inputs_hash===inputHash,sameTime=Boolean(v2?.as_of&&v2.as_of===v3.as_of);
  return {schema:'findpitches-v3-comparison-v1',inputs:inputs.length,input_hash:inputHash,comparable:sameInputs&&sameTime,
    limitations:[...(!v2?['V2 snapshot unavailable']:[]),...(v2&&!sameInputs?['Input hashes differ; yield/cost superiority cannot be inferred']:[]),...(v2&&!sameTime?['Evaluation times differ; lifecycle comparisons require aligned snapshots']:[]),...(!gold?['Gold labels unavailable; false rejection rate unavailable']:[])],
    v2:summarize(inputs,v2,gold),v3:summarize(inputs,v3,gold),superiority_claim:null};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2),get=name=>args.includes(name)?args[args.indexOf(name)+1]:null,read=file=>file?JSON.parse(fs.readFileSync(file,'utf8')):null;
  const baseline=read(get('--input')),v3=read(get('--v3'));
  const report=await compareSnapshots(baseline?.records??baseline,{v2:read(get('--v2')),v3,gold:read(get('--gold'))});
  const output=JSON.stringify(report,null,2)+'\n';if(get('--report'))fs.writeFileSync(get('--report'),output);else console.log(output);
}
