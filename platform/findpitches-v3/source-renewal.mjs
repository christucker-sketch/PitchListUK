import {sql} from './store.mjs';
import {hash} from './contract.mjs';
import {enqueue} from './jobs.mjs';
import {encodeSourceDocument} from './document-custody.mjs';
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
 const waiting=await sql(db,`SELECT COUNT(*) entities,SUM(a.retry_exhausted) exhausted_entities,MIN(a.retry_at) next_retry_at FROM source_renewal_attempts a WHERE a.outcome='transient_failure' AND a.sequence=(SELECT MAX(sequence) FROM source_renewal_attempts WHERE entity_id=a.entity_id)`).first();
 const reasons=(await sql(db,"SELECT reason,diagnostic,COUNT(*) attempts FROM source_renewal_attempts WHERE outcome='transient_failure' AND attempted_at>=? GROUP BY reason,diagnostic",since).all()).results;
 const legacy=await sql(db,`SELECT COUNT(*) entities FROM source_verifications v WHERE v.status='unverified'
  AND v.sequence=(SELECT MAX(sequence) FROM source_verifications WHERE entity_id=v.entity_id)
  AND EXISTS(SELECT 1 FROM json_each(v.report_json,'$.reasons') j WHERE j.value IN ('source_fetch_failed','source_http_408','source_http_429','source_http_500','source_http_502','source_http_503','source_http_504'))
  AND EXISTS(SELECT 1 FROM commercial_readiness_history h WHERE h.entity_id=v.entity_id AND h.status='ready')`).first();
 return {as_of:now,health:waiting.entities||legacy.entities?'degraded':'healthy',last_24h:totals,waiting,reasons,previously_ready_latest_failed_receipts:legacy.entities,limits:{failure_attempts_before_daily_cooldown:4,short_retry_delays_seconds:RENEWAL_DELAYS,retry_entities_per_domain_per_15min:16},interpretation:'Attempts are separate from proof. A failed retrieval never renews proof TTL, clears identity/closure holds or proves READY. Processing completion is not source renewal success.'};
}
