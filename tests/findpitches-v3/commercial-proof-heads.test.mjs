import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {database,seed,record,NOW} from './helpers.mjs';
import {sql} from '../../platform/findpitches-v3/store.mjs';
import {recordVerification} from '../../platform/findpitches-v3/verification-store.mjs';
import {evaluateReadiness} from '../../platform/findpitches-v3/pipeline.mjs';
import {documentFixture} from './verification-fixture.mjs';
import {INVENTORY_SQL,LEGACY_INVENTORY_SQL,commercialEntity,commercialRows,customerCatalogueRows} from '../../platform/findpitches-v3/commercial.mjs';
import {stagingCatalogue} from '../../platform/findpitches-v3/staging.mjs';
import {proofHeadMigration} from '../../operations/findpitches-v3/build-proof-head-migration.mjs';
import {timedReadDatabase,catalogueServerTiming} from '../../platform/findpitches-v3/read-timing.mjs';
const plain=rows=>rows.map(r=>({...r,proof_json:JSON.parse(r.proof_json)}));
async function parity(db){const old=plain((await sql(db,LEGACY_INVENTORY_SQL,'').all()).results),current=plain((await sql(db,INVENTORY_SQL,'').all()).results);assert.deepEqual(current,old);return current;}
async function fixture(t){const db=database(t),{entity}=await seed(db,record(),{environment:'shadow'});await recordVerification(db,entity.id,documentFixture(),{now:NOW});await evaluateReadiness(db,entity.id,{now:NOW});return {db,entity};}
test('generated proof-head migration stays identical to runtime projection',()=>assert.equal(fs.readFileSync(new URL('../../operations/findpitches-v3/migrations/0026_customer_proof_heads.sql',import.meta.url),'utf8'),proofHeadMigration()));
test('proof head is exact and bounded across renewals; source evidence stays immutable',async t=>{
 const {db,entity}=await fixture(t);const source=await sql(db,'SELECT * FROM source_verifications ORDER BY sequence').all();await parity(db);
 const old=(await sql(db,'SELECT * FROM customer_proof_heads').first()).verification_sequence;
 for(const checked of ['2026-10-06T13:00:00.000Z','2026-10-06T14:00:00.000Z']){await recordVerification(db,entity.id,{...documentFixture(),fetched_at:checked},{now:checked});await parity(db);}
 const heads=await sql(db,'SELECT * FROM customer_proof_heads').all();assert.equal(heads.results.length,1);assert.ok(heads.results[0].verification_sequence>old);
 assert.deepEqual((await sql(db,'SELECT * FROM source_verifications ORDER BY sequence LIMIT 1').all()).results,source.results);
 await assert.rejects(sql(db,"UPDATE source_verifications SET report_json='{}'").run(),/immutable/);
 await assert.rejects(sql(db,'DELETE FROM source_verifications').run(),/immutable/);
});
test('tampering, wrong identity, stale proof heads and fabricated READY are rejected',async t=>{
 const {db,entity}=await fixture(t),original=await sql(db,'SELECT * FROM customer_proof_heads').first();
 await assert.rejects(sql(db,"UPDATE customer_proof_heads SET proof_json='{}'").run(),/source_bound_proof_head_required/);
 await assert.rejects(sql(db,"INSERT OR REPLACE INTO customer_proof_heads VALUES (?,?,?)",entity.id,original.verification_sequence,'{}').run(),/source_bound_proof_head_required/);
 const other=await seed(db,record({opportunity_id:'other',application_url:'https://www.eventeny.com/events/vendor/?id=888',canonical_url:'https://www.eventeny.com/events/vendor/?id=888'}),{environment:'shadow'});
 await assert.rejects(sql(db,'UPDATE customer_proof_heads SET entity_id=?',other.entity.id).run(),/source_bound_proof_head_required/);
 await recordVerification(db,entity.id,{...documentFixture(),fetched_at:'2026-10-06T13:00:00.000Z'},{now:'2026-10-06T13:00:00.000Z'});
 await assert.rejects(sql(db,'UPDATE customer_proof_heads SET verification_sequence=?,proof_json=? WHERE entity_id=?',original.verification_sequence,original.proof_json,entity.id).run(),/source_bound_proof_head_required/);
 assert.equal((await stagingCatalogue(db,{now:'2026-10-06T13:00:00.000Z'})).items.length,0); // new proof invalidated readiness
});
test('cache miss fallback and post-migration backfill preserve exact projection',async t=>{
 const {db}=await fixture(t);await sql(db,'DELETE FROM customer_proof_heads').run();await parity(db);assert.equal((await stagingCatalogue(db,{now:NOW})).items.length,1);
 // Run the real migration against retained pre-migration evidence.
 await db.exec('DROP TRIGGER verification_refresh_customer_proof; DROP TRIGGER customer_proof_head_insert_guard; DROP TRIGGER customer_proof_head_update_guard; DROP TABLE customer_proof_heads;');
 await db.exec(proofHeadMigration());await parity(db);assert.equal((await sql(db,'SELECT COUNT(*) AS n FROM customer_proof_heads').first()).n,1);
});
test('live holds, current selection/revision, expiry and latest failed proof cannot be bypassed by a good head',async t=>{
 const {db,entity}=await fixture(t);assert.equal((await stagingCatalogue(db,{now:NOW})).items.length,1);
 assert.equal((await stagingCatalogue(db,{now:'2026-10-08T12:00:00.000Z'})).items.length,0);
 const row=(await parity(db))[0];assert.equal(commercialEntity({...row,quality_holds:1},NOW).ready,false);assert.equal(commercialEntity({...row,conflicts:1},NOW).ready,false);
 assert.equal(commercialEntity({...row,revision:row.revision+1},NOW).ready,false);
 assert.equal(commercialEntity({...row,fields_json:JSON.stringify({...JSON.parse(row.fields_json),event_name:'Completely Different Fair'})},NOW).ready,false);
 await recordVerification(db,entity.id,{...documentFixture(),http_status:503,html:'',fetched_at:'2026-10-06T13:00:00.000Z'},{now:'2026-10-06T13:00:00.000Z'});
 await evaluateReadiness(db,entity.id,{now:'2026-10-06T13:00:00.000Z'});await parity(db);
 assert.equal((await stagingCatalogue(db,{now:'2026-10-06T13:00:00.000Z'})).items.length,0);
});
test('private timing aggregates contain no SQL, source data or persistent writes',async t=>{
 const {db}=await fixture(t),metrics={};const result=await stagingCatalogue(timedReadDatabase(db,metrics),{now:NOW});assert.equal(result.items.length,1);assert.equal(metrics.queries,2); // bounded snapshot + latest producer policy
 const header=catalogueServerTiming({...metrics,read_ms:1,serialize_ms:0});assert.match(header,/source_read;dur=1.00/);assert.match(header,/d1_queries;desc="2"/);assert.doesNotMatch(header,/SELECT|ent_|eventeny/);
});

