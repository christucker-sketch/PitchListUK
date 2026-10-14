import {sql} from './store.mjs';
import {hash,stableJson} from './contract.mjs';
import {archiveSerializedDocument,readArchivedDocument,evidenceBucket,ARCHIVE_KIND} from './evidence-archive.mjs';
import {capacityStatus} from './storage-capacity.mjs';
async function ownedGuard(db){const r=await sql(db,'SELECT (SELECT publication_enabled FROM runtime_policy WHERE id=1) publication,(SELECT COUNT(*) FROM customer_projections) customers,(SELECT COUNT(*) FROM publication_queue) publications,(SELECT bulk_enabled FROM serper_policy WHERE id=1) bulk').first();if(r.publication||r.customers||r.publications||r.bulk)throw Error('owned_shadow_storage_required');}
export async function archiveHistoricalDocuments(db,ids,{now=new Date().toISOString()}={}){
 if(!Array.isArray(ids)||ids.length<1||ids.length>20||new Set(ids).size!==ids.length||ids.some(id=>!/^doc_[a-f0-9]{40}$/.test(id)))throw Error('bounded_archive_ids_required');
 await ownedGuard(db);const bucket=evidenceBucket(db);if(!bucket)throw Error('evidence_archive_unavailable');const results=[];
 // Four documents per atomic tranche bounds payload, memory and native SQL
 // round trips. Every object is copied and independently verified first.
 for(let i=0;i<ids.length;i+=4){
  const group=ids.slice(i,i+4),json=JSON.stringify(group),rows=(await sql(db,'SELECT * FROM source_documents WHERE id IN (SELECT value FROM json_each(?))',json).all()).results;
  if(rows.length!==group.length)throw Error('source_document_missing');
  const current=(await sql(db,'SELECT DISTINCT v.document_id FROM source_verifications v WHERE v.document_id IN (SELECT value FROM json_each(?)) AND v.sequence=(SELECT MAX(v2.sequence) FROM source_verifications v2 WHERE v2.entity_id=v.entity_id)',json).all()).results;
  const currentIds=new Set(current.map(r=>r.document_id));
  const prepared=await Promise.all(rows.map(async row=>{
   const p=JSON.parse(row.document_json);if(p.document_kind===ARCHIVE_KIND){await readArchivedDocument(p,bucket);return {row,replayed:true,pointer:p};}
   if(currentIds.has(row.id))throw Error('latest_proof_document_kept_inline');
   const wrapper=await archiveSerializedDocument(row.document_json,bucket);return {row,replayed:false,wrapper,pointer:JSON.parse(wrapper)};
  }));
  const changes=prepared.filter(p=>!p.replayed),statements=[];
  for(const {row,wrapper,pointer} of changes)statements.push(
   sql(db,'INSERT OR IGNORE INTO source_document_archives(document_id,serialized_sha256,serialized_bytes,archive_key,wrapper_json,source_url,content_hash,fetched_at,verified_at) VALUES (?,?,?,?,?,?,?,?,?)',row.id,pointer.serialized_sha256,pointer.serialized_bytes,pointer.key,wrapper,row.source_url,row.content_hash,row.fetched_at,now),
   sql(db,'UPDATE source_documents SET document_json=? WHERE id=? AND document_json=?',wrapper,row.id,row.document_json),
   sql(db,'INSERT INTO source_document_storage_events(document_id,event,serialized_sha256,created_at) VALUES (?,?,?,?)',row.id,'archived',pointer.serialized_sha256,now)
  );
  if(statements.length)await db.batch(statements);
  const stored=(await sql(db,'SELECT id,document_json FROM source_documents WHERE id IN (SELECT value FROM json_each(?))',json).all()).results;
  const verified=await Promise.all(prepared.map(async p=>{
   const serialized=stored.find(r=>r.id===p.row.id).document_json,original=await readArchivedDocument(JSON.parse(serialized),bucket);
   if(!p.replayed&&original!==p.row.document_json)throw Error('archive_post_transition_integrity_failed');
   return {id:p.row.id,replayed:p.replayed,original_bytes:p.pointer.serialized_bytes,...!p.replayed?{pointer_bytes:new TextEncoder().encode(serialized).length,serialized_sha256:p.pointer.serialized_sha256}:{}};
  }));results.push(...verified);
 }
 return {as_of:now,results,capacity:await capacityStatus(db),source_facts_changed:0,identity_changes:0};
}
export async function restoreArchivedDocument(db,id,{now=new Date().toISOString()}={}){
 await ownedGuard(db);const row=await sql(db,'SELECT document_json FROM source_documents WHERE id=?',id).first();if(!row)throw Error('source_document_missing');const pointer=JSON.parse(row.document_json);if(pointer.document_kind!==ARCHIVE_KIND)return {restored:false};
 const original=await readArchivedDocument(pointer,evidenceBucket(db)),sha=await hash(original),permit=stableJson({document_id:id,serialized_sha256:sha,document_json:original});
 await db.batch([sql(db,'INSERT INTO source_archive_restore_permits(document_id,permit_json) VALUES (?,?)',id,permit),sql(db,'UPDATE source_documents SET document_json=? WHERE id=? AND document_json=?',original,id,row.document_json),sql(db,'DELETE FROM source_archive_restore_permits WHERE document_id=?',id),sql(db,'INSERT INTO source_document_storage_events(document_id,event,serialized_sha256,created_at) VALUES (?,?,?,?)',id,'restored',sha,now)]);
 if((await sql(db,'SELECT document_json FROM source_documents WHERE id=?',id).first()).document_json!==original)throw Error('archive_restore_integrity_failed');return {restored:true,serialized_sha256:sha,bytes:pointer.serialized_bytes};
}
