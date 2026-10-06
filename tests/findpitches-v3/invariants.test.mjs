import test from 'node:test';
import assert from 'node:assert/strict';
import { database,record,seed,NOW } from './helpers.mjs';
import { sql,loadEntity,ingestRecords } from '../../platform/findpitches-v3/store.mjs';
import { proposeFact,selectRecordFacts } from '../../platform/findpitches-v3/evidence.mjs';
import { reconcileIdentity,canonicalUrl } from '../../platform/findpitches-v3/identity.mjs';
import { assessEligibility,evaluateReadiness,drainPipeline } from '../../platform/findpitches-v3/pipeline.mjs';
import { normalizeExport } from '../../platform/findpitches-v3/contract.mjs';

test('SQL retains raw evidence, facts, memberships and audit, including INSERT OR REPLACE bypasses',async t=>{
  const db=database(t),{entity,recordId}=await seed(db),fact=entity.selections.event_name;
  for(const [query,args] of [
    ['UPDATE producer_records SET raw_json=? WHERE id=?',['{}',recordId]],['DELETE FROM producer_records WHERE id=?',[recordId]],
    ['UPDATE source_facts SET value_json=? WHERE id=?',['"Destroyed"',fact.fact_id]],['DELETE FROM source_facts WHERE id=?',[fact.fact_id]],
    ['UPDATE entity_records SET entity_id=? WHERE record_id=?',[entity.id,recordId]],['DELETE FROM entity_facts WHERE entity_id=?',[entity.id]],
    ['DELETE FROM selection_audit WHERE entity_id=?',[entity.id]],['DELETE FROM field_selections WHERE entity_id=?',[entity.id]],
    ['UPDATE entities SET environment=? WHERE id=?',['production',entity.id]],['UPDATE entities SET promotion_eligible=1 WHERE id=?',[entity.id]],
  ])await assert.rejects(sql(db,query,...args).run());
  await sql(db,"INSERT OR REPLACE INTO source_facts SELECT id,record_id,field_name,'\"Destroyed\"',authority,source_url,evidence_json,provenance_json,created_at FROM source_facts WHERE id=?",fact.fact_id).run();
  await sql(db,"INSERT OR REPLACE INTO producer_records SELECT id,producer_name,producer_type,producer_record_id,environment,market,content_hash,'{}',normalized_json,validation_status,errors_json,received_at FROM producer_records WHERE id=?",recordId).run();
  await sql(db,"INSERT OR REPLACE INTO entities SELECT id,market,edition,'production',0,1,1,revision,created_at,updated_at FROM entities WHERE id=?",entity.id).run();
  assert.equal((await loadEntity(db,entity.id)).event_name,record().event_name);
  assert.equal((await loadEntity(db,entity.id)).environment,'test');
  assert.notEqual((await sql(db,'SELECT raw_json FROM producer_records WHERE id=?',recordId).first()).raw_json,'{}');
});
test('lower-authority replacement and customer/publication leakage are blocked by SQL',async t=>{
  const db=database(t),{entity}=await seed(db);
  const proposal=await proposeFact(db,entity.id,{field:'event_name',value:'Generic title',kind:'extracted_page',source_url:'https://example.org/form',excerpt:'Generic form title'},{now:NOW});
  assert.equal(proposal.decision,'rejected');
  await assert.rejects(sql(db,'UPDATE field_selections SET fact_id=? WHERE entity_id=? AND field_name=?',proposal.fact_id,entity.id,'event_name').run(),/weaker/);
  await assert.rejects(sql(db,'INSERT OR REPLACE INTO field_selections VALUES (?,?,?)',entity.id,'event_name',proposal.fact_id).run(),/replace_forbidden/);
  await assert.rejects(sql(db,'INSERT INTO customer_projections VALUES (?,?,?,?)',entity.id,entity.revision,'{}',NOW).run(),/blocked/);
  await assert.rejects(sql(db,'INSERT INTO publication_queue VALUES (?,?,?,?)','pub',entity.id,'ready',NOW).run(),/disabled/);
});
test('stronger identical evidence upgrades authority and prevents a later medium-authority overwrite',async t=>{
  const db=database(t);await sql(db,"INSERT INTO quality_gates VALUES ('structured-100-preservation',100,0,'{}','gate',?)",NOW).run();
  const weak=await seed(db,record(),{producer:'city-search'});assert.equal(weak.entity.selections.event_name.authority,50);
  await seed(db,record());const strong=await loadEntity(db,weak.entity.id);assert.equal(strong.selections.event_name.authority,100);
  const proposal=await proposeFact(db,strong.id,{field:'event_name',value:'Different medium-authority title',kind:'official_page',source_url:'https://example.org/form',excerpt:'Different title'},{now:NOW});
  assert.equal(proposal.decision,'rejected');assert.equal((await loadEntity(db,strong.id)).event_name,record().event_name);
});
test('initial batched selection rejects invalid locations and a stale empty snapshot cannot overwrite existing evidence',async t=>{
  const db=database(t),{entity}=await seed(db,record({location:'Submit form with your email'}));
  assert.equal(entity.location,undefined);
  assert.equal((await sql(db,"SELECT decision FROM selection_audit WHERE entity_id=? AND field_name='location'",entity.id).first()).decision,'rejected');
  const imported=await ingestRecords(db,[record({opportunity_id:'raced-initial',event_name:'Different title',location:'Elsewhere'})],{environment:'test',now:NOW});
  const facts=(await sql(db,'SELECT * FROM source_facts WHERE record_id=?',imported.record_ids[0]).all()).results;
  await assert.rejects(selectRecordFacts(db,entity.id,facts,{now:NOW,snapshot:{...entity,selections:{}}}),/selection_raced_retry/);
  assert.equal((await loadEntity(db,entity.id)).event_name,record().event_name);
  assert.equal((await sql(db,"SELECT COUNT(*) AS count FROM selection_audit WHERE proposed_fact_id=? AND decision='accepted'",imported.record_ids[0]+':event_name').first()).count,0);
});
test('additive supported evidence fills a missing field and invalidates stale readiness',async t=>{
  const db=database(t),{entity}=await seed(db,record({organiser:null}));
  assert.equal((await sql(db,'SELECT status FROM readiness WHERE entity_id=?',entity.id).first()).status,'blocked');
  const p=await proposeFact(db,entity.id,{field:'organiser',value:'River Arts Association',kind:'official_page',source_url:'https://example.org/organiser',excerpt:'Organised by River Arts Association'},{now:NOW});
  assert.equal(p.decision,'accepted');assert.equal(await sql(db,'SELECT * FROM readiness WHERE entity_id=?',entity.id).first(),null);
  assert.equal((await evaluateReadiness(db,entity.id,{now:NOW})).status,'ready');
  await assert.rejects(proposeFact(db,entity.id,{field:'organiser',value:{name:'invalid'},kind:'official_page',source_url:'https://example.org/',excerpt:'Invalid shape'}),/invalid_proposed/);
});
test('equal-authority static disagreement remains retained as a conflict and blocks readiness',async t=>{
  const db=database(t),{entity}=await seed(db);
  await seed(db,record({opportunity_id:'fixture-2',organiser:'Different Organisation'}));
  const current=await loadEntity(db,entity.id);assert.equal(current.organiser,'River Arts Association');
  assert.equal((await sql(db,'SELECT COUNT(*) AS n FROM conflicts WHERE entity_id=? AND resolved=0',entity.id).first()).n,1);
  assert.equal((await evaluateReadiness(db,entity.id,{now:NOW})).status,'blocked');
  assert.equal((await sql(db,"SELECT COUNT(*) AS n FROM source_facts WHERE field_name='organiser'").first()).n,2);
});
test('newer explicit source lifecycle transitions close and reopen without rewriting identity evidence',async t=>{
  const db=database(t),{entity}=await seed(db);
  for(const [application_state,lifecycle_event,last_checked] of [['CLOSED','CLOSED','2026-10-07T12:00:00.000Z'],['OPEN_NOW','REOPENED','2026-10-08T12:00:00.000Z']]) {
    await seed(db,record({application_state,lifecycle_event,last_checked}));
    const current=await loadEntity(db,entity.id);assert.equal(current.application_state,application_state);assert.equal(current.event_name,record().event_name);
  }
  assert.equal((await sql(db,'SELECT COUNT(*) AS n FROM entities').first()).n,1);
  assert.equal((await sql(db,'SELECT COUNT(*) AS n FROM conflicts').first()).n,0);
});
test('market, scope, platform IDs and editions remain distinct; ambiguous titles are not forced merges',()=>{
  const input=normalizeExport(record(),{environment:'test'}).normalized,candidate={...input,id:'existing'};
  assert.equal(reconcileIdentity(input,[candidate]).outcome,'EXACT_MATCH');
  for(const changed of [{market:'GB'},{environment:'shadow'},{event_start:'2027-11-21'},{source_identifier:'999',application_url:'https://www.eventeny.com/events/vendor/?id=999',canonical_url:'https://www.eventeny.com/events/vendor/?id=999'}])assert.equal(reconcileIdentity({...input,...changed},[candidate]).outcome,'NEW_ENTITY');
  assert.equal(reconcileIdentity({...input,application_url:'https://example.org/autumn',canonical_url:'https://example.org/autumn',source_identifier:null,source_platform:null},[candidate]).outcome,'PROBABLE_MATCH');
  const generic={...input,event_name:'Vendor Application',organiser:null,location:null,application_url:'https://www.eventeny.com/events/applications/',canonical_url:null,source_identifier:null};
  assert.equal(reconcileIdentity(generic,[{...generic,id:'generic'}]).outcome,'NEW_ENTITY');
  assert.match(canonicalUrl('https://www.eventeny.com/events/vendor/?utm_source=x&id=52126'),/id=52126/);
  assert.equal(reconcileIdentity(input,[candidate,{...candidate,id:'other'}]).outcome,'CONFLICT');
});
test('WATCH stays in shadow analysis; rejected receipts are immutable and idempotent',async t=>{
  const db=database(t),{entity}=await seed(db,record({application_state:'WATCH'}));
  assert.equal(assessEligibility(entity,{now:NOW}).status,'watch');
  assert.equal((await sql(db,'SELECT status FROM readiness WHERE entity_id=?',entity.id).first()).status,'watch');
  assert.ok(await sql(db,'SELECT * FROM shadow_projections WHERE entity_id=?',entity.id).first());
  const invalid=record({publication_eligible:true});
  for(let i=0;i<2;i++){const result=await ingestRecords(db,[invalid],{environment:'test',now:NOW});assert.equal(result.rejected,1);assert.equal(result.inserted,i?0:1);}
  await assert.rejects(ingestRecords(db,[record()],{environment:'production'}),/shadow_or_test/);
  await drainPipeline(db,{now:NOW});assert.equal((await sql(db,'SELECT COUNT(*) AS n FROM entities').first()).n,1);
});
