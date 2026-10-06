import test from 'node:test';
import assert from 'node:assert/strict';
import { database,record,seed,NOW } from './helpers.mjs';
import worker from '../../platform/findpitches-v3/worker.mjs';
import { verifyStructuredControl } from '../../platform/findpitches-v3/control.mjs';
const TOKEN='local-test-token-with-at-least-24-characters';
const request=(path,{method='GET',body,token=TOKEN}={})=>new Request('https://v3.example'+path,{method,headers:{authorization:'Bearer '+token,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
test('Worker APIs enforce authentication, role ownership, payload limits and hard publication disablement',async t=>{
  const db=database(t),env={FINDPITCHES_V3_DB:db,V3_ROLE:'ingest',V3_INGEST_TOKEN:TOKEN,V3_OPERATOR_TOKEN:TOKEN,PUBLICATION_ENABLED:'true'};
  assert.equal((await worker.fetch(request('/health'),env)).status,200);
  assert.equal((await worker.fetch(request('/imports',{method:'POST',body:{records:[record()]},token:'invalid'}),env)).status,401);
  assert.equal((await worker.fetch(request('/imports',{method:'POST',body:{records:[record()],environment:'test'}}),env)).status,202);
  assert.equal((await worker.fetch(request('/imports',{method:'POST',body:{records:[record()]} }),{...env,V3_ROLE:'api'})).status,404);
  assert.equal((await worker.fetch(request('/v1/opportunities'),env)).status,403);
  assert.equal((await worker.fetch(request('/shadow',{token:'invalid'}),{...env,V3_ROLE:'api'})).status,401);
  assert.equal((await worker.fetch(request('/imports',{method:'POST',body:{records:[],padding:'x'.repeat(1048576)}}),env)).status,413);
  const response=await worker.fetch(request('/status',{token:''}),env),status=await response.json();assert.equal(status.mode,'shadow');assert.equal(status.publication_enabled,false);assert.equal(status.customer_rows,0);assert.equal(status.publication_rows,0);
  assert.ok(status.jobs);assert.ok(status.throughput);assert.ok(status.stale_leases===0);
});
test('stage queue deliveries are idempotent and wrong-stage messages fail transport validation',async t=>{
  const db=database(t);await seed(db);let acks=0,retries=0;
  const messages=[{body:{stage:'readiness',job_id:'unknown'},ack:()=>acks++,retry:()=>retries++},{body:{stage:'reconcile',job_id:'wrong'},ack:()=>acks++,retry:()=>retries++}];
  await worker.queue({messages},{FINDPITCHES_V3_DB:db,V3_ROLE:'readiness'});assert.equal(acks,1);assert.equal(retries,1);
});
test('preservation gate cannot be declared from unprocessed records or client counts',async t=>{
  const db=database(t);
  await assert.rejects(verifyStructuredControl(db,[record()],['invented']),/exactly_100/);
});
