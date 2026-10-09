import {sql} from './store.mjs';
import {stableJson,hash} from './contract.mjs';
import {jobStatement} from './jobs.mjs';

export const LIFECYCLE_POLICY='lifecycle-observation-v1';
export async function repairLifecycleObservations(db,entityId,{now=new Date().toISOString()}={}) {
  if(typeof entityId!=='string'||!/^ent_[a-f0-9]{32}$/.test(entityId))throw Error('lifecycle_shadow_entity_required');
  const scope=await sql(db,`SELECT e.environment,
    (SELECT publication_enabled FROM runtime_policy WHERE id=1) AS publication,
    (SELECT COUNT(*) FROM customer_projections)+(SELECT COUNT(*) FROM publication_queue) AS leakage,
    (SELECT bulk_enabled FROM serper_policy WHERE id=1) AS bulk,
    (SELECT manual_paused FROM commercial_acquisition_policy WHERE id=1) AS paid_paused,
    EXISTS(SELECT 1 FROM quality_gates WHERE name='structured-100-preservation' AND destructive_mutations=0 AND tested_records=100) AS preservation,
    (SELECT COUNT(*) FROM jobs WHERE stage IN ('reconcile','eligibility','enrichment','readiness') AND status IN ('ready','leased') AND available_at<=?) AS due_jobs
    FROM entities e WHERE e.id=?`,now,entityId).first();
  if(!scope||scope.environment!=='shadow'||scope.publication||scope.leakage||scope.bulk||!scope.paid_paused||!scope.preservation)throw Error('lifecycle_shadow_guard_required');
  if(scope.due_jobs>40)throw Error('lifecycle_repair_backlog');
  const candidates=(await sql(db,`SELECT c.id,c.record_id,f.id AS incoming_fact_id,f.value_json AS incoming_value,
    s.fact_id AS selected_fact_id,old.value_json AS selected_value,p.content_hash,p.producer_record_id,
    json_extract(p.normalized_json,'$.last_checked') AS source_last_checked
    FROM conflicts c JOIN producer_records p ON p.id=c.record_id
    JOIN entity_records er ON er.record_id=p.id AND er.entity_id=c.entity_id
    JOIN reconciliation_decisions d ON d.record_id=p.id AND d.entity_id=c.entity_id
    JOIN source_facts f ON f.record_id=p.id AND f.field_name='lifecycle_state'
    JOIN field_selections s ON s.entity_id=c.entity_id AND s.field_name='lifecycle_state'
    JOIN source_facts old ON old.id=s.fact_id
    WHERE c.entity_id=? AND c.resolved=0 AND c.field_name='lifecycle_state' AND c.reason='equal_authority_disagreement'
    AND p.environment='shadow' AND p.producer_name='independent-structured' AND p.validation_status='accepted'
    AND json_extract(f.value_json,'$') IN ('NEW','UPDATED','UNCHANGED')
    AND json_extract(p.normalized_json,'$.lifecycle_state')=json_extract(f.value_json,'$') ORDER BY c.id LIMIT 51`,entityId).all()).results;
  if(candidates.length>50)throw Error('lifecycle_conflict_bound_requires_review');
  if(!candidates.length)return {entity_id:entityId,resolved_conflicts:0,idempotent:true,source_mutations:0};
  const statements=[];
  for(const c of candidates) {
    const evidence={policy:LIFECYCLE_POLICY,conflict_id:c.id,record_id:c.record_id,source_content_hash:c.content_hash,
      producer_record_id:c.producer_record_id,source_last_checked:c.source_last_checked,incoming_fact_id:c.incoming_fact_id,
      incoming_lifecycle:JSON.parse(c.incoming_value),selected_fact_id:c.selected_fact_id,selected_lifecycle:JSON.parse(c.selected_value),
      interpretation:'Informational producer lifecycle observation only; original facts, selected lifecycle, application state, identity and other conflicts are unchanged.'};
    statements.push(sql(db,`INSERT OR IGNORE INTO lifecycle_observation_resolutions VALUES (?,?,?,?,?,?,?,?,?)`,c.id,entityId,c.record_id,c.incoming_fact_id,c.selected_fact_id,LIFECYCLE_POLICY,'delivery_observation_not_source_disagreement',stableJson(evidence),now));
    statements.push(sql(db,`UPDATE conflicts SET resolved=1 WHERE id=? AND resolved=0 AND EXISTS(
      SELECT 1 FROM lifecycle_observation_resolutions a WHERE a.conflict_id=conflicts.id AND a.entity_id=conflicts.entity_id AND a.record_id=conflicts.record_id
      AND a.policy_version=?) RETURNING id`,c.id,LIFECYCLE_POLICY));
  }
  // The normal eligibility -> direct verification -> readiness path decides
  // recovery. Clearing a bookkeeping conflict never itself promotes a record.
  const recheckToken='lifecycle_'+(await hash(candidates.map(c=>c.id))).slice(0,32);
  statements.push(await jobStatement(db,'eligibility',entityId+':'+recheckToken,{entity_id:entityId,recheck_token:recheckToken},now));
  const result=await db.batch(statements),resolved=candidates.flatMap((_,i)=>result[i*2+1].results??[]).map(r=>r.id);
  return {entity_id:entityId,resolved_conflicts:resolved.length,resolved_conflict_ids:resolved,readiness_recheck_queued:true,source_mutations:0};
}
