import { FIELDS,PRODUCERS,normalizeExport,hash,stableJson } from './contract.mjs';
import { jobStatement } from './jobs.mjs';
import {LEGACY_AUTHORITIES} from './legacy.mjs';

export const sql=(db,text,...values)=>db.prepare(text).bind(...values);
export async function ingestRecords(db,records,{producer='independent-structured',environment='shadow',now=new Date().toISOString()}={}) {
  if(!['shadow','test'].includes(environment))throw new Error('shadow_or_test_required');
  if(!PRODUCERS[producer])throw new Error('unknown_producer');
  if(!Array.isArray(records)||records.length<1||records.length>100)throw new Error('batch_size_1_to_100_required');
  if(producer!=='independent-structured') {
    const gate=await sql(db,"SELECT name FROM quality_gates WHERE name='structured-100-preservation' AND tested_records=100 AND destructive_mutations=0").first();
    if(!gate)throw new Error('structured_preservation_gate_required');
  }
  const result={accepted:0,rejected:0,inserted:0,duplicates:0,record_ids:[],new_record_ids:[],errors:[]};
  for(const raw of records) {
    const rawJson=stableJson(raw), contentHash=await hash(rawJson);
    if(rawJson.length>131072)throw new Error('record_size_limit');
    const validated=normalizeExport(raw,{producer,environment});
    const normalized=validated.normalized;
    const recordId='rec_'+(await hash([environment,producer,raw?.opportunity_id??raw?.producer_record_id??contentHash,contentHash])).slice(0,40);
    const statements=[sql(db,`INSERT OR IGNORE INTO producer_records(id,producer_name,producer_type,producer_record_id,environment,market,content_hash,raw_json,normalized_json,validation_status,errors_json,received_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      recordId,producer,PRODUCERS[producer].type,String(raw?.opportunity_id??raw?.producer_record_id??'rejected:'+contentHash),environment,normalized?.market??null,contentHash,rawJson,normalized?stableJson(normalized):null,normalized?'accepted':'rejected',stableJson(validated.errors),now)];
    if(normalized) {
      for(const field of FIELDS) if(normalized[field]!==null && normalized[field]!==undefined && normalized[field]!=='') {
        const proof=producer==='legacy_v2'?normalized.field_evidence[field]:null;
        statements.push(sql(db,`INSERT OR IGNORE INTO source_facts(id,record_id,field_name,value_json,authority,source_url,evidence_json,provenance_json,created_at) VALUES (?,?,?,?,?,?,?,?,?)`,
          recordId+':'+field,recordId,field,stableJson(normalized[field]),proof?LEGACY_AUTHORITIES[proof.kind]:PRODUCERS[producer].authority,proof?.source??normalized.application_url??normalized.canonical_url,stableJson(proof?[proof]:normalized.evidence),stableJson(normalized.provenance),now));
      }
      statements.push(await jobStatement(db,'reconcile',recordId,{record_id:recordId},now));
    }
    const committed=await db.batch(statements);
    const inserted=Number(committed[0]?.meta?.changes||0);
    result.inserted+=inserted;result.duplicates+=inserted?0:1;
    if(normalized) { result.accepted++;result.record_ids.push(recordId);if(inserted)result.new_record_ids.push(recordId); } else { result.rejected++;result.errors.push({record_id:recordId,reasons:validated.errors}); }
  }
  return result;
}
export async function loadEntity(db,id) {
  const entity=await sql(db,'SELECT * FROM entities WHERE id=?',id).first();
  if(!entity)return null;
  const rows=(await sql(db,'SELECT * FROM selected_facts WHERE entity_id=?',id).all()).results??[];
  const fields=Object.fromEntries(rows.map(row=>[row.field_name,JSON.parse(row.value_json)]));
  return {...entity,...fields,fields,selections:Object.fromEntries(rows.map(row=>[row.field_name,row]))};
}
export async function linkedEntity(db,recordId) {
  const link=await sql(db,'SELECT entity_id FROM entity_records WHERE record_id=?',recordId).first();
  return link?loadEntity(db,link.entity_id):null;
}
