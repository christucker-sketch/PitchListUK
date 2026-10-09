// Read-only comparison against retained pre-build evidence and identity.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {shadowContext} from './shadow-context.mjs';
import {immutableDigests,sourceMutationCount} from './controlled-pilot.mjs';
import {stableJson} from '../../platform/findpitches-v3/contract.mjs';
export async function auditCustomerPreservation({credentialsFile,stateDirectory,customerDirectory}) {
  const before=JSON.parse(fs.readFileSync(path.join(customerDirectory,'baseline-private.json'),'utf8')),initial=JSON.parse(fs.readFileSync(path.join(customerDirectory,'before.json'),'utf8'));
  const oldIdentities=Array.isArray(before.identities)?before.identities:Object.values(before.identities);
  if(!before.baseline?.records||!before.baseline?.facts||!oldIdentities.length||oldIdentities.some(r=>typeof r.id!=='string'))throw Error('retained_customer_build_baseline_required');
  const ctx=await shadowContext({credentialsFile,stateDirectory}),after=await immutableDigests(ctx.db),mutationCount=sourceMutationCount(before.baseline,after);
  const identities=new Map((await ctx.db.prepare('SELECT id,market,edition,environment,shadow_only,promotion_eligible,publication_eligible FROM entities').all()).results.map(r=>[r.id,r]));
  const identityChanges=oldIdentities.filter(r=>stableJson(r)!==stableJson(identities.get(r.id))).length,status=await ctx.call('api','/status'),project=await ctx.api.accountRequest('/pages/projects/pitchlistuk'),v2=await ctx.api.accountRequest('/workers/scripts/findpitches-v2-shadow/schedules');
  let denied=false;try{await ctx.call('api','/v1/opportunities');}catch(e){denied=e.message.startsWith('shadow_http_403_');}
  const report={schema:'findpitches-v3-customer-preview-preservation-v1',as_of:new Date().toISOString(),receipts_compared:Object.keys(before.baseline.records).length,source_facts_compared:Object.keys(before.baseline.facts).length,existing_identities_compared:oldIdentities.length,destructive_source_mutations:mutationCount,existing_identity_changes:identityChanges,identity_comparison_key:'retained entity.id',customer_projection_rows:status.customer_rows,publication_queue_rows:status.publication_rows,publication_api_denied:denied,publication_enabled:status.publication_enabled,paid_queries_today:status.serper.usage.day_queries_attempted,paid_bulk_enabled:status.serper.bulk_enabled,live_v1_deployment_unchanged:initial.live_v1.production_deployment===project.canonical_deployment?.id,v2_schedules:v2.schedules,v2_schedules_unchanged:stableJson(initial.spend_controls.v2_schedules)===stableJson(v2.schedules)};
  fs.writeFileSync(path.join(customerDirectory,'preservation-report.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
  if(mutationCount||identityChanges||report.customer_projection_rows||report.publication_queue_rows||report.publication_enabled||!denied||report.paid_queries_today||report.paid_bulk_enabled||!report.live_v1_deployment_unchanged||!report.v2_schedules_unchanged)throw Error('customer_preview_preservation_failed');return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const a=process.argv.slice(2),get=k=>a[a.indexOf(k)+1];try{console.log(JSON.stringify(await auditCustomerPreservation({credentialsFile:get('--credentials'),stateDirectory:get('--state-dir'),customerDirectory:get('--customer-dir')})));}catch(e){console.error(/^[a-z0-9_]+$/.test(e.message)?e.message:'customer_preservation_audit_failed');process.exitCode=1;}}
