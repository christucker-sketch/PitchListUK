// Operator-run, free official GB programme. No standing acquisition schedule.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {shadowContext} from './shadow-context.mjs';
import {commercialRows,inventoryFromRows} from '../../platform/findpitches-v3/commercial.mjs';
import {immutableDigests,sourceMutationCount} from './controlled-pilot.mjs';
import {assertFreeGrowth} from './inventory-scale.mjs';
const save=(dir,name,value)=>fs.writeFileSync(path.join(dir,name),JSON.stringify(value,null,2)+'\n',{mode:0o600});
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export function ukGrowthStop(results,health={}) {
  if(health.source_mutations)return 'source_integrity_failure';if(health.customer_rows||health.publication_rows)return 'shadow_scope_leakage';if(health.due_jobs>40)return 'verification_backlog';
  if(results.some(r=>r.status==='failed'))return 'failed_custody_or_import';
  if(results.length>=50&&!results.some(r=>r.readiness==='ready'))return 'zero_ready_after_warmup';
  if(results.length>=100&&results.slice(-50).filter(r=>r.readiness==='ready').length<2)return 'diminishing_ready_yield';return null;
}
export async function runUKGrowth({credentialsFile,stateDirectory,outDirectory,maxVisits=100,maxCandidates=300,sources=null,baselineFile=null}) {
  fs.mkdirSync(outDirectory,{recursive:true,mode:0o700});const {db,call}=await shadowContext({credentialsFile,stateDirectory});
  const initial=await call('api','/status');assertFreeGrowth(initial);
  const baseline=baselineFile?JSON.parse(fs.readFileSync(baselineFile)):{as_of:initial.now,paid_queries:initial.commercial.kpis.paid_acquisition_queries,rows:await commercialRows(db),immutable:await immutableDigests(db)};
  baseline.paid_queries??=baseline.status?.commercial?.kpis?.paid_acquisition_queries;save(outDirectory,'uk-baseline-private.json',baseline);
  const run=await call('enrichment','/uk/start',{max_visits:maxVisits,max_candidates:maxCandidates});save(outDirectory,'uk-run-private.json',run);
  if(sources&&(!Array.isArray(sources)||sources.length<1||sources.length>25))throw Error('bounded_uk_source_list_required');
  const index=sources?{venues:sources,source:'retained_official_programme_routes'}:await call('enrichment','/uk/discover',{run_id:run.id,url:'https://www.myntimage.co.uk/events/'}),discoveries=[index],results=[];let stop=null;
  try {
    for(const url of index.venues??[]) {
      if(stop)break;await wait(1500);
      const discovery=await call('enrichment','/uk/discover',{run_id:run.id,url});discoveries.push(discovery);save(outDirectory,'uk-discovery-private.json',discoveries);
      // Complete a venue while its shared raw proof is genuinely fresh. Closed
      // slots and unbound forms remain holds and are never imported to pad size.
      for(const candidate of discovery.candidates??[]) {
        if(candidate.status==='held'){results.push({candidate_id:candidate.id,status:'held',reason:candidate.reason});continue;}
        let outcome;
        try {outcome=await call('enrichment','/uk/import',{candidate_id:candidate.id});}
        catch(e) {
          // A reply can be lost after an import. Read immutable custody before
          // deciding; never blindly retry a leased/partially committed record.
          const durable=await db.prepare('SELECT status,reason,entity_id,record_id,identity_outcome FROM uk_source_progress WHERE candidate_id=?').bind(candidate.id).first();
          if(durable?.status!=='imported')throw e;outcome={candidate_id:candidate.id,...durable,readiness:durable.reason,recovered_committed_response:true};
        }
        results.push(outcome);save(outDirectory,'uk-progress-private.json',results);stop=ukGrowthStop(results);if(stop)break;
      }
      const due=await db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE stage IN ('reconcile','eligibility','enrichment','readiness') AND status IN ('ready','leased') AND available_at<=?").bind(new Date().toISOString()).first();
      const boundary=await db.prepare('SELECT (SELECT COUNT(*) FROM customer_projections) AS customer_rows,(SELECT COUNT(*) FROM publication_queue) AS publication_rows').first();
      stop??=ukGrowthStop(results,{due_jobs:due.n,...boundary});
      console.log(JSON.stringify({uk_routes_checked:results.length,uk_run_ready:results.filter(r=>r.readiness==='ready').length,venue_sources:discoveries.length-1,paid_queries_added:0,stop}));
    }
    const rows=await commercialRows(db),now=new Date().toISOString(),mutation=sourceMutationCount(baseline.immutable,await immutableDigests(db)),status=await call('api','/status');assertFreeGrowth(status,baseline.paid_queries);
    if(mutation)stop='source_integrity_failure';const inventory=inventoryFromRows(rows,{now});
    const report={schema:'findpitches-v3-uk-growth-v1',as_of:now,run_id:run.id,paid_queries_added:0,source_mutations:mutation,customer_rows:status.customer_rows,publication_rows:status.publication_rows,
      routes_checked:results.length,ready_outcomes:results.filter(r=>r.readiness==='ready').length,held_sources:discoveries.filter(d=>d.held_source).map(d=>({url:d.url,reason:d.reason})),
      baseline_ready:inventoryFromRows(baseline.rows,{now:baseline.as_of}).ready_by_country,final_ready:inventory.ready_by_country,commercial_ready:inventory.totals.ready,gb:status.commercial.gb,us:status.commercial.us,stop_reason:stop??'bounded_catalogue_complete'};
    save(outDirectory,'uk-report.json',report);await call('enrichment','/uk/stop',{run_id:run.id,reason:stop??'bounded_catalogue_complete'});console.log(JSON.stringify(report));return report;
  }catch(e){await call('enrichment','/uk/stop',{run_id:run.id,reason:'custody_or_guard_requires_review'}).catch(()=>{});throw e;}
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const args={};for(let i=2;i<process.argv.length;i+=2)args[process.argv[i]]=process.argv[i+1];
  await runUKGrowth({credentialsFile:args['--credentials'],stateDirectory:args['--state-dir'],outDirectory:args['--out-dir'],maxVisits:Number(args['--max-visits']??100),maxCandidates:Number(args['--max-candidates']??300),sources:args['--source']?[args['--source']]:null,baselineFile:args['--baseline-file']??null});
}
