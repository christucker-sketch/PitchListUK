import {hash,stableJson} from './contract.mjs';
const writes=new WeakMap(),stores=new WeakMap(),LIMIT=4*1048576;
export const ARCHIVE_KIND='r2_source_custody_v1';
export function bindEvidenceArchive(db,bucket,{writeEnabled=false}={}){if(bucket){stores.set(db,bucket);writes.set(db,writeEnabled);}}
export function archiveWritesEnabled(db){return Boolean(db&&writes.get(db));}
export function evidenceBucket(db){return db?stores.get(db):null;}
async function bytes(stream,limit){const reader=stream.getReader(),parts=[];let size=0;try{for(;;){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>limit)throw Error('archive_size_limit');parts.push(r.value);}}finally{reader.releaseLock();}const out=new Uint8Array(size);let offset=0;for(const p of parts){out.set(p,offset);offset+=p.length;}return out;}
function descriptor(raw,sha){const d=JSON.parse(raw);return {document_kind:ARCHIVE_KIND,encoding:'gzip-utf8-json-v1',key:'source-documents/v1/'+sha+'.json.gz',serialized_sha256:sha,serialized_bytes:new TextEncoder().encode(raw).length,requested_url:d.requested_url,url:d.url,fetched_at:d.fetched_at,content_hash:d.content_hash};}
export async function readArchivedDocument(pointer,bucket){
 if(!bucket)throw Error('evidence_archive_unavailable');
 if(pointer.document_kind!==ARCHIVE_KIND||pointer.encoding!=='gzip-utf8-json-v1'||!/^[a-f0-9]{64}$/.test(pointer.serialized_sha256??'')||pointer.key!=='source-documents/v1/'+pointer.serialized_sha256+'.json.gz'||!Number.isInteger(pointer.serialized_bytes)||pointer.serialized_bytes<1||pointer.serialized_bytes>LIMIT)throw Error('archive_pointer_invalid');
 const object=await bucket.get(pointer.key);if(!object||object.size>LIMIT)throw Error('archived_evidence_missing_or_oversized');
 let data;try{data=await bytes(object.body.pipeThrough(new DecompressionStream('gzip')),pointer.serialized_bytes);}catch{throw Error('archive_integrity_failed');}
 const raw=new TextDecoder('utf-8',{fatal:true}).decode(data);if(data.length!==pointer.serialized_bytes||await hash(raw)!==pointer.serialized_sha256)throw Error('archive_integrity_failed');
 const d=JSON.parse(raw);for(const k of ['requested_url','url','fetched_at','content_hash'])if(d[k]!==pointer[k])throw Error('archive_source_clock_or_identity_changed');return raw;
}
export async function archiveSerializedDocument(raw,bucket){
 if(!bucket)throw Error('evidence_archive_unavailable');const data=new TextEncoder().encode(raw);if(data.length>LIMIT)throw Error('archive_size_limit');
 const sha=await hash(raw),pointer=descriptor(raw,sha),existing=await bucket.get(pointer.key);
 if(!existing){const compressed=await bytes(new Blob([data]).stream().pipeThrough(new CompressionStream('gzip')),LIMIT);await bucket.put(pointer.key,compressed,{onlyIf:new Headers({'If-None-Match':'*'}),httpMetadata:{contentType:'application/gzip'},customMetadata:{sha256:sha,original_bytes:String(data.length)}});}
 if(await readArchivedDocument(pointer,bucket)!==raw)throw Error('archive_round_trip_failed');return stableJson(pointer);
}
