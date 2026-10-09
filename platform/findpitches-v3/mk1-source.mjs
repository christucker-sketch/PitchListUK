import {EXPORT_SCHEMA,hash,platformId,stableJson} from './contract.mjs';
import {platformRoute} from './source-catalogue.mjs';
import {verifyDocument} from './verification.mjs';
import {fetchSourceDocument,safeSourceUrl} from './source-document.mjs';
import {sql,ingestRecords,loadEntity} from './store.mjs';
import {reconcileRecord,evaluateReadiness} from './pipeline.mjs';
import {recordVerification,verificationUrl} from './verification-store.mjs';
import {assessMk1Listing,summarizeMk1Document,mk1ApplicationRoutes} from './mk1-audit.mjs';
import {proposeFact} from './evidence.mjs';

// Anonymous public preview only: never send subscriber, Stripe or account credentials.
export async function fetchLiveMk1Catalogue({fetcher=fetch,now=new Date().toISOString()}={}) {
  const url='https://pitchlist.uk/api/customer-opportunities/search?limit=50';
  const response=await fetcher(url,{redirect:'manual',headers:{Accept:'application/json','User-Agent':'FindPitches-V3-ReadOnly-UK-Audit/1.0'},signal:AbortSignal.timeout(12000)});
  if(response.status!==200||!/application\/json/i.test(response.headers.get('content-type')??''))throw Error('mk1_live_public_catalogue_unavailable');
  const reader=response.body.getReader(),parts=[];let size=0;
  try {for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1048576){await reader.cancel();throw Error('mk1_live_catalogue_size_limit');}parts.push(value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let at=0;for(const part of parts){bytes.set(part,at);at+=part.length;}
  const raw=new TextDecoder().decode(bytes),data=JSON.parse(raw);
  if(!Number.isInteger(data.total)||data.total<0||data.total>10000||!Array.isArray(data.rows)||data.rows.length>50)throw Error('mk1_live_catalogue_shape_changed');
  if(data.rows.some(r=>r.country&&!['United Kingdom','GB','UK'].includes(r.country)||r.country_code&&r.country_code!=='GB'))throw Error('mk1_live_catalogue_country_conflict');
  return {requested_url:url,fetched_at:now,http_status:200,content_hash:await hash(raw),total:data.total,count:data.count,returned:data.rows.length,updated:data.updated,access:data.access,
    rows:data.rows.map(r=>({id:r.id,event_name:r.event_name,location:r.location,route_type:r.route_type,country:r.country,event_start:r.event_start}))};
}

export async function fetchMk1Attachment(url,{fetcher=fetch,now=new Date().toISOString()}={}) {
  const meta={requested_url:url,fetched_at:now};let current=url;
  for(let i=0;i<4;i++) {
    if(!safeSourceUrl(current))return {...meta,reason:'unsafe_original_source_url'};
    const r=await fetcher(current,{redirect:'manual',headers:{Accept:'application/pdf','User-Agent':'FindPitches-V3-ReadOnly-UK-Audit/1.0'},signal:AbortSignal.timeout(12000)});
    if([301,302,303,307,308].includes(r.status)&&r.headers.get('location')){current=new URL(r.headers.get('location'),current).href;continue;}
    if(!r.ok)return {...meta,url:current,http_status:r.status,reason:'source_http_'+r.status};
    if(!/application\/pdf/i.test(r.headers.get('content-type')??''))return {...meta,url:current,http_status:r.status,reason:'source_attachment_format_requires_review'};
    const reader=r.body.getReader(),parts=[];let size=0;
    try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2097152){await reader.cancel();return {...meta,reason:'source_attachment_size_limit'};}parts.push(value);}}finally{reader.releaseLock();}
    const bytes=new Uint8Array(size);let at=0;for(const p of parts){bytes.set(p,at);at+=p.length;}
    if(new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-')return {...meta,reason:'source_attachment_pdf_signature_missing'};
    let binary='';for(let at=0;at<bytes.length;at+=32768)binary+=String.fromCharCode(...bytes.subarray(at,at+32768));
    const digest=await crypto.subtle.digest('SHA-256',bytes);
    return {...meta,url:current,http_status:200,content_type:'application/pdf',bytes:size,content_sha256:[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join(''),pdf_base64:btoa(binary)};
  }
  return {...meta,reason:'source_redirect_limit'};
}

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

