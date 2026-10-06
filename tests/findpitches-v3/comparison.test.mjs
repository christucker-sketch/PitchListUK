import test from 'node:test';
import assert from 'node:assert/strict';
import { record } from './helpers.mjs';
import { compareSnapshots } from '../../operations/findpitches-v3/compare.mjs';
import { hash,normalizeExport } from '../../platform/findpitches-v3/contract.mjs';
test('comparison exposes unavailable V2/labels and requires equivalent input hashes and evaluation times',async()=>{
  const inputs=[record()],inputs_hash=await hash(inputs),row={producer_record_id:'fixture-1',entity_id:'entity',validation:'accepted',eligibility:'eligible',readiness:'ready',fields:normalizeExport(inputs[0]).normalized};
  const v3={records:[row],inputs_hash,as_of:'2026-10-06'};
  const missing=await compareSnapshots(inputs,{v3});assert.equal(missing.comparable,false);assert.equal(missing.v2,null);assert.equal(missing.v3.false_rejection_rate,null);assert.equal(missing.v3.source_field_retention,1);
  assert.equal((await compareSnapshots(inputs,{v3,v2:{...v3,inputs_hash:'different'}})).comparable,false);
  const v2={...v3,records:[{...row,eligibility:'rejected',fields:{...row.fields,event_name:'generic page'}}]};
  const report=await compareSnapshots(inputs,{v3,v2,gold:{inputs_hash,as_of:v3.as_of,records:[{producer_record_id:'fixture-1',eligible:true}]}});
  assert.equal(report.comparable,true);assert.equal(report.v2.source_field_mutations.length,1);assert.equal(report.v2.false_rejection_rate,1);assert.equal(report.v3.false_rejection_rate,0);assert.equal(report.superiority_claim,null);
});
test('missing outputs count against preservation and yield; independent labels distinguish unassessed from false rejection',async()=>{
  const inputs=[record(),record({opportunity_id:'second'})],inputs_hash=await hash(inputs),as_of='2026-10-06T12:00:00.000Z';
  const row={producer_record_id:'fixture-1',entity_id:'e',eligibility:'eligible',readiness:'ready',fields:normalizeExport(inputs[0]).normalized};
  const result=await compareSnapshots(inputs,{v3:{inputs_hash,as_of,records:[row]},gold:{inputs_hash,as_of,records:inputs.map(r=>({producer_record_id:r.opportunity_id,eligible:true}))}});
  assert.equal(result.v3.source_field_retention,.5);assert.equal(result.v3.readiness_yield,.5);assert.equal(result.v3.unassessed_eligible_gold_records,1);
  assert.equal(result.v3.false_rejection_rate,0);assert.equal(result.v3.eligible_gold_lost_rate,.5);
});
test('reviewed field truth and duplicate pairs score correctness rather than completeness',async()=>{
  const inputs=[record(),record({opportunity_id:'second'})],inputs_hash=await hash(inputs),as_of='2026-10-06T12:00:00.000Z';
  const manifest={inputs_hash,as_of,records:await Promise.all(inputs.map(async r=>({producer_record_id:r.opportunity_id,input_hash:await hash(r)})))};
  const rows=inputs.map((r,i)=>({...manifest.records[i],entity_id:'e'+i,eligibility:'eligible',readiness:'ready',fields:normalizeExport(r).normalized}));
  const v3={inputs_hash,as_of,environment:'test',records:rows},v2={...v3,records:rows.map(r=>({...r,entity_id:'merged',fields:{...r.fields,location:'restriction, or other reasons'}}))};
  const review={reviewed_by:'test reviewer',reviewed_at:as_of,references:['https://example.org/source']};
  const gold={inputs_hash,as_of,records:inputs.map(r=>({...review,producer_record_id:r.opportunity_id,eligible:true,fields:{location:{value:'Austin, Texas'}}})),duplicate_pairs:[{...review,left:'fixture-1',right:'second',same_entity:false}]};
  const result=await compareSnapshots(inputs,{v2,v3,gold,manifest});assert.equal(result.comparable,true);
  assert.equal(result.v3.field_quality_accuracy,1);assert.equal(result.v2.field_quality_accuracy,0);assert.equal(result.v2.false_merges,1);assert.equal(result.v3.duplicate_pair_accuracy,1);
  assert.equal(result.v2.advisory_quality_flags.length,2);
  assert.equal((await compareSnapshots(inputs,{v2,v3,gold:{...gold,records:gold.records.map(r=>({...r,reviewed_by:null}))},manifest})).v3.false_rejection_rate,null);
  const bad={...v2,records:v2.records.map(r=>({...r,input_hash:'wrong'}))};assert.equal((await compareSnapshots(inputs,{v2:bad,v3,manifest})).comparable,false);
});
test('unobserved audit fields and readiness remain unavailable rather than fabricated missing facts or yield',async()=>{
  const inputs=[record()],inputs_hash=await hash(inputs),as_of='2026-10-06T12:00:00.000Z';
  const v3={inputs_hash,as_of,records:[{producer_record_id:'fixture-1',readiness:'ready',fields:normalizeExport(inputs[0]).normalized}]};
  const v2={inputs_hash,as_of,readiness_measured:false,records:[{producer_record_id:'fixture-1',observed_fields:['event_name'],fields:{event_name:inputs[0].event_name}}]};
  const result=await compareSnapshots(inputs,{v2,v3});assert.equal(result.v2.source_field_retention,1);assert.equal(result.v2.fields.organiser.source_retention,null);
  assert.equal(result.v2.readiness_yield,null);assert.equal(result.deltas.source_field_retention,null);assert.equal(result.field_deltas.event_name.source_retention,0);
});
test('different truth and assessment coverage suppresses aggregate deltas while matched field scores remain usable',async()=>{
  const inputs=[record(),record({opportunity_id:'second'})],inputs_hash=await hash(inputs),as_of='2026-10-06T12:00:00.000Z';
  const manifest={inputs_hash,as_of,records:await Promise.all(inputs.map(async r=>({producer_record_id:r.opportunity_id,input_hash:await hash(r)})))};
  const rows=inputs.map((r,i)=>({...manifest.records[i],entity_id:'e'+i,eligibility:i?'rejected':'eligible',readiness:'ready',fields:{...normalizeExport(r).normalized,location:'incorrect'}}));
  const v3={inputs_hash,as_of,environment:'test',records:rows};
  const v2={...v3,records:rows.map((r,i)=>({...r,eligibility:i?'held':'eligible',observed_fields:['event_name'],fields:{event_name:r.fields.event_name}}))};
  const gold={inputs_hash,as_of,records:inputs.map(r=>({producer_record_id:r.opportunity_id,eligible:true,reviewed_by:'test reviewer',reviewed_at:as_of,references:['https://example.org/source'],fields:{event_name:{value:r.event_name},location:{value:r.location}}}))};
  const result=await compareSnapshots(inputs,{v2,v3,gold,manifest});assert.equal(result.comparable,true);
  assert.equal(result.v2.field_quality_accuracy,1);assert.equal(result.v3.field_quality_accuracy,.5);
  assert.equal(result.deltas.field_quality_accuracy,null);assert.equal(result.deltas.false_rejection_rate,null);assert.equal(result.field_deltas.event_name.gold_accuracy,0);
});
