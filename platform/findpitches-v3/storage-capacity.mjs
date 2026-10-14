import {sql} from './store.mjs';
export const CAPACITY_LIMIT_BYTES=10000000000;
export const CAPACITY_STOP_BYTES=9700000000;
export function capacityState(bytes){
 if(!Number.isFinite(bytes)||bytes<0)return {available:false,state:'unknown',source_growth_allowed:false};
 const percent=bytes/CAPACITY_LIMIT_BYTES*100,level=percent>=97?'protective_stop':percent>=90?'critical':percent>=80?'high':percent>=70?'warning':'normal';
 return {available:true,file_size_bytes:bytes,conservative_cap_bytes:CAPACITY_LIMIT_BYTES,protective_stop_bytes:CAPACITY_STOP_BYTES,percent_used:Math.round(percent*100)/100,remaining_bytes:Math.max(0,CAPACITY_LIMIT_BYTES-bytes),state:level,source_growth_allowed:bytes<CAPACITY_STOP_BYTES,warning_thresholds_percent:[70,80,90,97]};
}
export async function capacityStatus(db){
 const r=await sql(db,'SELECT 1 capacity_probe').all(),state=capacityState(r.meta?.size_after);
 const exists=await sql(db,"SELECT 1 ok FROM sqlite_master WHERE type='table' AND name='storage_capacity_samples'").first();
 const samples=exists?(await sql(db,'SELECT observed_at,file_size_bytes FROM storage_capacity_samples ORDER BY observed_at DESC LIMIT 2').all()).results:[];
 let growth=null;if(samples.length===2){const hours=(Date.parse(samples[0].observed_at)-Date.parse(samples[1].observed_at))/3600000;if(hours>0)growth=(samples[0].file_size_bytes-samples[1].file_size_bytes)/hours;}
 const archiveTable=await sql(db,"SELECT 1 ok FROM sqlite_master WHERE type='table' AND name='source_document_archives'").first();
 const archive=archiveTable?await sql(db,'SELECT COUNT(*) documents,COALESCE(SUM(a.serialized_bytes),0) original_payload_bytes FROM source_document_archives a JOIN source_documents d ON d.id=a.document_id WHERE d.document_json=a.wrapper_json').first():null;
 return {...state,as_of:new Date().toISOString(),growth_bytes_per_hour:growth,growth_interpretation:growth===null?'insufficient_observations':growth<0?'net_reclaim_during_migration':'net_database_growth',archive,samples,scope:'V3 source/evidence database; separate customer/auth/billing storage excluded'};
}
export async function guardSourceCapacity(db,{now=new Date().toISOString()}={}){
 const r=await sql(db,'SELECT 1 capacity_probe').all(),state=capacityState(r.meta?.size_after);
 if(state.available){const d=new Date(now);d.setUTCMinutes(Math.floor(d.getUTCMinutes()/15)*15,0,0);await sql(db,'INSERT OR IGNORE INTO storage_capacity_samples(observed_at,file_size_bytes) VALUES (?,?)',d.toISOString(),state.file_size_bytes).run();}
 if(!state.source_growth_allowed)throw Error(state.available?'source_storage_protective_pause':'source_storage_capacity_unknown');return state;
}
