import assert from 'node:assert/strict';
import test from 'node:test';
import {database,record,NOW,seed} from './helpers.mjs';
import {hash,normalizeExport} from '../../platform/findpitches-v3/contract.mjs';
import {legacyGlobalRecord,importLegacyGlobalRecords} from '../../platform/findpitches-v3/legacy-global.mjs';
import {sql,loadEntity} from '../../platform/findpitches-v3/store.mjs';
import {drainPipeline} from '../../platform/findpitches-v3/pipeline.mjs';
import {commercialStatus} from '../../platform/findpitches-v3/commercial.mjs';
import worker from '../../platform/findpitches-v3/worker.mjs';
import {documentFixture} from './verification-fixture.mjs';

const url='https://craft.example.org/autumn-fair';
async function recovery() {
  const original={source_url:url,application_url:'https://unrelated.example.org/tickets',event_name:'Visitor directory',
    location:'Query City',event_start:'2099-11-01',application_state:'OPEN_NOW',publishable:true,query_text:'Query City stallholders'};
  const html='<main><h1>Harbour Autumn Craft Fair</h1><p>Vendor and stallholder applications require review.</p></main><footer><a href="https://unrelated.example.org/form">Vendor application</a></footer>';
  const document={requested_url:url,url,fetched_at:NOW,http_status:200,html,content_hash:await hash(html)};
  const custody={workflow_id:'ukctl-v12-discover-q4-l4',archive_manifest_sha256:'a'.repeat(64),workflow_receipt_sha256:'b'.repeat(64),original_record_sha256:await hash(original)};
  return legacyGlobalRecord({original,document,custody});
}
async function guard(db) {
  await sql(db,'UPDATE commercial_acquisition_policy SET manual_paused=1').run();
  await sql(db,"INSERT INTO quality_gates VALUES ('structured-100-preservation',100,0,'{}','legacy-global-test',?)",NOW).run();
}

test('legacy global recovery uses actual source facts and never query geography, old dates, publication flags or footer application links',async t=>{
  const db=database(t);await guard(db);const {record:r}=await recovery();
  assert.equal(r.event_name,'Harbour Autumn Craft Fair');assert.equal(r.application_url,null);assert.equal(r.application_state,'UNKNOWN');
  assert.equal(r.location,undefined);assert.equal(r.event_start,undefined);assert.equal(r.publication_eligible,false);
  assert.equal(r.legacy_global_uk.original_fields.publishable,true,'historical classification survives as evidence only');
  const imported=await importLegacyGlobalRecords(db,{records:[r]},{now:NOW});await drainPipeline(db,{now:NOW});
  assert.equal(imported.accepted,1);const c=await commercialStatus(db,NOW);
  assert.equal(c.by_origin['legacy-global-uk'].blocked,1);assert.equal(c.totals.ready,0);assert.equal(c.kpis.paid_acquisition_queries,0);
  assert.equal((await sql(db,'SELECT producer_name FROM producer_records').first()).producer_name,'legacy-global-uk');
});

test('legacy global replay is idempotent and weaker recovery cannot rewrite a stronger independent source or change identity',async t=>{
  const db=database(t);await guard(db);
  const initial=await seed(db,record({country_code:'GB',event_name:'Harbour Autumn Craft Fair',canonical_url:url,application_url:url,source_platform:'craft.example.org'}),{environment:'shadow'});
  const beforeRecords=(await sql(db,'SELECT * FROM producer_records ORDER BY id').all()).results;
  const beforeFacts=(await sql(db,'SELECT * FROM source_facts ORDER BY id').all()).results;
  const before=await loadEntity(db,initial.entity.id);const {record:r}=await recovery();
  const imported=await importLegacyGlobalRecords(db,{records:[r]},{now:NOW});await drainPipeline(db,{now:NOW});
  const replay=await importLegacyGlobalRecords(db,{records:[r]},{now:NOW});assert.equal(replay.duplicates,1);
  assert.equal((await sql(db,'SELECT COUNT(*) AS n FROM entities').first()).n,1);
  const selected=await loadEntity(db,initial.entity.id);assert.equal(selected.location,before.location);assert.equal(selected.application_state,'OPEN_NOW');assert.equal(selected.event_start,before.event_start);
  assert.deepEqual(await sql(db,'SELECT * FROM producer_records WHERE id=?',beforeRecords[0].id).first(),beforeRecords[0]);
  assert.deepEqual((await sql(db,'SELECT * FROM source_facts WHERE record_id=? ORDER BY id',beforeRecords[0].id).all()).results,beforeFacts);
  assert.equal((await sql(db,'SELECT entity_id FROM entity_records WHERE record_id=?',imported.record_ids[0]).first()).entity_id,initial.entity.id);
});

test('legacy global imports require archive custody, operator authentication and paused shadow boundaries before any write',async t=>{
  const db=database(t);await guard(db);const {record:r}=await recovery();
  assert.ok(normalizeExport({...r,legacy_global_uk:{audit_status:'pending',shadow_only:true}},{producer:'legacy-global-uk'}).errors.includes('legacy_global_archive_custody_required'));
  await assert.rejects(importLegacyGlobalRecords(db,{records:[r,{...r,publication_eligible:true}]},{now:NOW}),/evidence_record_invalid/);
  assert.equal((await sql(db,'SELECT COUNT(*) AS n FROM producer_records').first()).n,0);
  const env={FINDPITCHES_V3_DB:db,V3_ROLE:'ingest',V3_OPERATOR_TOKEN:'operator-global-fixture-long-token',V3_INGEST_TOKEN:'ingest-only-global-fixture-long-token'};
  const response=await worker.fetch(new Request('https://shadow.test/legacy-global/import',{method:'POST',headers:{Authorization:'Bearer '+env.V3_INGEST_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({records:[r]})}),env);
  assert.equal(response.status,401);
  await sql(db,'UPDATE commercial_acquisition_policy SET manual_paused=0').run();
  await assert.rejects(importLegacyGlobalRecords(db,{records:[r]},{now:NOW}),/shadow_paused_guard/);
  assert.equal((await sql(db,'SELECT COUNT(*) AS n FROM customer_projections').first()).n,0);
});

test('legacy global recovery holds contradictory country and directory evidence without creating an entity',async()=>{
  const document=documentFixture();document.content_hash=await hash(document.html);
  const input={original:{source_url:document.requested_url},document,custody:{workflow_id:'ukctl-v1-discover-q0-l4',archive_manifest_sha256:'a'.repeat(64),workflow_receipt_sha256:'b'.repeat(64),original_record_sha256:'c'.repeat(64)}};
  const country=await legacyGlobalRecord(input);
  assert.equal(country.category,'quarantine');assert.equal(country.reason,'source_country_market_mismatch');assert.equal(country.record,undefined);
  const directory=documentFixture({url:'https://official.example.org/directory',event:{location:{name:'Town Hall',address:{addressLocality:'London',addressCountry:'GB'}}}});
  const held=await legacyGlobalRecord({...input,original:{source_url:directory.requested_url},document:directory});
  assert.equal(held.category,'quarantine');assert.equal(held.record,undefined);
});
