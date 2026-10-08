import {hash,stableJson} from './contract.mjs';
import {sql,loadEntity} from './store.mjs';
import {proposeFact} from './evidence.mjs';
import {fetchSourceDocument} from './source-document.mjs';
import {fetchMyntBundle,myntVenueUrl} from './uk-sources.mjs';
import {verifyDocument,compareProof,applicationScope,provedEventSourceUrl,eventenyParentId,VERIFIER_VERSION} from './verification.mjs';

export function verificationUrl(entity) {
  // Prefer the retained event detail over an old footer application link.
  // Eventeny's vendor ID is itself the application/event identity anchor.
  const app=entity.application_url,canonical=entity.canonical_url;
  try {if(/(?:^|\.)eventeny\.com$/.test(new URL(app).hostname)&&new URL(app).pathname==='/events/vendor/')return app;}catch{}
  return canonical??app;
}

export async function verificationGate(db,entity,{now=new Date().toISOString()}={}) {
  const row=await sql(db,'SELECT * FROM source_verifications WHERE entity_id=? ORDER BY sequence DESC LIMIT 1',entity.id).first();
  if(!row)return {status:'unverified',reasons:['source_verification_required']};
  const report=JSON.parse(row.report_json);
  if(row.entity_revision!==entity.revision||row.verifier_version!==VERIFIER_VERSION||Date.parse(row.checked_at)>Date.parse(now)||Date.parse(row.expires_at)<=Date.parse(now))return {status:'unverified',reasons:['source_verification_stale_or_revision_changed'],verification_id:row.id};
  const comparison=compareProof(entity,report),scope=applicationScope(report),reasons=[...new Set([...report.reasons,...comparison,...scope.reasons])];
  return {status:(comparison.length||scope.reasons.some(r=>r.startsWith('contradictory_')))&&row.status==='verified'?'quarantine':scope.reasons.length&&row.status==='verified'?'partial':row.status,reasons,verification_id:row.id,profile:report.profile,facts:report.facts,application_heading:scope.heading,application_audience:scope.audience,checked_at:row.checked_at,expires_at:row.expires_at};
}
export async function recordVerification(db,entityId,document,{now=new Date().toISOString(),addEvidence=true}={}) {
  let entity=await loadEntity(db,entityId);if(!entity||!['test','shadow'].includes(entity.environment))throw Error('shadow_entity_required');
  const originalRoute=verificationUrl(entity);
  if(document.requested_url!==originalRoute)throw Error('entity_original_source_required');
  const checked=document.fetched_at??now;
  if(!Number.isFinite(Date.parse(checked))||Date.parse(checked)>Date.parse(now)+1000)throw Error('source_fetch_time_invalid');
  const latest=await sql(db,'SELECT checked_at FROM source_verifications WHERE entity_id=? ORDER BY sequence DESC LIMIT 1',entityId).first();
  if(latest&&Date.parse(checked)<Date.parse(latest.checked_at))throw Error('older_verification_cannot_supersede_newer_proof');
  const report=verifyDocument(document,{now});
  if(report.profile==='eventeny') {
    const first=await sql(db,`SELECT v.report_json,d.document_json FROM source_verifications v JOIN source_documents d ON d.id=v.document_id WHERE v.entity_id=? AND json_extract(v.report_json,'$.profile')='eventeny'
      AND v.status IN ('verified','partial') ORDER BY v.sequence LIMIT 1`,entityId).first();
    const original=first?JSON.parse(first.report_json):null;
    // Older reports may have a truncated JSON-LD excerpt. The immutable full
    // document still binds the original parent; parsing it performs no visit.
    const prior=original?(eventenyParentId(provedEventSourceUrl(original))??eventenyParentId(provedEventSourceUrl(verifyDocument(JSON.parse(first.document_json),{now:original.checked_at})))):null,current=eventenyParentId(provedEventSourceUrl(report));
    if(prior&&prior!==current)report.reasons.push(current?'source_parent_event_identity_mismatch':'source_parent_event_binding_required');
  }
  const identityReasons=[...report.reasons,...compareProof(entity,report)].filter(r=>/identity_mismatch|market_mismatch|source_parent_event_binding_required/.test(r));
  const proposals=[];
  // Stronger evidence may repair selected values through existing authority/CAS rules.
  // A different country/edition or unsafe page is never an automatic identity repair.
  if(addEvidence&&!identityReasons.length&&['verified','partial'].includes(report.status)&&report.page_kind==='event') {
    const kind=['eventeny','localstalls'].includes(report.profile)?'direct_form':'extracted_page';
    for(const [field,value] of Object.entries(report.facts)) {
      if(field==='country'||value==null||value===''||field==='application_state'&&value==='UNKNOWN')continue;
      // Same-authority disagreements remain a verification hold, not invented conflicts.
      const authority=kind==='direct_form'?95:60,previous=entity.selections[field];
      if(previous&&previous.authority>=authority)continue;
      proposals.push({field,result:await proposeFact(db,entityId,{field,value,kind,source_url:document.url,excerpt:stableJson(report.evidence).slice(0,16000)},{now})});
    }
  }
  entity=await loadEntity(db,entityId);
  report.reasons=[...new Set([...report.reasons,...compareProof(entity,report)])];
  if(identityReasons.length||report.reasons.some(r=>/disagrees_with_proof|identity_mismatch|market_mismatch/.test(r)))report.status='quarantine';
  let expiry=Date.parse(checked)+24*3600000;
  if(report.facts.application_deadline)expiry=Math.min(expiry,Date.parse(report.facts.application_deadline+'T00:00:00Z'));
  const expires=new Date(expiry).toISOString(),documentId='doc_'+(await hash(document)).slice(0,40);
  const id='ver_'+(await hash([entityId,entity.revision,documentId,report])).slice(0,40);
  await db.batch([
    sql(db,'INSERT OR IGNORE INTO source_documents(id,source_url,content_hash,fetched_at,document_json) VALUES (?,?,?,?,?)',documentId,originalRoute,document.content_hash??null,checked,stableJson(document)),
    sql(db,'INSERT OR IGNORE INTO source_verifications(id,entity_id,entity_revision,document_id,verifier_version,status,report_json,checked_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?)',id,entityId,entity.revision,documentId,VERIFIER_VERSION,report.status,stableJson(report),checked,expires),
  ]);
  return {verification_id:id,entity_id:entityId,entity_revision:entity.revision,report,proposals};
}
export async function verifyEntitySource(db,entityId,{now=new Date().toISOString(),fetcher=fetch}={}) {
  const entity=await loadEntity(db,entityId);if(!entity||!['test','shadow'].includes(entity.environment))throw Error('shadow_entity_required');
  const original=verificationUrl(entity);if(!original)throw Error('entity_original_source_required');
  const document=entity.source_platform==='myntimage'&&myntVenueUrl(original)
    ?await fetchMyntBundle(original,entity.source_identifier,{fetcher,now})
    :await fetchSourceDocument(original,{fetcher,now});
  return recordVerification(db,entityId,document,{now});
}
export async function reverifyRetainedSource(db,entityId,{now=new Date().toISOString()}={}) {
  const latest=await sql(db,'SELECT d.document_json FROM source_verifications v JOIN source_documents d ON d.id=v.document_id WHERE v.entity_id=? ORDER BY v.sequence DESC LIMIT 1',entityId).first();
  if(!latest)throw Error('retained_source_document_required');const document=JSON.parse(latest.document_json);
  // A policy replay does not claim a new source visit or reset the proof TTL.
  if(!Number.isFinite(Date.parse(document.fetched_at))||Date.parse(now)-Date.parse(document.fetched_at)>=24*3600000)throw Error('retained_source_document_expired');
  return recordVerification(db,entityId,document,{now,addEvidence:false});
}
export async function verificationStatus(db,now) {
  const rows=(await sql(db,`SELECT CASE WHEN v.entity_revision<>e.revision OR julianday(v.expires_at)<=julianday(?) THEN 'expired_or_changed' ELSE v.status END AS status,COUNT(*) AS entities
    FROM source_verifications v JOIN entities e ON e.id=v.entity_id WHERE v.sequence=(SELECT MAX(sequence) FROM source_verifications WHERE entity_id=v.entity_id) GROUP BY 1`,now).all()).results;
  const missing=await sql(db,'SELECT COUNT(*) AS unverified_entities FROM entities e WHERE NOT EXISTS(SELECT 1 FROM source_verifications v WHERE v.entity_id=e.id)').first();
  return {version:VERIFIER_VERSION,required_for_readiness:true,refresh_hours:24,...missing,latest:rows};
}
