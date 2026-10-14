import {archiveSerializedDocument,readArchivedDocument,evidenceBucket,archiveWritesEnabled,ARCHIVE_KIND} from './evidence-archive.mjs';
// Lossless, bounded source custody for large multi-document proofs. Original
// bytes and clocks are retained; encoding never changes evidence or authority.
import {hash,stableJson} from './contract.mjs';
const LIMIT=4*1048576,ENCODE_AT=900000;
async function read(stream,limit){const reader=stream.getReader(),parts=[];let size=0;try{for(;;){const{done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw Error('source_custody_size_limit');}parts.push(value);}}finally{reader.releaseLock();}const bytes=new Uint8Array(size);let off=0;for(const p of parts){bytes.set(p,off);off+=p.length;}return bytes;}
function base64(bytes){let raw='';for(let i=0;i<bytes.length;i+=16384)raw+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(raw);}
export async function encodeSourceDocument(document,{db=null}={}){
 const raw=stableJson(document),bytes=new TextEncoder().encode(raw);if(bytes.length>LIMIT)throw Error('source_custody_size_limit');if(bytes.length<ENCODE_AT)return archiveWritesEnabled(db)?archiveSerializedDocument(raw,evidenceBucket(db)):raw;
 const compressed=await read(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip')),1048576);
 const encoded=stableJson({document_kind:'lossless_source_custody',encoding:'gzip-base64-v1',requested_url:document.requested_url,url:document.url,fetched_at:document.fetched_at,content_hash:document.content_hash,uncompressed_bytes:bytes.length,uncompressed_hash:await hash(raw),gzip_base64:base64(compressed)});return archiveWritesEnabled(db)?archiveSerializedDocument(encoded,evidenceBucket(db)):encoded;
}
export async function decodeSourceDocument(serialized,{db=null}={}){
 const wrapper=JSON.parse(serialized);
 if(wrapper.document_kind===ARCHIVE_KIND)return decodeSourceDocument(await readArchivedDocument(wrapper,evidenceBucket(db))); if(wrapper.document_kind!=='lossless_source_custody')return wrapper;
 if(wrapper.encoding!=='gzip-base64-v1'||!Number.isInteger(wrapper.uncompressed_bytes)||wrapper.uncompressed_bytes<1||wrapper.uncompressed_bytes>LIMIT||typeof wrapper.gzip_base64!=='string'||wrapper.gzip_base64.length>1400000)throw Error('source_custody_encoding_invalid');
 let compressed;try{compressed=Uint8Array.from(atob(wrapper.gzip_base64),c=>c.charCodeAt(0));}catch{throw Error('source_custody_encoding_invalid');}
 let bytes;try{bytes=await read(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip')),wrapper.uncompressed_bytes);}catch{throw Error('source_custody_integrity_failed');}
 const raw=new TextDecoder('utf-8',{fatal:true}).decode(bytes);if(bytes.length!==wrapper.uncompressed_bytes||await hash(raw)!==wrapper.uncompressed_hash)throw Error('source_custody_integrity_failed');
 const document=JSON.parse(raw);for(const field of ['requested_url','url','fetched_at','content_hash'])if(document[field]!==wrapper[field])throw Error('source_custody_identity_mismatch');return document;
}
