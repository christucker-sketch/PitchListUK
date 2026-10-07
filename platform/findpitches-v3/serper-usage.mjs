import {sql} from './store.mjs';
import {hash} from './contract.mjs';

export const SERPER_TIMEZONE='Europe/London';
export function budgetDay(now) {
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:SERPER_TIMEZONE,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now));
  const part=name=>parts.find(p=>p.type===name).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function nextBudgetDay(now) {
  // Find the next local midnight, including 23/25-hour DST days.
  const today=budgetDay(now);let low=Date.parse(now),high=low+27*3600000;
  while(high-low>1){const middle=Math.floor((low+high)/2);if(budgetDay(new Date(middle).toISOString())===today)low=middle;else high=middle;}
  return new Date(high).toISOString();
}
export async function serperPolicy(db) {
  const policy=await sql(db,'SELECT * FROM serper_policy WHERE id=1').first();
  if(!policy)throw new Error('serper_budget_policy_required');
  return policy;
}
const CREDITS='MAX(credit_units_reserved,COALESCE(credits_observed,0))';
export async function reserveSerperQuery(db,{runId,index,query,producer='city-search',lane='city-acquisition',market,region,now,pilotId=null,programmeId=null}) {
  const day=budgetDay(now),hour=new Date(Date.parse(now)-3600000).toISOString();
  const id='serper_'+(await hash([runId,index])).slice(0,40);
  // One atomic INSERT ... SELECT serializes concurrent reservations in D1.
  const inserted=await sql(db,`INSERT INTO serper_usage(id,run_id,query_index,kind,producer,lane,market,region,query_hash,
    queries_reserved,credit_units_reserved,status,budget_day,reserved_at)
    SELECT ?,?,?,'live',?,?,?,?,?,1,1,'reserved',?,? FROM serper_policy p
    WHERE p.id=1 AND p.manual_paused=0 AND (p.pause_until IS NULL OR p.pause_until<=?)
      AND (SELECT manual_paused FROM commercial_acquisition_policy WHERE id=1)=0
      AND COALESCE((SELECT SUM(queries_reserved) FROM serper_usage WHERE run_id=?),0)+1<=p.max_queries_per_run
      AND COALESCE((SELECT SUM(${CREDITS}) FROM serper_usage WHERE run_id=?),0)+1<=p.max_credits_per_run
      AND COALESCE((SELECT SUM(queries_reserved) FROM serper_usage WHERE reserved_at>?),0)+1<=p.max_queries_per_hour
      AND COALESCE((SELECT SUM(${CREDITS}) FROM serper_usage WHERE reserved_at>?),0)+1<=p.max_credits_per_hour
      AND COALESCE((SELECT SUM(queries_reserved) FROM serper_usage WHERE budget_day=?),0)+1<=p.max_queries_per_day
      AND COALESCE((SELECT SUM(${CREDITS}) FROM serper_usage WHERE budget_day=?),0)+1<=p.max_credits_per_day
      AND COALESCE((SELECT SUM(queries_reserved) FROM serper_usage WHERE budget_day=?),0)+1<=(SELECT daily_query_limit FROM commercial_acquisition_policy WHERE id=1)
      AND COALESCE((SELECT SUM(${CREDITS}) FROM serper_usage WHERE budget_day=?),0)+1<=(SELECT daily_query_limit FROM commercial_acquisition_policy WHERE id=1)
      AND (?<>'source-led-paid' OR EXISTS(SELECT 1 FROM source_led_programmes s JOIN source_led_grants g ON g.programme_id=s.id
        JOIN commercial_acquisition_policy c ON c.id=1 WHERE s.id=? AND s.status='active' AND s.expires_at>? AND s.budget_day=?
        AND s.active_run_id=g.run_id AND g.run_id=? AND g.status='running' AND g.market=? AND g.query_hash=? AND c.manual_paused=0
        AND COALESCE((SELECT SUM(u.queries_reserved) FROM serper_usage u JOIN source_led_grants z ON z.run_id=u.run_id WHERE z.programme_id=s.id),0)+1<=s.max_queries
        AND COALESCE((SELECT SUM(queries_reserved) FROM serper_usage WHERE budget_day=? AND lane='source-led-paid' AND market=g.market),0)+1<=c.queries_per_market))
      AND (? IS NULL OR EXISTS(SELECT 1 FROM acquisition_pilots s JOIN pilot_run_grants g ON g.pilot_id=s.id
        WHERE s.id=? AND s.status='active' AND s.expires_at>? AND s.budget_day=? AND s.active_run_id=g.run_id AND g.run_id=? AND g.status='running'
        AND COALESCE((SELECT SUM(queries_reserved) FROM serper_usage WHERE budget_day=?),0)+1<=s.daily_ceiling
        AND COALESCE((SELECT SUM(${CREDITS}) FROM serper_usage WHERE budget_day=?),0)+1<=s.daily_ceiling
        AND COALESCE((SELECT SUM(u.queries_reserved) FROM serper_usage u JOIN pilot_run_grants z ON z.run_id=u.run_id WHERE z.pilot_id=s.id),0)+1<=s.max_queries))
    RETURNING id`,id,runId,index,producer,lane,market,region,await hash(query),day,now,now,runId,runId,hour,hour,day,day,day,day,lane,programmeId,now,day,runId,market,await hash(query),day,pilotId,pilotId,now,day,runId,day,day).all();
  await refreshSerperPause(db,now);
  if(inserted.results.length!==1)throw new Error('serper_query_budget_exhausted_or_paused');
  return id;
}
export async function refreshSerperPause(db,now) {
  const day=budgetDay(now),hour=new Date(Date.parse(now)-3600000).toISOString();
  // The aggregation and policy update are a single statement, avoiding stale
  // concurrent reads clearing a pause established by another reservation.
  await sql(db,`WITH usage AS (SELECT
    COALESCE(SUM(CASE WHEN budget_day=? THEN queries_reserved ELSE 0 END),0) AS day_queries,
    COALESCE(SUM(CASE WHEN budget_day=? THEN ${CREDITS} ELSE 0 END),0) AS day_credits,
    COALESCE(SUM(CASE WHEN reserved_at>? THEN queries_reserved ELSE 0 END),0) AS hour_queries,
    COALESCE(SUM(CASE WHEN reserved_at>? THEN ${CREDITS} ELSE 0 END),0) AS hour_credits,
    MIN(CASE WHEN reserved_at>? THEN reserved_at END) AS first_hour_reservation
    FROM serper_usage WHERE budget_day=? OR reserved_at>?)
    UPDATE serper_policy SET pause_until=CASE
      WHEN (SELECT day_queries>=max_queries_per_day OR day_credits>=max_credits_per_day FROM usage) THEN ?
      WHEN (SELECT hour_queries>=max_queries_per_hour OR hour_credits>=max_credits_per_hour FROM usage)
        THEN (SELECT strftime('%Y-%m-%dT%H:%M:%fZ',first_hour_reservation,'+1 hour') FROM usage)
      ELSE NULL END,
      pause_reason=CASE
      WHEN (SELECT day_queries>=max_queries_per_day OR day_credits>=max_credits_per_day FROM usage) THEN 'daily_budget_reached'
      WHEN (SELECT hour_queries>=max_queries_per_hour OR hour_credits>=max_credits_per_hour FROM usage) THEN 'hourly_budget_reached'
      ELSE NULL END,updated_at=? WHERE id=1 AND manual_paused=0`,day,day,hour,hour,hour,day,hour,nextBudgetDay(now),now).run();
}
export async function observeSerperCredits(db,id,credits,now) {
  const observable=typeof credits==='number'&&Number.isFinite(credits)&&credits>=0;
  await sql(db,'UPDATE serper_usage SET credits_observed=?,credits_source=? WHERE id=?',observable?credits:null,observable?'provider_response':'unavailable',id).run();
  if(observable&&credits>1)await sql(db,"UPDATE serper_policy SET manual_paused=1,pause_reason='provider_credit_charge_exceeded_reservation',updated_at=? WHERE id=1",now).run();
  await refreshSerperPause(db,now);
  return observable&&credits>1;
}
export async function attributeSerperRecords(db,{runId,usageId,recordIds,newRecordIds=[],now}) {
  for(const recordId of recordIds) {
    await sql(db,'INSERT OR IGNORE INTO serper_run_records(run_id,record_id,usage_id,new_receipt,created_at) VALUES (?,?,?,?,?)',runId,recordId,usageId,newRecordIds.includes(recordId)?1:0,now).run();
  }
}
export async function serperStatus(db,now) {
  const policy=await serperPolicy(db),day=budgetDay(now),hour=new Date(Date.parse(now)-3600000).toISOString();
  const usage=await sql(db,`SELECT
    COALESCE(SUM(CASE WHEN budget_day=? THEN queries_reserved ELSE 0 END),0) AS day_queries_reserved,
    COALESCE(SUM(CASE WHEN budget_day=? THEN queries_attempted ELSE 0 END),0) AS day_queries_attempted,
    COALESCE(SUM(CASE WHEN budget_day=? THEN queries_completed ELSE 0 END),0) AS day_queries_completed,
    COALESCE(SUM(CASE WHEN budget_day=? THEN ${CREDITS} ELSE 0 END),0) AS day_credit_budget_units,
    SUM(CASE WHEN budget_day=? THEN credits_observed END) AS day_credits_observed,
    COALESCE(SUM(CASE WHEN budget_day=? AND credits_observed IS NULL THEN queries_reserved ELSE 0 END),0) AS day_queries_without_credit_observation,
    COALESCE(SUM(CASE WHEN reserved_at>? THEN queries_reserved ELSE 0 END),0) AS hour_queries_reserved,
    COALESCE(SUM(CASE WHEN reserved_at>? THEN ${CREDITS} ELSE 0 END),0) AS hour_credit_budget_units
    FROM serper_usage WHERE budget_day=? OR reserved_at>?`,day,day,day,day,day,day,hour,hour,day,hour).first();
  const rows=(await sql(db,`SELECT a.id AS run_id,a.city,a.created_at AS timestamp,a.updated_at,a.status,
    u.producer,u.lane,u.market,u.region,SUM(u.queries_reserved) AS queries_reserved,
    SUM(u.queries_attempted) AS query_count,SUM(u.queries_completed) AS queries_completed,
    SUM(u.credits_observed) AS observed_credit_subtotal,
    SUM(CASE WHEN u.credits_observed IS NULL THEN u.queries_reserved ELSE 0 END) AS queries_without_credit_observation,
    SUM(${CREDITS}) AS credit_budget_units,SUM(u.candidates_produced) AS candidates_produced,
    SUM(u.candidates_imported) AS candidates_accepted
    FROM acquisition_runs a JOIN serper_usage u ON u.run_id=a.id
    WHERE u.budget_day=? GROUP BY a.id ORDER BY a.created_at DESC LIMIT 50`,day).all()).results;
  const yields=(await sql(db,`SELECT x.run_id,COUNT(DISTINCT x.record_id) AS attributed_receipts,
      COUNT(DISTINCT p.producer_record_id) AS unique_candidates,
      COUNT(DISTINCT CASE WHEN a.status='eligible' THEN e.id END) AS usable_opportunities,
      COUNT(DISTINCT CASE WHEN d.outcome='NEW_ENTITY' AND x.new_receipt=1 THEN e.id END) AS entities_created,
      COUNT(DISTINCT CASE WHEN d.outcome='EXACT_MATCH' THEN x.record_id END) AS matched_records,
      COUNT(DISTINCT CASE WHEN d.record_id IS NOT NULL THEN x.record_id END) AS reconciled_records,
      COUNT(DISTINCT CASE WHEN r.status='ready' AND r.entity_revision=e.revision THEN e.id END) AS ready_opportunities,
      COUNT(DISTINCT CASE WHEN r.status='ready' AND r.entity_revision=e.revision AND d.outcome='NEW_ENTITY' AND x.new_receipt=1 THEN e.id END) AS new_ready_opportunities
      FROM serper_run_records x JOIN producer_records p ON p.id=x.record_id
      LEFT JOIN entity_records er ON er.record_id=x.record_id LEFT JOIN entities e ON e.id=er.entity_id
      LEFT JOIN reconciliation_decisions d ON d.record_id=x.record_id LEFT JOIN readiness r ON r.entity_id=e.id
      LEFT JOIN assessments a ON a.id=(SELECT id FROM assessments z WHERE z.entity_id=e.id AND z.entity_revision=e.revision ORDER BY z.assessed_at DESC,z.id DESC LIMIT 1)
      WHERE x.run_id IN (SELECT value FROM json_each(?)) GROUP BY x.run_id`,JSON.stringify(rows.map(r=>r.run_id))).all()).results;
  const runs=[];
  for(const row of rows) {
    const yieldRow=yields.find(y=>y.run_id===row.run_id)??{attributed_receipts:0,unique_candidates:0,usable_opportunities:0,ready_opportunities:0,new_ready_opportunities:0,entities_created:0,matched_records:0,reconciled_records:0};
    const credits=row.queries_without_credit_observation===0?row.observed_credit_subtotal:null;
    const cost=credits!==null&&policy.credit_unit_cost_usd!==null?credits*policy.credit_unit_cost_usd:null;
    runs.push({...row,...yieldRow,credits_consumed:credits,cost_usd:cost,
      duplicate_candidate_occurrences:Math.max(0,row.candidates_produced-yieldRow.unique_candidates),
      candidate_duplicate_rate:row.candidates_produced?Math.max(0,row.candidates_produced-yieldRow.unique_candidates)/row.candidates_produced:0,
      entity_duplicate_rate:yieldRow.reconciled_records?yieldRow.matched_records/yieldRow.reconciled_records:null,
      queries_per_candidate:yieldRow.unique_candidates?row.query_count/yieldRow.unique_candidates:null,
      credits_per_candidate:credits!==null&&yieldRow.unique_candidates?credits/yieldRow.unique_candidates:null,
      cost_per_candidate_usd:cost!==null&&yieldRow.unique_candidates?cost/yieldRow.unique_candidates:null,
      cost_per_candidate_occurrence_usd:cost!==null&&row.candidates_produced?cost/row.candidates_produced:null,
      queries_per_ready_opportunity:yieldRow.new_ready_opportunities?row.query_count/yieldRow.new_ready_opportunities:null,
      credits_per_ready_opportunity:credits!==null&&yieldRow.new_ready_opportunities?credits/yieldRow.new_ready_opportunities:null,
      cost_per_ready_opportunity_usd:cost!==null&&yieldRow.new_ready_opportunities?cost/yieldRow.new_ready_opportunities:null});
  }
  const activePause=policy.manual_paused===1||policy.pause_until&&policy.pause_until>now;
  return {provider:'serper',timezone:SERPER_TIMEZONE,day,as_of:now,bulk_enabled:policy.bulk_enabled===1,
    paused:Boolean(activePause),pause_reason:activePause?policy.pause_reason:null,pause_until:activePause?policy.pause_until:null,
    limits:{queries_per_run:policy.max_queries_per_run,queries_per_hour:policy.max_queries_per_hour,queries_per_day:policy.max_queries_per_day,
      credits_per_run:policy.max_credits_per_run,credits_per_hour:policy.max_credits_per_hour,credits_per_day:policy.max_credits_per_day},
    usage:{...usage,credits_consumed:usage.day_queries_without_credit_observation===0?usage.day_credits_observed:null},
    remaining:{daily_queries:Math.max(0,policy.max_queries_per_day-usage.day_queries_reserved),daily_credit_units:Math.max(0,policy.max_credits_per_day-usage.day_credit_budget_units),hourly_queries:Math.max(0,policy.max_queries_per_hour-usage.hour_queries_reserved),hourly_credit_units:Math.max(0,policy.max_credits_per_hour-usage.hour_credit_budget_units)},
    credit_unit_cost_usd:policy.credit_unit_cost_usd,pricing_status:policy.credit_unit_cost_usd===null?'unit_credit_price_unavailable':'configured',
    yield_definition:'Current shared-entity eligibility/readiness; later evidence may contribute. Ready cost denominator includes newly sourced entities only.',runs};
}
