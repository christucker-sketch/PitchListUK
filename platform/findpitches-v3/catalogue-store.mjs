import {sql,ingestRecords,loadEntity} from './store.mjs';
import {hash,stableJson,EXPORT_SCHEMA,platformId} from './contract.mjs';
import {catalogueUrl,fetchCatalogueDocument,catalogueLinks,platformRoute,eventApplicationLinks} from './source-catalogue.mjs';
import {fetchSourceDocument} from './source-document.mjs';
import {verifyDocument,applicationScope,compareProof} from './verification.mjs';
import {reconcileRecord,evaluateReadiness,runStage,enrichEntity} from './pipeline.mjs';
import {recordVerification,verificationGate,verifyEntitySource} from './verification-store.mjs';

async function shadowGuard(db) {
  const s=await sql(db,`SELECT (SELECT publication_enabled FROM runtime_policy WHERE id=1) AS publication_enabled,
    (SELECT COUNT(*) FROM customer_projections) AS customer_rows,(SELECT COUNT(*) FROM publication_queue) AS publication_rows,
    (SELECT bulk_enabled FROM serper_policy WHERE id=1) AS bulk_enabled,(SELECT manual_paused FROM commercial_acquisition_policy WHERE id=1) AS paid_paused,
    EXISTS(SELECT 1 FROM quality_gates WHERE name='structured-100-preservation' AND tested_records=100 AND destructive_mutations=0) AS preservation_gate`).first();
  if(s.publication_enabled||s.customer_rows||s.publication_rows||s.bulk_enabled||!s.paid_paused||!s.preservation_gate)throw Error('free_catalogue_shadow_preservation_required');
}
async function activeRun(db,id,now) {
  await shadowGuard(db);const run=await sql(db,'SELECT * FROM catalogue_runs WHERE id=?',id).first();
  if(!run||run.status!=='active'||run.expires_at<=now)throw Error('active_bounded_catalogue_run_required');
  if(await currentInvalidScopeClaims(db,id)){await stopCatalogueRun(db,id,'current_scope_false_promotion');throw Error('catalogue_current_scope_false_promotion');}
  return run;
}
async function currentInvalidScopeClaims(db,id) {
  const claims=(await sql(db,`SELECT DISTINCT e.id,e.market,e.edition,json_extract(v.report_json,'$.profile') AS profile,json_extract(v.report_json,'$.facts') AS facts_json,
    json_extract(v.report_json,'$.application_heading') AS application_heading,
    json_object('trader_application',json_extract(v.report_json,'$.application_scope_proof.trader_application'),
      'restricted_audience',json_extract(v.report_json,'$.application_scope_proof.restricted_audience'),
      'guaranteed_vendor_space',json_extract(v.report_json,'$.application_scope_proof.guaranteed_vendor_space'),
      'application_role',json_extract(v.report_json,'$.application_scope_proof.application_role'),
      'age_restricted',json_extract(v.report_json,'$.application_scope_proof.age_restricted'),
      'event_date_assertions',json(json_extract(v.report_json,'$.application_scope_proof.event_date_assertions')),
      'application_description',CASE WHEN (json_type(v.report_json,'$.application_scope_proof.event_date_assertions') IS NULL OR json_type(v.report_json,'$.application_scope_proof.application_role') IS NULL) THEN
        (SELECT json_extract(d.value,'$.excerpt') FROM json_each(v.report_json,'$.application_scope_proof.evidence') d WHERE json_extract(d.value,'$.kind')='application_description' LIMIT 1) END) AS scope_json
    FROM catalogue_candidates c JOIN catalogue_progress p ON p.candidate_id=c.id JOIN entities e ON e.id=p.entity_id
    JOIN readiness r ON r.entity_id=e.id AND r.status='ready' JOIN source_verifications v ON v.sequence=(SELECT MAX(sequence) FROM source_verifications WHERE entity_id=e.id)
    WHERE c.run_id=?`,id).all()).results??[];
  return claims.filter(c=>applicationScope({...c,facts:JSON.parse(c.facts_json??'{}'),application_scope_proof:JSON.parse(c.scope_json)}).reasons.length||compareProof(c,{facts:JSON.parse(c.facts_json??'{}')}).length).length;
}
export async function startCatalogueRun(db,{max_candidates=1000}={},now=new Date().toISOString()) {
  await shadowGuard(db);if(!Number.isInteger(max_candidates)||max_candidates<1||max_candidates>2000)throw Error('catalogue_limit_1_to_2000_required');
  const run={id:'catalogue_'+crypto.randomUUID(),max_candidates,created_at:now,expires_at:new Date(Date.parse(now)+6*3600000).toISOString()};
  await sql(db,"INSERT INTO catalogue_runs(id,status,max_candidates,created_at,expires_at) VALUES (?,'active',?,?,?)",run.id,max_candidates,now,run.expires_at).run();return {...run,paid_queries:0,standing_scheduler_enabled:false};
}
export async function resumeReviewedCatalogueRun(db,{run_id,review}={},now=new Date().toISOString()) {
  await shadowGuard(db);if(typeof review!=='string'||!review.trim()||review.length>1000)throw Error('catalogue_operator_review_required');
  const run=await sql(db,'SELECT * FROM catalogue_runs WHERE id=?',run_id).first();
  if(!run||run.status!=='paused'||run.expires_at<=now||run.checked>=run.max_candidates)throw Error('unexpired_bounded_paused_catalogue_run_required');
  const unsettled=await sql(db,`SELECT COUNT(*) AS n FROM catalogue_candidates c JOIN catalogue_progress p ON p.candidate_id=c.id WHERE c.run_id=? AND p.status IN ('failed','verifying')`,run_id).first();
  const due=await sql(db,"SELECT COUNT(*) AS n FROM jobs WHERE stage IN ('reconcile','eligibility','enrichment','readiness') AND status IN ('ready','leased') AND available_at<=?",now).first();
  if(unsettled.n||due.n>40||await currentInvalidScopeClaims(db,run_id))throw Error('catalogue_resume_health_review_required');
  const audit={document_kind:'bounded_catalogue_operator_resume',run_id,review,prior_stop_reason:run.stop_reason,reviewed_at:now,max_candidates:run.max_candidates,checked:run.checked,expires_at:run.expires_at,budget_reservation_refunded:false};
  const result=await db.batch([
    sql(db,"UPDATE catalogue_runs SET status='active',stop_reason=NULL WHERE id=? AND status='paused' AND checked=? AND expires_at=? RETURNING id",run_id,run.checked,run.expires_at),
    sql(db,'INSERT OR IGNORE INTO source_documents VALUES (?,?,NULL,?,?)','doc_'+(await hash(audit)).slice(0,40),'https://www.eventeny.com/robots.txt',now,stableJson(audit)),
  ]);
  if(result[0].results.length!==1)throw Error('catalogue_resume_raced');return {run_id,status:'active',max_candidates:run.max_candidates,checked:run.checked,expires_at:run.expires_at,reservations_refunded:0};
}
const routeKey=url=>{try{const u=new URL(url);u.hostname=u.hostname.replace(/^www\./,'');u.hash='';for(const key of [...u.searchParams.keys()])if(/^(?:utm_|srsltid|aff|fbclid)/i.test(key))u.searchParams.delete(key);return u.href;}catch{return null;}};
export async function adoptCommittedCatalogueReceipt(db,{candidate_id,review},now=new Date().toISOString()) {
  await shadowGuard(db);if(typeof review!=='string'||!review.trim()||review.length>1000)throw Error('catalogue_operator_review_required');
  const c=await sql(db,"SELECT c.*,p.status,p.record_id,p.document_id,p.entity_id FROM catalogue_candidates c JOIN catalogue_progress p ON p.candidate_id=c.id WHERE c.id=?",candidate_id).first();
  if(!c||c.status!=='failed'||c.record_id||c.document_id||c.entity_id)throw Error('catalogue_uncheckpointed_committed_receipt_required');
  const producerId=platformRoute(c.url)?.identity??'catalogue:'+routeKey(c.url);
  const receipt=await sql(db,`SELECT p.id,p.normalized_json,d.entity_id,d.outcome FROM producer_records p JOIN reconciliation_decisions d ON d.record_id=p.id
    JOIN entity_records l ON l.record_id=p.id AND l.entity_id=d.entity_id WHERE p.producer_name='platform-catalogue' AND p.environment='shadow'
    AND p.producer_record_id=? AND p.received_at>=? ORDER BY p.received_at DESC LIMIT 1`,producerId,c.discovered_at).first();
  if(!receipt)throw Error('catalogue_committed_identity_custody_required');
  const input=JSON.parse(receipt.normalized_json),provenance=Array.isArray(input.provenance)?input.provenance[0]:input.provenance;
  const source=await sql(db,'SELECT document_json FROM source_documents WHERE id=?',provenance?.source_document_id??'').first(),entity=await loadEntity(db,receipt.entity_id);
  if(!source||!entity||JSON.parse(source.document_json).requested_url!==c.url||input.canonical_url!==c.url||(entity.application_url??entity.canonical_url)!==c.url||provenance.catalogue_document_id!==c.source_document_id)throw Error('catalogue_committed_source_custody_required');
  const audit={document_kind:'catalogue_committed_receipt_adoption',candidate_id,record_id:receipt.id,entity_id:receipt.entity_id,document_id:provenance.source_document_id,review,adopted_at:now,source_refetches:0,reservations_refunded:0};
  const result=await db.batch([
    sql(db,"UPDATE catalogue_progress SET record_id=?,document_id=?,entity_id=? WHERE candidate_id=? AND status='failed' AND record_id IS NULL AND document_id IS NULL AND entity_id IS NULL RETURNING candidate_id",receipt.id,provenance.source_document_id,receipt.entity_id,candidate_id),
    sql(db,'INSERT OR IGNORE INTO source_documents VALUES (?,?,NULL,?,?)','doc_'+(await hash(audit)).slice(0,40),c.url,now,stableJson(audit)),
  ]);
  if(result[0].results.length!==1)throw Error('catalogue_committed_adoption_raced');
  return settleCommittedCatalogueReceipt(db,candidate_id,now);
}
export async function settleCommittedCatalogueReceipt(db,candidateId,now=new Date().toISOString()) {
  await shadowGuard(db);
  const c=await sql(db,'SELECT c.*,p.status,p.lease_until,p.record_id,p.document_id,p.entity_id FROM catalogue_candidates c JOIN catalogue_progress p ON p.candidate_id=c.id WHERE c.id=?',candidateId).first();
  if(!c||!['failed','verifying'].includes(c.status)||c.status==='verifying'&&(!c.lease_until||c.lease_until>now)||!c.record_id||!c.document_id||!c.entity_id)throw Error('catalogue_committed_interrupted_receipt_required');
  const custody=await sql(db,`SELECT d.document_json FROM producer_records r JOIN entity_records l ON l.record_id=r.id
    JOIN reconciliation_decisions i ON i.record_id=r.id AND i.entity_id=l.entity_id JOIN source_documents d ON d.id=?
    WHERE r.id=? AND r.producer_name='platform-catalogue' AND l.entity_id=?`,c.document_id,c.record_id,c.entity_id).first();
  const entity=await loadEntity(db,c.entity_id);
  if(!custody||!entity||JSON.parse(custody.document_json).requested_url!==(entity.application_url??entity.canonical_url))throw Error('catalogue_committed_custody_requires_review');
  // This only completes custody accounting, including an expired/WATCH result.
  // The normal gate recomputes current readiness; no source visit, new proof,
  // identity decision or budget refund is manufactured by recovery.
  const readiness=await evaluateReadiness(db,c.entity_id,{now});
  const audit={document_kind:'committed_catalogue_receipt_settlement',candidate_id:candidateId,record_id:c.record_id,entity_id:c.entity_id,source_document_id:c.document_id,settled_at:now,readiness:readiness.status,source_fetches:0,budget_reservation_refunded:false};
  const result=await db.batch([
    sql(db,"UPDATE catalogue_progress SET status='imported',reason=?,checked_at=?,lease_until=NULL WHERE candidate_id=? AND status=? AND record_id=? AND document_id=? AND entity_id=? RETURNING candidate_id",readiness.status,now,candidateId,c.status,c.record_id,c.document_id,c.entity_id),
    sql(db,'INSERT OR IGNORE INTO source_documents VALUES (?,?,NULL,?,?)','doc_'+(await hash(audit)).slice(0,40),c.url,now,stableJson(audit)),
  ]);
  if(result[0].results.length!==1)throw Error('catalogue_receipt_settlement_raced');
  return {candidate_id:candidateId,status:'imported',entity_id:c.entity_id,record_id:c.record_id,readiness:readiness.status,source_fetches:0,reservations_refunded:0};
}
export async function recoverUncommittedCatalogueLease(db,candidateId,now=new Date().toISOString()) {
  const c=await sql(db,'SELECT c.*,p.status,p.lease_until,p.record_id,p.document_id FROM catalogue_candidates c JOIN catalogue_progress p ON p.candidate_id=c.id WHERE c.id=?',candidateId).first();
  if(!c)throw Error('catalogue_candidate_missing');await shadowGuard(db);
  const run=await sql(db,'SELECT status,expires_at FROM catalogue_runs WHERE id=?',c.run_id).first();
  // Cleanup must work while paused; it does not reopen the fetch grant.
  if(!run||!['active','paused'].includes(run.status)||run.expires_at<=now)throw Error('catalogue_unexpired_recovery_run_required');
  if(c.status!=='verifying'||!c.lease_until||c.lease_until>now||c.record_id||c.document_id)throw Error('catalogue_uncommitted_expired_lease_required');
  const producerId=platformRoute(c.url)?.identity??'catalogue:'+routeKey(c.url),receipt={document_kind:'uncommitted_catalogue_lease_recovery',candidate_id:candidateId,expired_lease:c.lease_until,recovered_at:now,budget_reservation_refunded:false};
  const outcome=await db.batch([
    sql(db,`UPDATE catalogue_progress SET status='pending',reason='expired_before_import',lease_until=NULL WHERE candidate_id=? AND status='verifying' AND lease_until=? AND record_id IS NULL AND document_id IS NULL
      AND NOT EXISTS(SELECT 1 FROM producer_records WHERE producer_name='platform-catalogue' AND producer_record_id=?) RETURNING candidate_id`,candidateId,c.lease_until,producerId),
    sql(db,'INSERT OR IGNORE INTO source_documents VALUES (?,?,NULL,?,?)','doc_'+(await hash(receipt)).slice(0,40),c.url,now,stableJson(receipt)),
  ]);
  if(outcome[0].results.length!==1)throw Error('catalogue_custody_recovery_requires_review');return {candidate_id:candidateId,recovered:true,reservations_refunded:0};
}
export async function discoverCataloguePage(db,{run_id,url,offset=0,limit=500,byte_offset=0},{fetcher=fetch,now=new Date().toISOString()}={}) {
  await activeRun(db,run_id,now);if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>500)throw Error('bounded_catalogue_page_required');
  let document,links;
  if(catalogueUrl(url)) {document=await fetchCatalogueDocument(url,{fetcher,now,byte_offset});links=catalogueLinks(document);}
  else if(platformRoute(url)?.kind==='event_detail'){document=await fetchSourceDocument(url,{fetcher,now});links={catalogues:[],routes:eventApplicationLinks(document)};}
  else throw Error('approved_public_catalogue_or_event_detail_required');
  if(document.reason)return {run_id,reason:document.reason,routes:0,catalogues:[],candidates:[]};
  const applications=links.routes.filter(r=>r.kind==='application'),selected=applications.slice(offset,offset+limit);
  const extract={...document,content:undefined,html:undefined,document_kind:'catalogue_route_extract',offset,total_application_routes_observed:applications.length,routes:selected};
  const documentId='doc_'+(await hash(extract)).slice(0,40);
  await sql(db,'INSERT OR IGNORE INTO source_documents VALUES (?,?,?,?,?)',documentId,url,document.content_hash,document.fetched_at,stableJson(extract)).run();
  const known=(await sql(db,"SELECT json_extract(normalized_json,'$.canonical_url') AS canonical_url,json_extract(normalized_json,'$.application_url') AS application_url FROM producer_records WHERE environment='shadow' AND validation_status='accepted'").all()).results??[];
  const keys=new Set(known.flatMap(r=>[routeKey(r.canonical_url),routeKey(r.application_url)]).filter(Boolean));
  const recent=(await sql(db,`SELECT c.url FROM catalogue_candidates c JOIN catalogue_progress p ON p.candidate_id=c.id
    WHERE p.status IN ('held','imported','failed','verifying') AND (p.checked_at>=? OR p.lease_until>=?)`,new Date(Date.parse(now)-24*3600000).toISOString(),now).all()).results??[];
  const recentKeys=new Set(recent.map(r=>routeKey(r.url)));
  const candidates=[];for(const r of selected){const id='catalogue_candidate_'+(await hash([run_id,routeKey(r.url)])).slice(0,40),known=keys.has(routeKey(r.url)),checked=recentKeys.has(routeKey(r.url));candidates.push({id,url:r.url,family:r.family,duplicate:known||checked,duplicate_reason:known?'retained_route_already_present':checked?'recent_source_check_already_present':null});}
  // Bounded JSON inserts avoid one network/database query per discovery URL.
  await db.batch([
    sql(db,`INSERT OR IGNORE INTO catalogue_candidates SELECT json_extract(value,'$.id'),?,?,json_extract(value,'$.url'),json_extract(value,'$.family'),? FROM json_each(?)`,run_id,documentId,now,stableJson(candidates)),
    sql(db,`INSERT OR IGNORE INTO catalogue_progress(candidate_id,status,reason) SELECT json_extract(value,'$.id'),CASE WHEN json_extract(value,'$.duplicate') THEN 'duplicate' ELSE 'pending' END,json_extract(value,'$.duplicate_reason') FROM json_each(?)`,stableJson(candidates)),
  ]);
  return {run_id,document_id:documentId,coverage:document.coverage??'complete_document',byte_offset,catalogues:links.catalogues,event_details:links.routes.filter(r=>r.kind==='event_detail').slice(offset,offset+limit),routes:applications.length,offset,next_offset:offset+limit<applications.length?offset+limit:null,candidates};
}
export async function verifyCatalogueCandidate(db,candidateId,{fetcher=fetch,now=new Date().toISOString()}={}) {
  const c=await sql(db,'SELECT c.*,p.status,p.entity_id,p.record_id FROM catalogue_candidates c JOIN catalogue_progress p ON p.candidate_id=c.id WHERE c.id=?',candidateId).first();
  if(!c)throw Error('catalogue_candidate_missing');if(c.status!=='pending')return {candidate_id:candidateId,status:c.status,entity_id:c.entity_id,record_id:c.record_id,replay:true};
  await activeRun(db,c.run_id,now);
  const jobs=await sql(db,"SELECT COUNT(*) AS due_jobs FROM jobs WHERE stage IN ('reconcile','eligibility','enrichment','readiness') AND status IN ('ready','leased') AND available_at<=?",now).first();
  if(jobs.due_jobs>40)throw Error('catalogue_verification_backlog');
  const leaseUntil=new Date(Date.parse(now)+120000).toISOString();
  const claim=await sql(db,"UPDATE catalogue_progress SET status='verifying',lease_until=? WHERE candidate_id=? AND status='pending' RETURNING candidate_id",leaseUntil,candidateId).all();
  if(!claim.results.length)throw Error('catalogue_candidate_already_claimed');
  let reserved;
  try {reserved=await sql(db,"UPDATE catalogue_runs SET checked=checked+1 WHERE id=? AND status='active' AND checked<max_candidates RETURNING checked",c.run_id).all();}
  catch(error) {
    // No source visit has begun. Restore only this uncommitted lease, retaining
    // any reservation that may have committed before the response failed.
    await sql(db,"UPDATE catalogue_progress SET status='pending',reason='reservation_not_confirmed',lease_until=NULL WHERE candidate_id=? AND status='verifying' AND lease_until=? AND record_id IS NULL AND document_id IS NULL",candidateId,leaseUntil).run();
    await stopCatalogueRun(db,c.run_id,'budget_reservation_error');
    const code=String(error.message).match(/\bSQLITE_[A-Z_]+\b/)?.[0]?.toLowerCase()??'runtime_failure';
    throw Error('catalogue_budget_reservation_'+code);
  }
  if(!reserved.results.length){await sql(db,"UPDATE catalogue_progress SET status='pending',lease_until=NULL WHERE candidate_id=?",candidateId).run();throw Error('catalogue_bounded_fetch_limit_reached');}
  let checkpoint='source_fetch';
  try {
    const document=await fetchSourceDocument(c.url,{fetcher,now}),report=verifyDocument(document,{now}),documentId='doc_'+(await hash(document)).slice(0,40);
    checkpoint='document_retention';
    await sql(db,'INSERT OR IGNORE INTO source_documents VALUES (?,?,?,?,?)',documentId,c.url,document.content_hash??null,document.fetched_at,stableJson(document)).run();
    if(report.status!=='verified'||!['GB','US','CA','AU','NZ','IE','SG','HK'].includes(report.facts.country)) {
      const reason=report.reasons.join(',')||'supported_verified_country_required';
      await sql(db,"UPDATE catalogue_progress SET status='held',reason=?,document_id=?,checked_at=?,lease_until=NULL WHERE candidate_id=?",reason,documentId,now,candidateId).run();
      if(report.reasons.includes('source_http_429'))await stopCatalogueRun(db,c.run_id,'source_rate_limited');
      return {candidate_id:candidateId,status:'held',reason,source_country:report.facts.country??null};
    }
    // Only current proved trader applications enter the canonical pipeline. The
    // catalogue path/label supplies no geography, dates or availability facts.
    const f=report.facts,record={schema_version:EXPORT_SCHEMA,opportunity_id:platformRoute(c.url)?.identity??'catalogue:'+routeKey(c.url),country_code:f.country,
      ...Object.fromEntries(Object.entries(f).filter(([k])=>k!=='country')),canonical_url:c.url,source_platform:report.profile,source_identifier:platformId(c.url),lifecycle_state:'NEW',
      last_checked:document.fetched_at,source_fingerprint:document.content_hash,evidence:report.evidence,provenance:[{producer:'platform-catalogue',catalogue_document_id:c.source_document_id,source_document_id:documentId,verification_version:report.version,source_url:document.url,paid_queries:0}]};
    checkpoint='evidence_import';
    const imported=await ingestRecords(db,[record],{producer:'platform-catalogue',environment:'shadow',now});if(imported.rejected)throw Error('catalogue_source_record_invalid');
    checkpoint='identity_reconciliation';
    const recordId=imported.record_ids[0],decision=await reconcileRecord(db,recordId,{now});
    if(!decision.entity_id){await sql(db,"UPDATE catalogue_progress SET status='held',reason=?,document_id=?,record_id=?,checked_at=?,lease_until=NULL WHERE candidate_id=?",decision.reason,documentId,recordId,now,candidateId).run();return {candidate_id:candidateId,status:'held',reason:decision.reason};}
    const entity=await loadEntity(db,decision.entity_id);
    const retainedRoute=entity.application_url&&platformId(entity.application_url)?entity.application_url:entity.canonical_url??entity.application_url;
    if(retainedRoute!==document.requested_url){await sql(db,"UPDATE catalogue_progress SET status='held',reason='matched_entity_requires_original_source_verification',document_id=?,record_id=?,entity_id=?,checked_at=?,lease_until=NULL WHERE candidate_id=?",documentId,recordId,decision.entity_id,now,candidateId).run();return {candidate_id:candidateId,status:'held',entity_id:decision.entity_id,reason:'matched_entity_requires_original_source_verification'};}
    // Proof is recorded against the retained route/revision, including any
    // disagreement with stronger selected evidence on an existing entity.
    checkpoint='custody_checkpoint';
    await sql(db,'UPDATE catalogue_progress SET document_id=?,record_id=?,entity_id=? WHERE candidate_id=?',documentId,recordId,decision.entity_id,candidateId).run();
    checkpoint='source_proof';
    const proof=await recordVerification(db,decision.entity_id,document,{now});
    // Settle this record's durable jobs through the ordinary lease/CAS runner.
    // Leaving duplicate reconciliation/classification work behind each proved
    // import would fill the safety backlog before acquisition could scale.
    // Due proof renewals retain claim priority; no queue state is bypassed.
    checkpoint='durable_pipeline';
    for(const stage of ['reconcile','eligibility','enrichment','readiness'])for(let n=0;n<3;n++) {
      const job=await sql(db,`SELECT id FROM jobs WHERE stage=? AND status='ready' AND available_at<=? AND
        ${stage==='reconcile'?"json_extract(payload_json,'$.record_id')=?":"json_extract(payload_json,'$.entity_id')=?"} ORDER BY available_at,id LIMIT 1`,stage,now,stage==='reconcile'?recordId:decision.entity_id).first();
      if(!job)break;const result=await runStage(db,stage,{now,jobId:job.id,handlers:stage==='enrichment'?{
        enrichment:async payload=>{
          const current=await loadEntity(db,payload.entity_id),gate=await verificationGate(db,current,{now});
          if(payload.refresh_verification_id||gate.status==='unverified')await verifyEntitySource(db,current.id,{now,fetcher});
          return enrichEntity(db,current.id,{now});
        },
      }:{}});
      if(result.phase==='failed')throw Error('catalogue_durable_pipeline_failed');
    }
    // A completed durable readiness job has already written the gated result.
    // Avoid repeating its database work in this source-fetch invocation.
    checkpoint='current_readiness';
    const current=await sql(db,'SELECT r.status,r.entity_revision,r.evaluated_at,e.revision FROM readiness r JOIN entities e ON e.id=r.entity_id WHERE r.entity_id=?',decision.entity_id).first();
    const readiness=current&&current.entity_revision===current.revision&&current.evaluated_at>=now?current:await evaluateReadiness(db,decision.entity_id,{now});
    checkpoint='receipt_completion';
    await sql(db,"UPDATE catalogue_progress SET status='imported',reason=?,document_id=?,record_id=?,entity_id=?,checked_at=?,lease_until=NULL WHERE candidate_id=?",readiness.status,documentId,recordId,decision.entity_id,now,candidateId).run();
    return {candidate_id:candidateId,status:'imported',entity_id:decision.entity_id,identity_outcome:decision.outcome,readiness:readiness.status,source_country:f.country,source_family:report.profile,verification_id:proof.verification_id};
  }catch(e) {
    const code=String(e.message).match(/\bSQLITE_[A-Z_]+\b/)?.[0]?.toLowerCase()??(/too many (?:api requests|queries|subrequests)/i.test(e.message)?'worker_request_limit':/\b(?:locked|busy|overloaded)\b/i.test(e.message)?'database_busy':'runtime_failure');
    await sql(db,"UPDATE catalogue_progress SET status='failed',reason=?,lease_until=NULL,checked_at=? WHERE candidate_id=? AND status='verifying'",'verification_outcome_requires_review_'+checkpoint+'_'+code,now,candidateId).run();
    await stopCatalogueRun(db,c.run_id,'verification_outcome_requires_review');
    if(/^[a-z][a-z0-9_]{0,100}$/.test(e.message))throw e;throw Error('catalogue_'+checkpoint+'_'+code);
  }
}
export async function stopCatalogueRun(db,id,reason='operator_stopped') {
  if(!/^[a-z][a-z0-9_]{0,79}$/.test(reason))throw Error('catalogue_stop_reason_invalid');
  await sql(db,"UPDATE catalogue_runs SET status='paused',stop_reason=? WHERE id=? AND status='active'",reason,id).run();
}
export async function catalogueStatus(db) {
  const runs=(await sql(db,'SELECT * FROM catalogue_runs ORDER BY created_at DESC LIMIT 10').all()).results??[];
  const dispositions=(await sql(db,'SELECT c.run_id,p.status,p.reason,COUNT(*) AS candidates FROM catalogue_candidates c JOIN catalogue_progress p ON p.candidate_id=c.id GROUP BY c.run_id,p.status,p.reason').all()).results??[];
  for(const run of runs)run.current_invalid_scope_ready_claims=await currentInvalidScopeClaims(db,run.id);
  return {producer:'platform-catalogue',paid_queries:0,standing_scheduler_enabled:false,source_proof_required_before_import:true,maximum_candidates_per_run:2000,runs,dispositions};
}
