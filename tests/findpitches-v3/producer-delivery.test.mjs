import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { record } from './helpers.mjs';
import { readExport,importBatches,deliverExport,acknowledgeDeliveredRechecks } from '../../operations/findpitches-v3/producer-delivery.mjs';
const TOKEN='standalone-ingest-test-token-at-least-24';
function temporary(t){const d=fs.mkdtempSync(path.join(os.tmpdir(),'v3-delivery-'));t.after(()=>fs.rmSync(d,{recursive:true,force:true}));return d;}
test('JSONL delivery preserves producer fields and resumes an uncertain request through server idempotency',async t=>{
  const d=temporary(t),inputFile=path.join(d,'export.jsonl'),checkpointFile=path.join(d,'checkpoint.json');
  const records=Array.from({length:101},(_,i)=>record({opportunity_id:'delivery-'+i}));fs.writeFileSync(inputFile,records.map(r=>JSON.stringify(r)).join('\n'));
  assert.deepEqual(readExport(inputFile).records,records);let calls=0;const sent=[];
  const options={inputFile,checkpointFile,ingestUrl:'https://ingest.example.org',token:TOKEN,fetcher:async(_url,options)=>{
    calls++;const body=JSON.parse(options.body);sent.push(...body.records);assert.equal(body.environment,'shadow');
    if(calls===2)throw new Error('network interruption after possible acceptance');
    const n=body.records.length;return Response.json({accepted:n,rejected:0,inserted:calls===3?0:n,duplicates:calls===3?n:0,record_ids:body.records.map(r=>r.opportunity_id),errors:[]});
  }};
  await assert.rejects(deliverExport(options));assert.equal(JSON.parse(fs.readFileSync(checkpointFile)).next_batch,1);
  const result=await deliverExport(options);assert.equal(result.accepted,101);assert.equal(result.inserted,100);assert.equal(result.duplicates,1);assert.equal(calls,3);
  await deliverExport(options);assert.equal(calls,3);assert.deepEqual(sent.slice(0,100),records.slice(0,100));
  await assert.rejects(deliverExport({...options,environment:'test'}),/destination_mismatch/);
});
test('batches bound UTF-8 request size as well as count',()=>{
  const records=Array.from({length:20},(_,i)=>record({opportunity_id:'large-'+i,evidence:['🌍'.repeat(15000)]}));
  const batches=importBatches(records);assert.ok(batches.length>1);
  for(const batch of batches)assert.ok(Buffer.byteLength(JSON.stringify({environment:'shadow',records:batch}))<1048576);
});
test('rechecks are acknowledged only after accepted delivery in the matching environment',async()=>{
  let calls=0;const fetcher=async()=>{calls++;return Response.json({acknowledged:true});};
  const requested_at='2026-10-06T12:00:00.000Z';
  const requests=[{producer_record_id:'ok',entity_id:'e',requested_at,environment:'shadow'},{producer_record_id:'rejected',entity_id:'r',requested_at,environment:'shadow'},{producer_record_id:'ok',entity_id:'test',requested_at,environment:'test'},{producer_record_id:'old',entity_id:'old',requested_at,environment:'shadow'}];
  const delivery={ingest_origin:'https://ingest.example.org',environment:'shadow',results:[{rejected:0,producer_record_ids:['ok','old'],last_checked_by_producer:{ok:'2026-10-06T12:01:00.000Z',old:'2026-10-05T12:00:00.000Z'}},{rejected:1,producer_record_ids:['rejected']}]};
  assert.equal((await acknowledgeDeliveredRechecks({requests,delivery,token:TOKEN,fetcher})).acknowledged,1);assert.equal(calls,1);
});
