import test from 'node:test';
import assert from 'node:assert/strict';
import {database,seed,record,NOW} from './helpers.mjs';
import {sql,ingestRecords} from '../../platform/findpitches-v3/store.mjs';
import {producerRechecks,acknowledgeProducerRecheck,producerRecheckStatus} from '../../platform/findpitches-v3/rechecks.mjs';
import {drainPipeline,runStage} from '../../platform/findpitches-v3/pipeline.mjs';
import {enqueue} from '../../platform/findpitches-v3/jobs.mjs';
import {fetchRechecks} from '../../operations/findpitches-v3/producer-delivery.mjs';
import worker from '../../platform/findpitches-v3/worker.mjs';
const REQUEST='2026-10-07T12:00:00.000Z',FRESH='2026-10-08T12:00:00.000Z';
test('pagination reaches every producer request without repeats; diagnostic pages do not forge delivery cadence',async t=>{
  const db=database(t);
  for(let i=0;i<105;i++) {
    const id='ent_page_'+String(i).padStart(3,'0'),rid='record_page_'+i;
    await sql(db,"INSERT INTO entities(id,market,environment,shadow_only,created_at,updated_at) VALUES (?,'US','shadow',1,?,?)",id,NOW,NOW).run();
    await sql(db,"INSERT INTO producer_records(id,producer_name,producer_type,producer_record_id,environment,market,content_hash,raw_json,normalized_json,validation_status,received_at) VALUES (?,'independent-structured','structured_platform',?,'shadow','US',?,'{}',?,'accepted',?)",rid,'producer_'+i,rid,JSON.stringify({last_checked:NOW}),NOW).run();
    await sql(db,'INSERT INTO entity_records VALUES (?,?)',rid,id).run();
    await sql(db,"INSERT INTO recheck_requests VALUES (?,?,'watch_recheck_due')",id,REQUEST).run();
  }
  const first=await producerRechecks(db,{now:FRESH});assert.equal(first.requests.length,100);assert.equal(first.pending_entities,105);assert.ok(first.next_cursor);
  const second=await producerRechecks(db,{cursor:first.next_cursor,now:FRESH});assert.equal(second.requests.length,5);assert.equal(second.next_cursor,null);
  assert.equal(new Set([...first.requests,...second.requests].map(r=>r.entity_id)).size,105);
  const token='test-recheck-pagination-token-private',env={V3_ROLE:'ingest',V3_INGEST_TOKEN:token,FINDPITCHES_V3_DB:db};
  const requests=await fetchRechecks({ingestUrl:'https://shadow.test',token,probe:true,fetcher:(url,opts)=>worker.fetch(new Request(url,opts),env)});
  assert.equal(requests.length,105);assert.equal((await sql(db,'SELECT COUNT(*) AS n FROM structured_delivery_contacts').first()).n,0);
  await assert.rejects(producerRechecks(db,{cursor:'garbage'}),/cursor_invalid/);
});
test('acknowledgement retains immutable custody and requires exact request, membership and a non-future check',async t=>{
  const db=database(t),{entity}=await seed(db,record(),{environment:'shadow'});
  await sql(db,"INSERT INTO recheck_requests VALUES (?,?,'watch_recheck_due')",entity.id,REQUEST).run();
  const body={entity_id:entity.id,requested_at:REQUEST,producer_record_id:'fixture-1'};
  assert.equal((await acknowledgeProducerRecheck(db,body,{now:FRESH})).acknowledged,false);
  const imported=await ingestRecords(db,[record({last_checked:FRESH,lifecycle_event:'UNCHANGED'})],{environment:'shadow',now:FRESH});await drainPipeline(db,{now:FRESH});
  assert.equal((await acknowledgeProducerRecheck(db,{...body,requested_at:NOW},{now:FRESH})).acknowledged,false);
  assert.equal((await acknowledgeProducerRecheck(db,{...body,producer_record_id:'another-producer'},{now:FRESH})).acknowledged,false);
  assert.equal((await acknowledgeProducerRecheck(db,body,{now:REQUEST})).acknowledged,false);
  const status=await producerRecheckStatus(db,FRESH);assert.equal(status.fresh_evidence_ack_eligible,1);
  const before=(await sql(db,'SELECT * FROM source_facts ORDER BY id').all()).results;
  assert.equal((await acknowledgeProducerRecheck(db,body,{now:FRESH})).acknowledged,true);
  assert.equal((await acknowledgeProducerRecheck(db,body,{now:FRESH})).acknowledged,false);
  const proof=await sql(db,'SELECT * FROM producer_recheck_acknowledgements').first();assert.equal(proof.accepted_record_id,imported.record_ids[0]);assert.equal(proof.source_last_checked,FRESH);
  await assert.rejects(sql(db,'DELETE FROM producer_recheck_acknowledgements').run(),/immutable/);
  await assert.rejects(sql(db,"UPDATE producer_recheck_acknowledgements SET source_last_checked=?",NOW).run(),/immutable/);
  assert.deepEqual((await sql(db,'SELECT * FROM source_facts ORDER BY id').all()).results,before);
  assert.equal((await sql(db,'SELECT COUNT(*) AS n FROM customer_projections').first()).n,0);
});
test('repeated watch requests retain the original work token and do not move the acknowledgement deadline',async t=>{
  const db=database(t),{entity}=await seed(db,record(),{environment:'shadow'});
  await sql(db,"INSERT INTO recheck_requests VALUES (?,?,'watch_recheck_due')",entity.id,REQUEST).run();
  await enqueue(db,'watch','recheck-preserve-request',{entity_id:entity.id},FRESH);
  const job=await sql(db,"SELECT id FROM jobs WHERE stage='watch' AND dedupe_key='recheck-preserve-request'").first();
  assert.equal((await runStage(db,'watch',{jobId:job.id,now:FRESH})).phase,'complete');
  assert.equal((await sql(db,'SELECT requested_at FROM recheck_requests WHERE entity_id=?',entity.id).first()).requested_at,REQUEST);
});
test('ambiguous producer membership cannot use legacy acknowledgement or evidence from a different producer ID',async t=>{
  const db=database(t),{entity}=await seed(db,record(),{environment:'shadow'});
  await ingestRecords(db,[record({opportunity_id:'second-producer',last_checked:FRESH})],{environment:'shadow',now:FRESH});await drainPipeline(db,{now:FRESH});
  await sql(db,"INSERT INTO recheck_requests VALUES (?,?,'watch_recheck_due')",entity.id,REQUEST).run();
  const body={entity_id:entity.id,requested_at:REQUEST};
  assert.equal((await acknowledgeProducerRecheck(db,body,{now:FRESH})).reason,'producer_record_id_required');
  assert.equal((await acknowledgeProducerRecheck(db,{...body,producer_record_id:'fixture-1'},{now:FRESH})).acknowledged,false);
  assert.equal((await acknowledgeProducerRecheck(db,{...body,producer_record_id:'second-producer'},{now:FRESH})).acknowledged,true);
});
test('delivery client detects looping page cursors rather than silently truncating recheck work',async()=>{
  await assert.rejects(fetchRechecks({ingestUrl:'https://shadow.test',token:'test',fetcher:async()=>Response.json({requests:[],next_cursor:'same'})}),/cursor_loop/);
});
