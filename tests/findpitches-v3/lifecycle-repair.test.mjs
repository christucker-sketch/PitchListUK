import test from 'node:test';
import assert from 'node:assert/strict';
import {database,record,seed,NOW} from './helpers.mjs';
import {documentFixture} from './verification-fixture.mjs';
import {sql,loadEntity} from '../../platform/findpitches-v3/store.mjs';
import {recordVerification} from '../../platform/findpitches-v3/verification-store.mjs';
import {evaluateReadiness,drainPipeline} from '../../platform/findpitches-v3/pipeline.mjs';
import {repairLifecycleObservations} from '../../platform/findpitches-v3/lifecycle-repair.mjs';
import worker from '../../platform/findpitches-v3/worker.mjs';

const LATER='2026-10-06T12:15:00.000Z';
async function fixture(t,{proof=true}={}) {
  const db=database(t);await sql(db,'UPDATE commercial_acquisition_policy SET manual_paused=1').run();
  await sql(db,"INSERT INTO quality_gates VALUES ('structured-100-preservation',100,0,'{}','lifecycle-fixture',?)",NOW).run();
  const initial=await seed(db,record(),{environment:'shadow'});
  if(proof){await recordVerification(db,initial.entity.id,documentFixture(),{now:NOW});await evaluateReadiness(db,initial.entity.id,{now:NOW});}
  return {db,...initial};
}
async function oldConflict(db,entityId,recordId,{field='lifecycle_state',reason='equal_authority_disagreement'}={}) {
  const id='legacy-bug:'+recordId+':'+field;
  await sql(db,'INSERT INTO conflicts(id,entity_id,record_id,field_name,reason,created_at) VALUES (?,?,?,?,?,?)',id,entityId,recordId,field,reason,LATER).run();
  return id;
}

test('routine producer lifecycle observations retain evidence without conflicts, identity/revision changes or proof renewal',async t=>{
  const {db,entity,recordId}=await fixture(t),before=await loadEntity(db,entity.id);
  const original=await sql(db,'SELECT * FROM producer_records WHERE id=?',recordId).first();
  const facts=(await sql(db,'SELECT * FROM source_facts WHERE record_id=? ORDER BY field_name',recordId).all()).results;
  for(const [i,lifecycle_event] of ['UNCHANGED','UPDATED','NEW'].entries()) {
    const next=await seed(db,record({lifecycle_event,last_checked:`2026-10-06T12:${16+i}:00.000Z`}),{environment:'shadow'});
    assert.equal(next.entity.id,entity.id);assert.equal(next.entity.revision,before.revision);assert.equal(next.entity.lifecycle_state,'NEW');
    assert.equal((await evaluateReadiness(db,entity.id,{now:LATER})).status,'ready');
  }
  assert.equal((await sql(db,'SELECT COUNT(*) AS n FROM conflicts').first()).n,0);
  assert.equal((await sql(db,"SELECT COUNT(*) AS n FROM producer_records WHERE producer_name='independent-structured'").first()).n,4);
  assert.equal((await sql(db,'SELECT COUNT(*) AS n FROM source_verifications').first()).n,1);
  assert.equal((await sql(db,'SELECT checked_at FROM source_verifications').first()).checked_at,NOW);
  assert.deepEqual(await sql(db,'SELECT * FROM producer_records WHERE id=?',recordId).first(),original);
  assert.deepEqual((await sql(db,'SELECT * FROM source_facts WHERE record_id=? ORDER BY field_name',recordId).all()).results,facts);
});

