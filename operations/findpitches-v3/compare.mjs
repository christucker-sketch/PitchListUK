import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIELDS,hash,normalizeExport,stableJson } from '../../platform/findpitches-v3/contract.mjs';

function reviewed(label,strict) {
  return !strict||Boolean(label?.reviewed_by&&Number.isFinite(Date.parse(label.reviewed_at))&&label.references?.length);
}
function summarize(inputs,snapshot,gold,{strict=false}={}) {
  if(!snapshot)return null;
  const byId=new Map(snapshot.records.map(r=>[r.producer_record_id,r]));
  const hist={validation:{},eligibility:{},readiness:{},identity:{}};
  const fieldScores=Object.fromEntries(FIELDS.map(field=>[field,{provided:0,evaluated_provided:0,observed:0,unobserved:0,retained:0,available:0,changed:0,missing:0,gold_evaluated:0,gold_correct:0}]));
  const comparableGold=gold?.as_of===snapshot.as_of&&gold?.inputs_hash===snapshot.inputs_hash;
  const labels=new Map((comparableGold?gold.records??[]:[]).filter(r=>reviewed(r,strict)).map(r=>[r.producer_record_id,r]));
  let retained=0,provided=0,missing=0,knownFields=0,possibleFields=0,sourceUsable=0,sourceRejected=0;const mutations=[],ids=new Set(),qualityFlags=[];
  for(const raw of inputs) {
    const id=raw.opportunity_id??raw.producer_record_id,row=byId.get(id);
    if(!row)missing++;
    for(const key of Object.keys(hist)){const value=row?.[key]??'unavailable';hist[key][value]=(hist[key][value]??0)+1;}
    if(row?.entity_id)ids.add(row.entity_id);
    const baseline=normalizeExport(raw).normalized;if(!baseline)throw new Error('baseline_export_invalid');
    if(['OPEN_NOW','ROLLING','ENQUIRY_AVAILABLE'].includes(baseline.application_state)){sourceUsable++;if(['rejected','closed','ineligible'].includes(row?.eligibility))sourceRejected++;}
    for(const field of FIELDS) {
      const score=fieldScores[field],selected=row?.fields?.[field],hasBaseline=baseline[field]!==null&&baseline[field]!==undefined&&baseline[field]!=='';
      if(hasBaseline)score.provided++;
      if(row?.observed_fields&&!row.observed_fields.includes(field)){score.unobserved++;continue;}
      score.observed++;possibleFields++;
      if(selected!==null&&selected!==undefined&&selected!==''){knownFields++;score.available++;}
      const truth=labels.get(id)?.fields?.[field];
      if(truth&&Object.hasOwn(truth,'value')) {
        score.gold_evaluated++;
        if([truth.value,...truth.alternatives??[]].some(value=>stableJson(value)===stableJson(selected??null)))score.gold_correct++;
      }
      if(!hasBaseline)continue;
      provided++;score.evaluated_provided++;
      if(stableJson(baseline[field])===stableJson(selected)){retained++;score.retained++;}
      else {if(selected===null||selected===undefined||selected==='')score.missing++;else score.changed++;
        mutations.push({producer_record_id:id,field,source_value:baseline[field],selected_value:selected??null});}
    }
    for(const field of ['event_name','organiser','location'])if(/restriction, or other reasons|terms and conditions|privacy policy|cookie preferences/i.test(row?.fields?.[field]??''))qualityFlags.push({producer_record_id:id,field,reason:'page_fragment_pattern'});
    for(const field of ['event_start','event_end','application_deadline'])if(row?.fields?.[field]&&!Number.isFinite(Date.parse(row.fields[field])))qualityFlags.push({producer_record_id:id,field,reason:'unparseable_date'});
  }
  const inputIds=new Set(inputs.map(i=>i.opportunity_id??i.producer_record_id));
  const extra=snapshot.records.filter(r=>!inputIds.has(r.producer_record_id)).length;
  const duplicateInputIds=snapshot.records.length-byId.size;
  let eligibleGold=0,assessedGold=0,falseRejects=0;
  for(const label of labels.values())if(label.eligible===true&&inputIds.has(label.producer_record_id)) {
    eligibleGold++;const state=byId.get(label.producer_record_id)?.eligibility;
    if(['eligible','validated','accepted','watch','rejected','closed','ineligible'].includes(state))assessedGold++;
    if(['rejected','closed','ineligible'].includes(state))falseRejects++;
  }
  let pairs=0,correctPairs=0,falseMerges=0,falseSplits=0,missingPairs=0;
  for(const pair of comparableGold?gold.duplicate_pairs??[]:[]) {
    if(!reviewed(pair,strict)||typeof pair.same_entity!=='boolean'||!inputIds.has(pair.left)||!inputIds.has(pair.right))continue;
    const left=byId.get(pair.left)?.entity_id,right=byId.get(pair.right)?.entity_id;
    if(!left||!right){missingPairs++;continue;}pairs++;
    if((left===right)===pair.same_entity)correctPairs++;else if(pair.same_entity)falseSplits++;else falseMerges++;
  }
  const qualityEvaluated=Object.values(fieldScores).reduce((n,s)=>n+s.gold_evaluated,0),qualityCorrect=Object.values(fieldScores).reduce((n,s)=>n+s.gold_correct,0);
  for(const score of Object.values(fieldScores)){score.source_retention=score.evaluated_provided?score.retained/score.evaluated_provided:null;score.gold_accuracy=score.gold_evaluated?score.gold_correct/score.gold_evaluated:null;}
  const replay=snapshot.metrics?.replay;
  const replayMeasured=replay&&['initial_entities','after_replay_entities','replay_inputs','inserted','duplicates'].every(k=>Number.isInteger(replay[k])&&replay[k]>=0);
  return {observed_records:snapshot.records.length,missing_input_records:missing,unexpected_records:extra,duplicate_input_ids:duplicateInputIds,states:hist,
    unique_entities:ids.size,linked_records:inputs.filter(i=>byId.get(i.opportunity_id??i.producer_record_id)?.entity_id).length,
    source_fields_provided:Object.values(fieldScores).reduce((n,s)=>n+s.provided,0),source_fields_evaluated:provided,source_fields_retained:retained,source_field_retention:provided?retained/provided:null,source_field_mutations:mutations,
    field_completeness:possibleFields?knownFields/possibleFields:null,field_observation_coverage:inputs.length?possibleFields/(inputs.length*FIELDS.length):null,
    source_usable_records:sourceUsable,source_usable_rejected_records:sourceRejected,source_relative_rejection_rate:sourceUsable?sourceRejected/sourceUsable:null,
    fields:fieldScores,field_quality_evaluated:qualityEvaluated,field_quality_accuracy:qualityEvaluated?qualityCorrect/qualityEvaluated:null,
    advisory_quality_flags:qualityFlags,eligible_gold_records:eligibleGold,assessed_eligible_gold_records:assessedGold,unassessed_eligible_gold_records:eligibleGold-assessedGold,
    false_rejections:eligibleGold?falseRejects:null,false_rejection_rate:assessedGold?falseRejects/assessedGold:null,
    eligible_gold_lost_rate:eligibleGold?(falseRejects+eligibleGold-assessedGold)/eligibleGold:null,
    duplicate_pairs_evaluated:pairs,duplicate_pairs_missing:missingPairs,duplicate_pair_accuracy:pairs?correctPairs/pairs:null,false_merges:falseMerges,false_splits:falseSplits,
    replay_entity_growth:replayMeasured?replay.after_replay_entities-replay.initial_entities:null,
    replay_duplicate_receipt_rate:replayMeasured&&replay.replay_inputs?replay.duplicates/replay.replay_inputs:null,
    readiness_yield:snapshot.readiness_measured===false?null:inputs.length?(hist.readiness.ready??0)/inputs.length:null,metrics:snapshot.metrics??null};
}
export async function compareSnapshots(inputs,{v2=null,v3,gold=null,manifest=null}={}) {
  if(!v3)throw new Error('v3_snapshot_required');
  const inputHash=await hash(inputs),sameInputs=v3.inputs_hash===inputHash&&v2?.inputs_hash===inputHash,sameTime=Boolean(v2?.as_of&&v2.as_of===v3.as_of);
  const issues=[],strict=Boolean(manifest),inputIds=inputs.map(r=>r.opportunity_id??r.producer_record_id);
  if(new Set(inputIds).size!==inputs.length)throw new Error('evaluation_inputs_must_have_unique_producer_ids');
  if(manifest&&(manifest.inputs_hash!==inputHash||manifest.records.length!==inputs.length))throw new Error('evaluation_manifest_mismatch');
  if(manifest)for(let i=0;i<inputs.length;i++)if(manifest.records[i].producer_record_id!==inputIds[i]||manifest.records[i].input_hash!==await hash(inputs[i]))throw new Error('evaluation_manifest_record_mismatch');
  for(const [name,snapshot] of Object.entries({v2,v3}))if(snapshot) {
    if(!Array.isArray(snapshot.records))throw new Error('snapshot_records_required');
    const ids=snapshot.records.map(r=>r.producer_record_id);
    if(new Set(ids).size!==ids.length)issues.push(name+': duplicate snapshot IDs');
    if(strict) {
      if(snapshot.as_of!==manifest.as_of||snapshot.inputs_hash!==inputHash)issues.push(name+': dataset hash/evaluation time mismatch');
      if(ids.length!==inputIds.length||ids.some(id=>!inputIds.includes(id)))issues.push(name+': incomplete or unexpected input rows');
      const expected=new Map(manifest.records.map(r=>[r.producer_record_id,r.input_hash]));
      if(snapshot.records.some(r=>r.input_hash!==expected.get(r.producer_record_id)))issues.push(name+': per-record input hashes missing or different');
      if(snapshot.environment!=='test'&&!(name==='v2'&&snapshot.environment==='historical-shadow-pilot'&&snapshot.source?.historical_audit===true))issues.push(name+': test/reference scope unverified');
      if(snapshot.records.some(r=>r.validation==='unmeasured'))issues.push(name+': unmeasured template rows');
    }
  }
  const comparable=sameInputs&&sameTime&&issues.length===0,summary={v2:summarize(inputs,v2,gold,{strict}),v3:summarize(inputs,v3,gold,{strict})};
  const deltas={};for(const key of ['source_field_retention','false_rejection_rate','field_quality_accuracy','readiness_yield','duplicate_pair_accuracy','replay_entity_growth'])deltas[key]=comparable&&summary.v2[key]!==null&&summary.v3[key]!==null?summary.v3[key]-summary.v2[key]:null;
  if(v2&&summary.v2.source_fields_evaluated!==summary.v3.source_fields_evaluated)deltas.source_field_retention=null;
  if(v2&&summary.v2.field_quality_evaluated!==summary.v3.field_quality_evaluated)deltas.field_quality_accuracy=null;
  if(v2&&summary.v2.assessed_eligible_gold_records!==summary.v3.assessed_eligible_gold_records)deltas.false_rejection_rate=null;
  const fieldDeltas={};for(const field of FIELDS) {
    const a=summary.v2?.fields[field],b=summary.v3.fields[field];
    fieldDeltas[field]={source_retention:comparable&&a.evaluated_provided===b.evaluated_provided&&a.source_retention!==null&&b.source_retention!==null?b.source_retention-a.source_retention:null,
      gold_accuracy:comparable&&a.gold_evaluated===b.gold_evaluated&&a.gold_accuracy!==null&&b.gold_accuracy!==null?b.gold_accuracy-a.gold_accuracy:null};
  }
  return {schema:'findpitches-v3-comparison-v2',inputs:inputs.length,input_hash:inputHash,as_of:v3.as_of,comparable,alignment_issues:issues,
    limitations:[...(!v2?['V2 snapshot unavailable']:[]),...(v2&&!sameInputs?['Input hashes differ; yield/cost superiority cannot be inferred']:[]),...(v2&&!sameTime?['Evaluation times differ; lifecycle comparisons require aligned snapshots']:[]),...(!gold?['Gold labels unavailable; false rejection rate unavailable']:[]),...(gold&&(gold.as_of!==v3.as_of||gold.inputs_hash!==inputHash)?['Gold labels do not match the evaluation inputs/time']:[]),...(strict&&gold&&gold.records.some(r=>typeof r.eligible!=='boolean'||!reviewed(r,true))?['Gold eligibility labels are incomplete or unreviewed; coverage is reported separately']:[]),...(v2?.limitations??[]),...(v2&&summary.v2.source_fields_evaluated!==summary.v3.source_fields_evaluated?['Observed field coverage differs; compare matched per-field scores, not aggregate retention']:[])],
    ...summary,deltas,field_deltas:fieldDeltas,superiority_claim:null};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2),get=name=>args.includes(name)?args[args.indexOf(name)+1]:null,read=file=>file?JSON.parse(fs.readFileSync(file,'utf8')):null;
  const baseline=read(get('--input')),v3=read(get('--v3'));
  const report=await compareSnapshots(baseline?.records??baseline,{v2:read(get('--v2')),v3,gold:read(get('--gold')),manifest:read(get('--manifest'))});
  const output=JSON.stringify(report,null,2)+'\n';if(get('--report'))fs.writeFileSync(get('--report'),output);else console.log(output);
}
