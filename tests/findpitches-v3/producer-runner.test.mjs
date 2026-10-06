import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { deliveryCycle,runnerConfig } from '../../operations/findpitches-v3/producer-runner.mjs';
import { record,NOW } from './helpers.mjs';
function setup(t) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'v3-runner-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const config={input_file:path.join(dir,'export.jsonl'),token_file:path.join(dir,'ingest.env'),state_dir:path.join(dir,'state'),ingest_url:'https://ingest.example.org',interval_seconds:900,environment:'shadow'};
  fs.writeFileSync(config.token_file,'V3_INGEST_TOKEN=standalone-ingest-test-token-123456');fs.writeFileSync(config.input_file,JSON.stringify(record())+'\n');return config;
}
test('continuous delivery picks up changed exports, retries fresh acknowledgments, and never redelivers a completed unchanged file',async t=>{
  const config=setup(t);let imports=0,acks=0;const requested_at='2026-10-07T12:00:00.000Z';
  const fetcher=async(url,options={})=>{
    if(url.endsWith('/rechecks'))return Response.json({requests:[{entity_id:'entity',producer_record_id:'fixture-1',requested_at,environment:'shadow'}]});
    if(url.endsWith('/rechecks/ack')){acks++;return Response.json({acknowledged:acks>1});}
    const records=JSON.parse(options.body).records;imports++;
    return Response.json({accepted:records.length,rejected:0,inserted:records.length,duplicates:0,record_ids:['r'],errors:[]});
  };
  assert.equal((await deliveryCycle(config,{fetcher,now:()=>new Date(NOW)})).status,'delivered');
  await deliveryCycle(config,{fetcher,now:()=>new Date(NOW)});assert.equal(imports,1);assert.equal(acks,0);
  fs.writeFileSync(config.input_file,JSON.stringify(record({last_checked:'2026-10-08T12:00:00.000Z'}))+'\n');
  assert.equal((await deliveryCycle(config,{fetcher})).acknowledged_rechecks,0);
  assert.equal((await deliveryCycle(config,{fetcher})).acknowledged_rechecks,1);assert.equal(imports,2);
  fs.writeFileSync(path.join(config.state_dir,'cycle.lock'),'occupied');assert.equal((await deliveryCycle(config,{fetcher})).status,'busy');
});
test('malformed partial exports are not delivered and failure telemetry never echoes private exception text',async t=>{
  const config=setup(t);let imports=0;
  fs.writeFileSync(config.input_file,'{"schema_version":');
  const result=await deliveryCycle(config,{fetcher:async()=>Response.json({requests:[]})});assert.equal(result.status,'failed');
  const failed=await deliveryCycle(config,{fetcher:async()=>{imports++;throw new Error('private token value');}});
  assert.equal(failed.error,'producer_delivery_cycle_failed');assert.equal(failed.consecutive_failures,2);assert.equal(imports,1);
});
test('runner config resolves paths and rejects unsafe cadence and ambiguous feed configuration',t=>{
  const config=setup(t),file=path.join(config.state_dir,'../config.json');
  fs.writeFileSync(file,JSON.stringify({...config,token_file:'ingest.env'}));assert.equal(runnerConfig(file).token_file,config.token_file);
  fs.writeFileSync(file,JSON.stringify({...config,interval_seconds:1}));assert.throws(()=>runnerConfig(file),/cadence/);
  fs.writeFileSync(file,JSON.stringify({...config,export_url:'https://feed.example.org/export'}));assert.throws(()=>runnerConfig(file),/exactly_one/);
});
test('directory delivery combines normalized export files and detects changed records without modifying the source directory',async t=>{
  const config=setup(t),directory=path.dirname(config.input_file);delete config.input_file;config.input_directory=directory;config.file_pattern='*.jsonl';
  fs.writeFileSync(path.join(directory,'watch.jsonl'),JSON.stringify(record({opportunity_id:'watch',application_state:'WATCH'}))+'\n');let imported;
  const fetcher=async(url,options={})=>{
    if(url.endsWith('/rechecks'))return Response.json({requests:[]});
    imported=JSON.parse(options.body).records;return Response.json({accepted:imported.length,rejected:0,inserted:imported.length,duplicates:0,record_ids:imported.map(r=>r.opportunity_id),errors:[]});
  };
  assert.equal((await deliveryCycle(config,{fetcher})).records,2);assert.equal(imported[1].opportunity_id,'watch');
  assert.equal(fs.readdirSync(directory).filter(n=>n.endsWith('.jsonl')).length,2);
});