test('UNCHANGED/UPDATED cannot reopen an explicitly withdrawn opportunity or substitute for a substantive state change',async t=>{
  const {db,entity}=await fixture(t);
  await seed(db,record({application_state:'CLOSED',lifecycle_event:'WITHDRAWN',last_checked:LATER}),{environment:'shadow'});
  for(const lifecycle_event of ['UNCHANGED','UPDATED','NEW'])await seed(db,record({application_state:'CLOSED',lifecycle_event,last_checked:'2026-10-06T13:00:00.000Z'}),{environment:'shadow'});
  assert.equal((await loadEntity(db,entity.id)).lifecycle_state,'WITHDRAWN');
  assert.equal((await evaluateReadiness(db,entity.id,{now:LATER})).status,'blocked');
  await seed(db,record({application_state:'OPEN_NOW',lifecycle_event:'UPDATED',last_checked:'2026-10-06T14:00:00.000Z'}),{environment:'shadow'});
  assert.equal((await loadEntity(db,entity.id)).application_state,'CLOSED');
  assert.equal((await sql(db,"SELECT COUNT(*) AS n FROM conflicts WHERE field_name='application_state' AND resolved=0").first()).n,1);
});

test('real organiser/location disagreements remain conflicts even when the delivery says UPDATED',async t=>{
  const {db,entity}=await fixture(t);
  const next=await seed(db,record({lifecycle_event:'UPDATED',last_checked:LATER,organiser:'Another Organiser',location:'Unrelated Town'}),{environment:'shadow'});
  assert.equal(next.entity.id,entity.id);
  const conflicts=(await sql(db,'SELECT field_name FROM conflicts WHERE entity_id=? AND resolved=0 ORDER BY field_name',entity.id).all()).results;
  assert.deepEqual(conflicts.map(r=>r.field_name),['location','organiser']);
  assert.equal((await evaluateReadiness(db,entity.id,{now:LATER})).status,'blocked');
});

test('audited repair clears only old informational lifecycle conflicts, remains idempotent and never rewrites source/selection',async t=>{
  const {db,entity}=await fixture(t),next=await seed(db,record({lifecycle_event:'UNCHANGED',last_checked:LATER}),{environment:'shadow'});
  const id=await oldConflict(db,entity.id,next.recordId);
  assert.equal((await evaluateReadiness(db,entity.id,{now:LATER})).status,'blocked');
  const originalRecords=(await sql(db,'SELECT * FROM producer_records ORDER BY id').all()).results;
  const originalFacts=(await sql(db,'SELECT * FROM source_facts ORDER BY id').all()).results;
  const before=await loadEntity(db,entity.id);
  await assert.rejects(sql(db,'UPDATE conflicts SET resolved=1 WHERE id=?',id).run(),/audit_required/);
  const repaired=await repairLifecycleObservations(db,entity.id,{now:LATER});assert.equal(repaired.resolved_conflicts,1);
  assert.equal((await sql(db,'SELECT status FROM readiness WHERE entity_id=?',entity.id).first()).status,'blocked','repair itself does not promote');
  await drainPipeline(db,{now:LATER});assert.equal((await sql(db,'SELECT status FROM readiness WHERE entity_id=?',entity.id).first()).status,'ready','normal automatic stage path rechecks despite earlier completed jobs');
  assert.equal((await loadEntity(db,entity.id)).revision,before.revision);
  assert.equal((await loadEntity(db,entity.id)).selections.lifecycle_state.fact_id,before.selections.lifecycle_state.fact_id);
  assert.deepEqual((await sql(db,'SELECT * FROM producer_records ORDER BY id').all()).results,originalRecords);
  assert.deepEqual((await sql(db,'SELECT * FROM source_facts ORDER BY id').all()).results,originalFacts);
  assert.equal((await repairLifecycleObservations(db,entity.id,{now:LATER})).resolved_conflicts,0);
  assert.equal((await sql(db,'SELECT COUNT(*) AS n FROM lifecycle_observation_resolutions').first()).n,1);
  await assert.rejects(sql(db,'DELETE FROM lifecycle_observation_resolutions').run(),/immutable/);
  await assert.rejects(sql(db,"UPDATE lifecycle_observation_resolutions SET reason='other'").run(),/immutable/);
  await sql(db,"INSERT OR REPLACE INTO lifecycle_observation_resolutions SELECT conflict_id,entity_id,record_id,incoming_fact_id,selected_fact_id,policy_version,reason,'{}',resolved_at FROM lifecycle_observation_resolutions").run();
  assert.notEqual((await sql(db,'SELECT evidence_json FROM lifecycle_observation_resolutions').first()).evidence_json,'{}');
});