test('one bounded customer query matches full operator rows and refuses overflow rather than truncating',async t=>{
 const {db}=await fixture(t);assert.deepEqual(await customerCatalogueRows(db),await commercialRows(db,{onlyCachedReady:true,pageSize:1}));
 let calls=0;const oversized={prepare:query=>{assert.match(query,/LIMIT 20001$/);assert.doesNotMatch(query,/e.id>\?/);return {bind:()=>({all:async()=>{calls++;return {results:Array(20001).fill({})};}})};}};
 await assert.rejects(customerCatalogueRows(oversized),/customer_catalogue_capacity_exceeded/);assert.equal(calls,1);
});

test('compact heads preserve old report fallbacks, JSON types and negative dispositions exactly',async t=>{
 const {db,entity}=await fixture(t),v=await sql(db,'SELECT * FROM source_verifications LIMIT 1').first(),base=JSON.parse(v.report_json);
 const variants=[{...base,application_heading:undefined,application_scope_proof:undefined,venue_coordinate_policy:undefined},
  {...base,status:'quarantine',reasons:['source_country_market_mismatch'],facts:{...base.facts,country:'GB'}},
  {...base,status:'unverified',facts:{},reasons:['source_document_unavailable'],evidence:[]},
  {...base,status:'partial',application_scope_proof:{trader_application:false,restricted_audience:true,guaranteed_vendor_space:false,evidence:[{kind:'application_description',excerpt:'Waitlist only'}]}},
  {...base,application_heading:null,event_source_url:null,evidence:[{kind:'main_heading',excerpt:'Source application'},{kind:'event_json_ld',excerpt:JSON.stringify({url:'https://www.eventeny.com/events/fixture/'})},{kind:'venue_coordinate_country_proof',source_url:base.source_url,excerpt:'United States'}]}];
 let i=0;for(const report of variants){await sql(db,'INSERT INTO source_verifications(id,entity_id,entity_revision,document_id,verifier_version,status,report_json,checked_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?)','variant-'+i++,entity.id,v.entity_revision,v.document_id,v.verifier_version,report.status,JSON.stringify(report),v.checked_at,v.expires_at).run();await parity(db);assert.equal((await sql(db,'SELECT COUNT(*) n FROM customer_proof_heads').first()).n,1);}
});
