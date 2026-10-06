import { hash } from '../../platform/findpitches-v3/contract.mjs';
import { sql,linkedEntity } from '../../platform/findpitches-v3/store.mjs';

export async function createSnapshot(db,inputs,{now=new Date().toISOString(),elapsedMs=null,environment='test'}={}) {
  const records=[];
  for(const raw of inputs) {
    const input_hash=await hash(raw),row=await sql(db,"SELECT * FROM producer_records WHERE producer_name='independent-structured' AND environment=? AND producer_record_id=? AND content_hash=?",environment,raw.opportunity_id??raw.producer_record_id,input_hash).first();
    if(!row){records.push({producer_record_id:raw.opportunity_id??raw.producer_record_id,input_hash,validation:'not_processed'});continue;}
    const entity=await linkedEntity(db,row.id),decision=await sql(db,'SELECT outcome FROM reconciliation_decisions WHERE record_id=?',row.id).first();
    const ready=entity?await sql(db,'SELECT status FROM readiness WHERE entity_id=?',entity.id).first():null;
    const assessment=entity?await sql(db,'SELECT status FROM assessments WHERE entity_id=? ORDER BY assessed_at DESC LIMIT 1',entity.id).first():null;
    records.push({producer_record_id:row.producer_record_id,input_hash,validation:row.validation_status,entity_id:entity?.id??null,identity:decision?.outcome??null,eligibility:assessment?.status??null,readiness:ready?.status??null,fields:entity?.fields??{}});
  }
  const runs=await sql(db,'SELECT SUM(queries_reserved) AS reserved,SUM(queries_completed) AS completed FROM acquisition_runs').first();
  return {schema:'findpitches-shadow-evaluation-v1',implementation:'v3',environment,as_of:now,inputs_hash:await hash(inputs),records,metrics:{elapsed_ms:elapsedMs,provider_queries_reserved:runs.reserved??0,provider_queries_completed:runs.completed??0,total_cost_usd:null}};
}
