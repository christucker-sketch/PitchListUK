import {sql} from './store.mjs';
import {stableJson,hash} from './contract.mjs';
import {budgetDay,nextBudgetDay,serperStatus} from './serper-usage.mjs';
import {enqueue} from './jobs.mjs';

// Geography and templates are reviewed code, not caller-supplied search strings.
export const PILOT_CITIES=Object.freeze([
  ['bristol','Bristol','GB','GB-ENG','United Kingdom'],['ottawa','Ottawa','CA','CA-ON','Canada'],['geelong','Geelong','AU','AU-VIC','Australia'],
  ['norwich','Norwich','GB','GB-ENG','United Kingdom'],['halifax','Halifax','CA','CA-NS','Canada'],['hobart','Hobart','AU','AU-TAS','Australia'],
  ['dunedin','Dunedin','NZ','NZ-OTA','New Zealand'],['madison-wi','Madison','US','WI','Wisconsin USA'],['galway','Galway','IE','IE-G','Ireland'],
  ['nottingham','Nottingham','GB','GB-ENG','United Kingdom'],['kingston-on','Kingston','CA','CA-ON','Ontario Canada'],['newcastle-nsw','Newcastle','AU','AU-NSW','New South Wales Australia'],
  ['wellington','Wellington','NZ','NZ-WGN','New Zealand'],['richmond-va','Richmond','US','VA','Virginia USA'],['cork','Cork','IE','IE-CO','Ireland'],
  ['leeds','Leeds','GB','GB-ENG','United Kingdom'],['victoria-bc','Victoria','CA','CA-BC','British Columbia Canada'],['adelaide','Adelaide','AU','AU-SA','Australia'],
  ['christchurch','Christchurch','NZ','NZ-CAN','New Zealand'],['providence-ri','Providence','US','RI','Rhode Island USA'],['limerick','Limerick','IE','IE-LK','Ireland'],
  ['edinburgh','Edinburgh','GB','GB-SCT','United Kingdom'],['winnipeg','Winnipeg','CA','CA-MB','Canada'],['perth','Perth','AU','AU-WA','Australia'],
  ['auckland','Auckland','NZ','NZ-AUK','New Zealand'],['boise-id','Boise','US','ID','Idaho USA'],['dublin','Dublin','IE','IE-D','Ireland'],
  ['cardiff','Cardiff','GB','GB-WLS','United Kingdom'],['calgary','Calgary','CA','CA-AB','Canada'],['canberra','Canberra','AU','AU-ACT','Australia'],
  ['tauranga','Tauranga','NZ','NZ-BOP','New Zealand'],['savannah-ga','Savannah','US','GA','Georgia USA'],['waterford','Waterford','IE','IE-WD','Ireland'],
  ['sheffield','Sheffield','GB','GB-ENG','United Kingdom'],['kitchener','Kitchener','CA','CA-ON','Canada'],['ballarat','Ballarat','AU','AU-VIC','Australia'],
  ['hamilton-nz','Hamilton','NZ','NZ-WKO','New Zealand'],['chattanooga-tn','Chattanooga','US','TN','Tennessee USA'],['kilkenny','Kilkenny','IE','IE-KK','Ireland'],
  ['york','York','GB','GB-ENG','United Kingdom'],['london-on','London','CA','CA-ON','Ontario Canada'],['toowoomba','Toowoomba','AU','AU-QLD','Australia'],
  ['napier','Napier','NZ','NZ-HKB','New Zealand'],['tucson-az','Tucson','US','AZ','Arizona USA'],['sai-kung','Sai Kung','HK','HK','Hong Kong'],
  ['bath','Bath','GB','GB-ENG','United Kingdom'],['guelph','Guelph','CA','CA-ON','Canada'],['bendigo','Bendigo','AU','AU-VIC','Australia'],
  ['nelson-nz','Nelson','NZ','NZ-NSN','New Zealand'],['asheville-nc','Asheville','US','NC','North Carolina USA'],['singapore','Singapore','SG','SG','Singapore'],
  ['exeter','Exeter','GB','GB-ENG','United Kingdom'],['peterborough-on','Peterborough','CA','CA-ON','Ontario Canada'],['launceston','Launceston','AU','AU-TAS','Australia'],
  ['new-plymouth','New Plymouth','NZ','NZ-TKI','New Zealand'],['burlington-vt','Burlington','US','VT','Vermont USA'],['inverness','Inverness','GB','GB-SCT','United Kingdom'],
  ['chester','Chester','GB','GB-ENG','United Kingdom'],['fredericton','Fredericton','CA','CA-NB','Canada'],['wollongong','Wollongong','AU','AU-NSW','Australia'],
].map(([id,name,market,region,context])=>Object.freeze({id,name,market,region,context})));
export const PILOT_LIMITS=Object.freeze({warmup_queries:12,min_new_ready_per_query:0.1,min_new_entities_per_query:0.5,max_entity_duplicate_rate:0.6,max_due_jobs:40,max_oldest_due_seconds:120});
export function pilotPlan() {
  const templates=['"Christmas market" "vendor application" 2026','"craft fair" "stallholder application" 2026','"artisan market" "exhibitor application" 2027','"farmers market" "vendor registration" 2026'];
  return [0,2].flatMap(offset=>PILOT_CITIES.map(city=>({city:city.id,queries:templates.slice(offset,offset+2).map(template=>'"'+city.name+'" "'+city.context+'" '+template)})));
}
export function pilotStopReason(metrics) {
  if(metrics.customer_rows||metrics.publication_rows||metrics.publication_enabled||metrics.bulk_enabled)return 'shadow_scope_leakage';
  if(metrics.source_mutations||!metrics.preservation_gate)return 'source_preservation_failed';
  if(metrics.due_jobs>PILOT_LIMITS.max_due_jobs||metrics.oldest_due_seconds>PILOT_LIMITS.max_oldest_due_seconds)return 'queue_backlog';
  if(metrics.failed_runs)return 'paid_run_failed_requires_review';
  if(metrics.queries>=PILOT_LIMITS.warmup_queries&&metrics.pending_records===0) {
    if(metrics.entity_duplicate_rate>PILOT_LIMITS.max_entity_duplicate_rate)return 'duplicate_rate_exceeded';
    if(metrics.new_ready_opportunities/metrics.queries<PILOT_LIMITS.min_new_ready_per_query)return 'poor_ready_yield';
    if(metrics.entities_created/metrics.queries<PILOT_LIMITS.min_new_entities_per_query)return 'poor_entity_yield';
  }
  return null;
}
export async function pilotMetrics(db,id,now=new Date().toISOString()) {
  const counts=await sql(db,`SELECT COALESCE(SUM(u.queries_attempted),0) AS queries,COALESCE(SUM(u.queries_reserved),0) AS reserved,
    COALESCE(SUM(u.queries_completed),0) AS completed,COALESCE(SUM(u.candidates_produced),0) AS candidates,
    SUM(u.credits_observed) AS observed_credit_subtotal,COALESCE(SUM(u.credits_observed IS NULL),0) AS unobserved_queries
    FROM pilot_run_grants g JOIN serper_usage u ON u.run_id=g.run_id WHERE g.pilot_id=?`,id).first();
  const linked=await sql(db,`SELECT COUNT(DISTINCT p.producer_record_id) AS unique_candidates,COUNT(*) AS receipts,
    COUNT(DISTINCT er.entity_id) AS linked_entities,
    COUNT(DISTINCT CASE WHEN d.outcome='NEW_ENTITY' AND x.new_receipt=1 THEN er.entity_id END) AS entities_created,
    SUM(CASE WHEN d.outcome='EXACT_MATCH' THEN 1 ELSE 0 END) AS matched_records,
    SUM(CASE WHEN d.record_id IS NULL OR er.entity_id IS NOT NULL AND (r.entity_revision IS NULL OR r.entity_revision<>e.revision) THEN 1 ELSE 0 END) AS pending_records,
    COUNT(DISTINCT CASE WHEN r.status='ready' AND r.entity_revision=e.revision THEN e.id END) AS ready_opportunities,
    COUNT(DISTINCT CASE WHEN r.status='ready' AND r.entity_revision=e.revision AND d.outcome='NEW_ENTITY' AND x.new_receipt=1 THEN e.id END) AS new_ready_opportunities
    FROM pilot_run_grants g JOIN serper_run_records x ON x.run_id=g.run_id JOIN producer_records p ON p.id=x.record_id
    LEFT JOIN reconciliation_decisions d ON d.record_id=x.record_id LEFT JOIN entity_records er ON er.record_id=p.id
    LEFT JOIN entities e ON e.id=er.entity_id LEFT JOIN readiness r ON r.entity_id=e.id WHERE g.pilot_id=?`,id).first();
  const guards=await sql(db,`SELECT (SELECT COUNT(*) FROM customer_projections) AS customer_rows,(SELECT COUNT(*) FROM publication_queue) AS publication_rows,
    (SELECT publication_enabled FROM runtime_policy WHERE id=1) AS publication_enabled,(SELECT bulk_enabled FROM serper_policy WHERE id=1) AS bulk_enabled,
    EXISTS(SELECT 1 FROM quality_gates WHERE name='structured-100-preservation' AND tested_records=100 AND destructive_mutations=0) AS preservation_gate,
    COALESCE((SELECT destructive_mutations FROM quality_gates WHERE name='structured-100-preservation'),1) AS source_mutations,
    (SELECT COUNT(*) FROM pilot_run_grants WHERE pilot_id=? AND status='failed') AS failed_runs`,id).first();
  const jobs=await sql(db,`SELECT COUNT(*) AS due_jobs,MIN(available_at) AS oldest_due FROM jobs WHERE stage IN ('reconcile','eligibility','enrichment','readiness') AND status IN ('ready','leased') AND available_at<=?`,now).first();
  return {...counts,...linked,...guards,...jobs,integrity_scope:'Verified preservation gate plus SQL immutability guards; operator verifies immutable receipt/fact digests between runs.',oldest_due_seconds:jobs.oldest_due?Math.max(0,(Date.parse(now)-Date.parse(jobs.oldest_due))/1000):0,
    entity_duplicate_rate:linked.receipts?Number(linked.matched_records??0)/linked.receipts:0,
    candidate_duplicate_rate:counts.candidates?Math.max(0,counts.candidates-linked.unique_candidates)/counts.candidates:0,
    queries_per_new_ready_opportunity:linked.new_ready_opportunities?counts.queries/linked.new_ready_opportunities:null,
    credits_consumed:counts.unobserved_queries===0?counts.observed_credit_subtotal:null};
}
export async function stopPilot(db,id,reason,now=new Date().toISOString()) {
  await sql(db,"UPDATE acquisition_pilots SET status='paused',stop_reason=?,updated_at=? WHERE id=? AND status='active'",reason,now,id).run();
}
export async function checkPilot(db,id,now=new Date().toISOString(),{checkYield=true}={}) {
  const pilot=await sql(db,'SELECT * FROM acquisition_pilots WHERE id=?',id).first();
  if(!pilot||pilot.status!=='active'||pilot.budget_day!==budgetDay(now)||Date.parse(pilot.expires_at)<=Date.parse(now)) {
    if(pilot?.status==='active')await stopPilot(db,id,'pilot_expired',now);
    throw Error('pilot_not_active');
  }
  const metrics=await pilotMetrics(db,id,now),reason=pilotStopReason({...metrics,...checkYield?{}:{queries:0}});
  if(reason){await stopPilot(db,id,reason,now);throw Error('pilot_'+reason);}
  return {pilot,metrics};
}
export async function startPilot(db,{max_queries=240,daily_ceiling=250}={},now=new Date().toISOString()) {
  if(!Number.isInteger(max_queries)||max_queries<1||max_queries>250||!Number.isInteger(daily_ceiling)||daily_ceiling<max_queries||daily_ceiling>250)throw Error('bounded_pilot_budget_required');
  const plan=pilotPlan(),id='pilot_'+crypto.randomUUID(),expires=new Date(Math.min(Date.parse(now)+3*3600000,Date.parse(nextBudgetDay(now)))).toISOString();
  await sql(db,`INSERT INTO acquisition_pilots(id,budget_day,status,daily_ceiling,max_queries,plan_json,created_at,expires_at,updated_at)
    VALUES (?,?,'active',?,?,?,?,?,?)`,id,budgetDay(now),daily_ceiling,max_queries,stableJson(plan),now,expires,now).run();
  try {await checkPilot(db,id,now);}catch(error){await stopPilot(db,id,'initial_safety_check_failed',now);throw error;}
  return {id,max_queries,daily_ceiling,expires_at:expires,limits:PILOT_LIMITS};
}
export async function schedulePilotRun(db,id,now=new Date().toISOString()) {
  const {pilot,metrics}=await checkPilot(db,id,now);
  if(pilot.active_run_id) {
    const prior=await sql(db,'SELECT g.status,a.status AS acquisition_status FROM pilot_run_grants g LEFT JOIN acquisition_runs a ON a.id=g.run_id WHERE g.run_id=?',pilot.active_run_id).first();
    if(prior?.status!=='complete'||prior.acquisition_status!=='complete'||metrics.pending_records)throw Error('pilot_previous_run_not_settled');
  }
  const plan=JSON.parse(pilot.plan_json),entry=plan[pilot.next_run];
  const day=await sql(db,'SELECT COALESCE(SUM(queries_reserved),0) AS reserved FROM serper_usage WHERE budget_day=?',pilot.budget_day).first();
  if(!entry||metrics.reserved+entry.queries.length>pilot.max_queries||day.reserved+entry.queries.length>pilot.daily_ceiling) {
    await sql(db,"UPDATE acquisition_pilots SET status='complete',stop_reason='pilot_budget_or_plan_complete',updated_at=? WHERE id=? AND status='active'",now,id).run();return {complete:true};
  }
  const budget=await serperStatus(db,now);
  if(budget.paused||budget.remaining.hourly_queries<entry.queries.length||budget.remaining.hourly_credit_units<entry.queries.length)return {waiting:true,reason:budget.pause_reason??'hourly_headroom_insufficient',retry_after:budget.pause_until};
  for(const query of entry.queries)if(await sql(db,'SELECT id FROM serper_usage WHERE query_hash=? AND reserved_at>=? LIMIT 1',await hash(query),new Date(Date.parse(now)-7*86400000).toISOString()).first()) {await stopPilot(db,id,'repeated_query_refused',now);throw Error('pilot_repeated_query_refused');}
  const runId='pilotrun_'+crypto.randomUUID();
  const claim=await sql(db,`UPDATE acquisition_pilots SET active_run_id=?,next_run=next_run+1,updated_at=? WHERE id=? AND status='active' AND next_run=? AND active_run_id IS ? RETURNING id`,runId,now,id,pilot.next_run,pilot.active_run_id).all();
  if(claim.results.length!==1)throw Error('pilot_run_admission_raced');
  await sql(db,"INSERT INTO pilot_run_grants(run_id,pilot_id,run_index,city_id,queries_json,status,created_at) VALUES (?,?,?,?,?,'approved',?)",runId,id,pilot.next_run,entry.city,stableJson(entry.queries),now).run();
  await enqueue(db,'acquisition',runId,{city:entry.city,query_limit:entry.queries.length,run_id:runId,pilot_id:id},now);
  return {run_id:runId,pilot_id:id,city:entry.city,query_limit:entry.queries.length};
}
export async function pilotStatus(db,now=new Date().toISOString()) {
  const rows=(await sql(db,'SELECT id,budget_day,status,daily_ceiling,max_queries,next_run,active_run_id,stop_reason,created_at,expires_at FROM acquisition_pilots ORDER BY created_at DESC LIMIT 5').all()).results;
  return {automatic_bulk_enabled:false,limits:PILOT_LIMITS,sessions:await Promise.all(rows.map(async row=>({...row,metrics:await pilotMetrics(db,row.id,now)})))};
}
