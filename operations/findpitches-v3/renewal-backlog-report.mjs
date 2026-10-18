// Read-only triage. IDs, facts, source excerpts and producer exports remain
// private. Existing requests are counted, never cleared or acknowledged here.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {parseArgs} from 'node:util';
import {shadowContext} from './shadow-context.mjs';
import {commercialRows,commercialEntity} from '../../platform/findpitches-v3/commercial.mjs';
import {sourceDatePast} from '../../platform/findpitches-v3/source-calendar.mjs';
import {automaticWatchDecision,AUTOMATIC_WATCH_POLICY,renewalStatus} from '../../platform/findpitches-v3/source-renewal.mjs';
const add=(map,key)=>{map[key]=(map[key]??0)+1;};
export function renewalBacklogSummary({rows,requests,readyIds,assessments=[],now}){
 if(rows.length>25000||requests.length>25000)throw Error('bounded_renewal_report_required');
 const current=new Set(readyIds),assessed=new Map(assessments.map(r=>[r.entity_id,r])),evaluated=rows.map(r=>commercialEntity(r,now)),byId=new Map(evaluated.map(r=>[r.id,r])),policy={},origins={},producer={},countries={};let excluded=0,unattributed=0,structuredPending=0,commercialPending=0;
 for(const r of evaluated.filter(r=>r.commercial)){
  const decision=automaticWatchDecision({...r,...r.fields},{now,assessedAt:assessed.get(r.id)?.evaluated_at,readinessStatus:r.cached_readiness,verification:{...r.proof,reasons:r.reasons,checked_at:r.checked_at,expires_at:r.expires_at},conflicts:r.conflicts,qualityHolds:r.quality_holds});
  add(policy,decision.reason);origins[r.origin]??={};add(origins[r.origin],decision.reason);
 }
 for(const q of requests){
  const r=byId.get(q.entity_id);if(!r){unattributed++;continue;}if(!r.commercial){excluded++;continue;}commercialPending++;
  if(!JSON.parse(r.producers_json??'[]').includes('independent-structured'))continue;structuredPending++;
  const decision=automaticWatchDecision({...r,...r.fields},{now,assessedAt:assessed.get(r.id)?.evaluated_at,readinessStatus:r.cached_readiness,verification:{...r.proof,reasons:r.reasons,checked_at:r.checked_at,expires_at:r.expires_at},conflicts:r.conflicts,qualityHolds:r.quality_holds});
  const f=r.fields,key=current.has(r.id)?'currently_customer_ready':r.conflicts||r.quality_holds?'identity_or_quality_review_required':sourceDatePast(f.event_end,now)?'past_event_requires_new_evidence':['CLOSED','WITHDRAWN'].includes(f.application_state)||f.lifecycle_state==='WITHDRAWN'?'source_declared_closed':decision.reason==='source_purpose_review_required'?decision.reason:!f.event_start&&!f.event_end?'event_date_missing':!f.organiser||!f.location||!f.application_url?'core_source_fields_missing':r.proof.facts?.application_state==='CLOSED'?'proof_application_closed':r.proof.reasons?.includes('source_http_520')?'source_access_requires_review':'future_source_proof_gap';
  add(producer,key);countries[r.market]??={};add(countries[r.market],key);
 }
 const ready=policy.ready_proof_refresh??0,near=policy.near_event_watch??0,weak=policy.unproved_discovery_watch??0,review=(policy.past_event_requires_new_evidence??0)+(policy.identity_or_quality_review_required??0)+(policy.source_purpose_review_required??0);
 return {schema:'findpitches-v3-renewal-backlog-v1',as_of:now,commercial_entities:evaluated.filter(r=>r.commercial).length,pending_requests_all_scopes:requests.length,pending_commercial_requests:commercialPending,pending_structured_commercial_requests:structuredPending,excluded_noncommercial_requests:excluded,unattributed_requests:unattributed,structured_pending_dispositions:producer,structured_pending_by_country:countries,automatic_watch_policy:AUTOMATIC_WATCH_POLICY,policy_dispositions_all_commercial:policy,policy_dispositions_by_origin:origins,
  cadence_scenario:{before_entity_rechecks_per_day:ready*24/22+near+weak+review,after_entity_rechecks_per_day:ready*24/22+near+weak/7,review_or_new_evidence_entities:review,not_yet_assessed:policy.unassessed_source_requires_recheck??0,interpretation:'Policy scenario for these states, excluding unassessed entities. Entity rechecks are not HTTP requests; supporting fetches/retries vary. This is not measured post-deployment saving or an inventory/expiry change.'},
  read_only:true,requests_cleared:0,source_facts_changed:0,serper_queries:0,interpretation:'Sequential live reads, not an atomic snapshot. Producer requests, V3 proof retries and current customer eligibility are separate. Existing requests remain pending until their original exact fresh-evidence acknowledgement or reviewed-obsolete contract is met. New producer facts and explicit operator verification still enter the normal evidence path.'};
}
export async function renewalBacklogReport(c){
 const now=new Date().toISOString(),rows=await commercialRows(c.db,{pageSize:1000}),requests=(await c.db.prepare('SELECT entity_id,requested_at,reason FROM recheck_requests').all()).results,assessments=(await c.db.prepare('SELECT entity_id,evaluated_at FROM readiness').all()).results,snapshot=await c.catalogue(),out=renewalBacklogSummary({rows,requests,assessments,readyIds:snapshot.items.map(r=>r.id),now});
 out.customer_snapshot_as_of=snapshot.as_of;out.current_customer_ready=snapshot.items.length;out.proof_renewal=await renewalStatus(c.db,now);out.completed_at=new Date().toISOString();return out;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const {values}=parseArgs({options:{'credentials-file':{type:'string'},'state-dir':{type:'string'},output:{type:'string'}}});if(!values.output)throw Error('output_path_required');const c=await shadowContext({credentialsFile:values['credentials-file'],stateDirectory:values['state-dir']}),report=await renewalBacklogReport(c);fs.writeFileSync(values.output,JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(report));
}
