// Read-only operator checkpoint. This tooling is not a subscriber runtime dependency.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {shadowContext} from './shadow-context.mjs';
import {commercialRows,commercialEntity,inventoryFromRows} from '../../platform/findpitches-v3/commercial.mjs';
import {auditLegacyPaid,auditLegacyWorkflowHistory} from './legacy-paid-safety.mjs';
const QUERIES={
  latest_producer_units:`WITH ranked AS (SELECT r.id,r.market,r.producer_record_id,ROW_NUMBER() OVER(PARTITION BY r.market,r.producer_record_id ORDER BY julianday(json_extract(r.normalized_json,'$.last_checked')) DESC,r.received_at DESC,r.id DESC) AS ordinal FROM producer_records r WHERE r.producer_name='independent-structured' AND r.environment='shadow' AND r.validation_status='accepted') SELECT r.market,r.producer_record_id,r.id AS latest_record_id,er.entity_id,d.outcome,d.reason FROM ranked r LEFT JOIN entity_records er ON er.record_id=r.id LEFT JOIN reconciliation_decisions d ON d.record_id=r.id WHERE r.ordinal=1`,
  receipt_funnel:`SELECT market,validation_status,COUNT(*) AS receipts,COUNT(DISTINCT producer_record_id) AS producer_ids,MAX(received_at) AS last_receipt_at,MAX(json_extract(normalized_json,'$.last_checked')) AS latest_source_check FROM producer_records WHERE producer_name='independent-structured' AND environment='shadow' GROUP BY market,validation_status`,
  identity_variants:`SELECT r.market,r.producer_record_id,COUNT(DISTINCT er.entity_id) AS linked_entities,json_group_array(DISTINCT e.edition) AS editions FROM producer_records r JOIN entity_records er ON er.record_id=r.id JOIN entities e ON e.id=er.entity_id WHERE r.producer_name='independent-structured' AND r.environment='shadow' GROUP BY r.market,r.producer_record_id HAVING COUNT(DISTINCT er.entity_id)>1`,
  due_jobs:`SELECT stage,status,COUNT(*) AS jobs FROM jobs WHERE (status IN ('ready','dead') AND available_at<=?) OR (status='leased' AND lease_until<=?) GROUP BY stage,status`,
  leakage:`SELECT (SELECT COUNT(*) FROM customer_projections) AS customer_rows,(SELECT COUNT(*) FROM publication_queue) AS publication_rows`,
  counts:`SELECT (SELECT COUNT(*) FROM producer_records) AS immutable_receipts,(SELECT COUNT(*) FROM source_facts) AS immutable_source_facts`
};
export async function preparationAudit({credentialsFile,stateDirectory,includeWorkflowHistory=false}) {
  const ctx=await shadowContext({credentialsFile,stateDirectory}),now=new Date().toISOString(),raw={};
  for(const [name,query] of Object.entries(QUERIES))raw[name]=(await ctx.db.prepare(query).bind(...(name==='due_jobs'?[now,now]:[])).all()).results;
  const rows=await commercialRows(ctx.db),inventory=inventoryFromRows(rows,{now}),byId=new Map(rows.map(r=>[r.id,commercialEntity(r,now)]));
  const producer={};
  for(const unit of raw.latest_producer_units) {
    const group=producer[unit.market]??={accepted_producer_units:0,latest_receipt_linked:0,latest_receipt_unlinked:0,ready_units:0,watch_units:0,quarantined_units:0,blocked_units:0,dominant_reasons:{}};
    group.accepted_producer_units++;
    const entity=byId.get(unit.entity_id);
    if(!entity){group.latest_receipt_unlinked++;continue;}
    group.latest_receipt_linked++;
    for(const [flag,key] of [['ready','ready_units'],['watch','watch_units'],['quarantined','quarantined_units'],['blocked','blocked_units']])if(entity[flag])group[key]++;
    if(!entity.ready)for(const reason of entity.reasons)group.dominant_reasons[reason]=(group.dominant_reasons[reason]??0)+1;
  }
  const legacy=await auditLegacyPaid(ctx.api),v2Schedules=await ctx.api.accountRequest('/workers/scripts/findpitches-v2-shadow/schedules'),project=await ctx.api.accountRequest('/pages/projects/pitchlistuk');
  const liveStatus=await ctx.call('api','/status');
  const summary={schema:'findpitches-v3-customer-preparation-v1',as_of:now,timezone:'Europe/London',mode:'shadow',build4:{handoff_received:false,positive_identification:false,copied:false,integration_started:false},
    customer_application:liveStatus.customer_application??{status:'preparation_status_not_deployed'},inventory,producer_funnel:{latest_accepted_units_by_country:producer,receipts_by_country:raw.receipt_funnel,
      identity_variant_producer_ids:raw.identity_variants.length,definition:'Units use the latest accepted source-check revision per country and producer ID. Unit counts are not distinct entity counts; origin attribution and producer membership are separate. Producer usable counts/export manifest are not supplied.'},
    structured_delivery:liveStatus.structured_delivery,due_jobs:raw.due_jobs,leakage:raw.leakage[0],source_counts:raw.counts[0],paid_queries_today:liveStatus.serper.usage.day_queries_attempted,
    spend_controls:{legacy_flags:legacy.flags,legacy_controllers_stopped:legacy.all_flags_disabled,v2_schedules:v2Schedules.schedules,account_wide_lock:false,external_paid_client_attribution:'Not yet supplied by the independent producer; do not re-enable paid work.',...(includeWorkflowHistory?{legacy_workflows:await auditLegacyWorkflowHistory(ctx.api)}:{})},
    live_v1:{production_deployment:project.canonical_deployment?.id,read_only:true},
    blocked_waiting_for:['authoritative_build4_handoff','producer_recheck_execution_and_acknowledgement_breakdown','producer_uk_usable_count_and_manifest'],subscriber_preview_ready:false};
  fs.writeFileSync(path.join(stateDirectory,'customer-preparation-detail-private.json'),JSON.stringify({summary,raw},null,2)+'\n',{mode:0o600});
  return summary;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2),get=n=>args[args.indexOf(n)+1];
  try {
    if(!args.includes('--credentials')||!args.includes('--state-dir'))throw Error('credentials_and_state_directory_required');
    const summary=await preparationAudit({credentialsFile:get('--credentials'),stateDirectory:get('--state-dir'),includeWorkflowHistory:args.includes('--full-workflow-audit')});
    if(args.includes('--out'))fs.writeFileSync(get('--out'),JSON.stringify(summary,null,2)+'\n',{mode:0o600});
    console.log(JSON.stringify({as_of:summary.as_of,commercial_ready:summary.inventory.totals.ready,ready_by_country:summary.inventory.ready_by_country,producer_funnel:summary.producer_funnel.latest_accepted_units_by_country,rechecks:summary.structured_delivery.rechecks??null,spend_controls:summary.spend_controls,subscriber_preview_ready:false},null,2));
  }catch(error){console.error(/^[a-z][a-z0-9_]+$/.test(error.message)?error.message:'customer_preparation_audit_failed');process.exitCode=1;}
}
