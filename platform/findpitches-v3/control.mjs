import { FIELDS,hash,stableJson,normalizeExport } from './contract.mjs';
import { sql } from './store.mjs';

export async function verifyStructuredControl(db,records,recordIds,{now=new Date().toISOString()}={}) {
  if(records.length!==100||recordIds.length!==100||new Set(recordIds).size!==100)throw new Error('exactly_100_distinct_control_records_required');
  const mutations=[];const entities=new Set();
  const marks=recordIds.map(()=>'?').join(',');
  // Bounded set reads keep this audit within Worker subrequest limits.
  const [receipts,facts,links]=await Promise.all([
    sql(db,`SELECT * FROM producer_records WHERE id IN (${marks})`,...recordIds).all(),
    sql(db,`SELECT record_id,field_name,value_json FROM source_facts WHERE record_id IN (${marks})`,...recordIds).all(),
    sql(db,`SELECT er.record_id,e.id,e.revision FROM entity_records er JOIN entities e ON e.id=er.entity_id WHERE er.record_id IN (${marks})`,...recordIds).all(),
  ]);
  const storedMap=new Map(receipts.results.map(r=>[r.id,r])),factMap=new Map(facts.results.map(f=>[f.record_id+':'+f.field_name,f.value_json])),linkMap=new Map(links.results.map(e=>[e.record_id,e]));
  const entityIds=[...new Set(links.results.map(e=>e.id))];
  if(!entityIds.length)throw new Error('control_record_not_reconciled');
  const entityMarks=entityIds.map(()=>'?').join(',');
  const [selections,pipeline]=await Promise.all([
    sql(db,`SELECT * FROM selected_facts WHERE entity_id IN (${entityMarks})`,...entityIds).all(),
    sql(db,`SELECT e.id,r.entity_revision,EXISTS(SELECT 1 FROM assessments a WHERE a.entity_id=e.id) AS assessed,
      EXISTS(SELECT 1 FROM selection_audit a WHERE a.entity_id=e.id AND a.field_name='event_name' AND a.decision='rejected' AND a.reason='weaker_evidence') AS adverse
      FROM entities e LEFT JOIN readiness r ON r.entity_id=e.id WHERE e.id IN (${entityMarks})`,...entityIds).all(),
  ]);
  const selectedMap=new Map(selections.results.map(f=>[f.entity_id+':'+f.field_name,f.value_json])),pipelineMap=new Map(pipeline.results.map(r=>[r.id,r]));
  for(let i=0;i<records.length;i++) {
    const stored=storedMap.get(recordIds[i]);
    const baseline=normalizeExport(records[i],{environment:stored?.environment}).normalized;
    if(!stored||stored.producer_name!=='independent-structured'||stored.producer_type!=='structured'||!baseline)throw new Error('accepted_structured_control_required');
    if(stored.raw_json!==stableJson(records[i])||stored.content_hash!==await hash(records[i]))mutations.push({record_id:stored.id,field:'raw_payload'});
    const entity=linkMap.get(stored.id);
    if(!entity)throw new Error('control_record_not_reconciled');
    entities.add(entity.id);
    const evaluated=pipelineMap.get(entity.id);
    if(evaluated?.entity_revision!==entity.revision||!evaluated.assessed)throw new Error('control_pipeline_incomplete');
    if(!evaluated.adverse)throw new Error('adversarial_preservation_check_required');
    for(const field of FIELDS)if(baseline[field]!==null&&baseline[field]!==undefined&&baseline[field]!=='') {
      if(factMap.get(stored.id+':'+field)!==stableJson(baseline[field]))mutations.push({record_id:stored.id,field:field+':source_fact'});
      if(selectedMap.get(entity.id+':'+field)!==stableJson(baseline[field]))mutations.push({record_id:stored.id,field:field+':selected_value'});
    }
  }
  const customer=await sql(db,'SELECT COUNT(*) AS n FROM customer_projections').first();
  const publication=await sql(db,'SELECT COUNT(*) AS n FROM publication_queue').first();
  const report={tested_records:100,entities:entities.size,destructive_mutations:mutations.length,mutations,customer_projection_rows:customer.n,publication_rows:publication.n,input_hash:await hash(records),scope:'real_structured_artifact_control_not_exact_historical_pilot',checked_at:now};
  if(mutations.length||customer.n||publication.n)throw new Error('structured_control_failed:'+stableJson(report));
  await sql(db,`INSERT INTO quality_gates(name,tested_records,destructive_mutations,report_json,report_hash,passed_at) VALUES ('structured-100-preservation',100,0,?,?,?)
    ON CONFLICT(name) DO UPDATE SET report_json=excluded.report_json,report_hash=excluded.report_hash,passed_at=excluded.passed_at`,stableJson(report),await hash(report),now).run();
  return report;
}
