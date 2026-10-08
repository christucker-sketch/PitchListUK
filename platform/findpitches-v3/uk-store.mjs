import {sql,ingestRecords,loadEntity} from './store.mjs';
import {hash,stableJson,EXPORT_SCHEMA} from './contract.mjs';
import {fetchSourceDocument} from './source-document.mjs';
import {myntVenues,myntVenueUrl,parseMyntVenue,fetchMyntBundle} from './uk-sources.mjs';
import {verifyDocument} from './verification.mjs';
import {recordVerification,verificationUrl,verificationGate,verifyEntitySource} from './verification-store.mjs';
import {reconcileRecord,evaluateReadiness,runStage,enrichEntity} from './pipeline.mjs';

async function guard(db) {
  const r=await sql(db,`SELECT (SELECT publication_enabled FROM runtime_policy WHERE id=1) AS publication,
    (SELECT COUNT(*) FROM customer_projections)+(SELECT COUNT(*) FROM publication_queue) AS leakage,
    (SELECT bulk_enabled FROM serper_policy WHERE id=1) AS bulk,
    (SELECT manual_paused FROM commercial_acquisition_policy WHERE id=1) AS paid_paused,
    EXISTS(SELECT 1 FROM quality_gates WHERE name='structured-100-preservation' AND destructive_mutations=0 AND tested_records=100) AS preservation`).first();
  if(r.publication||r.leakage||r.bulk||!r.paid_paused||!r.preservation)throw Error('uk_shadow_integrity_required');
}
export async function stopUKRun(db,id,reason='operator_stopped') {
  if(!/^[a-z][a-z0-9_]{0,79}$/.test(reason))throw Error('uk_stop_reason_invalid');
  await sql(db,"UPDATE uk_source_runs SET status='paused',stop_reason=? WHERE id=? AND status='active'",reason,id).run();
}
async function active(db,id,now) {
  try{await guard(db);}catch(e){await stopUKRun(db,id,'integrity_or_leakage');throw e;}
  const run=await sql(db,'SELECT * FROM uk_source_runs WHERE id=?',id).first();
  if(!run||run.status!=='active'||run.expires_at<=now)throw Error('uk_active_bounded_run_required');
  const yieldState=await sql(db,`SELECT COUNT(*) AS settled,SUM(p.status='imported' AND p.reason='ready') AS ready
    FROM uk_source_progress p JOIN uk_source_candidates c ON c.id=p.candidate_id WHERE c.run_id=? AND p.status IN ('held','imported','failed')`,id).first();
  if(yieldState.settled>=50&&!yieldState.ready){await stopUKRun(db,id,'zero_ready_after_warmup');throw Error('uk_zero_ready_after_warmup');}
  const jobs=await sql(db,"SELECT COUNT(*) AS n FROM jobs WHERE stage IN ('reconcile','eligibility','enrichment','readiness') AND status IN ('ready','leased') AND available_at<=?",now).first();
  if(jobs.n>40){await stopUKRun(db,id,'verification_backlog');throw Error('uk_verification_backlog');}return run;
}
export async function startUKRun(db,{max_visits=100,max_candidates=300}={},now=new Date().toISOString()) {
  await guard(db);if(!Number.isInteger(max_visits)||max_visits<1||max_visits>250||!Number.isInteger(max_candidates)||max_candidates<1||max_candidates>500)throw Error('uk_bounded_limits_required');
  const run={id:'uk_'+crypto.randomUUID(),max_visits,max_candidates,created_at:now,expires_at:new Date(Date.parse(now)+2*3600000).toISOString()};
  await sql(db,"INSERT INTO uk_source_runs(id,status,max_visits,max_candidates,created_at,expires_at) VALUES (?,'active',?,?,?,?)",run.id,max_visits,max_candidates,now,run.expires_at).run();
  return {...run,paid_queries:0,standing_scheduler_enabled:false};
}
async function retain(db,document) {const id='doc_'+(await hash(document)).slice(0,40);await sql(db,'INSERT OR IGNORE INTO source_documents VALUES (?,?,?,?,?)',id,document.requested_url,document.content_hash??null,document.fetched_at,stableJson(document)).run();return id;}
async function reserveVisit(db,runId,url,now) {
  await active(db,runId,now);
  // The reservation commits before the network request. Failed requests consume it.
  const r=await sql(db,"UPDATE uk_source_runs SET visits_reserved=visits_reserved+1 WHERE id=? AND status='active' AND expires_at>? AND visits_reserved<max_visits RETURNING visits_reserved",runId,now).all();
  if(!r.results.length){await stopUKRun(db,runId,'source_visit_limit');throw Error('uk_source_visit_limit');}
  return {id:'uk_visit_'+crypto.randomUUID(),url};
}
export async function discoverUKSource(db,{run_id,url},{fetcher=fetch,now=new Date().toISOString()}={}) {
  await active(db,run_id,now);
  if(url!=='https://www.myntimage.co.uk/events/'&&!myntVenueUrl(url))throw Error('approved_uk_source_required');
  const prior=await sql(db,'SELECT source_document_id FROM uk_source_candidates WHERE run_id=? AND url=? LIMIT 1',run_id,url).first();
  if(prior)return {run_id,url,replay:true,candidates:(await sql(db,'SELECT id,source_identifier FROM uk_source_candidates WHERE run_id=? AND url=?',run_id,url).all()).results};
  let reservationFailure=null;
  const fetchBounded=async(u,options)=>{
    let reservation;try{reservation=await reserveVisit(db,run_id,u,now);}catch(e){reservationFailure=e;throw e;}
    const at=now;let response,reason=null;try{response=await fetcher(u,options);}catch{reason='source_fetch_failed';}
    const receipt={document_kind:'uk_http_visit_receipt',requested_url:u,url:u,fetched_at:at,http_status:response?.status??null,reason};
    const documentId=await retain(db,receipt);
    await sql(db,'INSERT INTO uk_source_visits VALUES (?,?,?,?,?,?)',reservation.id,run_id,u,at,documentId,reason??(!response.ok?'source_http_'+response.status:null)).run();
    if(!response)throw Error('source_fetch_failed');return response;
  };
  const visit=async d=>{if(reservationFailure)throw reservationFailure;await retain(db,d);if(d.reason==='source_http_429'||d.reason==='postcode_http_429'){await stopUKRun(db,run_id,'source_rate_limited');throw Error('uk_source_rate_limited');}};
  try {
    if(url==='https://www.myntimage.co.uk/events/') {const d=await fetchSourceDocument(url,{fetcher:fetchBounded,now});await visit(d);return {run_id,venues:myntVenues(d),reason:d.reason??null};}
    const bundle=await fetchMyntBundle(url,null,{fetcher:fetchBounded,now,visit});
    const venue=parseMyntVenue(bundle.documents[0]),documentId=await retain(db,bundle),candidates=[];
    for(const row of venue.rows)if(row.date>=now.slice(0,10)) {
      const selected={...bundle,source_identifier:row.source_identifier},proof=verifyDocument(selected,{now:new Date(Math.max(Date.parse(now),...bundle.documents.map(d=>Date.parse(d.fetched_at)))).toISOString()});
      candidates.push({id:'uk_candidate_'+(await hash([run_id,url,row.source_identifier])).slice(0,40),source_identifier:row.source_identifier,status:proof.status==='verified'?'pending':'held',reason:proof.reasons.join(',')||null,date:row.date,capacity:row.capacity});
    }
    if(candidates.length>100)throw Error('uk_venue_candidate_limit');
    await db.batch([
      sql(db,`INSERT OR IGNORE INTO uk_source_candidates SELECT json_extract(value,'$.id'),?,?,?,json_extract(value,'$.source_identifier'),'myntimage',? FROM json_each(?)`,run_id,documentId,url,now,stableJson(candidates)),
      sql(db,`INSERT OR IGNORE INTO uk_source_progress(candidate_id,status,reason,checked_at) SELECT json_extract(value,'$.id'),json_extract(value,'$.status'),json_extract(value,'$.reason'),CASE WHEN json_extract(value,'$.status')='held' THEN ? END FROM json_each(?)`,now,stableJson(candidates)),
    ]);
    return {run_id,url,document_id:documentId,candidates,source_visits:bundle.documents.length};
  }catch(e){
    if(/^(?:official_|dated_application_route_not_proved)/.test(e.message))return {run_id,url,candidates:[],held_source:true,reason:e.message};
    await stopUKRun(db,run_id,'source_structure_or_custody_review');throw e;
  }
}
export async function importUKCandidate(db,candidateId,{now=new Date().toISOString(),fetcher=fetch}={}) {
  const c=await sql(db,'SELECT c.*,p.status,p.entity_id,p.record_id FROM uk_source_candidates c JOIN uk_source_progress p ON p.candidate_id=c.id WHERE c.id=?',candidateId).first();
  if(!c)throw Error('uk_candidate_missing');if(c.status!=='pending')return {candidate_id:candidateId,status:c.status,entity_id:c.entity_id,replay:true};
  await active(db,c.run_id,now);
  const documentRow=await sql(db,'SELECT document_json FROM source_documents WHERE id=?',c.source_document_id).first();
  const document={...JSON.parse(documentRow.document_json),source_identifier:c.source_identifier};
  if(Date.parse(now)-Date.parse(document.fetched_at)>300000){await stopUKRun(db,c.run_id,'shared_source_proof_expired');throw Error('uk_shared_source_proof_expired');}
  const proof=verifyDocument(document,{now});
  if(proof.status!=='verified'||proof.facts.country!=='GB'){await sql(db,"UPDATE uk_source_progress SET status='held',reason=?,checked_at=? WHERE candidate_id=? AND status='pending'",proof.reasons.join(',')||'verified_gb_required',now,candidateId).run();return {candidate_id:candidateId,status:'held',reason:proof.reasons};}
  const claim=await sql(db,"UPDATE uk_source_progress SET status='verifying',lease_until=? WHERE candidate_id=? AND status='pending' RETURNING candidate_id",new Date(Date.parse(now)+120000).toISOString(),candidateId).all();
  if(!claim.results.length)throw Error('uk_candidate_claimed');
  try {
    const budget=await sql(db,"UPDATE uk_source_runs SET checked=checked+1 WHERE id=? AND status='active' AND checked<max_candidates RETURNING checked",c.run_id).all();if(!budget.results.length)throw Error('uk_candidate_limit');
    const f=proof.facts,record={schema_version:EXPORT_SCHEMA,opportunity_id:'myntimage:'+c.source_identifier,country_code:'GB',...Object.fromEntries(Object.entries(f).filter(([k])=>k!=='country')),lifecycle_state:'NEW',last_checked:document.fetched_at,source_fingerprint:document.content_hash,evidence:proof.evidence,
      provenance:[{producer:'uk-official',adapter_version:document.adapter_version,source_document_id:c.source_document_id,source_identifier:c.source_identifier,source_url:c.url,paid_queries:0}]};
    const imported=await ingestRecords(db,[record],{producer:'uk-official',environment:'shadow',now});if(imported.rejected)throw Error('uk_source_record_invalid');
    const recordId=imported.record_ids[0],decision=await reconcileRecord(db,recordId,{now});
    const outcome=imported.duplicates?'IDEMPOTENT_REPLAY':decision.outcome;
    await sql(db,'UPDATE uk_source_progress SET record_id=?,entity_id=?,identity_outcome=? WHERE candidate_id=?',recordId,decision.entity_id??null,outcome,candidateId).run();
    if(!decision.entity_id){await sql(db,"UPDATE uk_source_progress SET status='held',reason=?,checked_at=?,lease_until=NULL WHERE candidate_id=?",decision.reason,now,candidateId).run();return {candidate_id:candidateId,status:'held',reason:decision.reason};}
    const entity=await loadEntity(db,decision.entity_id);
    if(verificationUrl(entity)!==c.url||entity.source_identifier!==c.source_identifier)throw Error('uk_retained_source_identity_mismatch');
    const verification=await recordVerification(db,entity.id,document,{now});
    for(const stage of ['reconcile','eligibility','enrichment','readiness'])for(let n=0;n<3;n++) {
      const j=await sql(db,`SELECT id FROM jobs WHERE stage=? AND status='ready' AND available_at<=? AND ${stage==='reconcile'?"json_extract(payload_json,'$.record_id')=?":"json_extract(payload_json,'$.entity_id')=?"} ORDER BY available_at,id LIMIT 1`,stage,now,stage==='reconcile'?recordId:entity.id).first();if(!j)break;
      const result=await runStage(db,stage,{now,jobId:j.id,handlers:stage==='enrichment'?{enrichment:async p=>{
        const target=await loadEntity(db,p.entity_id),gate=await verificationGate(db,target,{now});
        if(gate.status==='unverified'||p.refresh_verification_id&&p.refresh_verification_id===gate.verification_id)await verifyEntitySource(db,target.id,{now,fetcher});
        return enrichEntity(db,target.id,{now});
      }}:{}});if(result.phase==='failed')throw Error('uk_durable_pipeline_failed');
    }
    const current=await sql(db,'SELECT r.status,r.entity_revision,e.revision FROM readiness r JOIN entities e ON e.id=r.entity_id WHERE r.entity_id=?',entity.id).first();
    const readiness=current&&current.entity_revision===current.revision?current:await evaluateReadiness(db,entity.id,{now});
    await sql(db,"UPDATE uk_source_progress SET status='imported',reason=?,checked_at=?,lease_until=NULL WHERE candidate_id=?",readiness.status,now,candidateId).run();
    return {candidate_id:candidateId,status:'imported',entity_id:entity.id,identity_outcome:outcome,original_identity_outcome:decision.outcome,readiness:readiness.status,verification_id:verification.verification_id,source_country:'GB',source_family:'myntimage',source_visits:0};
  }catch(e){await sql(db,"UPDATE uk_source_progress SET status='failed',reason='custody_requires_review',checked_at=?,lease_until=NULL WHERE candidate_id=?",now,candidateId).run();await stopUKRun(db,c.run_id,'failed_custody_or_import');throw e;}
}
export async function ukSourceStatus(db) {
  const runs=(await sql(db,'SELECT * FROM uk_source_runs ORDER BY created_at DESC LIMIT 10').all()).results??[];
  const outcomes=(await sql(db,'SELECT c.run_id,c.family,p.status,p.reason,p.identity_outcome,COUNT(*) AS candidates FROM uk_source_candidates c JOIN uk_source_progress p ON p.candidate_id=c.id GROUP BY c.run_id,c.family,p.status,p.reason,p.identity_outcome').all()).results??[];
  const visits=await sql(db,'SELECT COUNT(*) AS direct_source_visits,SUM(CASE WHEN reason IS NOT NULL THEN 1 ELSE 0 END) AS failed_visits FROM uk_source_visits').first();
  return {producer:'uk-official',paid_queries:0,standing_scheduler_enabled:false,adapter_versions:['myntimage-dated-stalls-v1'],runs,outcomes,...visits,visit_definition:'Actual adapter HTTP requests, including venue, embedded application, venue directions and public coordinate-country lookup. Research visits are reported separately.'};
}
