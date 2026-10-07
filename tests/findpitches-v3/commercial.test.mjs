import test from 'node:test';
import assert from 'node:assert/strict';
import {database,seed,record,NOW} from './helpers.mjs';
import {documentFixture} from './verification-fixture.mjs';
import {recordVerification} from '../../platform/findpitches-v3/verification-store.mjs';
import {evaluateReadiness} from '../../platform/findpitches-v3/pipeline.mjs';
import {commercialStatus,inventoryFromRows,commercialEntity} from '../../platform/findpitches-v3/commercial.mjs';
import {sql} from '../../platform/findpitches-v3/store.mjs';
import {structuredPriority,growthMetrics} from '../../operations/findpitches-v3/commercial-growth.mjs';

const row=changes=>({id:'entity',market:'US',environment:'shadow',revision:14,origin:'independent-structured',producers_json:'["independent-structured","legacy_v2"]',fields_json:JSON.stringify({...record(),event_start:'2026-11-21',event_end:'2026-11-22'}),proof_sequence:1,proof_revision:14,verifier_version:'source-proof-v1',proof_status:'verified',proof_json:JSON.stringify({facts:{country:'US',application_url:record().application_url,application_state:'OPEN_NOW'},reasons:[]}),checked_at:NOW,expires_at:'2026-10-07T12:00:00.000Z',cached_readiness:'ready',readiness_revision:14,quality_holds:0,conflicts:0,...changes});
test('commercial origins sum uniquely; overlapping provenance and test controls do not inflate READY',()=>{
  const r=inventoryFromRows([row({}),row({id:'legacy',origin:'legacy_v2',producers_json:'["legacy_v2"]'}),row({id:'control',environment:'test'})],{now:NOW});
  assert.equal(r.totals.ready,2);assert.equal(r.scope.test_control_excluded,1);assert.equal(r.by_origin['independent-structured'].ready,1);assert.equal(r.by_origin.legacy_v2.ready,1);assert.equal(r.by_source_membership.legacy_v2.ready,2);assert.equal(r.ready_by_country.US,2);
  assert.equal(r.totals.ready+r.totals.watch+r.totals.quarantined+r.totals.blocked,r.totals.total_distinct_entities);
});
test('stale cached READY, changed revisions, conflicts and held evidence never count commercially',()=>{
  for(const changes of [{expires_at:'2026-10-05T12:00:00.000Z'},{proof_revision:13},{readiness_revision:13},{quality_holds:1},{conflicts:1},{proof_status:'quarantine'},{proof_sequence:null},{verifier_version:'old'}])assert.equal(commercialEntity(row(changes),NOW).ready,false,JSON.stringify(changes));
});
test('commercial verification prioritises proved-application candidates and reports gains without identity changes',()=>{
  const strong=row({}),weak=row({id:'weak',fields_json:JSON.stringify({canonical_url:'https://example.org/blog/discovery',application_state:'WATCH'})});
  assert.ok(structuredPriority(strong,NOW)>structuredPriority(weak,NOW));
  const result=growthMetrics([row({cached_readiness:'watch'})],[strong],{now:NOW});
  assert.equal(result.structured.newly_promoted_ready,1);assert.equal(result.structured.records_checked,1);assert.equal(result.identity_mutations,0);
  assert.equal(growthMetrics([strong],[{...strong,market:'GB'}],{now:NOW}).identity_mutations,1);
});
test('real commercial history counts first proved READY in London day, never renewals or unproved claims',async t=>{
  const db=database(t),{entity}=await seed(db,record(),{environment:'shadow'});
  assert.equal((await commercialStatus(db,NOW)).kpis.new_ready_today,0);
  await recordVerification(db,entity.id,documentFixture(),{now:NOW});await evaluateReadiness(db,entity.id,{now:NOW});
  await evaluateReadiness(db,entity.id,{now:'2026-10-06T13:00:00.000Z'});
  const status=await commercialStatus(db,'2026-10-06T13:00:00.000Z');assert.equal(status.kpis.total_customer_ready_opportunities,1);assert.equal(status.kpis.new_ready_today,1);assert.equal(status.kpis.cost_per_ready_usd,null);
  assert.equal((await commercialStatus(db,'2026-10-07T13:00:00.000Z')).kpis.total_customer_ready_opportunities,0);
  assert.equal((await commercialStatus(db,'2026-10-07T13:00:00.000Z')).kpis.stale_expired_ready_removed,1);
  await assert.rejects(sql(db,'DELETE FROM commercial_readiness_history').run(),/immutable/);
  const existing=await sql(db,'SELECT * FROM source_verifications LIMIT 1').first();
  await sql(db,"INSERT OR REPLACE INTO source_verifications SELECT sequence,'different-id',entity_id,entity_revision,document_id,verifier_version,status,report_json,checked_at,expires_at FROM source_verifications WHERE sequence=?",existing.sequence).run();
  assert.equal((await sql(db,'SELECT id FROM source_verifications WHERE sequence=?',existing.sequence).first()).id,existing.id);
});
test('an unproved READY cache cannot manufacture growth; paid first-READY yield survives later expiry',async t=>{
  const db=database(t);
  await sql(db,"INSERT INTO quality_gates VALUES ('structured-100-preservation',100,0,'{}','gate',?)",NOW).run();
  const {entity}=await seed(db,record(),{environment:'shadow',producer:'city-search'});
  await sql(db,"INSERT INTO commercial_readiness_history(id,entity_id,entity_revision,status,occurred_at) VALUES ('unproved',?,?,'ready',?)",entity.id,entity.revision,NOW).run();
  assert.equal((await sql(db,'SELECT COUNT(*) AS n FROM commercial_readiness_history').first()).n,0);
  await recordVerification(db,entity.id,documentFixture(),{now:NOW});await evaluateReadiness(db,entity.id,{now:NOW});
  const before=await commercialStatus(db,NOW),after=await commercialStatus(db,'2026-10-08T12:00:00.000Z');
  assert.equal(before.kpis.first_confirmed_paid_ready,1);assert.equal(after.totals.ready,0);assert.equal(after.kpis.first_confirmed_paid_ready,1);
});
test('non-trader scope cannot inflate current inventory or first-READY growth from older proof',async t=>{
  const db=database(t),{entity}=await seed(db,record(),{environment:'shadow'});
  const report={...JSON.parse(row({}).proof_json),profile:'eventeny',evidence:[{kind:'main_heading',excerpt:'Christkindl Market Performer'}]};
  await sql(db,"INSERT INTO source_documents VALUES ('old',?,NULL,?,'{}')",entity.application_url,NOW).run();
  await sql(db,"INSERT INTO source_verifications(id,entity_id,entity_revision,document_id,verifier_version,status,report_json,checked_at,expires_at) VALUES ('scope-blind',?,?,'old','source-proof-v1','verified',?,?,'2026-10-07T12:00:00.000Z')",entity.id,entity.revision,JSON.stringify(report),NOW).run();
  await sql(db,"UPDATE readiness SET status='ready',evaluated_at=? WHERE entity_id=?",NOW,entity.id).run();
  const r=await commercialStatus(db,NOW);assert.equal(r.totals.ready,0);assert.equal(r.kpis.new_ready_today,0);assert.equal(r.kpis.previously_confirmed_ready,0);assert.equal(r.by_origin['independent-structured'].watch,1);
});
