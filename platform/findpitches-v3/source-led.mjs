import {sql,ingestRecords} from './store.mjs';
import {hash,stableJson,EXPORT_SCHEMA} from './contract.mjs';
import {budgetDay,nextBudgetDay,serperStatus,reserveSerperQuery,observeSerperCredits,attributeSerperRecords} from './serper-usage.mjs';
import {fetchSourceDocument,safeSourceUrl} from './source-document.mjs';
import {verifyDocument,applicationScope} from './verification.mjs';
import {INVENTORY_SQL,commercialEntity} from './commercial.mjs';

export const SOURCE_LED_MARKETS=Object.freeze(['GB','CA','AU','NZ','US']);
export const SOURCE_LED_LIMITS=Object.freeze({warmup_queries:10,min_ready_per_query:0.1,max_duplicate_rate:0.7,min_candidates_for_mix_stop:20,max_excluded_mix:0.5,max_due_jobs:40,max_oldest_due_seconds:120,max_pending_candidates:10});
const LANE='source-led-paid';
export function sourceLedPlan(now) {
  const year=new Date(now).getUTCFullYear(),next=year+1,avoid=' -site:facebook.com -site:instagram.com -site:eventbrite.com -site:tripadvisor.com';
  const rows={
    GB:[['localstalls',`site:localstalls.com/uk/event/ "Stallholder applications open" ${year}`],['official_organiser',`"trader applications" "applications open" "${next}" "United Kingdom"`],['municipal',`site:gov.uk "stallholder application" "${next}"`],['fair_operator',`"Christmas fair" "stallholder application" "${year}" site:co.uk`],['localstalls',`site:localstalls.com/uk/event/ "Stallholder applications open" ${next}`]],
    CA:[['official_organiser',`"vendor applications" "applications open" "${next}" site:ca`],['municipal',`"festival" "vendor application" "${next}" "Canada"`],['eventeny',`site:eventeny.com/events/vendor/ "Canada" "${year}"`],['fair_operator',`"craft fair" "vendor application" "${next}" site:ca`],['official_organiser',`"vendor applications" "business name" "${next}" site:ca`]],
    AU:[['localstalls',`site:localstalls.com/au/event/ "Stallholder applications open" ${year}`],['official_organiser',`"stallholder applications" "applications open" "${next}" site:com.au`],['municipal',`site:gov.au "stallholder application" "${next}"`],['fair_operator',`"festival" "stallholder application" "${next}" site:com.au`],['localstalls',`site:localstalls.com/au/event/ "Stallholder applications open" ${next}`]],
    NZ:[['localstalls',`site:localstalls.com/nz/event/ "Stallholder applications open" ${year}`],['official_organiser',`"stallholder applications" "applications open" "${next}" site:co.nz`],['municipal',`site:govt.nz "vendor application" "${next}"`],['fair_operator',`"festival" "stallholder application" "${next}" site:co.nz`],['localstalls',`site:localstalls.com/nz/event/ "Stallholder applications open" ${next}`]],
    US:[['eventeny',`site:eventeny.com/events/vendor/ "Start Application" "${next}" "United States"`],['official_organiser',`"vendor applications" "applications open" "${next}" "United States"`],['municipal',`site:gov "festival" "vendor application" "${next}"`],['eventeny',`site:eventeny.com/events/vendor/ "Arts and Crafts" "${next}"`],['eventeny',`site:eventeny.com/events/vendor/ "Food Vendors" "${next}"`]],
  };
  return Array.from({length:5},(_,i)=>SOURCE_LED_MARKETS.map(market=>({market,family:rows[market][i][0],query:rows[market][i][1]+avoid}))).flat();
}
export function sourceLedRoute(url) {
  if(!safeSourceUrl(url))return {family:'unsafe',disposition:'excluded'};
  const u=new URL(url),host=u.hostname.replace(/^www\./,'');
  for(const k of [...u.searchParams.keys()])if(/^(utm_|srsltid|fbclid|aff)/i.test(k))u.searchParams.delete(k);u.hash='';
  const key=u.href;
  if(/(?:^|\.)(facebook\.com|instagram\.com|tiktok\.com|x\.com|youtube\.com|linkedin\.com)$/.test(host))return {key,family:'social',disposition:'excluded'};
  if(/eventbrite\.|ticketmaster\.|ticketsource\.|tripadvisor\.|yelp\./.test(host))return {key,family:'visitor_directory',disposition:'excluded'};
  if(/\/(news|blog|stories|press|editorial)(\/|$)/i.test(u.pathname))return {key,family:'editorial',disposition:'excluded'};
  if(host==='eventeny.com')return {key,family:'eventeny',disposition:/^\/events\/vendor\/?$/.test(u.pathname)&&/^\d+$/.test(u.searchParams.get('id')??'')?'pending':'excluded'};
  if(host==='localstalls.com')return {key,family:'localstalls',disposition:/^\/[a-z]{2}\/event\/[^/]+\/[^/]+\/?$/.test(u.pathname)?'pending':'excluded'};
  if(u.pathname==='/'||/\/(directory|listings|search|login|sign-in|events|calendar|vendors)\/?$/i.test(u.pathname))return {key,family:'directory_login',disposition:'excluded'};
  if(/\.pdf$/i.test(u.pathname))return {key,family:'direct_form_pdf',disposition:'unsupported_pdf'};
  const forms=/(?:^|\.)(docs\.google\.com|forms\.gle|jotform\.com|jotform\.eu|formstack\.com)$/.test(host);
  return {key,family:forms?'external_form':/(?:\.gov(?:\.[a-z]{2})?|\.govt\.nz)$/.test(host)?'municipal':'official_organiser',disposition:forms?'unsupported_form':'pending'};
}
const query=async(db,q,...v)=>(await sql(db,q,...v).all()).results??[];
export async function sourceLedMetrics(db,id,now=new Date().toISOString()) {
  const session=await sql(db,'SELECT * FROM source_led_programmes WHERE id=?',id).first();if(!session)throw Error('source_led_programme_missing');
  const runs=await query(db,`SELECT g.*,u.queries_reserved,u.queries_attempted,u.credits_observed,u.candidates_produced,u.status AS usage_status FROM source_led_grants g LEFT JOIN serper_usage u ON u.run_id=g.run_id WHERE g.programme_id=? ORDER BY g.query_index`,id);
  const candidates=await query(db,`SELECT c.id,c.url_key,c.family,c.initial_disposition,p.status,p.record_id,p.actual_country,p.reason,c.run_id,er.entity_id,d.outcome FROM source_led_candidates c JOIN source_led_grants g ON g.run_id=c.run_id JOIN source_led_candidate_progress p ON p.candidate_id=c.id LEFT JOIN entity_records er ON er.record_id=p.record_id LEFT JOIN reconciliation_decisions d ON d.record_id=p.record_id WHERE g.programme_id=?`,id);
  const ids=[...new Set(candidates.map(c=>c.entity_id).filter(Boolean))];
  const entityRows=ids.length?await query(db,INVENTORY_SQL.replace('WHERE e.id>? ORDER BY e.id LIMIT 250','WHERE e.id IN (SELECT value FROM json_each(?)) ORDER BY e.id LIMIT 250'),stableJson(ids)):[];
  const entities=entityRows.map(r=>commercialEntity(r,now)),ready=entities.filter(e=>e.ready),createdIds=new Set(candidates.filter(c=>c.outcome==='NEW_ENTITY').map(c=>c.entity_id));
  const oldReady=new Set((await query(db,"SELECT DISTINCT entity_id FROM commercial_readiness_history WHERE status='ready' AND occurred_at<? AND entity_id IN (SELECT value FROM json_each(?))",session.created_at,stableJson(ids))).map(r=>r.entity_id));
  const gained=ready.filter(e=>!oldReady.has(e.id));
  const history=ids.length?await query(db,"SELECT h.entity_id,v.report_json FROM commercial_readiness_history h JOIN source_verifications v ON v.id=h.verification_id WHERE h.status='ready' AND h.occurred_at>=? AND h.entity_id IN (SELECT value FROM json_each(?))",session.created_at,stableJson(ids)):[];
  const falsePromotions=new Set(history.filter(h=>applicationScope(JSON.parse(h.report_json)).reasons.length).map(h=>h.entity_id)).size;
  const totalQueries=runs.reduce((n,r)=>n+(r.queries_attempted??0),0),reserved=runs.reduce((n,r)=>n+(r.queries_reserved??0),0),billed=runs.filter(r=>r.queries_reserved),credits=billed.length&&billed.every(r=>r.credits_observed!==null)?billed.reduce((n,r)=>n+r.credits_observed,0):null;
  const seen=new Set();let duplicates=0;for(const c of candidates){if(seen.has(c.url_key)||c.status==='duplicate'||c.outcome==='EXACT_MATCH')duplicates++;seen.add(c.url_key);}
  const pending=candidates.filter(c=>['pending','verifying'].includes(c.status)||c.record_id&&!c.entity_id&&!c.outcome||c.entity_id&&entities.some(e=>e.id===c.entity_id&&(!e.verification_checked||e.proof_revision!==e.revision||e.readiness_revision!==e.revision))).length;
  const excluded=candidates.filter(c=>c.initial_disposition==='excluded'||['social','editorial','directory'].includes(c.reason)).length;
  const guards=await sql(db,`SELECT (SELECT COUNT(*) FROM customer_projections) AS customer_rows,(SELECT COUNT(*) FROM publication_queue) AS publication_rows,(SELECT publication_enabled FROM runtime_policy WHERE id=1) AS publication_enabled,(SELECT bulk_enabled FROM serper_policy WHERE id=1) AS bulk_enabled,EXISTS(SELECT 1 FROM quality_gates WHERE name='structured-100-preservation' AND tested_records=100 AND destructive_mutations=0) AS preservation_gate,COALESCE((SELECT destructive_mutations FROM quality_gates WHERE name='structured-100-preservation'),1) AS source_mutations`).first();
  const jobs=await sql(db,"SELECT COUNT(*) AS due_jobs,MIN(available_at) AS oldest_due FROM jobs WHERE stage IN ('reconcile','eligibility','enrichment','readiness') AND status IN ('ready','leased') AND available_at<=?",now).first();
  const structured=await sql(db,`SELECT COUNT(*) AS structured_pending FROM jobs j JOIN producer_records p ON p.id=json_extract(j.payload_json,'$.record_id') WHERE j.stage='reconcile' AND j.status IN ('ready','leased') AND p.producer_name='independent-structured' AND j.available_at<=?`,now).first();
  const byCountry={},byFamily={};for(const e of gained){byCountry[e.market]=(byCountry[e.market]??0)+1;const family=['eventeny','localstalls'].includes(e.proof.profile)?e.proof.profile:candidates.find(c=>c.entity_id===e.id)?.family??e.proof.profile??e.domain;byFamily[family]=(byFamily[family]??0)+1;}
  const countries=Object.fromEntries(SOURCE_LED_MARKETS.map(country=>[country,{queries:runs.filter(r=>r.market===country).reduce((n,r)=>n+(r.queries_attempted??0),0),candidates:candidates.filter(c=>runs.find(r=>r.run_id===c.run_id)?.market===country).length,ready_gained:byCountry[country]??0}]));
  const families=Object.fromEntries([...new Set(candidates.map(c=>c.family).concat(runs.map(r=>r.family)))].map(family=>[family,{queries:runs.filter(r=>r.family===family).reduce((n,r)=>n+(r.queries_attempted??0),0),candidates:candidates.filter(c=>c.family===family).length,ready_gained:byFamily[family]??0}]));
  const watchQuarantine=candidates.filter(c=>c.status!=='duplicate'&&c.status!=='excluded'&&(!c.entity_id||!entities.find(e=>e.id===c.entity_id)?.ready)&&!['pending','verifying'].includes(c.status)).length;
  const price=await sql(db,'SELECT credit_unit_cost_usd FROM serper_policy WHERE id=1').first();
  return {queries:totalQueries,reserved,observed_credits:credits,candidates:candidates.length,distinct_candidate_urls:seen.size,distinct_entities:entities.length,entities_created:createdIds.size,verified_entities:entities.filter(e=>e.verified).length,ready_opportunities:ready.length,ready_gained:gained.length,ready_by_country:byCountry,ready_by_source_family:byFamily,
    duplicate_candidates:duplicates,duplicate_rate:candidates.length?duplicates/candidates.length:0,watch_quarantine_candidates:watchQuarantine,watch_quarantine_rate:candidates.length?watchQuarantine/candidates.length:0,watch_entities:entities.filter(e=>e.watch).length,quarantined_entities:entities.filter(e=>e.quarantined).length,blocked_entities:entities.filter(e=>e.blocked).length,
    out_of_market_candidates:candidates.filter(c=>c.status==='out_of_market').length,excluded_candidates:excluded,excluded_mix:candidates.length?excluded/candidates.length:0,pending_candidates:pending,ready_per_100_queries:totalQueries?100*gained.length/totalQueries:0,queries_per_ready:gained.length?totalQueries/gained.length:null,credits_per_ready:gained.length&&credits!==null?credits/gained.length:null,cost_usd_per_ready:gained.length&&credits!==null&&price.credit_unit_cost_usd!==null?credits*price.credit_unit_cost_usd/gained.length:null,
    false_ready_promotions_detected:falsePromotions,unlinked_identity_review_candidates:candidates.filter(c=>c.record_id&&!c.entity_id&&c.outcome).length,failed_runs:runs.filter(r=>r.status==='failed').length,...guards,...jobs,...structured,oldest_due_seconds:jobs.oldest_due?Math.max(0,(Date.parse(now)-Date.parse(jobs.oldest_due))/1000):0,
    by_target_country:countries,by_discovered_source_family:families,run_telemetry:runs.map(({query_hash,query,...r})=>r),
    definitions:'Queries count attempts, credits are observed only. READY gained excludes any entity with an earlier proved READY history. Query country is targeting only; READY country comes from source. Duplicate denominator and WATCH/quarantine denominator are all candidate occurrences. Unsupported/unproved sources remain discovery candidates without invented canonical geography.'};
}
export function sourceLedStopReason(m) {
  if(m.customer_rows||m.publication_rows||m.publication_enabled||m.bulk_enabled)return 'shadow_scope_leakage';
  if(m.source_mutations||!m.preservation_gate)return 'source_integrity_failure';
  if(m.false_ready_promotions_detected)return 'false_ready_promotion_detected';
  if(m.failed_runs)return 'paid_outcome_requires_review';
  if(m.due_jobs>SOURCE_LED_LIMITS.max_due_jobs||m.oldest_due_seconds>SOURCE_LED_LIMITS.max_oldest_due_seconds||m.pending_candidates>SOURCE_LED_LIMITS.max_pending_candidates)return 'verification_backlog';
  if(m.candidates>=SOURCE_LED_LIMITS.min_candidates_for_mix_stop&&m.duplicate_rate>SOURCE_LED_LIMITS.max_duplicate_rate)return 'duplicate_rate_spike';
  if(m.candidates>=SOURCE_LED_LIMITS.min_candidates_for_mix_stop&&m.excluded_mix>SOURCE_LED_LIMITS.max_excluded_mix)return 'excluded_source_mix_dominant';
  if(m.queries>=SOURCE_LED_LIMITS.warmup_queries&&m.pending_candidates===0){if(!m.ready_gained)return 'zero_ready_after_balanced_warmup';if(m.ready_gained/m.queries<SOURCE_LED_LIMITS.min_ready_per_query)return 'ready_yield_below_threshold';}
  return null;
}
export async function stopSourceLed(db,id,reason,now=new Date().toISOString(),{latch=true}={}) {
  if(!/^[a-z][a-z0-9_]{0,79}$/.test(reason))throw Error('source_led_stop_reason_invalid');
  await sql(db,"UPDATE source_led_programmes SET status='paused',stop_reason=?,updated_at=? WHERE id=? AND status='active'",reason,now,id).run();
  if(latch)await sql(db,'UPDATE commercial_acquisition_policy SET manual_paused=1,pause_reason=?,updated_at=? WHERE id=1',reason,now).run();
}
async function check(db,id,now,{yieldCheck=true}={}) {
  const p=await sql(db,'SELECT * FROM source_led_programmes WHERE id=?',id).first();
  if(!p||p.status!=='active')throw Error('source_led_programme_not_active');
  if(p.budget_day!==budgetDay(now)||p.expires_at<=now){await stopSourceLed(db,id,'programme_expired',now,{latch:false});throw Error('source_led_programme_expired');}
  const metrics=await sourceLedMetrics(db,id,now),reason=sourceLedStopReason({...metrics,...yieldCheck?{}:{queries:0}});
  if(reason){await stopSourceLed(db,id,reason,now);throw Error('source_led_'+reason);}
  return {programme:p,metrics};
}
export async function startSourceLed(db,{max_queries=25}={},now=new Date().toISOString()) {
  const policy=await sql(db,'SELECT * FROM commercial_acquisition_policy WHERE id=1').first();
  if(policy.manual_paused)throw Error('source_led_operator_review_required');
  if(!Number.isInteger(max_queries)||max_queries<1||max_queries>policy.daily_query_limit)throw Error('source_led_bounded_budget_required');
  const id='sourceled_'+crypto.randomUUID(),expires=new Date(Math.min(Date.parse(now)+3*3600000,Date.parse(nextBudgetDay(now)))).toISOString();
  await sql(db,"INSERT INTO source_led_programmes(id,budget_day,status,max_queries,plan_json,created_at,expires_at,updated_at) VALUES (?,?,'active',?,?,?,?,?)",id,budgetDay(now),max_queries,stableJson(sourceLedPlan(now)),now,expires,now).run();
  await check(db,id,now);return {id,max_queries,daily_total_paid_limit:policy.daily_query_limit,queries_per_country:policy.queries_per_market,expires_at:expires,limits:SOURCE_LED_LIMITS};
}
export async function scheduleSourceLed(db,id,now=new Date().toISOString()) {
  const {programme:p,metrics:m}=await check(db,id,now);
  if(m.structured_pending)return {waiting:true,reason:'structured_producer_has_priority'};
  if(p.active_run_id){const g=await sql(db,'SELECT status FROM source_led_grants WHERE run_id=?',p.active_run_id).first();if(g?.status!=='complete'||m.pending_candidates)throw Error('source_led_previous_run_not_settled');}
  const budget=await serperStatus(db,now),policy=await sql(db,'SELECT * FROM commercial_acquisition_policy WHERE id=1').first(),entry=JSON.parse(p.plan_json)[p.next_query];
  if(policy.manual_paused){await stopSourceLed(db,id,policy.pause_reason??'operator_pause',now,{latch:false});return {complete:true,reason:policy.pause_reason};}
  if(!entry||m.reserved>=p.max_queries||budget.usage.day_queries_reserved>=policy.daily_query_limit||budget.usage.day_credit_budget_units>=policy.daily_query_limit){await stopSourceLed(db,id,'commercial_daily_budget_reached',now,{latch:false});return {complete:true,reason:'commercial_daily_budget_reached'};}
  if(budget.paused||!budget.remaining.hourly_queries||!budget.remaining.hourly_credit_units){await stopSourceLed(db,id,'serper_budget_threshold_reached',now,{latch:false});return {complete:true,reason:'serper_budget_threshold_reached'};}
  const queryHash=await hash(entry.query),recent=new Date(Date.parse(now)-7*86400000).toISOString();
  if(await sql(db,'SELECT id FROM serper_usage WHERE query_hash=? AND reserved_at>=? LIMIT 1',queryHash,recent).first()){await stopSourceLed(db,id,'repeated_query_refused',now);throw Error('source_led_repeated_query_refused');}
  const quota=await sql(db,"SELECT COALESCE(SUM(queries_reserved),0) AS n FROM serper_usage WHERE budget_day=? AND lane=? AND market=?",budgetDay(now),LANE,entry.market).first();
  if(quota.n>=policy.queries_per_market){await stopSourceLed(db,id,'country_quota_reached',now,{latch:false});return {complete:true,reason:'country_quota_reached'};}
  const runId='sourceledrun_'+crypto.randomUUID();
  const claim=await sql(db,"UPDATE source_led_programmes SET active_run_id=?,next_query=next_query+1,updated_at=? WHERE id=? AND status='active' AND next_query=? AND active_run_id IS ? RETURNING id",runId,now,id,p.next_query,p.active_run_id).all();
  if(claim.results.length!==1)throw Error('source_led_admission_raced');
  await sql(db,"INSERT INTO source_led_grants VALUES (?,?,?,?,?, ?,?,'approved',?)",runId,id,p.next_query,entry.market,entry.family,entry.query,queryHash,now).run();
  return {run_id:runId,programme_id:id,market:entry.market,family:entry.family,query_limit:1};
}
export async function executeSourceLed(db,runId,env,{fetcher=fetch,now=new Date().toISOString()}={}) {
  if(env.V3_CITY_ENABLED!=='false'||Number(env.V3_DAILY_QUERY_LIMIT)!==1000||!env.SERPER_API_KEY)throw Error('source_led_shadow_configuration_required');
  const grant=await sql(db,'SELECT * FROM source_led_grants WHERE run_id=?',runId).first();if(!grant)throw Error('source_led_grant_required');
  if(grant.status==='complete')return {run_id:runId,replay:true};
  if(grant.status!=='approved')throw Error('source_led_outcome_requires_review');
  await check(db,grant.programme_id,now,{yieldCheck:false});
  const claimed=await sql(db,"UPDATE source_led_grants SET status='running' WHERE run_id=? AND status='approved' RETURNING run_id",runId).all();if(claimed.results.length!==1)throw Error('source_led_already_claimed');
  let usageId=null;
  try {
    await sql(db,"INSERT INTO acquisition_runs(id,city,day,queries_reserved,status,created_at,updated_at) VALUES (?,?,?,1,'reserved',?,?)",runId,'source-led:'+grant.market,budgetDay(now),now,now).run();
    usageId=await reserveSerperQuery(db,{runId,index:0,query:grant.query,producer:'source-led-search',lane:LANE,market:grant.market,region:null,programmeId:grant.programme_id,now});
    await sql(db,"UPDATE serper_usage SET status='dispatched',queries_attempted=1,dispatched_at=? WHERE id=?",now,usageId).run();
    const response=await fetcher('https://google.serper.dev/search',{method:'POST',headers:{'X-API-KEY':env.SERPER_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({q:grant.query,gl:grant.market.toLowerCase(),num:10}),signal:AbortSignal.timeout(20000)});
    await sql(db,'UPDATE serper_usage SET http_status=? WHERE id=?',response.status,usageId).run();
    const raw=await response.text();if(raw.length>1048576)throw Error('search_response_size_limit');const body=JSON.parse(raw);
    const excess=await observeSerperCredits(db,usageId,body.credits,now);if(!response.ok)throw Error('search_provider_http_'+response.status);
    const items=(Array.isArray(body.organic)?body.organic:[]).slice(0,10);
    for(const [position,item] of items.entries()) {
      const url=typeof item.link==='string'?item.link:'',route=sourceLedRoute(url),candidateId='discovery_'+(await hash([runId,position])).slice(0,40);
      const known=route.key&&await sql(db,'SELECT candidate_id FROM source_led_candidate_progress p JOIN source_led_candidates c ON c.id=p.candidate_id WHERE c.url_key=? AND c.discovered_at>=? AND p.status<>\'failed\' LIMIT 1',route.key,new Date(Date.parse(now)-7*86400000).toISOString()).first();
      const imported=route.key&&await sql(db,"SELECT 1 AS known FROM producer_records WHERE environment='shadow' AND validation_status='accepted' AND (json_extract(normalized_json,'$.canonical_url')=? OR json_extract(normalized_json,'$.application_url')=?) LIMIT 1",route.key,route.key).first();
      const status=(known||imported)?'duplicate':route.disposition;
      await db.batch([sql(db,'INSERT OR IGNORE INTO source_led_candidates VALUES (?,?,?,?,?,?,?,?,?,?)',candidateId,runId,usageId,position,url,route.key??url,route.family,stableJson({title:String(item.title??'').slice(0,4000),snippet:String(item.snippet??'').slice(0,4000),link:url,query:grant.query,target_country:grant.market,geography_authority:'targeting_only'}),now,route.disposition),sql(db,'INSERT OR IGNORE INTO source_led_candidate_progress(candidate_id,status,reason) VALUES (?,?,?)',candidateId,status,status==='pending'?null:status)]);
    }
    const result={run_id:runId,candidates:items.length,queries:1};
    await sql(db,"UPDATE serper_usage SET status='complete',queries_completed=1,candidates_produced=?,completed_at=? WHERE id=?",items.length,now,usageId).run();
    await sql(db,"UPDATE acquisition_runs SET status='complete',queries_completed=1,result_json=?,updated_at=? WHERE id=?",stableJson(result),now,runId).run();
    await sql(db,"UPDATE source_led_grants SET status='complete' WHERE run_id=?",runId).run();
    if(excess){await stopSourceLed(db,grant.programme_id,'provider_credit_charge_exceeded_reservation',now);throw Error('serper_credit_charge_requires_operator_review');}
    return result;
  } catch {
    if(usageId)await sql(db,"UPDATE serper_usage SET status='failed',error_code='source_led_provider_outcome_requires_review',completed_at=? WHERE id=?",now,usageId).run();
    await sql(db,"UPDATE source_led_grants SET status='failed' WHERE run_id=?",runId).run();await sql(db,"UPDATE acquisition_runs SET status='failed',updated_at=? WHERE id=?",now,runId).run();
    await stopSourceLed(db,grant.programme_id,'paid_outcome_requires_review',now);throw Error('source_led_paid_outcome_requires_review');
  }
}
export async function verifySourceLedCandidate(db,candidateId,{fetcher=fetch,now=new Date().toISOString()}={}) {
  const c=await sql(db,'SELECT c.*,p.status,g.programme_id FROM source_led_candidates c JOIN source_led_candidate_progress p ON p.candidate_id=c.id JOIN source_led_grants g ON g.run_id=c.run_id WHERE c.id=?',candidateId).first();
  if(!c)throw Error('source_led_candidate_missing');if(c.status!=='pending')return {candidate_id:candidateId,status:c.status,replay:true};
  const safety=await sourceLedMetrics(db,c.programme_id,now);
  if(safety.customer_rows||safety.publication_rows||safety.publication_enabled||safety.bulk_enabled||safety.source_mutations||!safety.preservation_gate)throw Error('source_led_shadow_integrity_required');
  const claim=await sql(db,"UPDATE source_led_candidate_progress SET status='verifying',lease_until=? WHERE candidate_id=? AND status='pending' RETURNING candidate_id",new Date(Date.parse(now)+60000).toISOString(),candidateId).all();if(!claim.results.length)throw Error('source_led_candidate_claimed');
  try {
    const document=await fetchSourceDocument(c.url_key,{fetcher,now}),report=verifyDocument(document,{now}),f=report.facts;
    let recordId=null,status='unverified',reason=report.reasons.join(',');
    const targetCountry=JSON.parse(c.discovery_json).target_country,withinQuota=f.country===targetCountry;
    // Canonical identity is created only from fetched event evidence. A query's market never supplies it.
    if(['verified','partial'].includes(report.status)&&report.page_kind==='event'&&withinQuota&&SOURCE_LED_MARKETS.includes(f.country)&&f.event_name&&f.event_start) {
      const record={schema_version:EXPORT_SCHEMA,opportunity_id:'sourceled_'+(await hash([f.country,document.url,f.event_start.slice(0,4)])).slice(0,40),country_code:f.country,event_name:f.event_name,organiser:f.organiser,location:f.location,event_start:f.event_start,event_end:f.event_end,application_url:f.application_url??null,application_deadline:f.application_deadline??null,application_state:f.application_state??'UNKNOWN',canonical_url:document.requested_url,source_platform:report.profile,first_seen:now,last_seen:now,last_checked:now,lifecycle_event:'NEW',evidence:report.evidence,provenance:[{producer:'source-led-search',discovery_candidate_id:c.id,query_target_country:JSON.parse(c.discovery_json).target_country,country_authority:'direct_source',document_hash:document.content_hash}],source_fingerprint:document.content_hash};
      const receipt=await ingestRecords(db,[record],{producer:'source-led-search',environment:'shadow',now});
      if(receipt.accepted!==1)throw Error('source_led_source_import_rejected');recordId=receipt.record_ids[0];status='imported';
      await attributeSerperRecords(db,{runId:c.run_id,usageId:c.usage_id,recordIds:receipt.record_ids,newRecordIds:receipt.new_record_ids,now});
      await sql(db,'UPDATE serper_usage SET candidates_imported=candidates_imported+1 WHERE id=?',c.usage_id).run();
    } else if(f.country&&!withinQuota){status='out_of_market';reason='proved_country_outside_target_quota';}
    else if(report.status==='quarantine'){status='quarantine';reason=['social','editorial','directory'].includes(report.page_kind)?report.page_kind:reason;}
    await sql(db,'UPDATE source_led_candidate_progress SET status=?,record_id=?,actual_country=?,document_json=?,report_json=?,reason=?,checked_at=?,lease_until=NULL WHERE candidate_id=?',status,recordId,f.country??null,stableJson(document),stableJson(report),reason,now,c.id).run();
    return {candidate_id:c.id,status,record_id:recordId,actual_country:f.country??null,proof_status:report.status,reasons:report.reasons};
  } catch {
    await sql(db,"UPDATE source_led_candidate_progress SET status='failed',reason='verification_requires_review',checked_at=?,lease_until=NULL WHERE candidate_id=?",now,c.id).run();await stopSourceLed(db,c.programme_id,'verification_requires_review',now);throw Error('source_led_verification_requires_review');
  }
}
export async function sourceLedStatus(db,now=new Date().toISOString()) {
  const policy=await sql(db,'SELECT * FROM commercial_acquisition_policy WHERE id=1').first(),budget=await serperStatus(db,now);
  const rows=await query(db,'SELECT id,budget_day,status,max_queries,next_query,stop_reason,created_at,expires_at FROM source_led_programmes ORDER BY created_at DESC LIMIT 3');
  return {lane:LANE,automatic_paid_scheduler:false,structured_producer_priority:true,timezone:'Europe/London',policy,daily_total_paid_queries:budget.usage.day_queries_reserved,daily_credit_budget_units:budget.usage.day_credit_budget_units,remaining_queries:Math.max(0,policy.daily_query_limit-budget.usage.day_queries_reserved),remaining_credit_units:Math.max(0,policy.daily_query_limit-budget.usage.day_credit_budget_units),budget_paused:budget.usage.day_queries_reserved>=policy.daily_query_limit||budget.usage.day_credit_budget_units>=policy.daily_query_limit||budget.paused,limits:SOURCE_LED_LIMITS,markets:SOURCE_LED_MARKETS,sessions:await Promise.all(rows.map(async r=>({...r,metrics:await sourceLedMetrics(db,r.id,now)})))};
}
