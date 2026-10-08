// Bounded free platform discovery, independent of the structured delivery host.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {shadowContext} from './shadow-context.mjs';
import {commercialRows,inventoryFromRows,commercialEntity} from '../../platform/findpitches-v3/commercial.mjs';
import {immutableDigests,sourceMutationCount} from './controlled-pilot.mjs';
import {assertFreeGrowth,growthOutcome} from './inventory-scale.mjs';

const SOURCES=['https://localstalls.com/sitemaps/events-au-1.xml','https://localstalls.com/sitemaps/events-nz-1.xml','https://localstalls.com/sitemaps/events-uk-1.xml','https://localstalls.com/sitemaps/events-us-1.xml','https://www.eventeny.com/sitemap/event_elements.xml'];
const save=(dir,name,data)=>fs.writeFileSync(path.join(dir,name),JSON.stringify(data,null,2)+'\n',{mode:0o600});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export function catalogueGrowthStop(results,{due_jobs=0,customer_rows=0,publication_rows=0,source_mutations=0}={}) {
  if(customer_rows||publication_rows)return 'shadow_scope_leakage';if(source_mutations)return 'source_integrity_failure';if(due_jobs>40)return 'verification_backlog';
  if(results.some(r=>r.reason?.includes('source_http_429')))return 'source_rate_limited';
  if(results.length>=50&&!results.some(r=>r.readiness==='ready'))return 'zero_ready_after_free_warmup';
  // Early successes cannot justify visiting an indefinitely stale tail. Below
  // 1% READY in the latest 200 visits, after 500 outcomes, requires review.
  if(results.length>=500&&results.slice(-200).filter(r=>r.readiness==='ready').length<2)return 'diminishing_ready_yield';return null;
}
export async function completedCatalogueOutcome(db,candidateId) {
  const r=await db.prepare(`SELECT c.id AS candidate_id,c.url,c.family AS source_family,p.status,p.reason,p.entity_id,p.record_id,
    CASE WHEN p.status='imported' THEN r.status END AS readiness,e.market AS source_country
    FROM catalogue_candidates c JOIN catalogue_progress p ON p.candidate_id=c.id LEFT JOIN entities e ON e.id=p.entity_id
    LEFT JOIN readiness r ON r.entity_id=e.id WHERE c.id=? AND p.status IN ('held','imported')`).bind(candidateId).first();
  return r?{...r,recovered_committed_response:true,source_refetches:0}:null;
}
export async function runCatalogueGrowth({credentialsFile,stateDirectory,outDirectory,maxCandidates=2000,cataloguePages=8,catalogueByteOffset=0,baselineFile=null}) {
  if(!Number.isInteger(maxCandidates)||maxCandidates<1||maxCandidates>2000)throw Error('bounded_free_catalogue_limit_required');
  if(!Number.isInteger(cataloguePages)||cataloguePages<1||cataloguePages>14)throw Error('bounded_catalogue_pages_required');
  fs.mkdirSync(outDirectory,{recursive:true,mode:0o700});const {db,call}=await shadowContext({credentialsFile,stateDirectory}),initial=await call('api','/status');assertFreeGrowth(initial);
  if(![0,2097152,4194304,6291456].includes(catalogueByteOffset))throw Error('bounded_catalogue_byte_window_required');
  const savedBaseline=baselineFile??path.join(outDirectory,'catalogue-baseline-private.json');let baseline;
  if(fs.existsSync(savedBaseline))baseline=JSON.parse(fs.readFileSync(savedBaseline));else {baseline={as_of:initial.now,paid_queries:initial.commercial.kpis.paid_acquisition_queries,rows:await commercialRows(db),immutable:await immutableDigests(db)};save(outDirectory,'catalogue-baseline-private.json',baseline);}
  baseline.paid_queries??=baseline.status?.commercial?.kpis?.paid_acquisition_queries;
  assertFreeGrowth(initial,baseline.paid_queries);
  const runFile=path.join(outDirectory,'catalogue-run-private.json');const run=fs.existsSync(runFile)?JSON.parse(fs.readFileSync(runFile)):await call('enrichment','/catalogue/start',{max_candidates:maxCandidates});save(outDirectory,'catalogue-run-private.json',run);
  if(run.expires_at<=new Date().toISOString())throw Error('expired_catalogue_run_requires_new_bounded_run');
  const discoveriesFile=path.join(outDirectory,'catalogue-discovery-private.json');let discoveries=[];
  if(fs.existsSync(discoveriesFile))discoveries=JSON.parse(fs.readFileSync(discoveriesFile));else {
    // Complete small non-US catalogues first; large application catalogues stay
    // bounded. A prefix is never described as complete source coverage.
    for(const url of SOURCES){for(let offset=0;offset<cataloguePages*500;offset+=500){const page=await call('enrichment','/catalogue/discover',{run_id:run.id,url,offset,limit:500,byte_offset:url.includes('eventeny.com/')?catalogueByteOffset:0});discoveries.push({source_url:url,...page});save(outDirectory,'catalogue-discovery-private.json',discoveries);if(page.next_offset===null||!page.candidates?.length)break;}}
  }
  const available=[...new Map(discoveries.flatMap(p=>p.candidates??[]).filter(c=>!c.duplicate).map(c=>[c.id,c])).values()];
  const strong=available.filter(c=>c.family==='eventeny'),international=available.filter(c=>c.family!=='eventeny'),candidates=[];
  // Diversify the warm-up rather than exhausting a weak family before testing
  // the source already demonstrated to produce READY. These are discovery
  // priorities only, never assertions about source geography or availability.
  while(candidates.length<maxCandidates&&(strong.length||international.length)) {
    candidates.push(...strong.splice(0,3),...international.splice(0,2));
  }
  candidates.splice(maxCandidates);
  const progressFile=path.join(outDirectory,'catalogue-progress-private.json'),saved=fs.existsSync(progressFile)?JSON.parse(fs.readFileSync(progressFile)):[];
  // A worker can commit custody/proof before the operator receives its reply.
  // Recover the authoritative outcomes before resuming; never re-fetch/re-import
  // already-completed candidates or lose their identity attribution.
  const durable=(await db.prepare(`SELECT c.id AS candidate_id,c.url,c.family AS source_family,p.status,p.reason,p.entity_id,p.record_id,
    CASE WHEN p.status='imported' THEN r.status END AS readiness,e.market AS source_country,
    p.lease_until,p.document_id FROM catalogue_candidates c JOIN catalogue_progress p ON p.candidate_id=c.id LEFT JOIN entities e ON e.id=p.entity_id
    LEFT JOIN readiness r ON r.entity_id=e.id WHERE c.run_id=? AND p.status IN ('held','imported','failed','verifying')`).bind(run.id).all()).results;
  const recovered=new Set();
  for(const r of durable)if(r.status==='verifying'&&!r.record_id&&!r.document_id&&r.lease_until<=new Date().toISOString()) {
    await call('enrichment','/catalogue/recover',{candidate_id:r.candidate_id});recovered.add(r.candidate_id);
  }
  if(durable.some(r=>['failed','verifying'].includes(r.status)&&!recovered.has(r.candidate_id)))throw Error('catalogue_unsettled_custody_requires_review');
  const results=[...new Map([...saved,...durable.filter(r=>!recovered.has(r.candidate_id))].map(r=>[r.candidate_id,r])).values()],done=new Set(results.map(r=>r.candidate_id));save(outDirectory,'catalogue-progress-private.json',results);
  let cursor=0,stopped=false,stopReason='bounded_run_complete';const nextHost=new Map();
  async function lane(){try{for(;;){if(stopped)return;const candidate=candidates[cursor++];if(!candidate)return;if(done.has(candidate.id))continue;
    const host=new URL(candidate.url).hostname,at=Math.max(Date.now(),nextHost.get(host)??0);nextHost.set(host,at+1500);if(at>Date.now())await sleep(at-Date.now());
    let result;try{result=await call('enrichment','/catalogue/verify',{candidate_id:candidate.id});}
    catch(e){if(e.message==='shadow_http_400_catalogue_bounded_fetch_limit_reached'){stopReason='bounded_fetch_limit_reached';stopped=true;return;}
      // A lost HTTP response is not permission to fetch again. Recover only a
      // completed authoritative receipt; unsettled/failed custody still pauses.
      if(e.message==='shadow_fetch_timeout_enrichment'||/^shadow_invalid_json_enrichment_5\d\d$/.test(e.message))result=await completedCatalogueOutcome(db,candidate.id);
      if(!result){save(outDirectory,'catalogue-request-error-private.json',{candidate_id:candidate.id,error:e.message,diagnostic_code:e.diagnostic_code??'unavailable',at:new Date().toISOString()});throw e;}
    }
    results.push({...result,url:candidate.url,source_family:result.source_family??candidate.family});save(outDirectory,'catalogue-progress-private.json',results);
    const reason=catalogueGrowthStop(results);if(reason){stopReason=reason;stopped=true;return;}
    if(results.length%25===0){const s=await call('api','/status');assertFreeGrowth(s,baseline.paid_queries);const jobs=await db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE stage IN ('reconcile','eligibility','enrichment','readiness') AND status IN ('ready','leased') AND available_at<=?").bind(s.now).first();const reason=catalogueGrowthStop(results,{due_jobs:jobs.n,...s});if(reason){stopReason=reason;stopped=true;return;}console.log(JSON.stringify({free_candidates_checked:results.length,maximum:candidates.length,new_catalogue_ready:results.filter(r=>r.readiness==='ready').length,commercial_ready:s.commercial.totals.ready,paid_queries_added:0}));}
  }}catch(e){stopped=true;throw e;}}
  try{const lanes=await Promise.allSettled(Array.from({length:3},lane)),failure=lanes.find(r=>r.status==='rejected');if(failure)throw failure.reason;}catch(e){stopReason=/^[a-z0-9_]+$/.test(e.message)?e.message:'free_catalogue_operator_failure';throw e;}
  finally {await call('enrichment','/catalogue/stop',{run_id:run.id,reason:stopReason});}
  for(let i=0;i<30;i++){const jobs=await db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE stage IN ('reconcile','eligibility','enrichment','readiness') AND status IN ('ready','leased') AND available_at<=?").bind(new Date().toISOString()).first();if(!jobs.n)break;for(const role of ['reconcile','eligibility','enrichment','readiness'])await call(role,'/tick',{limit:25});await sleep(1000);if(i===29)throw Error('free_catalogue_pipeline_not_settled');}
  const final=await call('api','/status');assertFreeGrowth(final,baseline.paid_queries);const rows=await commercialRows(db),mutations=sourceMutationCount(baseline.immutable,await immutableDigests(db)),outcome=growthOutcome(baseline.rows,rows,{beforeAt:baseline.as_of,now:final.now});
  if(mutations||outcome.identity_mutations||outcome.missing_original_entities)throw Error('free_catalogue_preservation_failed');
  const linkedIds=new Set(results.map(r=>r.entity_id).filter(Boolean)),linked=rows.map(r=>commercialEntity(r,final.now)).filter(r=>linkedIds.has(r.id)),ready=linked.filter(r=>r.ready);
  const tally=(array,key)=>array.reduce((out,r)=>(out[key(r)]=(out[key(r)]??0)+1,out),{});
  const budget=await db.prepare('SELECT checked,max_candidates,status,stop_reason,expires_at FROM catalogue_runs WHERE id=?').bind(run.id).first();
  const registrations=await db.prepare('SELECT COUNT(*) AS n FROM catalogue_candidates WHERE run_id=?').bind(run.id).first();
  const identity=(await db.prepare(`SELECT d.outcome,COUNT(*) AS receipts FROM catalogue_candidates c JOIN catalogue_progress p ON p.candidate_id=c.id
    JOIN reconciliation_decisions d ON d.record_id=p.record_id WHERE c.run_id=? GROUP BY d.outcome`).bind(run.id).all()).results;
  const report={schema:'findpitches-v3-free-catalogue-growth-v1',as_of:final.now,run_id:run.id,stop_reason:stopReason,checked:results.length,fetch_reservations:budget.checked,maximum_candidates:budget.max_candidates,expires_at:budget.expires_at,additional_serper_queries:0,
    discovery_route_observations:discoveries.reduce((n,p)=>n+(p.candidates?.length??0),0),registered_distinct_routes:registrations.n,discovery_skipped_by_reason:tally(discoveries.flatMap(p=>p.candidates??[]).filter(c=>c.duplicate),r=>r.duplicate_reason??'retained_route_already_present'),identity_outcomes:identity,
    linked_distinct_entities:linked.length,current_ready:ready.length,ready_by_country:tally(ready,r=>r.market),ready_by_source:tally(ready,r=>r.domain),dispositions:tally(results,r=>r.status),dominant_blockers:tally(results.filter(r=>r.reason),r=>r.reason),
    catalogue_coverage:discoveries.map(p=>({source_url:p.source_url,coverage:p.coverage,byte_offset:p.byte_offset??0,routes_observed:p.routes,offset:p.offset,candidates_in_page:p.candidates?.length??0})),
    inventory_growth:outcome,inventory:inventoryFromRows(rows,{now:final.now}),source_mutations:mutations,customer_leakage:final.customer_rows,publication_leakage:final.publication_rows,paid_paused:true,structured_delivery:final.structured_delivery};
  save(outDirectory,'catalogue-growth-report.json',report);save(outDirectory,'catalogue-final-private.json',{as_of:final.now,status:final,rows});return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2),get=name=>args[args.indexOf(name)+1];
  try{const r=await runCatalogueGrowth({credentialsFile:get('--credentials'),stateDirectory:get('--state-dir'),outDirectory:get('--out-dir'),maxCandidates:args.includes('--max-candidates')?Number(get('--max-candidates')):2000,cataloguePages:args.includes('--catalogue-pages')?Number(get('--catalogue-pages')):8,catalogueByteOffset:args.includes('--catalogue-byte-offset')?Number(get('--catalogue-byte-offset')):0,baselineFile:args.includes('--baseline-file')?get('--baseline-file'):null});console.log(JSON.stringify({checked:r.checked,catalogue_ready:r.current_ready,total_ready:r.inventory.totals.ready,stop_reason:r.stop_reason}));}
  catch(e){console.error(/^[a-z0-9_]+$/.test(e.message)?e.message:'free_catalogue_growth_failed');process.exitCode=1;}
}
