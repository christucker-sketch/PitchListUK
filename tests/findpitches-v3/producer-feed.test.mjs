import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeExport} from '../../platform/findpitches-v3/contract.mjs';
import {ingestRecords,linkedEntity,loadEntity,sql} from '../../platform/findpitches-v3/store.mjs';
import {drainPipeline} from '../../platform/findpitches-v3/pipeline.mjs';
import {record,database,NOW} from './helpers.mjs';

test('producer closure/withdrawal feed remains additive, linked and never promotes WATCH',async t=>{
  const db=database(t),current=record({channel:'current',export_readiness:'READY'}),initial=await ingestRecords(db,[current],{environment:'shadow',now:NOW});await drainPipeline(db,{now:NOW});const id=(await linkedEntity(db,initial.record_ids[0])).id,before=(await sql(db,'SELECT * FROM source_facts WHERE record_id=?',initial.record_ids[0]).all()).results;
  const closed={...current,channel:'watch',export_readiness:'WATCH',application_state:'CLOSED_CURRENT_CYCLE',lifecycle_event:'CLOSED',last_checked:'2026-10-07T12:00:00Z'};
  const receipt=await ingestRecords(db,[closed],{environment:'shadow',now:'2026-10-07T12:01:00Z'});assert.equal(receipt.accepted,1);await drainPipeline(db,{now:'2026-10-07T12:01:00Z'});assert.equal((await linkedEntity(db,receipt.record_ids[0])).id,id);assert.equal((await loadEntity(db,id)).application_state,'CLOSED');assert.notEqual((await sql(db,'SELECT status FROM readiness WHERE entity_id=?',id).first()).status,'ready');
  assert.deepEqual((await sql(db,'SELECT * FROM source_facts WHERE record_id=?',initial.record_ids[0]).all()).results,before);
  const stale=await ingestRecords(db,[{...current,last_checked:'2026-10-05T12:00:00Z'}],{environment:'shadow',now:'2026-10-07T12:02:00Z'});await drainPipeline(db,{now:'2026-10-07T12:02:00Z'});assert.equal((await loadEntity(db,id)).application_state,'CLOSED');assert.equal(stale.accepted,1);
  for(const state of ['HISTORICAL','UPCOMING_NOT_OPEN'])assert.deepEqual(normalizeExport({...closed,application_state:state},{environment:'shadow'}).errors,[]);
  const missedClosure={...closed,lifecycle_event:'UNCHANGED'};assert.equal(normalizeExport(missedClosure,{environment:'shadow'}).normalized.lifecycle_state,'CLOSED');
  const held=normalizeExport({...current,channel:'held'},{environment:'shadow'});assert.equal(held.normalized.application_state,'WATCH');const retired=normalizeExport({...current,channel:'retired',lifecycle_event:'WITHDRAWN'},{environment:'shadow'});assert.equal(retired.normalized.lifecycle_state,'WITHDRAWN');
});

test('changed platform identity under a stable producer ID requires review, never a silent new entity',async t=>{
  const db=database(t),first=await ingestRecords(db,[record()],{environment:'shadow',now:NOW});await drainPipeline(db,{now:NOW});const original=(await linkedEntity(db,first.record_ids[0])).id;
  const next=await ingestRecords(db,[record({application_url:'https://www.eventeny.com/events/vendor/?id=99999',canonical_url:'https://www.eventeny.com/events/vendor/?id=99999',source_identifier:'99999',last_checked:'2026-10-07T12:00:00Z'})],{environment:'shadow',now:'2026-10-07T12:01:00Z'});await drainPipeline(db,{now:'2026-10-07T12:01:00Z'});
  const decision=await sql(db,'SELECT * FROM reconciliation_decisions WHERE record_id=?',next.record_ids[0]).first();assert.equal(decision.outcome,'REVIEW_REQUIRED');assert.equal(decision.reason,'stable_producer_identity_changed_requires_review');assert.equal((await sql(db,'SELECT COUNT(*) AS n FROM entities').first()).n,1);assert.equal((await loadEntity(db,original)).application_url,record().application_url);
});
test('historical multi-entity producer IDs cannot silently grow a third identity',async t=>{
  const db=database(t),first=await ingestRecords(db,[record()],{environment:'shadow',now:NOW});await drainPipeline(db,{now:NOW});
  const other=record({opportunity_id:'other-lane',application_url:'https://www.eventeny.com/events/vendor/?id=88888',canonical_url:'https://www.eventeny.com/events/vendor/?id=88888',source_identifier:'88888'});
  const second=await ingestRecords(db,[other],{environment:'shadow',now:NOW});await drainPipeline(db,{now:NOW});const historicalId=(await linkedEntity(db,second.record_ids[0])).id;
  // Retained pre-guard linkage, inserted once in this isolated history fixture.
  const historical=await ingestRecords(db,[{...other,opportunity_id:record().opportunity_id,last_checked:'2026-10-07T12:00:00Z'}],{environment:'shadow',now:'2026-10-07T12:01:00Z'});
  await sql(db,'INSERT INTO entity_records VALUES (?,?)',historical.record_ids[0],historicalId).run();await sql(db,'INSERT INTO reconciliation_decisions VALUES (?,?,?,?,?,?)',historical.record_ids[0],'EXACT_MATCH',historicalId,'[]','retained_pre_guard_history',NOW).run();
  const next=await ingestRecords(db,[record({application_url:'https://www.eventeny.com/events/vendor/?id=99999',canonical_url:'https://www.eventeny.com/events/vendor/?id=99999',source_identifier:'99999',last_checked:'2026-10-08T12:00:00Z'})],{environment:'shadow',now:'2026-10-08T12:01:00Z'});await drainPipeline(db,{now:'2026-10-08T12:01:00Z'});
  const decision=await sql(db,'SELECT * FROM reconciliation_decisions WHERE record_id=?',next.record_ids[0]).first();assert.equal(decision.outcome,'REVIEW_REQUIRED');assert.equal(JSON.parse(decision.candidates_json).length,2);assert.equal((await sql(db,'SELECT COUNT(*) AS n FROM entities').first()).n,2);
});