export async function mk1AuditedRecord({market,original,document,documents=new Map(),reviewedPdfHashes=[],gitRef,snapshotHash,now=new Date().toISOString()}) {
  if(market!=='GB'||!/^[a-f0-9]{40}$/.test(gitRef??'')||!/^[a-f0-9]{64}$/.test(snapshotHash??''))throw Error('mk1_uk_source_custody_required');
  if(document.requested_url?.split('#')[0]!==original.source_url?.split('#')[0]||document.html&&await hash(document.html)!==document.content_hash)throw Error('mk1_original_document_custody_required');
  const audit=assessMk1Listing({original,source:document,documents,reviewedPdfHashes,now});
  if(!['clearly_usable','usable_minor_gaps'].includes(audit.grade)||audit.country!=='GB')return {held:true,audit,reasons:audit.reasons};
  const facts={...audit.facts,canonical_url:document.requested_url,lifecycle_state:'NEW',source_platform:audit.proof.profile==='generic'?new URL(document.url).hostname:audit.proof.profile};
  const field_evidence={...audit.field_evidence};
  for(const [key,value] of Object.entries(facts))if(!field_evidence[key])field_evidence[key]={kind:'source_route',source:document.url,excerpt:'Audited current source '+document.url+'; '+key+': '+value};
  const metadata={audit_status:'pending',shadow_only:true,git_ref:gitRef,snapshot_sha256:snapshotHash,original_row_sha256:await hash(original),original_fields:original,
    source_hash:document.content_hash,country_evidence:audit.country_evidence??audit.proof.evidence,practical_quality:audit.grade,location_caveat:audit.location_caveat??null,application_receipt:audit.application_receipt??null};
  return {audit,record:{schema_version:EXPORT_SCHEMA,opportunity_id:original.id,country_code:'GB',...facts,last_checked:document.fetched_at,source_fingerprint:document.content_hash,
    field_evidence,legacy_mk1:metadata,evidence:audit.proof.evidence,provenance:[{producer:'legacy_mk1',discovery_origin:'legacy_mk1',customer_host:'pitchlist.uk',...metadata}],promotion_eligible:false,publication_eligible:false}};
}

