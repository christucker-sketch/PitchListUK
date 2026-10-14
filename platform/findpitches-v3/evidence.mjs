import { AUTHORITIES,FIELDS,hash,stableJson,publicHttps,validFieldValue } from './contract.mjs';
import { sql,loadEntity } from './store.mjs';
import {verifyDocument} from './verification.mjs';
import {decodeSourceDocument} from './document-custody.mjs';

// These describe a producer delivery, rather than a change to participation.
// Keep every observation as source evidence without replacing a durable
// CLOSED/WITHDRAWN/REOPENED state or invalidating proof of unchanged facts.
export const LIFECYCLE_OBSERVATIONS=Object.freeze(['NEW','UPDATED','UNCHANGED']);
const TRUSTED_OFFICIAL_REVIEWS=new WeakSet();
export const isTrustedOfficialSourceReview=review=>Boolean(review&&TRUSTED_OFFICIAL_REVIEWS.has(review));

// Reserved internal receipt names cannot be supplied through ingestRecords.
// Metadata on an ordinary producer receipt, or a link alone, grants no review.
export async function trustedOfficialSourceReview(db,entityId,{candidateRecordId=null,reviewRecordId=null}={}) {
  const rows=(await sql(db,`SELECT p.* FROM producer_records p JOIN entity_records er ON er.record_id=p.id
    WHERE er.entity_id=? AND p.producer_name='operator-review:official-source' AND p.producer_type='enrichment'
      AND p.validation_status='accepted' ${candidateRecordId?"AND json_extract(p.raw_json,'$.candidate_record_id')=?":''} ${reviewRecordId?'AND p.id=?':''}
    ORDER BY p.received_at DESC,p.id DESC LIMIT 20`,entityId,...(candidateRecordId?[candidateRecordId]:[]),...(reviewRecordId?[reviewRecordId]:[])).all()).results??[];
  for(const receipt of rows) {
    try {
      const raw=JSON.parse(receipt.raw_json),entity=await sql(db,'SELECT * FROM entities WHERE id=?',entityId).first();
      if(!entity||!['test','shadow'].includes(entity.environment)||receipt.environment!==entity.environment||receipt.market!==entity.market
        ||!/^review_[a-f0-9]{40}$/.test(receipt.id)||receipt.content_hash!==await hash(receipt.raw_json)
        ||raw.review_status!=='supersession_committed'||raw.entity_id!==entityId||raw.actor!=='codex'
        ||typeof raw.reason!=='string'||!raw.reason.trim()||raw.reason.length>1000
        ||!raw.previous_field_ids||typeof raw.previous_field_ids!=='object'||Array.isArray(raw.previous_field_ids)
        ||raw.original_source_platform!=='ukcraftfairs'||raw.reviewed_source_platform!=='creativecrafts'
        ||!publicHttps(raw.original_canonical_url)||!publicHttps(raw.reviewed_canonical_url))continue;
      const originalFields=Object.entries(raw.previous_field_ids);
      if(!originalFields.length||originalFields.some(([field,id])=>!FIELDS.includes(field)||typeof id!=='string'||!id))continue;
      const previous=(await sql(db,`SELECT f.id,f.field_name,f.value_json,f.authority FROM source_facts f JOIN entity_facts ef ON ef.fact_id=f.id
        WHERE ef.entity_id=? AND f.id IN (SELECT value FROM json_each(?))`,entityId,stableJson(originalFields.map(([,id])=>id))).all()).results??[];
      if(previous.length!==originalFields.length||originalFields.some(([field,id])=>!previous.some(f=>f.id===id&&f.field_name===field)))continue;
      const old=Object.fromEntries(previous.map(f=>[f.field_name,JSON.parse(f.value_json)]));
      if(old.source_platform!==raw.original_source_platform||old.canonical_url!==raw.original_canonical_url
        ||(old.source_identifier??null)!==(raw.original_source_identifier??null))continue;
      const candidate=await sql(db,`SELECT p.* FROM producer_records p JOIN entity_records er ON er.record_id=p.id
        WHERE p.id=? AND er.entity_id=? AND p.validation_status='accepted'`,raw.candidate_record_id,entityId).first();
      if(!candidate||candidate.environment!==entity.environment||candidate.market!==entity.market||!candidate.normalized_json)continue;
      const input=JSON.parse(candidate.normalized_json),documentRow=await sql(db,'SELECT * FROM source_documents WHERE id=?',raw.document_id).first();
      if(!documentRow)continue;
      const document=await decodeSourceDocument(documentRow.document_json,{db});
      if(document.document_kind!=='cca_official_bundle'||document.source_identifier!==raw.reviewed_source_identifier
        ||document.requested_url!==raw.reviewed_canonical_url||document.url!==raw.reviewed_canonical_url
        ||documentRow.source_url!==raw.reviewed_canonical_url||documentRow.fetched_at!==document.fetched_at)continue;
      const received=Date.parse(receipt.received_at),checked=Date.parse(document.fetched_at);
      if(!Number.isFinite(received)||!Number.isFinite(checked)||received<checked||received-checked>300000)continue;
      // Validate at the original review time: reviewed identity lineage outlives
      // proof TTL, while current customer readiness still requires fresh proof.
      const proof=verifyDocument(document,{now:receipt.received_at});
      if(proof.status!=='verified'||proof.facts.country!==entity.market||proof.facts.source_identifier!==raw.reviewed_source_identifier
        ||proof.facts.source_platform!==raw.reviewed_source_platform||proof.facts.canonical_url!==raw.reviewed_canonical_url
        ||input.market!==entity.market||input.environment!==entity.environment
        ||input.source_platform!==raw.reviewed_source_platform||input.source_identifier!==raw.reviewed_source_identifier
        ||input.canonical_url!==raw.reviewed_canonical_url||input.event_start!==proof.facts.event_start||input.event_end!==proof.facts.event_end
        ||entity.edition!==proof.facts.event_start?.slice(0,4))continue;
      const facts=(await sql(db,`SELECT f.* FROM source_facts f JOIN entity_facts ef ON ef.fact_id=f.id
        WHERE f.record_id=? AND ef.entity_id=?`,receipt.id,entityId).all()).results??[];
      const required=['source_platform','source_identifier','canonical_url','event_start','event_end','organiser'];
      if(required.some(field=>!facts.some(f=>f.field_name===field&&f.authority===100&&f.value_json===stableJson(proof.facts[field])))
        ||facts.some(f=>f.authority!==100||!FIELDS.includes(f.field_name)||f.value_json!==stableJson(proof.facts[f.field_name])))continue;
      const superseded=previous.filter(old=>old.authority===100&&facts.some(f=>f.field_name===old.field_name&&f.value_json!==old.value_json));
      if(raw.verified_report!==undefined&&stableJson(raw.verified_report)!==stableJson(proof))continue;
      if(superseded.length) {
        if(!raw.verified_report)continue;
        const ledger=(await sql(db,'SELECT * FROM official_source_supersessions WHERE review_record_id=? AND entity_id=?',receipt.id,entityId).all()).results??[];
        if(superseded.some(old=>!ledger.some(s=>s.previous_fact_id===old.id&&s.field_name===old.field_name
          &&s.next_fact_id===facts.find(f=>f.field_name===old.field_name)?.id&&s.document_id===raw.document_id&&s.reviewed_at===receipt.received_at)))continue;
      }
      const review=Object.freeze({receipt_id:receipt.id,entity_id:entityId,candidate_record_id:candidate.id,raw:Object.freeze({...raw,previous_field_ids:Object.freeze({...raw.previous_field_ids})}),facts:Object.freeze(facts.map(f=>Object.freeze({...f})))});
      TRUSTED_OFFICIAL_REVIEWS.add(review);return review;
    } catch { /* malformed or mismatched custody is not an approved review */ }
  }
  return null;
}

