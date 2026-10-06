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
