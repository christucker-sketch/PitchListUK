import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {database,seed,record,NOW} from './helpers.mjs';
import {sql,ingestRecords} from '../../platform/findpitches-v3/store.mjs';
import {drainPipeline,evaluateReadiness} from '../../platform/findpitches-v3/pipeline.mjs';
import {recordVerification} from '../../platform/findpitches-v3/verification-store.mjs';
import {documentFixture} from './verification-fixture.mjs';
import {INVENTORY_SQL,LEGACY_INVENTORY_SQL} from '../../platform/findpitches-v3/commercial.mjs';
import {stagingCatalogue} from '../../platform/findpitches-v3/staging.mjs';
import {selectionHeadMigration} from '../../operations/findpitches-v3/build-selection-head-migration.mjs';
const read=async(db,q)=>(await sql(db,q,'').all()).results.map(r=>({...r,proof_json:JSON.parse(r.proof_json)}));
async function parity(db){assert.deepEqual(await read(db,INVENTORY_SQL),await read(db,LEGACY_INVENTORY_SQL));}
async function fixture(t){const db=database(t),input=record(),{entity,recordId}=await seed(db,input,{environment:'shadow'});await recordVerification(db,entity.id,documentFixture(),{now:NOW});await evaluateReadiness(db,entity.id,{now:NOW});return {db,entity,input,recordId};}
test('selection-head migration matches exact runtime derivations',()=>assert.equal(fs.readFileSync(new URL('../../operations/findpitches-v3/migrations/0027_customer_selection_heads.sql',import.meta.url),'utf8'),selectionHeadMigration()));
test('lifecycle updates refresh current selected fields atomically without rewriting original source',async t=>{
 const {db,entity,input}=await fixture(t);const original=(await sql(db,'SELECT * FROM source_facts ORDER BY id').all()).results;await parity(db);assert.equal((await stagingCatalogue(db,{now:NOW})).items.length,1);
 const later='2026-10-06T13:00:00.000Z';await ingestRecords(db,[{...input,application_state:'CLOSED',lifecycle_event:'CLOSED',last_checked:later}],{environment:'shadow',now:later});await drainPipeline(db,{now:later});await parity(db);
 const cached=JSON.parse((await sql(db,'SELECT fields_json FROM customer_selection_heads WHERE entity_id=?',entity.id).first()).fields_json);assert.equal(cached.application_state,'CLOSED');assert.equal((await stagingCatalogue(db,{now:later})).items.length,0);
 assert.deepEqual((await sql(db,'SELECT * FROM source_facts WHERE id IN (SELECT value FROM json_each(?)) ORDER BY id',JSON.stringify(original.map(r=>r.id))).all()).results,original);
 assert.equal((await sql(db,'SELECT COUNT(*) n FROM customer_selection_heads').first()).n,1);assert.equal((await sql(db,'SELECT COUNT(*) n FROM customer_origin_heads').first()).n,1);
});
test('live quality holds retain exact selected-field multiplicity and are never frozen in a cache',async t=>{
 const {db,recordId}=await fixture(t);await parity(db);
 await sql(db,'INSERT INTO legacy_quality_holds(record_id,rules_version,reason,created_at) VALUES (?,?,?,?)',recordId,'fixture-rules-v1','source_quality_issue',NOW).run();await parity(db);
 const rows=await read(db,INVENTORY_SQL);assert.ok(rows[0].quality_holds>1);assert.equal((await stagingCatalogue(db,{now:NOW})).items.length,0);
});
test('source-bound selection and attribution caches reject fabrication and legacy fallbacks remain exact',async t=>{
 const {db,entity}=await fixture(t);await assert.rejects(sql(db,"UPDATE customer_selection_heads SET fields_json='{}'").run(),/source_bound_selection_head_required/);
 await assert.rejects(sql(db,"UPDATE customer_selection_heads SET selected_record_ids_json='[]'").run(),/source_bound_selection_head_required/);
 await assert.rejects(sql(db,"UPDATE customer_origin_heads SET origin='legacy_v2'").run(),/source_bound_selection_head_required/);
 await assert.rejects(sql(db,"INSERT OR REPLACE INTO customer_origin_heads VALUES (?,?,'legacy_v2')",entity.id,'[]').run(),/source_bound_selection_head_required/);
 await sql(db,'DELETE FROM customer_selection_heads').run();await sql(db,'DELETE FROM customer_origin_heads').run();await parity(db);assert.equal((await stagingCatalogue(db,{now:NOW})).items.length,1);
});
test('real backfill, diagnostic origins and additional receipt links preserve source attribution',async t=>{
 const {db,entity,recordId}=await fixture(t),p=await sql(db,'SELECT * FROM producer_records WHERE id=?',recordId).first();
 // An earlier diagnostic receipt cannot steal origin from accepted commercial evidence.
 for(const diagnostic of [1,0]){
  const id='receipt-'+diagnostic,normalized=JSON.stringify({...JSON.parse(p.normalized_json),provenance:{diagnostic}});
  await sql(db,"INSERT INTO producer_records(id,producer_name,producer_type,producer_record_id,environment,market,content_hash,raw_json,normalized_json,validation_status,errors_json,received_at) VALUES (?,'city-search','discovery',?,'shadow','US',?,?,?,'accepted','[]',?)",id,id,p.content_hash,p.raw_json,normalized,'2026-10-01T12:00:00.000Z').run();
  await sql(db,'INSERT INTO entity_records VALUES (?,?)',id,entity.id).run();await parity(db);
  assert.equal((await sql(db,'SELECT origin FROM customer_origin_heads').first()).origin,diagnostic?'independent-structured':'city-search');
 }
 for(const table of ['customer_selection_heads','customer_origin_heads']){for(const event of ['insert','update'])await db.exec(`DROP TRIGGER ${table}_${event}_guard;`);await db.exec(`DROP TABLE ${table};`);}
 for(const input of ['field_selections','entity_records'])for(const event of ['insert','update','delete'])await db.exec(`DROP TRIGGER ${input}_refresh_customer_${event};`);
 await db.exec(selectionHeadMigration());await parity(db);
});
