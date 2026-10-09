import {EXPORT_SCHEMA,hash,platformId,stableJson} from './contract.mjs';
import {platformRoute} from './source-catalogue.mjs';
import {verifyDocument} from './verification.mjs';
import {fetchSourceDocument,safeSourceUrl} from './source-document.mjs';
import {sql,ingestRecords,loadEntity} from './store.mjs';
import {reconcileRecord,evaluateReadiness} from './pipeline.mjs';
import {recordVerification,verificationUrl} from './verification-store.mjs';

export async function mk1ProofRecord({market,original,document,gitRef,snapshotHash,now=new Date().toISOString()}) {
  if(market!=='GB')throw Error('mk1_uk_only_required');
  if(!/^[a-f0-9]{40}$/.test(gitRef)||!/^[a-f0-9]{64}$/.test(snapshotHash))throw Error('mk1_git_custody_required');
  const url=platformRoute(original.application_url)?.url??original.source_url??original.application_url;
  if(document.requested_url!==url||document.html&&await hash(document.html)!==document.content_hash)throw Error('mk1_original_document_custody_required');
  const proof=verifyDocument(document,{now});
  if(proof.status!=='verified')return {held:true,reasons:proof.reasons};
  if(proof.facts.country!==market)return {held:true,reasons:['source_country_market_mismatch']};
  const {country,...facts}=proof.facts;
  return {record:{schema_version:EXPORT_SCHEMA,opportunity_id:platformRoute(url)?.identity??'mk1-source:'+await hash([country,url]),country_code:country,...facts,
    canonical_url:url,source_platform:proof.profile,source_identifier:platformId(url),lifecycle_state:'NEW',last_checked:document.fetched_at,source_fingerprint:document.content_hash,
    evidence:proof.evidence,provenance:[{producer:'platform-catalogue',discovery_origin:'legacy_mk1',git_ref:gitRef,snapshot_sha256:snapshotHash,
      original_row_sha256:await hash(original),original_fields:original,source_url:document.url,source_content_sha256:document.content_hash,verification_version:proof.version,paid_queries:0}],
    promotion_eligible:false,publication_eligible:false}};
}

export async function importMk1Source(db,body,{fetcher=fetch,now=new Date().toISOString()}={}) {
  const guard=await sql(db,`SELECT (SELECT publication_enabled FROM runtime_policy WHERE id=1) AS publication,
    (SELECT COUNT(*) FROM customer_projections)+(SELECT COUNT(*) FROM publication_queue) AS leakage,
    (SELECT bulk_enabled FROM serper_policy WHERE id=1) AS bulk,(SELECT manual_paused FROM commercial_acquisition_policy WHERE id=1) AS paid_paused,
    EXISTS(SELECT 1 FROM quality_gates WHERE name='structured-100-preservation' AND tested_records=100 AND destructive_mutations=0) AS preservation_gate`).first();
  if(guard.publication||guard.leakage||guard.bulk||!guard.paid_paused||!guard.preservation_gate)throw Error('mk1_shadow_preservation_guard_required');
  if(body.market!=='GB')throw Error('mk1_uk_only_required');
  if(!body.original||stableJson(body.original).length>131072||!/^[a-f0-9]{40}$/.test(body.gitRef??'')||!/^[a-f0-9]{64}$/.test(body.snapshotHash??''))throw Error('mk1_bounded_source_custody_required');
  const url=platformRoute(body.original.application_url)?.url??body.original.source_url??body.original.application_url;
  if(!safeSourceUrl(url))throw Error('mk1_public_original_source_required');
  const due=await sql(db,"SELECT COUNT(*) AS n FROM jobs WHERE stage IN ('reconcile','eligibility','enrichment','readiness') AND status IN ('ready','leased') AND available_at<=?",now).first();
  if(due.n>40)throw Error('mk1_verification_backlog');
  // Native Worker fetch: an operator-provided HTML document can never manufacture proof.
  const document=await fetchSourceDocument(url,{fetcher,now}),prepared=await mk1ProofRecord({...body,document,now});
  const documentId='doc_'+(await hash(document)).slice(0,40);
  await sql(db,'INSERT OR IGNORE INTO source_documents VALUES (?,?,?,?,?)',documentId,url,document.content_hash??null,document.fetched_at,stableJson(document)).run();
  if(!prepared.record)return {status:'held',reasons:prepared.reasons,source_document_id:documentId};
  const imported=await ingestRecords(db,[prepared.record],{producer:'platform-catalogue',environment:'shadow',now});
  if(imported.rejected)throw Error('mk1_proved_record_rejected');
  const recordId=imported.record_ids[0],decision=await reconcileRecord(db,recordId,{now});
  if(!decision.entity_id)return {status:'held',record_id:recordId,identity:decision.outcome,reasons:[decision.reason]};
  const entity=await loadEntity(db,decision.entity_id);
  if(verificationUrl(entity)!==document.requested_url)return {status:'held',record_id:recordId,entity_id:entity.id,identity:decision.outcome,reasons:['matched_entity_requires_original_source_verification']};
  await recordVerification(db,entity.id,document,{now});
  const readiness=await evaluateReadiness(db,entity.id,{now});
  return {status:'imported',record_id:recordId,entity_id:entity.id,identity:decision.outcome,readiness:readiness.status,duplicate:imported.duplicates===1,source_document_id:documentId};
}
