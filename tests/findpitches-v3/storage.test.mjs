import test from 'node:test';import assert from 'node:assert/strict';
import {database,seed,NOW} from './helpers.mjs';import {sql} from '../../platform/findpitches-v3/store.mjs';
import {bindEvidenceArchive,archiveSerializedDocument,readArchivedDocument} from '../../platform/findpitches-v3/evidence-archive.mjs';
import {encodeSourceDocument,decodeSourceDocument} from '../../platform/findpitches-v3/document-custody.mjs';
import {archiveHistoricalDocuments,restoreArchivedDocument} from '../../platform/findpitches-v3/storage-migration.mjs';
import {recordVerification} from '../../platform/findpitches-v3/verification-store.mjs';
import {documentFixture} from './verification-fixture.mjs';
import {capacityState,CAPACITY_STOP_BYTES} from '../../platform/findpitches-v3/storage-capacity.mjs';
function bucket(){const objects=new Map();return {objects,puts:0,async get(key){const bytes=objects.get(key);return bytes?{size:bytes.length,body:new Blob([bytes]).stream()}:null;},async put(key,data){if(objects.has(key))return null;objects.set(key,new Uint8Array(data));this.puts++;return {};}};}
test('archive exact bytes/clocks survives compressed/inline formats, replays idempotently and fails closed on corruption or identity changes',async()=>{
 const b=bucket(),document=documentFixture(),raw=await encodeSourceDocument(document),pointer=await archiveSerializedDocument(raw,b),p=JSON.parse(pointer);assert.equal(await readArchivedDocument(p,b),raw);await archiveSerializedDocument(raw,b);assert.equal(b.puts,1);
 const db={},other={};bindEvidenceArchive(db,b);assert.deepEqual(await decodeSourceDocument(pointer,{db}),document);await assert.rejects(()=>decodeSourceDocument(pointer,{db:other}),/archive_unavailable/);
 await assert.rejects(()=>readArchivedDocument({...p,fetched_at:'2027-01-01'},b),/clock_or_identity/);await assert.rejects(()=>readArchivedDocument({...p,key:'other'},b),/pointer_invalid/);await assert.rejects(()=>readArchivedDocument({...p,serialized_bytes:1},b),/integrity/);
 b.objects.set(p.key,new Uint8Array([1,2,3]));await assert.rejects(()=>readArchivedDocument(p,b),/integrity/);await assert.rejects(()=>archiveSerializedDocument(raw,b),/integrity/);assert.equal(b.puts,1);
});
test('new archive-aware source custody stores verified pointers with original values; no binding keeps old inline behavior',async()=>{
 const b=bucket(),db={},doc=documentFixture();bindEvidenceArchive(db,b,{writeEnabled:true});const pointer=await encodeSourceDocument(doc,{db});assert.equal(JSON.parse(pointer).document_kind,'r2_source_custody_v1');assert.deepEqual(await decodeSourceDocument(pointer,{db}),doc);
 const large={...doc,html:'A'.repeat(1000000)},largePointer=await encodeSourceDocument(large,{db});assert.deepEqual(await decodeSourceDocument(largePointer,{db}),large);assert.notEqual(JSON.parse(await encodeSourceDocument(doc)).document_kind,'r2_source_custody_v1');
});
test('historical archive/restore preserves document metadata, source facts and identities; current proof and arbitrary rewrites remain protected',async t=>{
 const db=database(t),b=bucket();bindEvidenceArchive(db,b);const {entity}=await seed(db),doc=documentFixture();
 // Retain two ordinary inline source receipts before archive activation.
 const inline=await encodeSourceDocument(doc),old='doc_'+'a'.repeat(40),current='doc_'+'b'.repeat(40);
 await sql(db,'INSERT INTO source_documents VALUES (?,?,?,?,?)',old,doc.url,doc.content_hash??null,NOW,inline).run();await sql(db,'INSERT INTO source_documents VALUES (?,?,?,?,?)',current,doc.url,doc.content_hash??null,NOW,inline).run();
 await sql(db,'INSERT INTO source_verifications(id,entity_id,entity_revision,document_id,verifier_version,status,report_json,checked_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?)','ver-current',entity.id,entity.revision,current,'source-proof-v1','partial','{}',NOW,'2026-10-07T12:00:00Z').run();
 const source=(await sql(db,'SELECT * FROM source_facts ORDER BY id').all()).results,identity=await sql(db,'SELECT * FROM entities WHERE id=?',entity.id).first();
 const result=await archiveHistoricalDocuments(db,[old],{now:NOW});assert.equal(result.results.length,1);const archived=await sql(db,'SELECT * FROM source_documents WHERE id=?',old).first();assert.equal(await readArchivedDocument(JSON.parse(archived.document_json),b),inline);assert.equal(archived.fetched_at,NOW);assert.equal((await archiveHistoricalDocuments(db,[old],{now:NOW})).results[0].replayed,true);
 await assert.rejects(()=>archiveHistoricalDocuments(db,[current],{now:NOW}),/latest_proof/);await assert.rejects(()=>sql(db,'UPDATE source_documents SET document_json=? WHERE id=?','{}',old).run(),/immutable/);await assert.rejects(()=>sql(db,'UPDATE source_documents SET fetched_at=? WHERE id=?','2027-01-01',old).run(),/immutable/);await assert.rejects(()=>sql(db,'DELETE FROM source_documents WHERE id=?',old).run(),/immutable/);
 assert.equal((await restoreArchivedDocument(db,old,{now:NOW})).restored,true);assert.equal((await sql(db,'SELECT document_json FROM source_documents WHERE id=?',old).first()).document_json,inline);assert.deepEqual((await sql(db,'SELECT * FROM source_facts ORDER BY id').all()).results,source);assert.deepEqual(await sql(db,'SELECT * FROM entities WHERE id=?',entity.id).first(),identity);assert.equal((await sql(db,'SELECT COUNT(*) n FROM source_archive_restore_permits').first()).n,0);
 await assert.rejects(()=>sql(db,'UPDATE source_facts SET value_json=? WHERE id=?','"changed"',source[0].id).run(),/immutable/);
});
test('capacity warnings/stop use native size and unknown measurements never permit source growth',()=>{
 for(const [size,state]of [[6999999999,'normal'],[7000000000,'warning'],[8000000000,'high'],[9000000000,'critical'],[CAPACITY_STOP_BYTES,'protective_stop']])assert.equal(capacityState(size).state,state);
 assert.equal(capacityState(CAPACITY_STOP_BYTES-1).source_growth_allowed,true);assert.equal(capacityState(CAPACITY_STOP_BYTES).source_growth_allowed,false);assert.equal(capacityState(undefined).source_growth_allowed,false);assert.equal(capacityState(NaN).available,false);
});