test('repair preserves substantive lifecycle, field and ambiguous-identity conflicts and rejects a forged resolution',async t=>{
  const {db,entity}=await fixture(t);
  const metadata=await seed(db,record({lifecycle_event:'UPDATED',last_checked:LATER,organiser:'Different'}),{environment:'shadow'});
  await oldConflict(db,entity.id,metadata.recordId);
  const closing=await seed(db,record({lifecycle_event:'WITHDRAWN',application_state:'CLOSED',last_checked:'2026-10-05T12:00:00.000Z'}),{environment:'shadow'});
  const substantive=await oldConflict(db,entity.id,closing.recordId);
  await oldConflict(db,entity.id,metadata.recordId,{field:null,reason:'ambiguous_identity'});
  await repairLifecycleObservations(db,entity.id,{now:LATER});
  assert.equal((await sql(db,'SELECT resolved FROM conflicts WHERE id=?',substantive).first()).resolved,0);
  assert.equal((await sql(db,"SELECT COUNT(*) AS n FROM conflicts WHERE entity_id=? AND resolved=0 AND (field_name='organiser' OR field_name IS NULL)",entity.id).first()).n,2);
  assert.equal((await evaluateReadiness(db,entity.id,{now:LATER})).status,'blocked');
  const selected=(await loadEntity(db,entity.id)).selections.lifecycle_state.fact_id;
  await assert.rejects(sql(db,'INSERT INTO lifecycle_observation_resolutions VALUES (?,?,?,?,?,?,?,?,?)',substantive,entity.id,closing.recordId,closing.recordId+':lifecycle_state',selected,'lifecycle-observation-v1','delivery_observation_not_source_disagreement','{}',LATER).run(),/scope_required/);
});

test('clearing metadata cannot refresh expired proof or bypass paused/shadow/operator boundaries',async t=>{
  const {db,entity}=await fixture(t),next=await seed(db,record({lifecycle_event:'UNCHANGED',last_checked:LATER}),{environment:'shadow'});
  await oldConflict(db,entity.id,next.recordId);
  const env={FINDPITCHES_V3_DB:db,V3_ROLE:'reconcile',V3_OPERATOR_TOKEN:'operator-only-fixture-secret-long',V3_INGEST_TOKEN:'different-ingest-fixture-secret-long'};
  const denied=await worker.fetch(new Request('https://shadow.test/lifecycle/repair',{method:'POST',headers:{Authorization:'Bearer '+env.V3_INGEST_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({entity_id:entity.id})}),env);
  assert.equal(denied.status,401);
  await sql(db,'UPDATE commercial_acquisition_policy SET manual_paused=0').run();
  await assert.rejects(repairLifecycleObservations(db,entity.id,{now:LATER}),/shadow_guard/);
  await sql(db,'UPDATE commercial_acquisition_policy SET manual_paused=1').run();
  const later='2026-10-07T13:00:00.000Z';await repairLifecycleObservations(db,entity.id,{now:later});await drainPipeline(db,{now:later});
  assert.equal((await evaluateReadiness(db,entity.id,{now:later})).status,'watch');
  assert.equal((await sql(db,'SELECT checked_at FROM source_verifications').first()).checked_at,NOW);
  const testEntity=await seed(db,record({opportunity_id:'test-scope',application_url:'https://www.eventeny.com/events/vendor/?id=777',canonical_url:'https://www.eventeny.com/events/vendor/?id=777'}));
  await assert.rejects(repairLifecycleObservations(db,testEntity.entity.id,{now:LATER}),/shadow_guard/);
  assert.equal((await sql(db,'SELECT COUNT(*) AS n FROM customer_projections').first()).n,0);assert.equal((await sql(db,'SELECT COUNT(*) AS n FROM publication_queue').first()).n,0);
});
