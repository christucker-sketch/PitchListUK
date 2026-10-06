import {hash,stableJson,normalizeExport} from './contract.mjs';
import {sql,ingestRecords} from './store.mjs';

export async function importLegacyBatch(db,body,{now=new Date().toISOString()}={}) {
  const run=body.run;
  if(!run||!/^legacy_[a-f0-9]{64}$/.test(run.id)||!/^[a-f0-9]{64}$/.test(run.snapshot_hash??'')
    ||!Number.isInteger(run.total_opportunities)||run.total_opportunities<1||run.total_opportunities>100000)throw Error('legacy_snapshot_manifest_required');
  const expected=run.rules_version==='evidence-v2'?await hash([run.snapshot_hash,run.rules_version]):run.snapshot_hash;
  if(run.id!=='legacy_'+expected||run.rules_version&&run.rules_version!=='evidence-v2')throw Error('legacy_rules_manifest_invalid');
  if(!Array.isArray(body.entries)||body.entries.length<1||body.entries.length>10)throw Error('legacy_batch_1_to_10_required');
  if(new Set(body.entries.map(entry=>entry?.id)).size!==body.entries.length)throw Error('legacy_batch_duplicate_identity');
  for(const entry of body.entries) {
    if(typeof entry.id!=='string'||entry.id.length>256||!Array.isArray(entry.references)||!entry.references.length
      ||!['retained_evidence','source_refetch','quarantine'].includes(entry.category)||!entry.field_audit||typeof entry.reason!=='string')throw Error('legacy_audited_entry_required');
    if(entry.category!=='quarantine'&&(entry.record?.opportunity_id!==entry.id||normalizeExport(entry.record,{producer:'legacy_v2'}).errors.length))throw Error('legacy_evidence_record_invalid');
    if(entry.category==='quarantine'&&entry.record)throw Error('quarantined_evidence_must_not_create_entity');
  }
  const previous=await sql(db,'SELECT * FROM legacy_recovery_runs WHERE id=?',run.id).first();
  if(previous&&(previous.snapshot_hash!==run.snapshot_hash||previous.total_opportunities!==run.total_opportunities||previous.source_counts_json!==stableJson(run.source_counts)))throw Error('legacy_snapshot_manifest_replay_conflict');
  await sql(db,"INSERT OR IGNORE INTO legacy_recovery_runs(id,snapshot_hash,source_counts_json,total_opportunities,status,created_at,updated_at) VALUES (?,?,?,?,'running',?,?)",run.id,run.snapshot_hash,stableJson(run.source_counts),run.total_opportunities,now,now).run();
  if(run.supersedes) {
    const old=await sql(db,'SELECT snapshot_hash,superseded_by FROM legacy_recovery_runs WHERE id=?',run.supersedes).first();
    if(!old||old.snapshot_hash!==run.snapshot_hash||old.superseded_by&&old.superseded_by!==run.id)throw Error('legacy_superseded_manifest_conflict');
    await sql(db,'UPDATE legacy_recovery_runs SET superseded_by=? WHERE id=? AND superseded_by IS NULL',run.id,run.supersedes).run();
  }
  const results=[],ids=stableJson(body.entries.map(entry=>entry.id));
  const digests=await Promise.all(body.entries.map(entry=>hash(entry)));
  const priorRows=(await sql(db,'SELECT * FROM legacy_recovery_records WHERE run_id=? AND legacy_id IN (SELECT value FROM json_each(?))',run.id,ids).all()).results;
  const priorById=new Map(priorRows.map(row=>[row.legacy_id,row])),fresh=[];
  for(let i=0;i<body.entries.length;i++) {
    const entry=body.entries[i],digest=digests[i],prior=priorById.get(entry.id);
    if(prior){if(prior.content_hash!==digest)throw Error('legacy_recovery_replay_conflict');results.push({id:entry.id,record_id:prior.record_id,duplicate:true});}
    else fresh.push({entry,digest});
  }
  if(fresh.length) {
    await db.batch(fresh.map(({entry,digest})=>sql(db,'INSERT OR IGNORE INTO legacy_recovery_claims VALUES (?,?,?)',run.id,entry.id,digest)));
    const claims=(await sql(db,'SELECT legacy_id,content_hash FROM legacy_recovery_claims WHERE run_id=? AND legacy_id IN (SELECT value FROM json_each(?))',run.id,ids).all()).results;
    const claimById=new Map(claims.map(row=>[row.legacy_id,row.content_hash]));
    for(const{entry,digest}of fresh)if(claimById.get(entry.id)!==digest)throw Error('legacy_recovery_replay_conflict');
  }
  const statements=[];
  for(const{entry,digest}of fresh) {
    const receipt=entry.record?await ingestRecords(db,[entry.record],{producer:'legacy_v2',environment:'shadow',now}):null;
    if(receipt?.rejected)throw Error('legacy_evidence_record_invalid');
    statements.push(sql(db,'INSERT OR IGNORE INTO legacy_recovery_records VALUES (?,?,?,?,?,?,?,?,?,?)',run.id,entry.id,digest,stableJson(entry.references),entry.category,entry.reason,receipt?.record_ids[0]??null,stableJson(entry.field_audit),entry.refetch_attempts??0,now));
    results.push({id:entry.id,record_id:receipt?.record_ids[0]??null,duplicate:receipt?.duplicates>0});
  }
  // Completing the manifest is explicit, so a large recovery does not rescan
  // the entire audit ledger after every single imported opportunity.
  statements.push(sql(db,'UPDATE legacy_recovery_runs SET updated_at=? WHERE id=?',now,run.id));
  await db.batch(statements);
  const byId=new Map(results.map(result=>[result.id,result]));
  return {run_id:run.id,results:body.entries.map(entry=>byId.get(entry.id)),shadow_only:true,audit_status:'pending'};
}
export async function completeLegacyRecovery(db,runId,{now=new Date().toISOString()}={}) {
  if(!/^legacy_[a-f0-9]{64}$/.test(runId??''))throw Error('legacy_run_id_required');
  const result=await sql(db,`UPDATE legacy_recovery_runs SET status='complete',updated_at=?
    WHERE id=? AND total_opportunities=(SELECT COUNT(*) FROM legacy_recovery_records WHERE run_id=?)`,now,runId,runId).run();
  if(Number(result.meta?.changes)!==1)throw Error('legacy_recovery_manifest_incomplete');
  return {run_id:runId,complete:true,shadow_only:true,audit_status:'pending'};
}
export async function legacyRecoveryStatus(db) {
  return {runs:(await sql(db,`SELECT r.id,r.total_opportunities,r.status,r.superseded_by,r.created_at,r.updated_at,
    COUNT(l.legacy_id) AS inspected,SUM(l.category='retained_evidence' AND h.record_id IS NULL) AS recovered_from_retained,
    SUM(l.category='source_refetch' AND h.record_id IS NULL) AS recovered_by_refetch,SUM(l.category='quarantine' OR h.record_id IS NOT NULL) AS quarantined,
    SUM(d.outcome='EXACT_MATCH') AS exact_matches,SUM(d.outcome='PROBABLE_MATCH') AS probable_matches,
    SUM(d.outcome='NEW_ENTITY') AS new_entity_decisions,
    SUM(l.record_id IS NOT NULL AND d.record_id IS NULL) AS reconciliation_pending,
    SUM(h.record_id IS NOT NULL) AS source_qualification_holds,
    SUM(d.outcome IN ('CONFLICT','REVIEW_REQUIRED')) AS reconciliation_quarantined
    FROM legacy_recovery_runs r LEFT JOIN legacy_recovery_records l ON l.run_id=r.id
    LEFT JOIN reconciliation_decisions d ON d.record_id=l.record_id
    LEFT JOIN legacy_quality_holds h ON h.record_id=l.record_id GROUP BY r.id ORDER BY r.created_at DESC LIMIT 10`).all()).results};
}
