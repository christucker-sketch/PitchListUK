// Recovery from a separate legacy paid engine, never the independent producer.
import {EXPORT_SCHEMA,hash,normalizeExport} from './contract.mjs';
import {extractLegacyPage,fieldEvidence,legacySourceUrl} from './legacy.mjs';
import {verifyDocument} from './verification.mjs';
import {sql,ingestRecords} from './store.mjs';

export async function legacyGlobalRecord({original,document,custody}) {
  const route=original?.source_url;
  if(!legacySourceUrl(route)||document?.requested_url!==route||document.reason||!document.html
    ||!Number.isFinite(Date.parse(document.fetched_at)))return {category:'quarantine',reason:document?.reason??'original_source_document_required'};
  const extracted=await extractLegacyPage(document.html,document.url,{now:document.fetched_at});
  if(!extracted.fields)return {category:'quarantine',reason:extracted.reason};
  const proof=verifyDocument(document,{now:document.fetched_at});
  if(proof.status==='quarantine')return {category:'quarantine',reason:proof.reasons[0]??'source_page_requires_review',proof_reasons:proof.reasons};
  if(proof.facts.country&&proof.facts.country!=='GB')return {category:'quarantine',reason:'source_country_market_mismatch'};
  const fields={...extracted.fields,canonical_url:route,
    // Legacy publication flags, query geography, old dates/states and the old
    // generic link scan cannot supply current application proof.
    application_url:['verified','partial'].includes(proof.status)?proof.facts.application_url??null:null,
    application_state:'UNKNOWN',lifecycle_state:'WATCH',source_platform:new URL(document.url).hostname.replace(/^www\./,'')};
  const evidence=fieldEvidence(fields,{kind:extracted.kind,source:route,excerpt:extracted.evidence.excerpt});
  for(const field of ['canonical_url','source_platform'])evidence[field]={kind:'source_route',source:route,excerpt:document.url};
  for(const field of ['application_state','lifecycle_state'])evidence[field]={kind:'historical_state',source:route,excerpt:'Availability requires independent current verification; no open application is asserted.'};
  if(fields.application_url)evidence.application_url={kind:'retained_structured',source:route,excerpt:JSON.stringify(proof.evidence).slice(0,3000)};
  const record={schema_version:EXPORT_SCHEMA,opportunity_id:'legacy-global:'+await hash(route),country_code:'GB',...fields,
    last_checked:document.fetched_at,evidence:[extracted.evidence],field_evidence:evidence,
    provenance:[{kind:'legacy_global_paid_recovery',...custody,original_source:route,live_document_sha256:document.content_hash}],
    legacy_global_uk:{...custody,audit_status:'pending',shadow_only:true,original_fields:original},
    publication_eligible:false,promotion_eligible:false};
  if(normalizeExport(record,{producer:'legacy-global-uk'}).errors.length)throw Error('legacy_global_record_custody_invalid');
  return {category:'source_refetch',record,proof_status:proof.status,proof_reasons:proof.reasons};
}

export async function importLegacyGlobalRecords(db,body,{now=new Date().toISOString()}={}) {
  if(!Array.isArray(body.records)||body.records.length<1||body.records.length>10)throw Error('legacy_global_batch_1_to_10_required');
  const guard=await sql(db,`SELECT (SELECT publication_enabled FROM runtime_policy WHERE id=1) AS publication,
    (SELECT COUNT(*) FROM customer_projections)+(SELECT COUNT(*) FROM publication_queue) AS leakage,
    (SELECT bulk_enabled FROM serper_policy WHERE id=1) AS bulk,
    (SELECT manual_paused FROM commercial_acquisition_policy WHERE id=1) AS paid_paused`).first();
  if(guard.publication||guard.leakage||guard.bulk||!guard.paid_paused)throw Error('legacy_global_shadow_paused_guard_required');
  // Validate the entire bounded batch before any write.
  if(body.records.some(r=>normalizeExport(r,{producer:'legacy-global-uk',environment:'shadow'}).errors.length))throw Error('legacy_global_evidence_record_invalid');
  return {...await ingestRecords(db,body.records,{producer:'legacy-global-uk',environment:'shadow',now}),shadow_only:true,audit_status:'pending'};
}
