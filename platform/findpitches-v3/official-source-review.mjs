// Explicit cross-source review, separate from automatic reconciliation. This
// narrow rule joins a proved CCA event to one unverified UKCF directory record.
// Original receipts/facts/decisions survive; selected values and aliases have
// an immutable reviewed-source receipt and per-field CAS audit.
import {FIELDS,hash,stableJson,validFieldValue} from './contract.mjs';
import {sql,loadEntity} from './store.mjs';
import {identityKeys} from './identity.mjs';
import {verifyDocument,calendarDate,VERIFIER_VERSION} from './verification.mjs';
import {fetchCCABundle,ccaVenues,CCA_ORIGIN} from './creative-crafts.mjs';
import {assertUKReviewRun,ukSourceReader,retainUKDocument,stopUKRun} from './uk-store.mjs';
import {trustedOfficialSourceReview} from './evidence.mjs';
import {classifyEntity,enrichEntity,evaluateReadiness} from './pipeline.mjs';
const norm=s=>String(s??'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const nameTokens=s=>norm(s).split(' ').filter(w=>w.length>2&&!['the','and','for','craft','gift','market','fair'].includes(w));
const directory=u=>{try{const x=new URL(u);return x.protocol==='https:'&&x.hostname.replace(/^www\./,'')==='ukcraftfairs.com'&&/^\/craft-events\/\d+\//.test(x.pathname);}catch{return false;}};
export function reviewOfficialIdentity(entity,incoming,report,venue) {
  if(entity.environment!=='shadow'||entity.shadow_only!==1||entity.market!=='GB'||incoming.market!=='GB'||report.facts.country!=='GB')throw Error('official_review_same_shadow_country_required');
  if(entity.source_platform!=='ukcraftfairs'||!directory(entity.canonical_url)||norm(entity.organiser)!=='ukcraftfairs com')throw Error('official_review_directory_metadata_required');
  if(['CLOSED','WITHDRAWN'].includes(entity.lifecycle_state)||entity.application_state==='CLOSED')throw Error('official_review_closed_identity_requires_separate_decision');
  if(report.status!=='verified'||report.profile!=='creativecrafts'||report.facts.application_state!=='OPEN_NOW'||new URL(report.source_url).origin!==CCA_ORIGIN)throw Error('official_review_current_dated_trader_proof_required');
  const f=report.facts;
  if(entity.edition!==f.event_start.slice(0,4)||calendarDate(entity.event_start)!==f.event_start||calendarDate(entity.event_end)!==f.event_end)throw Error('official_review_exact_edition_dates_required');
  if(entity.application_deadline&&calendarDate(entity.application_deadline)!==f.application_deadline)throw Error('official_review_deadline_requires_separate_decision');
  if(!venue||!norm(entity.location).startsWith(norm(venue.venue)))throw Error('official_review_exact_named_venue_required');
  const old=new Set(nameTokens(entity.event_name));if(nameTokens(f.event_name).filter(w=>old.has(w)).length<3)throw Error('official_review_event_name_corroboration_required');
  // A current re-fetch must still corroborate the original proposed event. It
  // cannot quietly repair a moved edition/date/control or a changed source.
  for(const key of Object.keys(f).filter(k=>k!=='country'))if(stableJson(incoming[key]??null)!==stableJson(f[key]))throw Error('official_review_candidate_source_changed');
  return f;
}
// A committed review includes its verification in the same D1 transaction.
// Recovery completes only derived custody; it performs no fetch, fact selection,
// identity repair or budget reset and evaluates against the latest proof.
async function finishReview(db,c,receipt,runId,now,{recovered=false}={}) {
  const raw=receipt.raw;
  if(raw.review_run_id!==runId)throw Error('official_review_original_run_required');
  const safety=await sql(db,`SELECT (SELECT publication_enabled FROM runtime_policy WHERE id=1) publication,
    (SELECT bulk_enabled FROM serper_policy WHERE id=1) bulk,
    (SELECT manual_paused FROM commercial_acquisition_policy WHERE id=1) paused,
    (SELECT COUNT(*) FROM customer_projections)+(SELECT COUNT(*) FROM publication_queue) leakage`).first();
  if(safety.publication||safety.bulk||safety.paused!==1||safety.leakage)throw Error('official_review_shadow_integrity_required');
  const verification=await sql(db,`SELECT * FROM source_verifications WHERE entity_id=? AND document_id=? AND status='verified' AND checked_at=? ORDER BY sequence LIMIT 1`,receipt.entity_id,raw.document_id,raw.source_checked_at).first();
  if(!verification||verification.verifier_version!==VERIFIER_VERSION||stableJson(JSON.parse(verification.report_json))!==stableJson(raw.verified_report))throw Error('official_review_committed_custody_incomplete');
  await classifyEntity(db,receipt.entity_id,{now});await enrichEntity(db,receipt.entity_id,{now});const ready=await evaluateReadiness(db,receipt.entity_id,{now});
  await db.batch([
    sql(db,'INSERT INTO official_source_review_outcomes VALUES (?,?,?,?,?,?,?,?)',c.id,receipt.receipt_id,runId,c.record_id,receipt.entity_id,verification.id,ready.status,now),
    sql(db,"UPDATE uk_source_progress SET status='held',reason=?,lease_until=NULL WHERE candidate_id=? AND record_id=? AND status IN ('verifying','failed')",raw.original_progress_reason,c.id,c.record_id),
  ]);
  return {candidate_id:c.id,entity_id:receipt.entity_id,review_id:receipt.receipt_id,status:'imported',identity_outcome:'REVIEWED_MATCH',original_identity_outcome:'PROBABLE_MATCH',readiness:ready.status,verification_id:verification.id,source_family:'creativecrafts',source_country:'GB',source_mutations:0,entity_id_changed:false,original_receipts_retained:true,recovered,proof_clock_reset:false};
}
export async function reviewOfficialCandidate(db,body,{fetcher=fetch,now=new Date().toISOString()}={}) {
  if(!body||Object.keys(body).some(k=>!['run_id','candidate_id','entity_id','expected_revision','reason'].includes(k))||!Number.isInteger(body.expected_revision)||typeof body.reason!=='string'||body.reason.trim().length<30||body.reason.length>1000)throw Error('official_review_explicit_bounded_request_required');
  const c=await sql(db,`SELECT c.*,p.status,p.reason AS progress_reason,p.record_id,p.entity_id,p.identity_outcome,r.normalized_json,d.outcome,d.candidates_json
    FROM uk_source_candidates c JOIN uk_source_progress p ON p.candidate_id=c.id LEFT JOIN producer_records r ON r.id=p.record_id
    LEFT JOIN reconciliation_decisions d ON d.record_id=p.record_id WHERE c.id=?`,body.candidate_id).first();
  if(!c||c.family!=='creativecrafts'||!c.record_id)throw Error('official_review_retained_candidate_required');
  const previous=await trustedOfficialSourceReview(db,body.entity_id,{candidateRecordId:c.record_id});
  if(previous) {
    const outcome=await sql(db,'SELECT * FROM official_source_review_outcomes WHERE candidate_id=? AND review_record_id=?',c.id,previous.receipt_id).first();
    if(!outcome)return finishReview(db,c,previous,body.run_id,now,{recovered:true});
    return {candidate_id:c.id,entity_id:body.entity_id,review_id:previous.receipt_id,replay:true,proof_clock_reset:false};
  }
  const uncommittedRetry=c.status==='failed'&&c.progress_reason==='official_review_requires_custody_check';
  if((c.status!=='held'&&!uncommittedRetry)||c.entity_id||c.outcome!=='PROBABLE_MATCH'||stableJson(JSON.parse(c.candidates_json))!==stableJson([body.entity_id]))throw Error('official_review_single_probable_identity_required');
  await assertUKReviewRun(db,body.run_id,now);
  let entity=await loadEntity(db,body.entity_id);if(!entity||entity.revision!==body.expected_revision)throw Error('official_review_entity_revision_changed');
  const safety=await sql(db,`SELECT EXISTS(SELECT 1 FROM source_verifications WHERE entity_id=? AND status='verified') verified_before,
    (SELECT COUNT(*) FROM conflicts WHERE entity_id=? AND resolved=0 AND record_id<>?) other_conflicts,
    (SELECT COUNT(*) FROM selected_facts f JOIN legacy_quality_holds h ON h.record_id=f.record_id WHERE f.entity_id=?) quality_holds,
    EXISTS(SELECT 1 FROM entity_records WHERE record_id=?) candidate_linked,
    EXISTS(SELECT 1 FROM producer_records WHERE producer_name='operator-review:official-source' AND json_extract(raw_json,'$.candidate_record_id')=?) committed_review`,entity.id,entity.id,c.record_id,entity.id,c.record_id,c.record_id).first();
  if(safety.verified_before||safety.other_conflicts||safety.quality_holds||safety.candidate_linked||safety.committed_review)throw Error('official_review_existing_proof_or_conflict_requires_separate_decision');
  const incoming=JSON.parse(c.normalized_json);if(incoming.producer_name!=='uk-official'||incoming.environment!=='shadow')throw Error('official_review_owned_source_record_required');
  const reader=ukSourceReader(db,body.run_id,{fetcher,now});
  const document=await fetchCCABundle(c.url,c.source_identifier,{...reader,now}),report=verifyDocument(document,{now});
  const venue=ccaVenues(document.documents.find(d=>d.url===CCA_ORIGIN+'/craft-event-directions/')).find(v=>v.url===c.url);
  const facts=reviewOfficialIdentity(entity,incoming,report,venue);
  const current=await loadEntity(db,entity.id);if(current.revision!==entity.revision)throw Error('official_review_entity_revision_changed');
  const documentId=await retainUKDocument(db,document),previousIds=Object.fromEntries(Object.keys(facts).filter(k=>k!=='country'&&entity.selections[k]).map(k=>[k,entity.selections[k].fact_id]));
  const raw={review_run_id:body.run_id,original_progress_reason:uncommittedRetry?'distinctive_name_and_corroboration':c.progress_reason,review_status:'supersession_committed',actor:'codex',reason:body.reason,entity_id:entity.id,candidate_record_id:c.record_id,document_id:documentId,
    original_source_platform:entity.source_platform,original_source_identifier:entity.source_identifier??null,original_canonical_url:entity.canonical_url,
    reviewed_source_platform:facts.source_platform,reviewed_source_identifier:facts.source_identifier,reviewed_canonical_url:facts.canonical_url,
    previous_field_ids:previousIds,previous_revision:entity.revision,reviewed_facts:facts,verified_report:report,source_checked_at:document.fetched_at,reviewed_at:now};
  const rawJson=stableJson(raw),reviewId='review_'+(await hash(rawJson)).slice(0,40),verificationId='ver_'+(await hash([reviewId,documentId,report])).slice(0,40),statements=[],updates=[],casIndexes=[];
  const lease=await sql(db,"UPDATE uk_source_progress SET status='verifying',lease_until=? WHERE candidate_id=? AND (status='held' OR (status='failed' AND reason='official_review_requires_custody_check')) AND entity_id IS NULL RETURNING candidate_id",new Date(Date.parse(now)+120000).toISOString(),c.id).all();
  if(lease.results.length!==1)throw Error('official_review_candidate_claimed');
  try {
    const allowance=await sql(db,"UPDATE uk_source_runs SET checked=checked+1 WHERE id=? AND status='active' AND checked<max_candidates RETURNING checked",body.run_id).all();if(!allowance.results.length)throw Error('official_review_candidate_budget_reached');
    statements.push(sql(db,`INSERT INTO producer_records(id,producer_name,producer_type,producer_record_id,environment,market,content_hash,raw_json,validation_status,received_at)
      SELECT ?,'operator-review:official-source','enrichment',?,'shadow','GB',?,?,'accepted',? FROM entities WHERE id=? AND revision=? AND market='GB' AND environment='shadow' AND NOT EXISTS (SELECT 1 FROM source_verifications WHERE entity_id=? AND julianday(checked_at)>julianday(?))`,reviewId,reviewId,await hash(rawJson),rawJson,now,entity.id,entity.revision,entity.id,document.fetched_at));
    statements.push(sql(db,'INSERT INTO entity_records(record_id,entity_id) VALUES (?,?)',reviewId,entity.id));
    statements.push(sql(db,'INSERT INTO entity_records(record_id,entity_id) VALUES (?,?)',c.record_id,entity.id));
    for(const [field,value] of Object.entries(facts))if(field!=='country') {
      if(!FIELDS.includes(field)||!validFieldValue(field,value))throw Error('official_review_source_field_invalid');
      const factId=reviewId+':'+field,prior=entity.selections[field];
      statements.push(sql(db,`INSERT INTO source_facts(id,record_id,field_name,value_json,authority,source_url,evidence_json,provenance_json,created_at) VALUES (?,?,?,?,100,?,?,?,?)`,factId,reviewId,field,stableJson(value),document.url,stableJson(report.evidence),stableJson({kind:'reviewed_official_source',review_id:reviewId,document_id:documentId}),now));
      statements.push(sql(db,'INSERT INTO entity_facts VALUES (?,?)',entity.id,factId));
      if(prior)statements.push(sql(db,'INSERT INTO official_source_supersessions VALUES (?,?,?,?,?,?,?,?)','sup_'+(await hash([reviewId,field])).slice(0,40),reviewId,entity.id,field,prior.fact_id,factId,documentId,now));
      updates.push(prior?sql(db,'UPDATE field_selections SET fact_id=? WHERE entity_id=? AND field_name=? AND fact_id=? RETURNING fact_id',factId,entity.id,field,prior.fact_id):sql(db,'INSERT INTO field_selections VALUES (?,?,?) RETURNING fact_id',entity.id,field,factId));
      updates.push(sql(db,"INSERT INTO selection_audit VALUES (?,?,?,?,?,'accepted','reviewed_official_source_supersession',?)",'sel_'+(await hash([reviewId,field])).slice(0,32),entity.id,field,factId,prior?.fact_id??null,now));
    }
    for(let i=0;i<updates.length;i+=2)casIndexes.push(statements.length+i);statements.push(...updates);
    for(const key of identityKeys(incoming))statements.push(sql(db,'INSERT OR IGNORE INTO identity_keys VALUES (?,?,?,?)','shadow','GB',key,entity.id));
    statements.push(sql(db,"UPDATE conflicts SET resolved=1 WHERE entity_id=? AND record_id=? AND reason='distinctive_name_and_corroboration' AND resolved=0",entity.id,c.record_id));
    // Atomic proof custody prevents a concurrent old-route recheck from leaving
    // selected official fields without the reviewed verification receipt.
    const expiry=new Date(Math.min(Date.parse(document.fetched_at)+24*3600000,report.facts.application_deadline?Date.parse(report.facts.application_deadline+'T00:00:00Z'):Infinity)).toISOString();
    statements.push(sql(db,`INSERT INTO source_verifications(id,entity_id,entity_revision,document_id,verifier_version,status,report_json,checked_at,expires_at)
      SELECT ?,id,revision,?,?, 'verified',?,?,? FROM entities WHERE id=?`,verificationId,documentId,VERIFIER_VERSION,stableJson(report),document.fetched_at,expiry,entity.id));
    const committed=await db.batch(statements);if(casIndexes.some(i=>committed[i]?.results?.length!==1))throw Error('official_review_selection_raced');
    const receipt=await trustedOfficialSourceReview(db,entity.id,{candidateRecordId:c.record_id,reviewRecordId:reviewId});if(!receipt)throw Error('official_review_lineage_not_proved');
    return await finishReview(db,c,receipt,body.run_id,now);

  }catch(e){await sql(db,"UPDATE uk_source_progress SET status='failed',reason='official_review_requires_custody_check',lease_until=NULL WHERE candidate_id=? AND status='verifying'",c.id).run();await stopUKRun(db,body.run_id,'official_review_requires_custody_check');throw e;}
}