export async function importMk1Source(db,body,{fetcher=fetch,now=new Date().toISOString()}={}) {
  const guard=await sql(db,`SELECT (SELECT publication_enabled FROM runtime_policy WHERE id=1) AS publication,
    (SELECT COUNT(*) FROM customer_projections)+(SELECT COUNT(*) FROM publication_queue) AS leakage,
    (SELECT bulk_enabled FROM serper_policy WHERE id=1) AS bulk,(SELECT manual_paused FROM commercial_acquisition_policy WHERE id=1) AS paid_paused,
    EXISTS(SELECT 1 FROM quality_gates WHERE name='structured-100-preservation' AND tested_records=100 AND destructive_mutations=0) AS preservation_gate`).first();
  if(guard.publication||guard.leakage||guard.bulk||!guard.paid_paused||!guard.preservation_gate)throw Error('mk1_shadow_preservation_guard_required');
  if(body.market!=='GB')throw Error('mk1_uk_only_required');
  if(!body.original||stableJson(body.original).length>131072||!/^[a-f0-9]{40}$/.test(body.gitRef??'')||!/^[a-f0-9]{64}$/.test(body.snapshotHash??''))throw Error('mk1_bounded_source_custody_required');
  const audited=body.audit_mode==='source_review';
  if(body.reviewedPdfHashes!==undefined&&(!Array.isArray(body.reviewedPdfHashes)||body.reviewedPdfHashes.length>10||body.reviewedPdfHashes.some(h=>!(/^[a-f0-9]{64}$/).test(h))))throw Error('bounded_reviewed_pdf_hashes_required');
  const url=audited?body.original.source_url:platformRoute(body.original.application_url)?.url??body.original.source_url??body.original.application_url;
  if(!safeSourceUrl(url))throw Error('mk1_public_original_source_required');
  const due=await sql(db,"SELECT COUNT(*) AS n FROM jobs WHERE stage IN ('reconcile','eligibility','enrichment','readiness') AND status IN ('ready','leased') AND available_at<=?",now).first();
  if(due.n>40)throw Error('mk1_verification_backlog');
  // Native Worker fetch: an operator-provided HTML document can never manufacture proof.
  const document=await fetchSourceDocument(url,{fetcher,now}),documents=new Map([[url.split('#')[0],document]]);
  if(audited) {
    const choices=mk1ApplicationRoutes(summarizeMk1Document(document));
    const chosen=choices.find(r=>r.url.split('#')[0]===body.original.application_url?.split('#')[0])??(choices.length===1?choices[0]:null);
    if(chosen&&chosen.url.split('#')[0]!==url.split('#')[0]) {
      let app=await fetchSourceDocument(chosen.url,{fetcher,now});
      if(app.reason==='source_format_requires_review'){const pdf=await fetchMk1Attachment(chosen.url,{fetcher,now});if(!pdf.reason){delete pdf.pdf_base64;app=pdf;}}
      documents.set(chosen.url.split('#')[0],app);
    }
  }
  const prepared=audited?await mk1AuditedRecord({...body,document,documents,now}):await mk1ProofRecord({...body,document,now});
  const documentId='doc_'+(await hash(document)).slice(0,40);
  await sql(db,'INSERT OR IGNORE INTO source_documents VALUES (?,?,?,?,?)',documentId,url,document.content_hash??null,document.fetched_at,stableJson(document)).run();
  for(const [appUrl,app] of documents)if(app!==document)await sql(db,'INSERT OR IGNORE INTO source_documents VALUES (?,?,?,?,?)','doc_'+(await hash(app)).slice(0,40),appUrl,app.content_hash??app.content_sha256??null,app.fetched_at,stableJson(app)).run();
  if(!prepared.record)return {status:'held',reasons:prepared.reasons,source_document_id:documentId};
  const imported=await ingestRecords(db,[prepared.record],{producer:audited?'legacy_mk1':'platform-catalogue',environment:'shadow',now});
  if(imported.rejected)throw Error('mk1_proved_record_rejected');
  const recordId=imported.record_ids[0],decision=await reconcileRecord(db,recordId,{now});
  if(!decision.entity_id)return {status:'held',record_id:recordId,identity:decision.outcome,reasons:[decision.reason]};
  // A current specific trader form proves its application route, even when
  // venue/availability gaps prevent whole-record READY verification. Retain the
  // older route and use the designed additive evidence selector, never SQL repair.
  let applicationRepair=null;
  if(audited&&prepared.audit.source_form_proof) {
    const proof=prepared.audit.source_form_proof;
    applicationRepair=await proposeFact(db,decision.entity_id,{field:'application_url',value:prepared.audit.facts.application_url,kind:'direct_form',source_url:proof.source_url,excerpt:proof.excerpt},{now});
  }
  const entity=await loadEntity(db,decision.entity_id);
  if(verificationUrl(entity)!==document.requested_url)return {status:'held',record_id:recordId,entity_id:entity.id,identity:decision.outcome,reasons:['matched_entity_requires_original_source_verification']};
  await recordVerification(db,entity.id,document,{now,addEvidence:!audited||prepared.audit.proof.status==='verified'});
  const readiness=await evaluateReadiness(db,entity.id,{now});
  return {status:'imported',record_id:recordId,entity_id:entity.id,identity:decision.outcome,readiness:readiness.status,duplicate:imported.duplicates===1,source_document_id:documentId,...(applicationRepair?{application_route_evidence:applicationRepair}:{})};
}
