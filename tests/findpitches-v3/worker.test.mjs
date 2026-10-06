import test from 'node:test';
import assert from 'node:assert/strict';
import { database,record,seed,NOW } from './helpers.mjs';
import worker from '../../platform/findpitches-v3/worker.mjs';
import { verifyStructuredControl } from '../../platform/findpitches-v3/control.mjs';
import { sql,ingestRecords } from '../../platform/findpitches-v3/store.mjs';
import { drainPipeline } from '../../platform/findpitches-v3/pipeline.mjs';
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
test('producer recheck acknowledgment requires newer linked evidence and the exact request timestamp',async t=>{
  const db=database(t),{entity}=await seed(db,record(),{environment:'shadow'});
  const requested_at='2026-10-07T12:00:00.000Z',env={FINDPITCHES_V3_DB:db,V3_ROLE:'ingest',V3_INGEST_TOKEN:TOKEN};
  await sql(db,"INSERT INTO recheck_requests VALUES (?,?,'watch_recheck_due')",entity.id,requested_at).run();
  const ack=async time=>(await worker.fetch(request('/rechecks/ack',{method:'POST',body:{entity_id:entity.id,requested_at:time}}),env)).json();
  assert.equal((await ack(requested_at)).acknowledged,false);
  await ingestRecords(db,[record({last_checked:'2026-10-08T12:00:00.000Z'})],{environment:'shadow',now:'2026-10-08T12:00:00.000Z'});await drainPipeline(db,{now:'2026-10-08T12:00:00.000Z'});
  assert.equal((await ack('2026-10-06T12:00:00.000Z')).acknowledged,false);
  assert.equal((await ack(requested_at)).acknowledged,true);
});
