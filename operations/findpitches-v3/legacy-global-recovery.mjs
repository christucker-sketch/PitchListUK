// Explicit, bounded recovery from an archived legacy paid engine. No Serper.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as wait} from 'node:timers/promises';
import {shadowContext} from './shadow-context.mjs';
import {immutableDigests,sourceMutationCount} from './controlled-pilot.mjs';
import {assertFreeGrowth,growthOutcome} from './inventory-scale.mjs';
import {commercialRows,commercialEntity} from '../../platform/findpitches-v3/commercial.mjs';
import {legacyGlobalRecord} from '../../platform/findpitches-v3/legacy-global.mjs';
import {hash} from '../../platform/findpitches-v3/contract.mjs';

export async function recoverLegacyGlobal({credentialsFile,stateDirectory,archiveDirectory,outDirectory,maximum=50}) {
  if(!Number.isInteger(maximum)||maximum<1||maximum>50)throw Error('legacy_global_recovery_limit_1_to_50_required');
  fs.mkdirSync(outDirectory,{recursive:true,mode:0o700});
  const save=(name,value)=>fs.writeFileSync(path.join(outDirectory,name),JSON.stringify(value,null,2)+'\n',{mode:0o600});
  const manifestBytes=fs.readFileSync(path.join(archiveDirectory,'manifest-private.json'),'utf8'),manifest=JSON.parse(manifestBytes),manifestHash=await hash(manifestBytes);
  const groups=JSON.parse(fs.readFileSync(path.join(archiveDirectory,'candidate-groups-private.json')));
  const documents=JSON.parse(fs.readFileSync(path.join(archiveDirectory,'direct-verification-private.json')));
  if(manifest.worker!=='findpitches-global-acquisition-shadow'||manifest.read_errors||groups.length>maximum)throw Error('complete_bounded_legacy_archive_required');
  const receipts=new Map(manifest.rows.map(r=>[r.id,r])),entries=[];
  for(const group of groups) {
    const original=group.latest.row,id=group.latest.workflow_id,receipt=receipts.get(id);
    if(!receipt||!/^ukctl-[a-zA-Z0-9_-]+$/.test(id))throw Error('legacy_global_workflow_custody_required');
    const bytes=fs.readFileSync(path.join(archiveDirectory,'workflows',id+'.json'),'utf8');
    if(await hash(bytes)!==receipt.sha256)throw Error('legacy_global_archive_hash_mismatch');
    const retained=JSON.parse(bytes).output,originalHash=await hash(original);
    if(!retained?.customer_ready_rows||!(await Promise.all(retained.customer_ready_rows.map(r=>hash(r)))).includes(originalHash))throw Error('legacy_global_original_row_custody_required');
    const visit=documents.find(d=>d.url===group.url);
    if(!visit)throw Error('legacy_global_source_visit_required');
    const document=JSON.parse(fs.readFileSync(visit.file));
    if(document.html&&await hash(document.html)!==document.content_hash)throw Error('legacy_global_source_document_hash_mismatch');
    const outcome=await legacyGlobalRecord({original,document,custody:{archive_manifest_sha256:manifestHash,workflow_id:id,workflow_receipt_sha256:receipt.sha256,original_record_sha256:originalHash}});
    entries.push({url:group.url,occurrences:group.occurrences,...outcome});
  }
  save('prepared-private.json',entries);
  const {db,call}=await shadowContext({credentialsFile,stateDirectory}),initial=await call('api','/status');assertFreeGrowth(initial);
  const baselineFile=path.join(outDirectory,'baseline-private.json');
  const baseline=fs.existsSync(baselineFile)?JSON.parse(fs.readFileSync(baselineFile)):{as_of:initial.now,rows:await commercialRows(db),immutable:await immutableDigests(db),paid_queries:initial.commercial.kpis.paid_acquisition_queries};
  assertFreeGrowth(initial,baseline.paid_queries);save('baseline-private.json',baseline);
  const imported=[],records=entries.filter(r=>r.record);
  for(let start=0;start<records.length;start+=5) {
    const result=await call('ingest','/legacy-global/import',{records:records.slice(start,start+5).map(r=>r.record)});
    if(result.rejected)throw Error('legacy_global_import_rejected');imported.push(result);
    for(const role of ['reconcile','eligibility','enrichment','readiness'])await call(role,'/tick',{limit:10});
  }
  const recordIds=[...new Set(imported.flatMap(r=>r.record_ids))];
  const deadline=Date.now()+180000;let decisions=[];
  for(;;) {
    decisions=(await db.prepare('SELECT record_id,outcome,entity_id,reason FROM reconciliation_decisions WHERE record_id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(recordIds)).all()).results;
    const entityIds=[...new Set(decisions.map(r=>r.entity_id).filter(Boolean))];
    const pending=await db.prepare(`SELECT COUNT(*) AS n,SUM(status='dead') AS dead FROM jobs WHERE status IN ('ready','leased','dead') AND stage IN ('reconcile','eligibility','enrichment','readiness') AND available_at<=? AND (json_extract(payload_json,'$.record_id') IN (SELECT value FROM json_each(?)) OR json_extract(payload_json,'$.entity_id') IN (SELECT value FROM json_each(?)))`).bind(new Date().toISOString(),JSON.stringify(recordIds),JSON.stringify(entityIds)).first();
    if(pending.dead)throw Error('legacy_global_dead_job');if(decisions.length===recordIds.length&&!pending.n)break;
    if(Date.now()>deadline)throw Error('legacy_global_pipeline_unsettled');
    for(const role of ['reconcile','eligibility','enrichment','readiness'])await call(role,'/tick',{limit:10});await wait(2000);
  }
  const final=await call('api','/status');assertFreeGrowth(final,baseline.paid_queries);
  const rows=await commercialRows(db),rowsAt=new Date().toISOString(),after=await immutableDigests(db),mutations=sourceMutationCount(baseline.immutable,after);
  const growth=growthOutcome(baseline.rows,rows,{beforeAt:baseline.as_of,now:rowsAt}),priorIds=new Set(baseline.rows.map(r=>r.id)),linked=new Set(decisions.map(r=>r.entity_id).filter(Boolean));
  if(mutations||growth.identity_mutations||growth.missing_original_entities)throw Error('legacy_global_source_preservation_failed');
  const cohort=rows.map(r=>commercialEntity(r,rowsAt)).filter(r=>linked.has(r.id)),outcomes=cohort.reduce((o,r)=>(o[r.ready?'ready':r.quarantined?'quarantined':r.blocked?'blocked':'watch']++,o),{ready:0,watch:0,quarantined:0,blocked:0});
  const priorReady=new Set(baseline.rows.map(r=>commercialEntity(r,baseline.as_of)).filter(r=>r.ready).map(r=>r.id));
  const report={schema:'findpitches-legacy-global-recovery-v1',as_of:rowsAt,source_window:{from:manifest.from,to:manifest.to},archived_workflows:manifest.rows.length,archived_bytes:manifest.archive_bytes,archive_manifest_sha256:manifestHash,
    discovery_row_occurrences:groups.reduce((n,r)=>n+r.occurrences,0),distinct_source_routes:groups.length,repeat_occurrence_percent:Number((100*(groups.reduce((n,r)=>n+r.occurrences,0)-groups.length)/groups.reduce((n,r)=>n+r.occurrences,0)).toFixed(2)),
    legacy_published_additions:manifest.acquisition_manifest_additions,recovered_current_source_receipts:recordIds.length,source_routes_quarantined_without_entity:entries.filter(r=>!r.record).length,
    distinct_linked_entities:linked.size,matched_existing_entities:[...linked].filter(id=>priorIds.has(id)).length,new_shadow_entities:[...linked].filter(id=>!priorIds.has(id)).length,
    reconciliation_outcomes:decisions.reduce((o,r)=>(o[r.outcome]=(o[r.outcome]??0)+1,o),{}),cohort_outcomes:outcomes,
    newly_ready_in_recovery_cohort:cohort.filter(r=>r.ready&&!priorReady.has(r.id)).length,
    proof_reasons:entries.reduce((o,r)=>{for(const reason of r.proof_reasons??[r.reason])if(reason)o[reason]=(o[reason]??0)+1;return o},{}),
    source_mutations:mutations,baseline_receipts_verified:Object.keys(baseline.immutable.records).length,baseline_source_facts_verified:Object.keys(baseline.immutable.facts).length,identity_mutations:growth.identity_mutations,missing_original_entities:growth.missing_original_entities,
    serper_queries_added:final.commercial.kpis.paid_acquisition_queries-baseline.paid_queries,customer_rows:final.customer_rows,publication_rows:final.publication_rows,publication_enabled:final.publication_enabled,
    inventory_status_as_of:final.now,inventory_ready:final.commercial.totals.ready,legacy_global_origin:final.commercial.by_origin['legacy-global-uk'],
    interpretation:'Legacy customer-ready flags never establish V3 readiness. Current source facts are additive evidence with archive custody. Held or quarantined recovery is not customer-ready inventory. This recovery performs no V2 or legacy writes; the separately authorized legacy UK controller pause is audited independently.'};
  save('recovery-report.json',report);save('final-private.json',{as_of:rowsAt,status:final,rows,decisions});return report;
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const args={};for(let i=2;i<process.argv.length;i+=2)args[process.argv[i]]=process.argv[i+1];
  try{const report=await recoverLegacyGlobal({credentialsFile:args['--credentials'],stateDirectory:args['--state-dir'],archiveDirectory:args['--archive-dir'],outDirectory:args['--out-dir'],maximum:Number(args['--maximum']??50)});console.log(JSON.stringify(report));}
  catch(e){console.error(/^[a-z0-9_]+$/.test(e.message)?e.message:'legacy_global_recovery_failed');process.exitCode=1;}
}
