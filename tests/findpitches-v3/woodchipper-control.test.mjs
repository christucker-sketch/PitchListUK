import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { openLocalD1 } from '../../operations/findpitches-v3/local-d1.mjs';
import { sql } from '../../platform/findpitches-v3/store.mjs';
import { runPreservationControl } from '../../operations/findpitches-v3/control.mjs';

const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/structured-control-100.json',import.meta.url)));
test('100 real structured records survive classification, destructive extraction proposals, readiness and idempotent replay',async t=>{
  const db=openLocalD1();t.after(()=>db.close());
  const report=await runPreservationControl(db,fixture.records);
  assert.equal(report.tested_records,100);assert.equal(report.customer_projection_rows,0);assert.equal(report.publication_rows,0);
  console.log('V3 woodchipper control:',JSON.stringify({...report,record_ids:undefined}));
  const row=await sql(db,"SELECT value_json FROM selected_facts WHERE field_name='application_url' AND value_json LIKE '%id=52126%'").first();
  assert.ok(row,'Historical Eventeny vendor route 52126 must survive intact');
});
test('the recovered actual V2 pilot IDs also survive every adverse source-field proposal with zero mutations',async t=>{
  const inputs=JSON.parse(fs.readFileSync(new URL('../../operations/findpitches-v3/datasets/woodchipper-pilot-2026-10-05/inputs.json',import.meta.url))).records;
  const manifest=JSON.parse(fs.readFileSync(new URL('../../operations/findpitches-v3/datasets/woodchipper-pilot-2026-10-05/manifest.json',import.meta.url)));
  const db=openLocalD1();t.after(()=>db.close());const report=await runPreservationControl(db,inputs,{now:manifest.as_of});
  assert.equal(report.tested_records,100);assert.equal(report.destructive_mutations,0);assert.equal(report.replay_duplicates,100);
  assert.equal(report.customer_projection_rows,0);assert.equal(report.publication_rows,0);
});
