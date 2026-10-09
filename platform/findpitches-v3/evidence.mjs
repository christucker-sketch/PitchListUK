import { AUTHORITIES,FIELDS,hash,stableJson,publicHttps,validFieldValue } from './contract.mjs';
import { sql,loadEntity } from './store.mjs';

// These describe a producer delivery, rather than a change to participation.
// Keep every observation as source evidence without replacing a durable
// CLOSED/WITHDRAWN/REOPENED state or invalidating proof of unchanged facts.
export const LIFECYCLE_OBSERVATIONS=Object.freeze(['NEW','UPDATED','UNCHANGED']);

export async function selectRecordFacts(db,entityId,facts,{now=new Date().toISOString(),snapshot=null}={}) {
  if(facts.length>FIELDS.length||new Set(facts.map(f=>f.field_name)).size!==facts.length)throw Error('bounded_distinct_record_fields_required');
  const entity=snapshot??await loadEntity(db,entityId);
  if(!entity||entity.id!==entityId)throw new Error('entity_missing');
  const statements=[],selectionIndexes=[],decisions=[];
  for(const fact of facts) {
  const previous=entity.selections[fact.field_name];
  const nextValue=JSON.parse(fact.value_json);
  let decision='accepted',reason='missing_field';
  if(nextValue===null||nextValue===''||fact.field_name==='location'&&/restriction|other reasons|^availability$|submit form|your email/i.test(String(nextValue))) { decision='rejected';reason='invalid_or_empty_value'; }
  else if(previous) {
    if(previous.value_json===fact.value_json) { decision=fact.authority>previous.authority?'accepted':'corroborated';reason=decision==='accepted'?'stronger_corroboration':'same_value'; }
    else if(fact.field_name==='lifecycle_state'&&LIFECYCLE_OBSERVATIONS.includes(nextValue)) { decision='corroborated';reason='lifecycle_observation_only'; }
    else if(fact.authority<previous.authority) { decision='rejected';reason='weaker_evidence'; }
    else if(fact.authority===previous.authority) {
      let temporal=false;
      if(['application_state','lifecycle_state'].includes(fact.field_name)) {
      const n=await sql(db,'SELECT * FROM producer_records WHERE id=?',fact.record_id).first();
      const o=await sql(db,'SELECT * FROM producer_records WHERE id=?',previous.record_id).first();
      const nMeta=JSON.parse(n.normalized_json||'{}'),oMeta=JSON.parse(o.normalized_json||'{}');
      temporal=n.producer_name===o.producer_name&&n.producer_record_id===o.producer_record_id&&Date.parse(nMeta.last_checked)>Date.parse(oMeta.last_checked)&&['STATE_CHANGED','CLOSED','REOPENED','WITHDRAWN'].includes(nMeta.lifecycle_state);
      }
      decision=temporal?'accepted':'conflict';reason=temporal?'newer_lifecycle_evidence':'equal_authority_disagreement';
    } else reason='stronger_evidence';
  }
  statements.push(sql(db,'INSERT OR IGNORE INTO entity_facts(entity_id,fact_id) VALUES (?,?)',entityId,fact.id));
  if(decision==='accepted') {
    selectionIndexes.push(statements.length);
    if(!previous) statements.push(sql(db,`INSERT OR IGNORE INTO field_selections(entity_id,field_name,fact_id) SELECT ?,?,?
      WHERE NOT EXISTS(SELECT 1 FROM field_selections WHERE entity_id=? AND field_name=?) RETURNING fact_id`,entityId,fact.field_name,fact.id,entityId,fact.field_name));
    else statements.push(sql(db,'UPDATE field_selections SET fact_id=? WHERE entity_id=? AND field_name=? AND fact_id=? RETURNING fact_id',fact.id,entityId,fact.field_name,previous.fact_id));
  }
  if(decision==='conflict') statements.push(sql(db,'INSERT OR IGNORE INTO conflicts(id,entity_id,record_id,field_name,reason,created_at) VALUES (?,?,?,?,?,?)',entityId+':'+fact.id,entityId,fact.record_id,fact.field_name,reason,now));
  const auditId='sel_'+(await hash([entityId,fact.id,previous?.fact_id??null,decision])).slice(0,32);
  statements.push(sql(db,`INSERT OR IGNORE INTO selection_audit(id,entity_id,field_name,proposed_fact_id,previous_fact_id,decision,reason,created_at) SELECT ?,?,?,?,?,?,?,?
    WHERE ?<>'accepted' OR EXISTS(SELECT 1 FROM field_selections WHERE entity_id=? AND field_name=? AND fact_id=?)`,auditId,entityId,fact.field_name,fact.id,previous?.fact_id??null,decision,reason,now,decision,entityId,fact.field_name,fact.id));
  decisions.push({decision,reason,fact_id:fact.id});
  }
  if(statements.length) {
    const results=await db.batch(statements);
    if(selectionIndexes.some(index=>results[index]?.results?.length!==1))throw new Error('selection_raced_retry');
  }
  return decisions;
}
export async function selectFact(db,entityId,fact,options={}) {
  return (await selectRecordFacts(db,entityId,[fact],options))[0];
}
export async function proposeFact(db,entityId,proposal,{now=new Date().toISOString()}={}) {
  const entity=await loadEntity(db,entityId);
  if(!entity)throw new Error('entity_missing');
  if(!FIELDS.includes(proposal.field)||!AUTHORITIES[proposal.kind]||!publicHttps(proposal.source_url)||typeof proposal.excerpt!=='string'||!proposal.excerpt.trim())throw new Error('supported_source_evidence_required');
  if(!validFieldValue(proposal.field,proposal.value)||proposal.excerpt.length>16000)throw new Error('invalid_proposed_value');
  if(['canonical_url','application_url'].includes(proposal.field)&&proposal.value!==null&&!publicHttps(proposal.value))throw new Error('unsafe_route_proposal');
  const contentHash=await hash(proposal),recordId='enr_'+(await hash([entityId,contentHash])).slice(0,40),factId=recordId+':'+proposal.field;
  await db.batch([
    sql(db,`INSERT OR IGNORE INTO producer_records(id,producer_name,producer_type,producer_record_id,environment,market,content_hash,raw_json,validation_status,received_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,recordId,'enrichment:'+proposal.kind,'enrichment',recordId,entity.environment,entity.market,contentHash,stableJson(proposal),'accepted',now),
    sql(db,`INSERT OR IGNORE INTO source_facts(id,record_id,field_name,value_json,authority,source_url,evidence_json,provenance_json,created_at) VALUES (?,?,?,?,?,?,?,?,?)`,factId,recordId,proposal.field,stableJson(proposal.value),AUTHORITIES[proposal.kind],proposal.source_url,stableJson([{source:proposal.source_url,excerpt:proposal.excerpt}]),stableJson({kind:proposal.kind}),now),
  ]);
  const fact=await sql(db,'SELECT * FROM source_facts WHERE id=?',factId).first();
  const result=await selectFact(db,entityId,fact,{now,snapshot:entity});
  await sql(db,'INSERT OR IGNORE INTO enrichment_proposals(id,entity_id,fact_id,decision,reason,proposed_at) VALUES (?,?,?,?,?,?)',factId,entityId,factId,result.decision,result.reason,now).run();
  return result;
}
