import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { record,NOW } from './helpers.mjs';
import { buildDataset } from '../../operations/findpitches-v3/evaluation-dataset.mjs';
import { evaluateDataset } from '../../operations/findpitches-v3/evaluate-dataset.mjs';
import { compareSnapshots } from '../../operations/findpitches-v3/compare.mjs';

test('frozen real-input dataset measures replay and prevents templates being mistaken for measured V2 output',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'v3-eval-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const file=path.join(dir,'input.jsonl'),out=path.join(dir,'dataset');fs.writeFileSync(file,'\uFEFF'+JSON.stringify(record())+'\n');
  const manifest=await buildDataset({inputFile:file,outputDirectory:out,asOf:NOW});
  const result=await evaluateDataset({datasetDirectory:out});assert.equal(result.v3.source_field_retention,1);assert.equal(result.v3.replay_entity_growth,0);assert.equal(result.v3.replay_duplicate_receipt_rate,1);
  assert.equal(result.v3.false_rejection_rate,null);
  const v2=JSON.parse(fs.readFileSync(path.join(out,'v2-snapshot-template.json'))),v3=JSON.parse(fs.readFileSync(path.join(out,'v3-snapshot.json')));
  const template=await compareSnapshots([record()],{manifest,v2,v3});assert.equal(template.comparable,false);assert.ok(template.alignment_issues.some(v=>v.includes('unmeasured')));
  await assert.rejects(buildDataset({inputFile:file,outputDirectory:out,asOf:NOW}));
  const changed=JSON.parse(fs.readFileSync(path.join(out,'inputs.json')));changed.records[0].event_name='changed';fs.writeFileSync(path.join(out,'inputs.json'),JSON.stringify(changed));
  await assert.rejects(evaluateDataset({datasetDirectory:out}),/manifest_mismatch/);
});
