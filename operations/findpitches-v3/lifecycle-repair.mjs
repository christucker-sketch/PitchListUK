// Bounded repair of derived producer-observation conflicts. No source rewrites.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as wait} from 'node:timers/promises';
import {shadowContext} from './shadow-context.mjs';
import {immutableDigests,sourceMutationCount} from './controlled-pilot.mjs';
import {assertFreeGrowth,growthOutcome} from './inventory-scale.mjs';
import {commercialRows,commercialEntity,inventoryFromRows} from '../../platform/findpitches-v3/commercial.mjs';

export async function runLifecycleRepair({credentialsFile,stateDirectory,outDirectory,maximum=250,priorityBaselineFile=null}) {
  if(!Number.isInteger(maximum)||maximum<1||maximum>250)throw Error('lifecycle_repair_limit_1_to_250_required');
  fs.mkdirSync(outDirectory,{recursive:true,mode:0o700});
  const save=(name,value)=>fs.writeFileSync(path.join(outDirectory,name),JSON.stringify(value,null,2)+'\n',{mode:0o600});
  const {db,call}=await shadowContext({credentialsFile,stateDirectory});
  const initial=await call('api','/status');assertFreeGrowth(initial);
  const baselineFile=path.join(outDirectory,'baseline-private.json');
  const baseline=fs.existsSync(baselineFile)?JSON.parse(fs.readFileSync(baselineFile)):{as_of:initial.now,rows:await commercialRows(db),immutable:await immutableDigests(db),paid_queries:initial.commercial.kpis.paid_acquisition_queries};
  assertFreeGrowth(initial,baseline.paid_queries);save('baseline-private.json',baseline);
  const priority=priorityBaselineFile?JSON.parse(fs.readFileSync(priorityBaselineFile)):baseline;
  const previouslyReady=new Set(priority.rows.map(r=>commercialEntity(r,priority.as_of)).filter(r=>r.commercial&&r.ready).map(r=>r.id));
  const candidates=(await db.prepare(`SELECT c.entity_id,COUNT(*) AS conflicts FROM conflicts c JOIN producer_records p ON p.id=c.record_id
    JOIN entities e ON e.id=c.entity_id WHERE c.resolved=0 AND c.field_name='lifecycle_state' AND c.reason='equal_authority_disagreement'
    AND e.environment='shadow' AND p.environment='shadow' AND p.producer_name='independent-structured' AND p.validation_status='accepted'
    AND json_extract(p.normalized_json,'$.lifecycle_state') IN ('NEW','UPDATED','UNCHANGED') GROUP BY c.entity_id ORDER BY c.entity_id`).all()).results
    .sort((a,b)=>Number(previouslyReady.has(b.entity_id))-Number(previouslyReady.has(a.entity_id))||a.entity_id.localeCompare(b.entity_id)).slice(0,maximum);
  save('candidate-ids-private.json',candidates);const results=[];
  async function settle() {
    const ids=results.map(r=>r.entity_id),deadline=Date.now()+180000;
    for(;;) {
      const now=new Date().toISOString(),q=await db.prepare(`SELECT COUNT(*) AS pending,SUM(status='dead') AS dead FROM jobs
        WHERE stage IN ('eligibility','enrichment','readiness') AND status IN ('ready','leased','dead')
        AND available_at<=? AND json_extract(payload_json,'$.entity_id') IN (SELECT value FROM json_each(?))`).bind(now,JSON.stringify(ids)).first();
      if(q.dead)throw Error('lifecycle_repair_dead_job');if(!q.pending)return;
      if(Date.now()>deadline)throw Error('lifecycle_repair_pipeline_not_settled');
      // Ordinary leased stage execution only; never write READY or proof directly.
      for(const role of ['eligibility','enrichment','readiness'])await call(role,'/tick',{limit:25});
      await wait(2000);
    }
  }
  for(const target of candidates) {
    const result=await call('reconcile','/lifecycle/repair',{entity_id:target.entity_id});results.push(result);save('progress-private.json',results);
    if(results.length%5===0){await settle();console.log(JSON.stringify({entities_rechecked:results.length,maximum:candidates.length,false_conflicts_resolved:results.reduce((n,r)=>n+r.resolved_conflicts,0)}));}
    await wait(1000);
  }
  await settle();const final=await call('api','/status');assertFreeGrowth(final,baseline.paid_queries);
  const rows=await commercialRows(db),after=await immutableDigests(db),mutations=sourceMutationCount(baseline.immutable,after);
  const growth=growthOutcome(baseline.rows,rows,{beforeAt:baseline.as_of,now:final.now}),ids=new Set(results.map(r=>r.entity_id));
  const affected=rows.map(r=>commercialEntity(r,final.now)).filter(r=>ids.has(r.id));
  if(mutations||growth.identity_mutations||growth.missing_original_entities)throw Error('lifecycle_repair_preservation_failed');
  const dispositions=affected.reduce((o,r)=>(o[r.ready?'ready':r.quarantined?'quarantined':r.blocked?'blocked':'watch']++,o),{ready:0,watch:0,quarantined:0,blocked:0});
  const blockers={};for(const r of affected.filter(r=>!r.ready))for(const reason of r.reasons)blockers[reason]=(blockers[reason]??0)+1;
  const report={schema:'findpitches-v3-lifecycle-repair-v1',as_of:final.now,baseline_as_of:baseline.as_of,maximum,entities_rechecked:results.length,
    previously_ready_entities_rechecked:results.filter(r=>previouslyReady.has(r.entity_id)).length,false_conflicts_resolved:results.reduce((n,r)=>n+r.resolved_conflicts,0),
    source_mutations:mutations,baseline_receipts_verified:Object.keys(baseline.immutable.records).length,baseline_source_facts_verified:Object.keys(baseline.immutable.facts).length,
    additional_serper_queries:0,...growth,affected_dispositions:dispositions,remaining_blockers:blockers,inventory:inventoryFromRows(rows,{now:final.now}),
    customer_rows:final.customer_rows,publication_rows:final.publication_rows,publication_enabled:final.publication_enabled,bulk_paid_enabled:final.serper.bulk_enabled,
    interpretation:'Only informational lifecycle conflicts were resolved, with immutable provenance. Source facts and selected lifecycle were not rewritten. Normal eligibility, direct verification and readiness still decide every opportunity.'};
  save('repair-report.json',report);save('final-private.json',{as_of:final.now,status:final,rows});return report;
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const args={};for(let i=2;i<process.argv.length;i+=2)args[process.argv[i]]=process.argv[i+1];
  try{const r=await runLifecycleRepair({credentialsFile:args['--credentials'],stateDirectory:args['--state-dir'],outDirectory:args['--out-dir'],maximum:Number(args['--maximum']??250),priorityBaselineFile:args['--priority-baseline']});console.log(JSON.stringify({ready:r.ready_after,ready_gained:r.ready_gained,affected:r.entities_rechecked,resolved:r.false_conflicts_resolved,source_mutations:r.source_mutations}));}
  catch(e){console.error(/^[a-z0-9_]+$/.test(e.message)?e.message:'lifecycle_repair_operator_failed');process.exitCode=1;}
}