export async function selectRecordFacts(db,entityId,facts,{now=new Date().toISOString(),snapshot=null}={}) {
  if(facts.length>FIELDS.length||new Set(facts.map(f=>f.field_name)).size!==facts.length)throw Error('bounded_distinct_record_fields_required');
  const entity=snapshot??await loadEntity(db,entityId);
  if(!entity||entity.id!==entityId)throw new Error('entity_missing');
  const reviews=new Map(),producers=new Map();
  const statements=[],selectionIndexes=[],decisions=[];
  for(const fact of facts) {
  const previous=entity.selections[fact.field_name];
  const nextValue=JSON.parse(fact.value_json);
  let weakerReviewedSource=false;
  if(previous?.authority===100&&previous.record_id.startsWith('review_')&&previous.value_json!==fact.value_json
    &&fact.field_name!=='lifecycle_state'&&(fact.field_name!=='application_state'||['ENQUIRY_AVAILABLE','WATCH','UNKNOWN','ROLLING'].includes(nextValue))) {
    if(!reviews.has(previous.record_id))reviews.set(previous.record_id,await trustedOfficialSourceReview(db,entityId,{reviewRecordId:previous.record_id}));
    if(reviews.get(previous.record_id)) {
      if(!producers.has(fact.record_id))producers.set(fact.record_id,await sql(db,'SELECT producer_type FROM producer_records WHERE id=?',fact.record_id).first());
      weakerReviewedSource=['structured','search','legacy_recovery','legacy_paid_recovery'].includes(producers.get(fact.record_id)?.producer_type);
    }
  }
  let decision='accepted',reason='missing_field';
  if(nextValue===null||nextValue===''||fact.field_name==='location'&&/restriction|other reasons|^availability$|submit form|your email/i.test(String(nextValue))) { decision='rejected';reason='invalid_or_empty_value'; }
  else if(previous) {
    if(previous.value_json===fact.value_json) { decision=fact.authority>previous.authority?'accepted':'corroborated';reason=decision==='accepted'?'stronger_corroboration':'same_value'; }
    else if(fact.field_name==='lifecycle_state'&&LIFECYCLE_OBSERVATIONS.includes(nextValue)) { decision='corroborated';reason='lifecycle_observation_only'; }
    else if(weakerReviewedSource) {decision='rejected';reason='weaker_reviewed_source_evidence';}
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
