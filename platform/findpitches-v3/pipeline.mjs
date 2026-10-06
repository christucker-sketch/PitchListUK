import { FIELDS,hash,stableJson } from './contract.mjs';
import { identityKeys,identityAnchor,reconcileIdentity,edition } from './identity.mjs';
import { sql,loadEntity } from './store.mjs';
import { selectFact,proposeFact } from './evidence.mjs';
import { enqueue,jobStatement,claimJob,finishJob,failJob } from './jobs.mjs';

export async function reconcileRecord(db,recordId,{now=new Date().toISOString()}={}) {
  const existing=await sql(db,'SELECT * FROM reconciliation_decisions WHERE record_id=?',recordId).first();
  if(existing)return existing;
  const record=await sql(db,"SELECT * FROM producer_records WHERE id=? AND validation_status='accepted'",recordId).first();
  if(!record)throw new Error('accepted_record_required');
  const incoming=JSON.parse(record.normalized_json),keys=identityKeys(incoming);
  const candidates=new Map();
  for(const key of keys) {
    const rows=(await sql(db,'SELECT entity_id FROM identity_keys WHERE environment=? AND market=? AND identity_key=? LIMIT 101',incoming.environment,incoming.market,key).all()).results??[];
    if(rows.length>100)throw new Error('identity_pool_requires_review');
    for(const row of rows)candidates.set(row.entity_id,null);
  }
  for(const id of candidates.keys())candidates.set(id,await loadEntity(db,id));
  const decision=reconcileIdentity(incoming,[...candidates.values()]);
  if(['CONFLICT','PROBABLE_MATCH','REVIEW_REQUIRED'].includes(decision.outcome)) {
    await db.batch([
      sql(db,'INSERT OR IGNORE INTO reconciliation_decisions(record_id,outcome,entity_id,candidates_json,reason,created_at) VALUES (?,?,?,?,?,?)',recordId,decision.outcome,null,stableJson(decision.candidates),decision.reason,now),
      ...decision.candidates.map(id=>sql(db,'INSERT OR IGNORE INTO conflicts(id,entity_id,record_id,reason,created_at) VALUES (?,?,?,?,?)',recordId+':'+id,id,recordId,decision.reason,now)),
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
  for(const fact of facts) {
    const selected=await selectFact(db,id,fact,{now,snapshot});
    if(selected.decision==='accepted')snapshot.selections[fact.field_name]={...fact,fact_id:fact.id};
  }
  const entity=await loadEntity(db,id);
  await db.batch([
    sql(db,'INSERT OR IGNORE INTO reconciliation_decisions(record_id,outcome,entity_id,candidates_json,reason,created_at) VALUES (?,?,?,?,?,?)',recordId,decision.outcome,id,stableJson(decision.candidates),decision.reason,now),
    await jobStatement(db,'eligibility',id+':'+entity.revision,{entity_id:id},now),
  ]);
  return {...decision,entity_id:id};
}
export function assessEligibility(entity,{now=new Date().toISOString(),conflicts=0}={}) {
  let status='eligible',reasons=[];
  if(conflicts) { status='review';reasons=['unresolved_evidence_conflict']; }
  else if(entity.lifecycle_state==='WITHDRAWN'||entity.application_state==='CLOSED') { status='closed';reasons=['source_declared_closed']; }
  else if(entity.event_end&&Number.isFinite(Date.parse(entity.event_end))&&Date.parse(entity.event_end)<Date.parse(now)) { status='closed';reasons=['past_event_end']; }
  else if(['WATCH','UNKNOWN'].includes(entity.application_state)||!entity.application_state) { status='watch';reasons=['application_state_requires_recheck']; }
  else if(!entity.event_name||!(entity.application_url||entity.canonical_url)) { status='review';reasons=['insufficient_source_evidence']; }
  return {status,reasons,score:status==='eligible'?1:status==='watch'?.5:0};
}
export async function classifyEntity(db,id,{now=new Date().toISOString()}={}) {
  const entity=await loadEntity(db,id);
  if(!entity)throw new Error('entity_missing');
  const conflicts=await sql(db,'SELECT COUNT(*) AS n FROM conflicts WHERE entity_id=? AND resolved=0',id).first();
  const result=assessEligibility(entity,{now,conflicts:conflicts.n});
  const revision=entity.revision;
  const ruleset='eligibility-v1:'+now.slice(0,10);
  await db.batch([
    sql(db,'INSERT OR IGNORE INTO assessments(id,entity_id,entity_revision,ruleset,status,reasons_json,score,assessed_at) VALUES (?,?,?,?,?,?,?,?)',id+':'+revision+':'+ruleset,id,revision,ruleset,result.status,stableJson(result.reasons),result.score,now),
    await jobStatement(db,'enrichment',id+':'+revision+':'+now.slice(0,10),{entity_id:id},now),
  ]);
  return result;
}
export async function enrichEntity(db,id,{proposals=[],now=new Date().toISOString()}={}) {
  const results=[];
  for(const proposal of proposals)results.push(await proposeFact(db,id,proposal,{now}));
  const entity=await loadEntity(db,id);
  if(!entity)throw new Error('entity_missing');
  await enqueue(db,'readiness',id+':'+entity.revision+':'+now.slice(0,10),{entity_id:id},now);
  return {proposals:results};
}
export async function evaluateReadiness(db,id,{now=new Date().toISOString()}={}) {
  const entity=await loadEntity(db,id);
  if(!entity)throw new Error('entity_missing');
  const conflict=await sql(db,'SELECT COUNT(*) AS n FROM conflicts WHERE entity_id=? AND resolved=0',id).first();
  const eligibility=assessEligibility(entity,{now,conflicts:conflict.n});
  const reasons=[...eligibility.reasons];
  if(!entity.location)reasons.push('source_backed_location_missing');
  if(!entity.organiser)reasons.push('organiser_missing');
  const status=eligibility.status==='watch'?'watch':eligibility.status==='eligible'&&reasons.length===0?'ready':'blocked';
  const snapshotHash=await hash(entity.fields);
  const payload={id,market:entity.market,region_code:null,environment:entity.environment,shadow_only:true,promotion_eligible:false,publication_eligible:false,readiness:status,...entity.fields};
  const statements=[sql(db,`INSERT INTO readiness(entity_id,entity_revision,status,reasons_json,snapshot_hash,evaluated_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM entities WHERE id=? AND revision=?)
    ON CONFLICT(entity_id) DO UPDATE SET entity_revision=excluded.entity_revision,status=excluded.status,reasons_json=excluded.reasons_json,snapshot_hash=excluded.snapshot_hash,evaluated_at=excluded.evaluated_at RETURNING entity_revision`,id,entity.revision,status,stableJson(reasons),snapshotHash,now,id,entity.revision)];
  if(['shadow','test'].includes(entity.environment))statements.push(sql(db,`INSERT INTO shadow_projections(entity_id,entity_revision,payload_json,updated_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM entities WHERE id=? AND revision=?)
    ON CONFLICT(entity_id) DO UPDATE SET entity_revision=excluded.entity_revision,payload_json=excluded.payload_json,updated_at=excluded.updated_at`,id,entity.revision,stableJson(payload),now,id,entity.revision));
  // Ready events also need time-based rechecks: eligibility can expire without a fact revision.
  const future=Number.isFinite(Date.parse(entity.event_end))&&Date.parse(entity.event_end)>Date.parse(now)?Math.min(Date.parse(now)+7*86400000,Date.parse(entity.event_end)+86400000):Date.parse(now)+7*86400000;
  statements.push(await jobStatement(db,'watch',id+':'+entity.revision+':'+now.slice(0,10),{entity_id:id},now,new Date(future).toISOString()));
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
    else if(stage==='eligibility')result=await classifyEntity(db,payload.entity_id,{now});
    else if(stage==='enrichment')result=await enrichEntity(db,payload.entity_id,{proposals:payload.proposals??[],now});
    else if(stage==='readiness')result=await evaluateReadiness(db,payload.entity_id,{now});
    else if(stage==='watch') {
      await sql(db,`INSERT INTO recheck_requests(entity_id,requested_at,reason) VALUES (?,?,'watch_recheck_due') ON CONFLICT(entity_id) DO UPDATE SET requested_at=excluded.requested_at`,payload.entity_id,now).run();
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
