import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {cloudflareClient,readCredentials} from './cloudflare-api.mjs';
import {openRemoteD1} from './remote-d1.mjs';
import {hash,FIELDS,stableJson} from '../../platform/findpitches-v3/contract.mjs';
import {LEGACY_RULES_VERSION,legacyUnits,fieldAudit} from './legacy-recovery.mjs';

export async function reportLegacyRecovery({credentialsFile,stateDirectory,recoveryDirectory,snapshotFile}) {
  const snapshot=JSON.parse(fs.readFileSync(snapshotFile)),baseline=JSON.parse(fs.readFileSync(path.join(recoveryDirectory,'v3-entity-baseline.json')));
  const state=JSON.parse(fs.readFileSync(path.join(stateDirectory,'resources.json'))),db=await openRemoteD1(cloudflareClient(readCredentials(credentialsFile)),state);
  const run=await db.prepare('SELECT * FROM legacy_recovery_runs WHERE id=?').bind(baseline.run_id).first();
  if(!run||run.snapshot_hash!==snapshot.content_hash)throw Error('legacy_recovery_run_required');
  const rows=(await db.prepare(`SELECT l.*,d.outcome,d.entity_id,d.candidates_json,h.reason AS quality_hold FROM legacy_recovery_records l
    LEFT JOIN reconciliation_decisions d ON d.record_id=l.record_id
    LEFT JOIN legacy_quality_holds h ON h.record_id=l.record_id WHERE l.run_id=? ORDER BY l.legacy_id`).bind(run.id).all()).results;
  const unitById=new Map(legacyUnits(snapshot).map(unit=>[unit.id,unit]));
  const known=new Set(baseline.entity_ids),newEntities=new Set(),existingEntities=new Set(),counts={retained_evidence:0,source_refetch:0,quarantine:0};
  const finalCategories={retained_evidence:0,source_refetch:0,quarantine:0},identityHoldsBySource={retained_evidence:0,source_refetch:0};
  const creators=(await db.prepare(`SELECT DISTINCT lnk.entity_id,
    (SELECT p.producer_name FROM reconciliation_decisions d JOIN producer_records p ON p.id=d.record_id
      WHERE d.entity_id=lnk.entity_id AND d.outcome='NEW_ENTITY' ORDER BY d.created_at,d.record_id LIMIT 1) AS first_producer
    FROM legacy_recovery_records l JOIN entity_records lnk ON lnk.record_id=l.record_id WHERE l.run_id=?`).bind(run.id).all()).results;
  for(const creator of creators)if(creator.first_producer!=='legacy_v2')known.add(creator.entity_id);
  const fields={source_fields:0,historical_preserved:0,historical_repaired:0,historical_withheld:0,retained_source_preserved:0,retained_source_changed:0};
  const perField={},reasons={},outcomes={};let matched=0,within=0,pending=0,refetchAttempts=0,represented=0,qualityHolds=0,identityReview=0;
  for(const row of rows) {
    const category=row.quality_hold?'quarantine':row.category,reason=row.quality_hold??row.reason;
    const identityHold=!row.quality_hold&&['PROBABLE_MATCH','REVIEW_REQUIRED','CONFLICT'].includes(row.outcome);
    finalCategories[identityHold?'quarantine':category]++;
    if(identityHold&&category!=='quarantine')identityHoldsBySource[category]++;
    counts[category]++;reasons[reason]=(reasons[reason]??0)+1;represented+=JSON.parse(row.references_json).length;refetchAttempts+=row.refetch_attempts;
    if(row.quality_hold)qualityHolds++;
    else if(identityHold)identityReview++;
    const audit=row.quality_hold?fieldAudit(unitById.get(row.legacy_id),null):JSON.parse(row.field_audit_json);for(const k of Object.keys(fields))fields[k]+=audit.totals?.[k]??0;
    for(const[f,v]of Object.entries(audit.fields??{})) {
      perField[f]??={reconstructed_present:0,reconstructed_absent:0};
      perField[f][v.recovered?'reconstructed_present':'reconstructed_absent']++;
      perField[f][v.decision]=(perField[f][v.decision]??0)+1;
    }
    if(row.outcome)outcomes[row.outcome]=(outcomes[row.outcome]??0)+1;
    if(row.record_id&&!row.outcome)pending++;
    if(row.entity_id&&!row.quality_hold) {
      if(known.has(row.entity_id)){matched++;existingEntities.add(row.entity_id);}else{if(newEntities.has(row.entity_id))within++;newEntities.add(row.entity_id);}
    }
  }
  let rawVerified=0,sourceFieldsVerified=0,mutations=0,marketRepairs=0;
  const entries=rows.filter(r=>r.record_id);
  for(let i=0;i<entries.length;i+=50) {
    const part=entries.slice(i,i+50),ids=part.map(r=>r.record_id),marks=ids.map(()=>'?').join(',');
    const [receipts,facts]=await Promise.all([
      db.prepare(`SELECT id,raw_json,content_hash,environment,producer_name FROM producer_records WHERE id IN (${marks})`).bind(...ids).all(),
      db.prepare(`SELECT record_id,field_name,value_json FROM source_facts WHERE record_id IN (${marks})`).bind(...ids).all(),
    ]);
    for(const row of part) {
      const receipt=receipts.results.find(r=>r.id===row.record_id);
      if(!receipt){mutations++;continue;}
      const entry=JSON.parse(fs.readFileSync(path.join(recoveryDirectory,'entries-'+LEGACY_RULES_VERSION,row.legacy_id+'.json')));
      const history=entry.record.provenance?.find(p=>p.historical_market);
      if(!row.quality_hold&&history&&history.historical_market!==entry.record.country_code)marketRepairs++;
      if(await hash(receipt.raw_json)!==receipt.content_hash||stableJson(entry.record)!==receipt.raw_json||receipt.environment!=='shadow'||receipt.producer_name!=='legacy_v2')mutations++;else rawVerified++;
      for(const field of FIELDS)if(entry.record[field]!==null&&entry.record[field]!==undefined&&entry.record[field]!=='') {
        const fact=facts.results.find(f=>f.record_id===receipt.id&&f.field_name===field);
        if(!fact||fact.value_json!==stableJson(entry.record[field]))mutations++;else sourceFieldsVerified++;
      }
    }
  }
  const guard=await db.prepare(`SELECT (SELECT COUNT(*) FROM customer_projections) AS customer_rows,
    (SELECT COUNT(*) FROM publication_queue) AS publication_rows,
    (SELECT publication_enabled FROM runtime_policy WHERE id=1) AS publication_enabled,
    (SELECT bulk_enabled FROM serper_policy WHERE id=1) AS bulk_enabled,
    (SELECT COALESCE(SUM(queries_completed),0) FROM acquisition_runs) AS total_v3_serper_queries_completed`).first();
  const cachedSources=fs.readdirSync(path.join(recoveryDirectory,'sources')).filter(n=>n.endsWith('.json')).length;
  const selection=(await db.prepare(`SELECT a.decision,a.reason,COUNT(*) AS fields FROM selection_audit a
    JOIN source_facts f ON f.id=a.proposed_fact_id JOIN legacy_recovery_records l ON l.record_id=f.record_id
    WHERE l.run_id=? GROUP BY a.decision,a.reason ORDER BY a.decision,a.reason`).bind(run.id).all()).results;
  const review=identityReview;
  if(Object.values(finalCategories).reduce((a,b)=>a+b,0)!==rows.length)throw Error('legacy_final_category_count_mismatch');
  return {schema:'findpitches-legacy-v2-recovery-report-v1',as_of:new Date().toISOString(),run_id:run.id,snapshot_hash:snapshot.content_hash,
    evidence_rules_version:LEGACY_RULES_VERSION,superseded_attempt:baseline.superseded_run_id??null,
    capture_window:{started_at:snapshot.capture_started_at,completed_at:snapshot.capture_completed_at,consistency:snapshot.consistency},
    source_table_counts:snapshot.counts,total_reference_rows_read:Object.values(snapshot.counts).reduce((a,b)=>a+b,0),
    total_v2_records_inspected:represented,total_v2_opportunities_inspected:rows.length,planned_recovery_units:run.total_opportunities,
    recovery_unit_definition:'A candidate and its customer row are one unit; an explicitly or uniquely source-linked structured baseline joins that unit. Remaining baselines are separate units until reconciliation.',
    complete:run.status==='complete'&&pending===0,
    recovered_from_retained_evidence:counts.retained_evidence,recovered_by_source_refetch:counts.source_refetch,
    final_categories:finalCategories,identity_holds_by_source_category:identityHoldsBySource,
    final_category_definition:'Mutually exclusive disposition per recovery unit. Source-qualified records still awaiting identity review are counted only in quarantine here; evidence reconstruction totals above include those holds.',
    matched_to_existing_v3:matched,distinct_existing_v3_entities:existingEntities.size,genuinely_new_v3_entities:newEntities.size,
    matched_within_recovery:within,within_recovery_match_definition:'Additional qualified recovery units linked to an already counted new entity; counted independently of earlier held receipts and reconciliation outcome labels.',quarantined_unrecoverable:counts.quarantine+review,
    quarantined_at_source:counts.quarantine-qualityHolds,quarantined_after_source_qualification:qualityHolds,quarantined_after_reconciliation:review,
    source_evidence_receipts_retained_including_quality_holds:entries.length,
    category_definition:'Retained/re-fetch counts exclude source-qualification holds. Identity holds overlap reconstructed-evidence counts and are included in total quarantine; overlapping quality/identity holds are counted once.',
    existing_entity_definition:'Initial V3 population plus entities first created by other producers while recovery ran.',
    entity_definition:'Distinct source-linked entity IDs under conservative market/edition identity rules; real-world uniqueness has not been independently labelled.',
    reconciliation_review_required:review,
    reconciliation_pending:pending,reconciliation_outcomes:outcomes,quarantine_and_recovery_reasons:reasons,
    field_statistics:{...fields,historical_market_repaired:marketRepairs,selection_decisions:selection,per_field:perField,immutable_raw_receipts_verified:rawVerified,immutable_source_fields_verified:sourceFieldsVerified,destructive_source_mutations:mutations,
      source_preservation_verified:mutations===0&&rawVerified===entries.length,unsupported_customer_values_imported:0,
      definition:'Historical repaired/withheld counts compare customer fields when present, otherwise candidate fields; quality-held reconstructions are treated as withheld. Source preservation compares retained structured baselines with qualified reconstructed values. Immutable receipt/fact verification includes held evidence. Reconstructed fields include UNKNOWN/WATCH defaults; not_previously_present does not imply a new populated value.'},
    direct_source_refetch:{opportunity_route_attempts:refetchAttempts,unique_cached_urls:cachedSources,max_original_routes_per_opportunity:2,max_redirects:3,max_response_bytes:1048576,search_queries_issued:0},
    source_reference_read_only:true,customer_records_bulk_copied:false,all_recovered_evidence_shadow_only:true,audit_status:'pending',...guard};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2),get=name=>args[args.indexOf(name)+1];
  try {const report=await reportLegacyRecovery({credentialsFile:get('--credentials'),stateDirectory:get('--state-dir'),recoveryDirectory:get('--recovery-dir'),snapshotFile:get('--snapshot')});fs.writeFileSync(get('--out'),JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(JSON.stringify({inspected:report.total_v2_opportunities_inspected,retained:report.recovered_from_retained_evidence,refetched:report.recovered_by_source_refetch,new:report.genuinely_new_v3_entities,matched:report.matched_to_existing_v3,quarantine:report.quarantined_unrecoverable,pending:report.reconciliation_pending,mutations:report.field_statistics.destructive_source_mutations,complete:report.complete}));}
  catch {console.error('legacy_recovery_report_failed');process.exitCode=1;}
}
