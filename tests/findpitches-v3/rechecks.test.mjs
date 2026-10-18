import test from 'node:test';
import assert from 'node:assert/strict';
import {database,seed,record,NOW} from './helpers.mjs';
import {sql,ingestRecords} from '../../platform/findpitches-v3/store.mjs';
import {producerRechecks,acknowledgeProducerRecheck,producerRecheckStatus,resolveObsoleteProducerRequest} from '../../platform/findpitches-v3/rechecks.mjs';
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
test('reviewed obsolete past work has separate immutable custody, no fresh ack, and cannot clear another request or alter facts',async t=>{
  const db=database(t),{entity,recordId}=await seed(db,record({event_start:'2026-10-05',event_end:'2026-10-05'}),{environment:'shadow'});
  await sql(db,"INSERT INTO recheck_requests VALUES (?,?,'watch_recheck_due')",entity.id,REQUEST).run();
  const input={entity_id:entity.id,requested_at:REQUEST,producer_record_id:'fixture-1',accepted_record_id:recordId,entity_revision:entity.revision,evidence_ref:'docs/producer-review.json',evidence_hash:'a'.repeat(64),reviewed_by:'Codex',
    evidence:{entity_id:entity.id,requested_at:REQUEST,producer_record_id:'fixture-1',no_longer_produced:true,edition_is_past:true,replacement_delivered:false,last_event_date:'2026-10-05',assessed_at:REQUEST}};
  const before=(await sql(db,'SELECT * FROM source_facts ORDER BY id').all()).results;
  assert.equal((await resolveObsoleteProducerRequest(db,{...input,entity_revision:999},{now:FRESH})).resolved,false);
  assert.equal((await resolveObsoleteProducerRequest(db,{...input,requested_at:NOW,evidence:{...input.evidence,requested_at:NOW}},{now:FRESH})).resolved,false);
  assert.equal((await resolveObsoleteProducerRequest(db,input,{now:FRESH})).resolved,true);
  assert.equal((await resolveObsoleteProducerRequest(db,input,{now:FRESH})).replayed,true);
  assert.equal((await resolveObsoleteProducerRequest(db,{...input,evidence_hash:'b'.repeat(64)},{now:FRESH})).resolved,false);
  assert.equal((await sql(db,'SELECT COUNT(*) AS n FROM producer_recheck_acknowledgements').first()).n,0);
  assert.equal((await producerRecheckStatus(db,FRESH)).obsolete_requests_resolved,1);
  for(const q of ['DELETE FROM producer_recheck_resolutions','UPDATE producer_recheck_resolutions SET reviewed_at=\'2099-01-01\''])await assert.rejects(sql(db,q).run(),/immutable/);
  assert.deepEqual((await sql(db,'SELECT * FROM source_facts ORDER BY id').all()).results,before);
  await enqueue(db,'watch','obsolete-watch',{entity_id:entity.id},FRESH);await runStage(db,'watch',{now:FRESH});
  assert.equal(await sql(db,'SELECT * FROM recheck_requests WHERE entity_id=?',entity.id).first(),null);
  const NEWER='2026-10-09T12:00:00.000Z';await ingestRecords(db,[record({event_start:'2026-10-05',event_end:'2026-10-05',last_checked:NEWER,lifecycle_event:'UNCHANGED'})],{now:NEWER,environment:'shadow'});await drainPipeline(db,{now:NEWER});
  await enqueue(db,'watch','genuinely-new-watch',{entity_id:entity.id},NEWER);await runStage(db,'watch',{now:NEWER});
  // A genuinely fresh receipt is retained, but still names a past event.
  // It does not justify restarting endless automatic polling of that edition.
  assert.equal(await sql(db,'SELECT * FROM recheck_requests WHERE entity_id=?',entity.id).first(),null);
  assert.equal((await sql(db,"SELECT MAX(json_extract(normalized_json,'$.last_checked')) checked FROM producer_records WHERE producer_name='independent-structured'").first()).checked,NEWER);
});
test('obsolete operator resolution refuses current dates, wrong editions, future assessments and ingest-only credentials',async t=>{
  const db=database(t),{entity,recordId}=await seed(db,record(),{environment:'shadow'});
  await sql(db,"INSERT INTO recheck_requests VALUES (?,?,'watch_recheck_due')",entity.id,REQUEST).run();
  const input={entity_id:entity.id,requested_at:REQUEST,producer_record_id:'fixture-1',accepted_record_id:recordId,entity_revision:entity.revision,evidence_ref:'docs/producer-review.json',evidence_hash:'a'.repeat(64),reviewed_by:'Codex',
    evidence:{entity_id:entity.id,requested_at:REQUEST,producer_record_id:'fixture-1',no_longer_produced:true,edition_is_past:true,replacement_delivered:false,last_event_date:'2026-11-22',assessed_at:REQUEST}};
  assert.equal((await resolveObsoleteProducerRequest(db,input,{now:FRESH})).resolved,false);
  assert.equal((await resolveObsoleteProducerRequest(db,{...input,evidence:{...input.evidence,last_event_date:'2025-11-22'}},{now:FRESH})).resolved,false);
  await assert.rejects(resolveObsoleteProducerRequest(db,{...input,evidence:{...input.evidence,assessed_at:'2099-01-01'}},{now:FRESH}),/review_required/);
  const response=await worker.fetch(new Request('https://shadow.test/rechecks/resolve',{method:'POST',headers:{Authorization:'Bearer ingest-only','Content-Type':'application/json'},body:JSON.stringify(input)}),{V3_ROLE:'api',V3_INGEST_TOKEN:'ingest-only',V3_OPERATOR_TOKEN:'operator-only',FINDPITCHES_V3_DB:db});assert.equal(response.status,401);
  assert.equal((await sql(db,'SELECT COUNT(*) AS n FROM recheck_requests').first()).n,1);
});
