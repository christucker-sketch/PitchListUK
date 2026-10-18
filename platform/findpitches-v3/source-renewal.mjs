import {sql} from './store.mjs';
import {hash} from './contract.mjs';
import {enqueue} from './jobs.mjs';
import {encodeSourceDocument} from './document-custody.mjs';
import {sourceDatePast} from './source-calendar.mjs';
export const AUTOMATIC_WATCH_POLICY=Object.freeze({version:'source-watch-value-v1',ready_proof_ttl_unchanged:true,ready_early_refresh_hours:2,nonready_near_event_days:14,nonready_near_recheck_hours:24,nonready_other_recheck_hours:168,manual_review_never_acknowledged:true});
export async function operationalWatchEvidence(db,entityId,gate){
 if(!gate.reasons?.includes('source_verification_stale_or_revision_changed'))return gate;
 const row=await sql(db,"SELECT json_extract(report_json,'$.reasons') reasons_json,checked_at FROM source_verifications WHERE entity_id=? ORDER BY sequence DESC LIMIT 1",entityId).first();
 // Retained negative reasons may stop pointless automatic work. They never
 // change the unverified gate, supply current facts or extend its expiry.
 return {...gate,retained_reasons:JSON.parse(row?.reasons_json??'[]'),retained_checked_at:row?.checked_at??null};
}
const REVIEW_ONLY_REASONS=new Set(['social_page_is_discovery_only','platform_index_is_not_an_opportunity','editorial_page_is_discovery_only','application_is_not_a_trader_opportunity','application_restricted_audience_requires_review','trader_application_purpose_not_proved','sponsor_trading_entitlement_not_proved']);
// Operational cadence only. Never creates proof, extends expiry, changes facts,
// closes a producer request or treats a held entity as customer eligible.
export function automaticWatchDecision(entity,{now,assessedAt=null,readinessStatus=null,verification={},conflicts=0,qualityHolds=0,scheduledRefresh=false}){
 const clock=Date.parse(now);if(!Number.isFinite(clock))throw Error('valid_watch_clock_required');
 const stop=reason=>({schedule:false,reason,policy:AUTOMATIC_WATCH_POLICY.version});
 // A start date alone cannot prove the end of a multi-day/recurring event.
 if(entity.event_end&&sourceDatePast(entity.event_end,now))return stop('past_event_requires_new_evidence');
 if(conflicts||qualityHolds)return stop('identity_or_quality_review_required');
 if([...(verification.reasons??[]),...(verification.retained_reasons??[])].some(r=>REVIEW_ONLY_REASONS.has(r)))return stop('source_purpose_review_required');
 const at=(time,reason)=>({schedule:true,at:new Date(time).toISOString(),reason,policy:AUTOMATIC_WATCH_POLICY.version});
 if(readinessStatus==='ready'){
  if(scheduledRefresh)return at(clock,'ready_proof_refresh');
  const expiry=Date.parse(verification.expires_at),early=expiry-2*3600000;
  return at(Number.isFinite(expiry)?Math.max(clock,early>clock+300000?early:expiry):clock,'ready_proof_refresh');
 }
 const base=Date.parse(verification.checked_at??verification.retained_checked_at??assessedAt);if(!readinessStatus||!Number.isFinite(base)||base>clock)return at(clock,'unassessed_source_requires_recheck');
 const near=[entity.event_start,entity.event_end,entity.application_deadline].filter(Boolean).some(d=>{const t=Date.parse(d);return Number.isFinite(t)&&t>=clock-86400000&&t<=clock+14*86400000;});
 return at(base+(near?24:168)*3600000,near?'near_event_watch':'unproved_discovery_watch');
}
export function historicalFailureDisposition(entity,now){
 if(entity.environment!=='shadow')return 'noncommercial';
 if(entity.quality_holds||entity.conflicts)return 'identity_quality_hold';
 if(['CLOSED','WITHDRAWN'].includes(entity.application_state))return 'closed_withdrawn';
 if(sourceDatePast(entity.event_end??entity.event_start,now))return 'past_event';
 if(sourceDatePast(entity.application_deadline,now))return 'past_deadline';
 if(!entity.event_end&&!entity.event_start)return 'date_unknown';
 if(!entity.application_url)return 'application_route_missing';
 if(!entity.organiser||!entity.location)return 'missing_core_fields';
 return 'future_recheck_candidate';
}
export const RENEWAL_DELAYS=[300,900,3600];
export const RENEWAL_FAILURES=new Set(['source_fetch_failed','source_http_408','source_http_429','source_http_500','source_http_502','source_http_503','source_http_504']);
export function retryableDocument(document){return document.fetch_error_kind!=='request_budget'&&RENEWAL_FAILURES.has(document.reason);}
export async function renewalRetryCurrent(db,entity,attemptId){
 const latest=await sql(db,'SELECT id,entity_revision,outcome,active_verification_id,attempted_at FROM source_renewal_attempts WHERE entity_id=? ORDER BY sequence DESC LIMIT 1',entity.id).first();
 if(!latest||latest.id!==attemptId||latest.entity_revision!==entity.revision||latest.outcome!=='transient_failure')return false;
 const proof=await sql(db,'SELECT id,checked_at FROM source_verifications WHERE entity_id=? ORDER BY sequence DESC LIMIT 1',entity.id).first();
 return !(proof&&proof.id!==latest.active_verification_id&&Date.parse(proof.checked_at)>=Date.parse(latest.attempted_at));
}
export async function renewalAdmission(db,entity,url,now){
 const latest=await sql(db,'SELECT * FROM source_renewal_attempts WHERE entity_id=? ORDER BY sequence DESC LIMIT 1',entity.id).first();
 if(!latest||latest.outcome!=='transient_failure'||latest.entity_revision!==entity.revision)return {allowed:true};
 const proof=await sql(db,'SELECT id,checked_at FROM source_verifications WHERE entity_id=? ORDER BY sequence DESC LIMIT 1',entity.id).first();
 if(proof&&proof.id!==latest.active_verification_id&&Date.parse(proof.checked_at)>=Date.parse(latest.attempted_at))return {allowed:true};
 if(latest.retry_at&&Date.parse(latest.retry_at)>Date.parse(now))return {allowed:false,attempt:latest,reason:latest.retry_exhausted?'source_retry_exhausted':'source_retry_backoff'};
 const host=new URL(url).hostname.toLowerCase(),window=new Date(Math.floor(Date.parse(now)/900000)*900000).toISOString();
 const grant=await sql(db,`INSERT INTO source_renewal_domain_windows(source_host,window_start,retries) VALUES (?,?,1)
  ON CONFLICT(source_host,window_start) DO UPDATE SET retries=retries+1 WHERE retries<16 RETURNING retries`,host,window).first();
 if(grant)return {allowed:true};
 const retryAt=new Date(Date.parse(window)+900000).toISOString();
 await enqueue(db,'enrichment',entity.id+':domain-retry:'+window,{entity_id:entity.id,source_retry_attempt_id:latest.id},now,retryAt);
 return {allowed:false,attempt:latest,reason:'source_retry_domain_budget',retry_at:retryAt};
}
export async function recordRenewalFailure(db,entity,document,{now,activeVerificationId}){
 const since=new Date(Date.parse(now)-86400000).toISOString(),lastSuccess=await sql(db,"SELECT MAX(attempted_at) at FROM source_renewal_attempts WHERE entity_id=? AND outcome='source_result'",entity.id).first();
 const count=await sql(db,"SELECT COUNT(*) n FROM source_renewal_attempts WHERE entity_id=? AND outcome='transient_failure' AND attempted_at>=? AND attempted_at>COALESCE(?,'')",entity.id,since,lastSuccess?.at??null).first();
 const exhausted=count.n>=RENEWAL_DELAYS.length,delay=exhausted?86400:Math.max(RENEWAL_DELAYS[count.n],Math.min(3600,document.retry_after_seconds??0));
 const retryAt=new Date(Date.parse(now)+delay*1000).toISOString(),documentId='doc_'+(await hash(document)).slice(0,40),id='renew_'+(await hash([entity.id,entity.revision,documentId])).slice(0,40),custody=await encodeSourceDocument(document,{db});
 await db.batch([
  sql(db,'INSERT OR IGNORE INTO source_documents(id,source_url,content_hash,fetched_at,document_json) VALUES (?,?,?,?,?)',documentId,document.requested_url,document.content_hash??null,document.fetched_at,custody),
  sql(db,`INSERT OR IGNORE INTO source_renewal_attempts(id,entity_id,entity_revision,source_host,document_id,active_verification_id,outcome,reason,diagnostic,attempted_at,retry_at,retry_exhausted) VALUES (?,?,?,?,?,?,'transient_failure',?,?,?,?,?)`,id,entity.id,entity.revision,new URL(document.requested_url).hostname.toLowerCase(),documentId,activeVerificationId,document.reason,document.fetch_error_kind??null,document.fetched_at,retryAt,exhausted?1:0),
 ]);
 await enqueue(db,'enrichment',id+':retry',{entity_id:entity.id,source_retry_attempt_id:id},now,retryAt);
 const active=activeVerificationId?await sql(db,'SELECT expires_at FROM source_verifications WHERE id=?',activeVerificationId).first():null;
 // The earlier refresh watch pointer may already be complete. Independently
 // reevaluate at the original expiry; a retry must not leave cached READY stale.
 if(active&&Date.parse(active.expires_at)>Date.parse(now))await enqueue(db,'readiness',entity.id+':proof-expiry:'+activeVerificationId,{entity_id:entity.id},now,active.expires_at);
 return {id,retry_at:retryAt,retry_exhausted:exhausted};
}
export async function recordRenewalResult(db,entity,documentId,verificationId,now,url){
 const id='renew_'+(await hash([entity.id,entity.revision,documentId])).slice(0,40);
 await sql(db,`INSERT OR IGNORE INTO source_renewal_attempts(id,entity_id,entity_revision,source_host,document_id,verification_id,active_verification_id,outcome,attempted_at) VALUES (?,?,?,?,?,?,?,'source_result',?)`,id,entity.id,entity.revision,new URL(url).hostname.toLowerCase(),documentId,verificationId,verificationId,now).run();
 return id;
}
export async function renewalStatus(db,now){
 const since=new Date(Date.parse(now)-86400000).toISOString();
 const totals=await sql(db,`SELECT COUNT(*) attempts,COALESCE(SUM(outcome='transient_failure'),0) transient_failures,COALESCE(SUM(outcome='source_result'),0) source_results,COALESCE(SUM(retry_exhausted),0) exhausted_attempts FROM source_renewal_attempts WHERE attempted_at>=?`,since).first();
 const latestFailures=await sql(db,`SELECT COUNT(*) entities FROM source_renewal_attempts a WHERE a.outcome='transient_failure' AND a.sequence=(SELECT MAX(sequence) FROM source_renewal_attempts WHERE entity_id=a.entity_id)`).first();
 const waiting=await sql(db,`SELECT COUNT(*) entities,COALESCE(SUM(a.retry_exhausted),0) exhausted_entities,MIN(a.retry_at) next_retry_at
  FROM source_renewal_attempts a JOIN entities e ON e.id=a.entity_id
  LEFT JOIN source_verifications v ON v.sequence=(SELECT MAX(sequence) FROM source_verifications WHERE entity_id=a.entity_id)
  WHERE a.outcome='transient_failure' AND a.sequence=(SELECT MAX(sequence) FROM source_renewal_attempts WHERE entity_id=a.entity_id)
  AND a.entity_revision=e.revision AND NOT(v.id IS NOT NULL AND (a.active_verification_id IS NULL OR v.id<>a.active_verification_id) AND julianday(v.checked_at)>=julianday(a.attempted_at))`).first();
 waiting.superseded_latest_failures_retained=latestFailures.entities-waiting.entities;
 const expiredPositive=await sql(db,`SELECT COUNT(*) entities FROM readiness r JOIN entities e ON e.id=r.entity_id
  JOIN source_verifications v ON v.sequence=(SELECT MAX(sequence) FROM source_verifications WHERE entity_id=e.id)
  WHERE e.environment='shadow' AND r.status='ready' AND r.entity_revision=e.revision
  AND v.entity_revision=e.revision AND v.status='verified' AND julianday(v.expires_at)<=julianday(?)`,now).first();
 const reasons=(await sql(db,"SELECT reason,diagnostic,COUNT(*) attempts FROM source_renewal_attempts WHERE outcome='transient_failure' AND attempted_at>=? GROUP BY reason,diagnostic",since).all()).results;
 const legacy=(await sql(db,`SELECT e.environment,
  (SELECT json_group_object(field_name,json(value_json)) FROM selected_facts WHERE entity_id=e.id) fields_json,
  (SELECT COUNT(*) FROM selected_facts f JOIN legacy_quality_holds h ON h.record_id=f.record_id WHERE f.entity_id=e.id) quality_holds,
  (SELECT COUNT(*) FROM conflicts c WHERE c.entity_id=e.id AND c.resolved=0) conflicts
  FROM source_verifications v JOIN entities e ON e.id=v.entity_id WHERE v.status='unverified'
  AND v.sequence=(SELECT MAX(sequence) FROM source_verifications WHERE entity_id=v.entity_id)
  AND EXISTS(SELECT 1 FROM json_each(v.report_json,'$.reasons') j WHERE j.value IN ('source_fetch_failed','source_http_408','source_http_429','source_http_500','source_http_502','source_http_503','source_http_504'))
  AND EXISTS(SELECT 1 FROM commercial_readiness_history h WHERE h.entity_id=v.entity_id AND h.status='ready')`).all()).results;
 const dispositions={};for(const row of legacy){const key=historicalFailureDisposition({...JSON.parse(row.fields_json??'{}'),...row},now);dispositions[key]=(dispositions[key]??0)+1;}
 const actionNeeded=['future_recheck_candidate','date_unknown','application_route_missing','missing_core_fields'].reduce((n,k)=>n+(dispositions[k]??0),0);
 return {as_of:now,health:waiting.entities||actionNeeded||expiredPositive.entities?'degraded':'healthy',last_24h:totals,waiting,reasons,expired_cached_ready_positive_proofs:expiredPositive.entities,previously_ready_latest_failed_receipts:legacy.length,historical_failed_receipts:{total:legacy.length,action_needed:actionNeeded,held:legacy.length-actionNeeded,dispositions,basis:'Current selected facts and unresolved holds; triage only, not a new source verification. Historical failures remain immutable and visible. Held records remain withheld.'},limits:{failure_attempts_before_daily_cooldown:4,short_retry_delays_seconds:RENEWAL_DELAYS,retry_entities_per_domain_per_15min:16},automatic_watch_policy:AUTOMATIC_WATCH_POLICY,interpretation:'Attempts are separate from proof. A failed retrieval never renews proof TTL, clears identity/closure holds or proves READY. Processing completion is not source renewal success. Expired cached-ready positives are customer-withheld renewal gaps, never active inventory.'};
}
