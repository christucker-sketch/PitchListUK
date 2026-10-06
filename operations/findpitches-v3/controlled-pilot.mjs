// Explicit, bounded shadow experiment. No scheduler, no publication, no V2 access.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {shadowContext} from './shadow-context.mjs';
import {stableJson} from '../../platform/findpitches-v3/contract.mjs';
import {pilotMetrics,PILOT_LIMITS} from '../../platform/findpitches-v3/pilot.mjs';
import {nextBudgetDay} from '../../platform/findpitches-v3/serper-usage.mjs';

const digest=row=>createHash('sha256').update(stableJson(row)).digest('hex');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function immutableDigests(db) {
  async function table(name) {
    const rows={};let after='';
    for(;;) {
      const page=(await db.prepare(`SELECT * FROM ${name} WHERE id>? ORDER BY id LIMIT 250`).bind(after).all()).results;
      if(!page.length)break;
      for(const row of page)rows[row.id]=digest(row);
      after=page.at(-1).id;
    }
    return rows;
  }
  const [records,facts]=await Promise.all([table('producer_records'),table('source_facts')]);
  return {records,facts};
}
export function sourceMutationCount(before,after) {
  let mutations=0;
  for(const table of ['records','facts'])for(const [id,hash] of Object.entries(before[table]))if(after[table][id]!==hash)mutations++;
  return mutations;
}
export async function runControlledPilot({credentialsFile,stateDirectory,outDirectory,maxQueries=240}) {
  fs.mkdirSync(outDirectory,{recursive:true,mode:0o700});
  const {db,call}=await shadowContext({credentialsFile,stateDirectory});
  const initial=await call('api','/status');
  if(initial.customer_rows||initial.publication_rows||initial.publication_enabled||initial.serper.bulk_enabled
    ||stableJson(initial.serper.limits)!==stableJson({queries_per_run:4,queries_per_hour:100,queries_per_day:1000,credits_per_run:4,credits_per_hour:100,credits_per_day:1000}))throw Error('shadow_hard_limits_required');
  const baseline=await immutableDigests(db);
  fs.writeFileSync(path.join(outDirectory,'immutable-baseline-private.json'),JSON.stringify(baseline),{mode:0o600});
  let pilot=null,reason=null,mutations=0;const runs=[];
  try {
    // Avoid fragmenting a useful warm-up across the daily reset. Every sleep is bounded.
    while(Date.parse(nextBudgetDay(new Date().toISOString()))-Date.now()<20*60000) {
      console.log('Waiting for the London budget-day reset before granting paid work.');
      await sleep(Math.min(30000,Date.parse(nextBudgetDay(new Date().toISOString()))-Date.now()+100));
    }
    pilot=await call('acquisition','/acquisition/pilot/start',{max_queries:maxQueries,daily_ceiling:250});
    fs.writeFileSync(path.join(outDirectory,'pilot-grant.json'),JSON.stringify(pilot,null,2)+'\n',{mode:0o600});
    while(Date.now()<Date.parse(pilot.expires_at)) {
      let grant;
      try {grant=await call('acquisition','/acquisition/pilot/next',{pilot_id:pilot.id});}
      catch(error) {
        const state=await db.prepare('SELECT status,stop_reason FROM acquisition_pilots WHERE id=?').bind(pilot.id).first();
        if(state?.status==='paused'){reason=state.stop_reason;break;}throw error;
      }
      if(grant.complete){reason='pilot_budget_or_plan_complete';break;}
      if(grant.waiting){await sleep(30000);continue;}
      console.log(JSON.stringify({pilot_run:runs.length+1,city:grant.city,maximum_queries:grant.query_limit}));
      await call('acquisition','/tick',{});
      const deadline=Math.min(Date.now()+240000,Date.parse(pilot.expires_at));
      let settled=false;
      while(Date.now()<deadline) {
        const run=await db.prepare('SELECT status FROM acquisition_runs WHERE id=?').bind(grant.run_id).first();
        const metrics=await pilotMetrics(db,pilot.id);
        if(metrics.customer_rows||metrics.publication_rows||metrics.publication_enabled||metrics.bulk_enabled)throw Error('shadow_scope_leakage');
        if(metrics.due_jobs>PILOT_LIMITS.max_due_jobs||metrics.oldest_due_seconds>PILOT_LIMITS.max_oldest_due_seconds)throw Error('queue_backlog');
        if(run?.status==='failed')throw Error('paid_run_failed_requires_review');
        if(run?.status==='complete'&&metrics.pending_records===0&&metrics.due_jobs===0){settled=true;break;}
        await sleep(3000);
      }
      if(!settled)throw Error('reconciliation_did_not_settle');
      const current=await immutableDigests(db);
      mutations=Math.max(mutations,sourceMutationCount(baseline,current));
      if(mutations)throw Error('source_preservation_failed');
      // Include newly acquired receipts/facts in every subsequent integrity check.
      Object.assign(baseline.records,current.records);Object.assign(baseline.facts,current.facts);
      const metrics=await pilotMetrics(db,pilot.id);runs.push({run_id:grant.run_id,city:grant.city,cumulative_metrics:metrics});
      fs.writeFileSync(path.join(outDirectory,'pilot-progress.json'),JSON.stringify({pilot_id:pilot.id,runs},null,2)+'\n',{mode:0o600});
    }
    if(!reason)reason='pilot_expired';
  } catch(error) {
    reason=/^[a-z0-9_]+$/.test(error.message)?error.message:'pilot_operator_failed_requires_review';
  } finally {
    if(pilot)await call('acquisition','/acquisition/pilot/stop',{pilot_id:pilot.id,reason:reason??'operator_stopped'});
  }
  if(!pilot)throw Error(reason??'pilot_start_failed');
  const current=await immutableDigests(db);mutations=Math.max(mutations,sourceMutationCount(baseline,current));
  const final=await call('api','/status'),session=final.controlled_pilot.sessions.find(s=>s.id===pilot.id);
  const report={schema:'findpitches-controlled-pilot-report-v1',as_of:new Date().toISOString(),budget_timezone:final.serper.timezone,
    pilot_id:pilot.id,budget_day:session.budget_day,status:session.status,stop_reason:session.stop_reason??reason,
    intended_maximum_queries:maxQueries,total_daily_v3_ceiling:250,global_limits:final.serper.limits,pilot_limits:PILOT_LIMITS,
    metrics:{...session.metrics,source_mutations:mutations},runs,run_telemetry:final.serper.runs.filter(r=>runs.some(g=>g.run_id===r.run_id)),day_usage:final.serper.usage,pricing_status:final.serper.pricing_status,
    immutable_records_verified:Object.keys(baseline.records).length,immutable_source_fields_verified:Object.keys(baseline.facts).length,
    customer_rows:final.customer_rows,publication_rows:final.publication_rows,publication_enabled:final.publication_enabled,
    bulk_enabled:final.serper.bulk_enabled,structured_delivery:final.structured_delivery,
    interpretation:'Search snippets remain immutable evidence, with UNKNOWN availability and no inferred venue. No readiness is manufactured from query geography or search snippets. Ready yield measures current shared entities; new-ready denominator prevents crediting previously ready entities.',
    recommendation:session.metrics.new_ready_opportunities?'Review source quality before any further bounded trial; continuous bulk remains disabled.':'Keep paid acquisition disabled pending source verification improvements; the early-stop result does not justify a 250/day standing allowance.'};
  fs.writeFileSync(path.join(outDirectory,'pilot-report.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
  if(mutations||final.customer_rows||final.publication_rows)throw Error('final_integrity_or_leakage_failed');
  return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2),get=name=>args[args.indexOf(name)+1];
  try {const report=await runControlledPilot({credentialsFile:get('--credentials'),stateDirectory:get('--state-dir'),outDirectory:get('--out-dir')});console.log(JSON.stringify({queries:report.metrics.queries,candidates:report.metrics.candidates,entities:report.metrics.entities_created,ready:report.metrics.new_ready_opportunities,stop_reason:report.stop_reason}));}
  catch(error){console.error(/^[a-z0-9_]+$/.test(error.message)?error.message:'bounded_pilot_failed');process.exitCode=1;}
}
