import { FIELDS,hash,stableJson,platformId } from './contract.mjs';
import { identityKeys,identityCandidateKeys,identityAnchor,reconcileIdentity,edition } from './identity.mjs';
import { sql,loadEntity } from './store.mjs';
import { selectRecordFacts,proposeFact } from './evidence.mjs';
import { enqueue,jobStatement,claimJob,finishJob,failJob } from './jobs.mjs';
import {verificationGate} from './verification-store.mjs';

export async function reconcileRecord(db,recordId,{now=new Date().toISOString()}={}) {
  const existing=await sql(db,'SELECT * FROM reconciliation_decisions WHERE record_id=?',recordId).first();
  if(existing)return existing;
  if(await sql(db,'SELECT record_id FROM legacy_quality_holds WHERE record_id=?',recordId).first()) {
    const decision={outcome:'REVIEW_REQUIRED',entity_id:null,candidates:[],reason:'legacy_source_qualification_requires_review'};
    await sql(db,'INSERT OR IGNORE INTO reconciliation_decisions(record_id,outcome,entity_id,candidates_json,reason,created_at) VALUES (?,?,NULL,?,?,?)',recordId,decision.outcome,'[]',decision.reason,now).run();
    return decision;
  }
  const record=await sql(db,"SELECT * FROM producer_records WHERE id=? AND validation_status='accepted'",recordId).first();
  if(!record)throw new Error('accepted_record_required');
  const incoming=JSON.parse(record.normalized_json),keys=identityKeys(incoming);
  const candidateKeys=identityCandidateKeys(incoming),sourceId=incoming.source_identifier??platformId(incoming.application_url);
  // Apply only necessary conditions from reconcileIdentity before bounding the pool:
  // an exact route/ID or three shared name tokens. A year token alone is insufficient.
  // Known distinct IDs on the same platform cannot match and need not be loaded.
  const excludeDistinctIds=Boolean(incoming.source_platform&&sourceId);
  const rows=(await sql(db,`SELECT k.entity_id FROM identity_keys k
    JOIN json_each(?) wanted ON wanted.value=k.identity_key
    LEFT JOIN selected_facts p ON p.entity_id=k.entity_id AND p.field_name='source_platform'
    LEFT JOIN selected_facts i ON i.entity_id=k.entity_id AND i.field_name='source_identifier'
    WHERE k.environment=? AND k.market=?
    ${excludeDistinctIds?"AND NOT (COALESCE(p.value_json=?,0) AND i.value_json IS NOT NULL AND i.value_json<>'null' AND i.value_json<>?)":''}
    GROUP BY k.entity_id
    HAVING SUM(CASE WHEN k.identity_key LIKE 'name:%' THEN 0 ELSE 1 END)>0
      OR SUM(CASE WHEN k.identity_key LIKE 'name:%' THEN 1 ELSE 0 END)>=3
    ORDER BY k.entity_id LIMIT 101`,stableJson(candidateKeys),incoming.environment,incoming.market,
    ...(excludeDistinctIds?[stableJson(incoming.source_platform),stableJson(sourceId)]:[])).all()).results??[];
  let decision;
  if(rows.length>100)decision={outcome:'REVIEW_REQUIRED',entity_id:null,candidates:[],reason:'identity_pool_requires_review'};
  else {
    const candidates=[];
    for(const row of rows)candidates.push(await loadEntity(db,row.entity_id));
    decision=reconcileIdentity(incoming,candidates);
  }
  if(['CONFLICT','PROBABLE_MATCH','REVIEW_REQUIRED'].includes(decision.outcome)) {
    await db.batch([
      sql(db,'INSERT OR IGNORE INTO reconciliation_decisions(record_id,outcome,entity_id,candidates_json,reason,created_at) VALUES (?,?,?,?,?,?)',recordId,decision.outcome,null,stableJson(decision.candidates),decision.reason,now),
      ...decision.candidates.map(id=>sql(db,'INSERT OR IGNORE INTO conflicts(id,entity_id,record_id,reason,created_at) VALUES (?,?,?,?,?)',recordId+':'+id,id,recordId,decision.reason,now)),
      ...(decision.outcome==='REVIEW_REQUIRED'?[sql(db,'INSERT OR IGNORE INTO conflicts(id,entity_id,record_id,reason,created_at) VALUES (?,NULL,?,?,?)',recordId+':review',recordId,decision.reason,now)]:[]),
    ]);
    return decision;
  }
  // Stable entity identity makes retried ingestion and concurrent exact-route records converge.
  const strongKey=identityAnchor(incoming);
  const id=decision.entity_id??'ent_'+(await hash([incoming.environment,incoming.market,strongKey,edition(incoming)])).slice(0,32);
  await db.batch([
    sql(db,'INSERT OR IGNORE INTO entities(id,market,edition,environment,shadow_only,created_at,updated_at) VALUES (?,?,?,?,1,?,?)',id,incoming.market,edition(incoming),incoming.environment,now,now),
    sql(db,'INSERT OR IGNORE INTO entity_records(record_id,entity_id) VALUES (?,?)',recordId,id),
    ...keys.map(key=>sql(db,'INSERT OR IGNORE INTO identity_keys(environment,market,identity_key,entity_id) VALUES (?,?,?,?)',incoming.environment,incoming.market,key,id)),
  ]);
  const facts=(await sql(db,'SELECT * FROM source_facts WHERE record_id=? ORDER BY field_name',recordId).all()).results??[];
  const snapshot=await loadEntity(db,id);
  await selectRecordFacts(db,id,facts,{now,snapshot});
  const entity=await loadEntity(db,id);
  await db.batch([
    sql(db,'INSERT OR IGNORE INTO reconciliation_decisions(record_id,outcome,entity_id,candidates_json,reason,created_at) VALUES (?,?,?,?,?,?)',recordId,decision.outcome,id,stableJson(decision.candidates),decision.reason,now),
    await jobStatement(db,'eligibility',id+':'+entity.revision,{entity_id:id},now),
  ]);
  return {...decision,entity_id:id};
}
export function assessEligibility(entity,{now=new Date().toISOString(),conflicts=0,qualityHolds=0}={}) {
  let status='eligible',reasons=[];
  if(qualityHolds) { status='review';reasons=['source_qualification_requires_review']; }
  else if(conflicts) { status='review';reasons=['unresolved_evidence_conflict']; }
  else if(entity.lifecycle_state==='WITHDRAWN'||entity.application_state==='CLOSED') { status='closed';reasons=['source_declared_closed']; }
  else if(entity.event_end&&Number.isFinite(Date.parse(entity.event_end))&&Date.parse(entity.event_end)<Date.parse(now)) { status='closed';reasons=['past_event_end']; }
  else if(['WATCH','UNKNOWN','ENQUIRY_AVAILABLE'].includes(entity.application_state)||!entity.application_state) { status='watch';reasons=['application_state_requires_recheck']; }
  else if(!entity.event_name||!(entity.application_url||entity.canonical_url)) { status='review';reasons=['insufficient_source_evidence']; }
  return {status,reasons,score:status==='eligible'?1:status==='watch'?.5:0};
}
export async function classifyEntity(db,id,{now=new Date().toISOString(),refreshVerificationId=null,recheckToken=null}={}) {
  const entity=await loadEntity(db,id);
  if(!entity)throw new Error('entity_missing');
  const conflicts=await sql(db,'SELECT COUNT(*) AS n FROM conflicts WHERE entity_id=? AND resolved=0',id).first();
  const quality=await sql(db,'SELECT COUNT(*) AS n FROM selected_facts f JOIN legacy_quality_holds h ON h.record_id=f.record_id WHERE f.entity_id=?',id).first();
  const result=assessEligibility(entity,{now,conflicts:conflicts.n,qualityHolds:quality.n});
  const revision=entity.revision;
  const ruleset='eligibility-v2:'+now.slice(0,10);
  await db.batch([
    sql(db,'INSERT OR IGNORE INTO assessments(id,entity_id,entity_revision,ruleset,status,reasons_json,score,assessed_at) VALUES (?,?,?,?,?,?,?,?)',id+':'+revision+':'+ruleset,id,revision,ruleset,result.status,stableJson(result.reasons),result.score,now),
    await jobStatement(db,'enrichment',id+':'+revision+':'+(refreshVerificationId??recheckToken??now.slice(0,10)),{entity_id:id,...(refreshVerificationId?{refresh_verification_id:refreshVerificationId}:{}),...(recheckToken?{recheck_token:recheckToken}:{})},now),
  ]);
  return result;
}
export async function enrichEntity(db,id,{proposals=[],now=new Date().toISOString(),recheckToken=null}={}) {
  const results=[];
  for(const proposal of proposals)results.push(await proposeFact(db,id,proposal,{now}));
  const entity=await loadEntity(db,id);
  if(!entity)throw new Error('entity_missing');
  const proof=await verificationGate(db,entity,{now});
  await enqueue(db,'readiness',id+':'+entity.revision+':'+(proof.verification_id??now.slice(0,10))+(recheckToken?':'+recheckToken:''),{entity_id:id},now);
  return {proposals:results};
}
export async function evaluateReadiness(db,id,{now=new Date().toISOString()}={}) {
  const entity=await loadEntity(db,id);
  if(!entity)throw new Error('entity_missing');
  const conflict=await sql(db,'SELECT COUNT(*) AS n FROM conflicts WHERE entity_id=? AND resolved=0',id).first();
  const quality=await sql(db,'SELECT COUNT(*) AS n FROM selected_facts f JOIN legacy_quality_holds h ON h.record_id=f.record_id WHERE f.entity_id=?',id).first();
  const eligibility=assessEligibility(entity,{now,conflicts:conflict.n,qualityHolds:quality.n});
  const verification=await verificationGate(db,entity,{now});
  const reasons=[...new Set([...eligibility.reasons,...verification.reasons])];
  if(!entity.location)reasons.push('source_backed_location_missing');
  if(!entity.organiser)reasons.push('organiser_missing');
  const status=verification.status==='quarantine'||['review','closed'].includes(eligibility.status)||!entity.location||!entity.organiser?'blocked':eligibility.status==='watch'||verification.status!=='verified'?'watch':reasons.length===0?'ready':'blocked';
  const snapshotHash=await hash(entity.fields);
  const payload={id,market:entity.market,region_code:null,environment:entity.environment,shadow_only:true,promotion_eligible:false,publication_eligible:false,readiness:status,verification,verified_application_state:verification.facts?.application_state??null,verified_application_heading:verification.application_heading??null,verified_application_audience:verification.application_audience??null,...entity.fields};
  const statements=[sql(db,`INSERT INTO readiness(entity_id,entity_revision,status,reasons_json,snapshot_hash,evaluated_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM entities WHERE id=? AND revision=?)
    ON CONFLICT(entity_id) DO UPDATE SET entity_revision=excluded.entity_revision,status=excluded.status,reasons_json=excluded.reasons_json,snapshot_hash=excluded.snapshot_hash,evaluated_at=excluded.evaluated_at RETURNING entity_revision`,id,entity.revision,status,stableJson(reasons),snapshotHash,now,id,entity.revision)];
  if(['shadow','test'].includes(entity.environment))statements.push(sql(db,`INSERT INTO shadow_projections(entity_id,entity_revision,payload_json,updated_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM entities WHERE id=? AND revision=?)
    ON CONFLICT(entity_id) DO UPDATE SET entity_revision=excluded.entity_revision,payload_json=excluded.payload_json,updated_at=excluded.updated_at`,id,entity.revision,stableJson(payload),now,id,entity.revision));
  // Ready events also need time-based rechecks: eligibility can expire without a fact revision.
  const future=Number.isFinite(Date.parse(entity.event_end))&&Date.parse(entity.event_end)>Date.parse(now)?Math.min(Date.parse(now)+86400000,Date.parse(entity.event_end)+86400000):Date.parse(now)+86400000;
  // Renew proved READY before its 24-hour TTL. Within the final two hours of a
  // fixed deadline, wait for expiry instead of repeatedly fetching the same page.
  const expiry=Date.parse(verification.expires_at),early=expiry-2*3600000;
  const refresh=status==='ready'&&Number.isFinite(expiry),at=refresh?(early>Date.parse(now)+300000?early:expiry):future;
  statements.push(await jobStatement(db,'watch',id+':'+entity.revision+':'+(refresh?verification.verification_id:now.slice(0,10)),{entity_id:id,...(refresh?{refresh_verification_id:verification.verification_id}:{})},now,new Date(at).toISOString()));
  const result=await db.batch(statements);
  if(result[0]?.results?.length!==1)throw new Error('readiness_revision_raced');
  return {status,reasons,snapshot_hash:snapshotHash};
}
export async function runStage(db,stage,{now=new Date().toISOString(),jobId=null,handlers={},clock=null}={}) {
  if(stage==='publication')throw new Error('publication_disabled');
  const job=await claimJob(db,stage,{now,jobId});
  if(!job)return {phase:'idle',stage};
  try {
    const payload=JSON.parse(job.payload_json);
    let result;
    if(handlers[stage])result=await handlers[stage](payload);
    else if(stage==='reconcile')result=await reconcileRecord(db,payload.record_id,{now});
    else if(stage==='eligibility')result=await classifyEntity(db,payload.entity_id,{now,refreshVerificationId:payload.refresh_verification_id,recheckToken:payload.recheck_token});
    else if(stage==='enrichment')result=await enrichEntity(db,payload.entity_id,{proposals:payload.proposals??[],now,recheckToken:payload.recheck_token});
    else if(stage==='readiness')result=await evaluateReadiness(db,payload.entity_id,{now});
    else if(stage==='watch') {
      if(payload.refresh_verification_id) {
        const entity=await loadEntity(db,payload.entity_id),gate=await verificationGate(db,entity,{now});
        if(gate.verification_id!==payload.refresh_verification_id) {
          await finishJob(db,job,clock?clock().toISOString():now);
          return {phase:'complete',stage,job_id:job.id,result:{phase:'superseded_refresh_skipped'}};
        }
      }
      await sql(db,`INSERT INTO recheck_requests(entity_id,requested_at,reason) VALUES (?,?,'watch_recheck_due') ON CONFLICT(entity_id) DO NOTHING`,payload.entity_id,now).run();
      await enqueue(db,'eligibility',payload.entity_id+':watch:'+now,payload,now);
      result={phase:'producer_recheck_requested'};
    } else throw new Error('stage_handler_required');
    await finishJob(db,job,clock?clock().toISOString():now);
    return {phase:'complete',stage,job_id:job.id,result};
  } catch(error) {
    await failJob(db,job,error,clock?clock().toISOString():now);
    return {phase:'failed',stage,job_id:job.id,error:String(error.message)};
  }
}
export async function drainPipeline(db,{now=new Date().toISOString(),limit=1000}={}) {
  let completed=0;
  for(const stage of ['reconcile','eligibility','enrichment','readiness']) {
    for(let i=0;i<limit;i++) {
      const result=await runStage(db,stage,{now});
      if(result.phase==='idle')break;
      if(result.phase==='failed')throw new Error(stage+':'+result.error);
      completed++;
      if(i===limit-1)throw new Error('pipeline_drain_limit');
    }
  }
  return {completed};
}
