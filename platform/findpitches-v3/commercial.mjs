import {sql} from './store.mjs';
import {assessEligibility} from './pipeline.mjs';
import {compareProof,applicationScope,VERIFIER_VERSION,calendarDate} from './verification.mjs';
import {budgetDay} from './serper-usage.mjs';

export const COMMERCIAL_PRODUCERS=['independent-structured','legacy_v2','city-search'];
export const INVENTORY_SQL=`SELECT e.*,
 (SELECT json_group_object(f.field_name,json(f.value_json)) FROM selected_facts f WHERE f.entity_id=e.id) AS fields_json,
 (SELECT json_group_array(DISTINCT p.producer_name) FROM entity_records er JOIN producer_records p ON p.id=er.record_id WHERE er.entity_id=e.id AND p.producer_name IN ('independent-structured','legacy_v2','city-search')) AS producers_json,
 (SELECT p.producer_name FROM entity_records er JOIN producer_records p ON p.id=er.record_id WHERE er.entity_id=e.id AND p.validation_status='accepted' AND p.producer_name IN ('independent-structured','legacy_v2','city-search')
  AND COALESCE(json_extract(p.normalized_json,'$.provenance.diagnostic'),0)<>1 AND COALESCE(json_extract(p.normalized_json,'$.provenance[0].diagnostic'),0)<>1
  ORDER BY p.received_at,p.id LIMIT 1) AS origin,
 (SELECT COUNT(*) FROM selected_facts f JOIN legacy_quality_holds h ON h.record_id=f.record_id WHERE f.entity_id=e.id) AS quality_holds,
 (SELECT COUNT(*) FROM conflicts c WHERE c.entity_id=e.id AND c.resolved=0) AS conflicts,
 r.status AS cached_readiness,r.entity_revision AS readiness_revision,
 v.sequence AS proof_sequence,v.entity_revision AS proof_revision,v.status AS proof_status,
 json_object('status',v.status,'facts',json(json_extract(v.report_json,'$.facts')),'reasons',json(json_extract(v.report_json,'$.reasons')),'profile',json_extract(v.report_json,'$.profile'),'source_url',json_extract(v.report_json,'$.source_url'),'application_heading',COALESCE(json_extract(v.report_json,'$.application_heading'),(SELECT json_extract(h.value,'$.excerpt') FROM json_each(v.report_json,'$.evidence') h WHERE json_extract(h.value,'$.kind')='main_heading' LIMIT 1)),'application_landing_url',json_extract(v.report_json,'$.application_landing_url'),'evidence',json((SELECT json_group_array(json_object('kind',json_extract(x.value,'$.kind'))) FROM json_each(v.report_json,'$.evidence') x))) AS proof_json,
 v.checked_at,v.expires_at,v.verifier_version
 FROM entities e LEFT JOIN readiness r ON r.entity_id=e.id
 LEFT JOIN source_verifications v ON v.sequence=(SELECT MAX(sequence) FROM source_verifications WHERE entity_id=e.id)
 WHERE e.id>? ORDER BY e.id LIMIT 250`;
export async function commercialRows(db) {
  const rows=[];let after='';for(;;){const page=(await sql(db,INVENTORY_SQL,after).all()).results??[];if(!page.length)break;rows.push(...page);after=page.at(-1).id;}return rows;
}
const pct=(n,d)=>d?Number((100*n/d).toFixed(2)):null;
const parse=(v,fallback)=>{try{return typeof v==='string'?JSON.parse(v):v??fallback;}catch{return fallback;}};
const empty=()=>({total_distinct_entities:0,verified:0,ready:0,watch:0,quarantined:0,blocked:0,awaiting_verification:0,missing_application_proof:0,stale_expired:0,verification_checked:0});
export function commercialEntity(row,now) {
  const fields=parse(row.fields_json,{}),proof=parse(row.proof_json,{}),entity={...row,...fields};
  const fresh=Boolean(row.proof_sequence&&row.proof_revision===row.revision&&row.verifier_version===VERIFIER_VERSION&&Date.parse(row.checked_at)<=Date.parse(now)&&Date.parse(row.expires_at)>Date.parse(now));
  const comparison=compareProof(entity,{...proof,facts:proof.facts??{}}),scope=applicationScope(proof),reasons=[...new Set([...(proof.reasons??[]),...comparison,...scope.reasons])];
  const eligibility=assessEligibility(entity,{now,conflicts:row.conflicts??0,qualityHolds:row.quality_holds??0});
  const verified=fresh&&row.proof_status==='verified'&&reasons.length===0;
  const ready=verified&&row.cached_readiness==='ready'&&row.readiness_revision===row.revision&&eligibility.status==='eligible'&&Boolean(fields.organiser&&fields.location);
  const quarantined=!ready&&Boolean(row.quality_holds||row.conflicts||row.proof_status==='quarantine'||fresh&&comparison.length);
  const blocked=!ready&&!quarantined&&(['closed','review'].includes(eligibility.status)||!fields.organiser||!fields.location);
  const applicationProof=fresh&&!scope.reasons.length&&Boolean(proof.facts?.application_url)&&['OPEN_NOW','ROLLING'].includes(proof.facts?.application_state)&&!reasons.some(r=>/vendor_application_not_proved|application_route_missing|waitlist_only|application_closed|application_deadline_passed|selected_application_.*disagrees/.test(r));
  const stale=Boolean(row.proof_sequence&&!fresh||fields.event_end&&calendarDate(fields.event_end)<budgetDay(now)||fields.application_deadline&&calendarDate(fields.application_deadline)<budgetDay(now));
  let domain='missing';try{domain=new URL(proof.source_url??fields.canonical_url??fields.application_url).hostname.replace(/^www\./,'');}catch{}
  return {...row,fields,proof,reasons,domain,commercial:row.environment==='shadow'&&COMMERCIAL_PRODUCERS.includes(row.origin),verified,ready,quarantined,blocked,watch:!ready&&!quarantined&&!blocked,
    awaiting_verification:!fresh||row.proof_status==='unverified',missing_application_proof:!applicationProof,stale_expired:stale,verification_checked:Boolean(row.proof_sequence)};
}
export function inventoryFromRows(rows,{now=new Date().toISOString()}={}) {
  const all=rows.map(r=>commercialEntity(r,now)),commercial=all.filter(r=>r.commercial),ready=commercial.filter(r=>r.ready);
  const origin=Object.fromEntries(COMMERCIAL_PRODUCERS.map(p=>[p,empty()])),membership=Object.fromEntries(COMMERCIAL_PRODUCERS.map(p=>[p,empty()])),totals=empty();
  function count(out,row){out.total_distinct_entities++;for(const key of Object.keys(out).filter(k=>k!=='total_distinct_entities'))if(row[key])out[key]++;}
  for(const row of commercial){count(totals,row);count(origin[row.origin],row);for(const p of new Set(parse(row.producers_json,[])))if(membership[p])count(membership[p],row);}
  const byCountry={},byDomain={},byState={},byPlatform={};for(const r of ready){byCountry[r.market]=(byCountry[r.market]??0)+1;byDomain[r.domain]=(byDomain[r.domain]??0)+1;const state=r.proof.facts.application_state;byState[state]=(byState[state]??0)+1;const platform=r.fields.source_platform??r.proof.profile??'unknown';byPlatform[platform]=(byPlatform[platform]??0)+1;}
  function coverage(subset,source=false){const f=r=>source?r.proof.facts:r.fields;const have=k=>subset.filter(r=>Boolean(f(r)?.[k])).length;return {denominator:subset.length,application_url_percent:pct(have('application_url'),subset.length),future_event_date_percent:pct(subset.filter(r=>calendarDate(f(r)?.event_start)>=budgetDay(now)).length,subset.length),location_percent:pct(have('location'),subset.length),organiser_percent:pct(have('organiser'),subset.length)};}
  return {schema:'findpitches-v3-commercial-inventory-v1',as_of:now,timezone:'Europe/London',ready_definition:'Shadow entities with current version/revision-matched source proof, current READY assessment, supported vendor application and no identity/evidence/legacy hold. Publication remains disabled.',
    scope:{commercial_entities:commercial.length,test_control_excluded:all.filter(r=>r.environment==='test').length,other_noncommercial_excluded:all.filter(r=>r.environment!=='test'&&!r.commercial).length},
    totals,by_origin:origin,by_source_membership:membership,attribution:'Origin is the earliest accepted non-diagnostic producer receipt linked to the entity. Origin rows are exclusive and sum to the commercial total. Source membership overlaps and must not be summed.',
    status_counts:'READY/WATCH/quarantined/blocked are exclusive current dispositions. Verified, awaiting verification, missing application proof and stale/expired are overlapping flags. Old cached READY alone never qualifies.',
    ready_by_country:byCountry,ready_by_source_domain:byDomain,ready_by_source_platform:byPlatform,ready_by_application_state:byState,
    kpis:{total_customer_ready_opportunities:ready.length,verification_conversion_percent:pct(ready.length,totals.verification_checked),verification_entities_checked:totals.verification_checked,coverage_all_inventory_unverified_presence:coverage(commercial),coverage_ready_source_proof:coverage(ready,true)}};
}
export async function commercialStatus(db,now=new Date().toISOString()) {
  const rows=await commercialRows(db),report=inventoryFromRows(rows,{now}),ids=rows.filter(r=>r.environment==='shadow'&&COMMERCIAL_PRODUCERS.includes(r.origin)).map(r=>r.id),day=budgetDay(now);
  // First confirmed READY, not a renewal or historical unverified cache claim.
  const history=(await sql(db,`SELECT h.entity_id,h.occurred_at AS first_ready,json_extract(v.report_json,'$.profile') AS profile,
    COALESCE(json_extract(v.report_json,'$.application_heading'),(SELECT json_extract(x.value,'$.excerpt') FROM json_each(v.report_json,'$.evidence') x WHERE json_extract(x.value,'$.kind')='main_heading' LIMIT 1)) AS application_heading
    FROM commercial_readiness_history h JOIN source_verifications v ON v.id=h.verification_id WHERE h.status='ready' AND h.entity_id IN (SELECT value FROM json_each(?)) ORDER BY h.occurred_at,h.sequence`,JSON.stringify(ids)).all()).results??[];
  const accepted=new Map();for(const r of history)if(!applicationScope(r).reasons.length&&!accepted.has(r.entity_id))accepted.set(r.entity_id,r);
  const first=[...accepted.values()];
  const newToday=first.filter(r=>budgetDay(r.first_ready)===day).length;
  const usage=await sql(db,`SELECT COALESCE(SUM(queries_attempted),0) AS queries, SUM(credits_observed) AS observed_credits, SUM(CASE WHEN credits_observed IS NULL THEN queries_reserved ELSE 0 END) AS unobserved FROM serper_usage`).first();
  const price=await sql(db,'SELECT credit_unit_cost_usd,bulk_enabled FROM serper_policy WHERE id=1').first();
  const paidIds=new Set(rows.filter(r=>r.environment==='shadow'&&r.origin==='city-search').map(r=>r.id));
  const paidReady=first.filter(r=>paidIds.has(r.entity_id)).length;
  const candidates=(await sql(db,`SELECT p.producer_name,COUNT(DISTINCT p.producer_record_id) AS candidate_ids,COUNT(DISTINCT er.entity_id) AS linked_entities FROM producer_records p JOIN entity_records er ON er.record_id=p.id JOIN entities e ON e.id=er.entity_id WHERE e.environment='shadow' AND p.producer_name IN ('independent-structured','legacy_v2','city-search') GROUP BY p.producer_name`).all()).results;
  const receipts=(await sql(db,`SELECT p.producer_name,COUNT(*) AS receipts,COUNT(DISTINCT p.producer_record_id) AS candidate_ids,
    SUM(CASE WHEN NOT EXISTS(SELECT 1 FROM entity_records er WHERE er.record_id=p.id) THEN 1 ELSE 0 END) AS unlinked_receipts
    FROM producer_records p WHERE p.environment='shadow' AND p.producer_name IN ('independent-structured','legacy_v2','city-search')
    AND COALESCE(json_extract(p.normalized_json,'$.provenance.diagnostic'),0)<>1 AND COALESCE(json_extract(p.normalized_json,'$.provenance[0].diagnostic'),0)<>1 GROUP BY p.producer_name`).all()).results;
  const readyHistory=new Set(first.map(r=>r.entity_id)),removed=rows.map(r=>commercialEntity(r,now)).filter(r=>r.commercial&&readyHistory.has(r.id)&&!r.ready&&r.stale_expired).length;
  return {...report,source_receipts:receipts,kpis:{...report.kpis,new_ready_today:newToday,new_ready_day:day,first_proof_readiness_history_available:true,
    paid_acquisition_queries:usage.queries,first_confirmed_paid_ready:paidReady,new_ready_per_100_acquisition_queries:usage.queries?Number((100*paidReady/usage.queries).toFixed(2)):null,queries_per_new_paid_ready:paidReady?usage.queries/paidReady:null,paid_credit_cost_per_ready:paidReady&&usage.unobserved===0?usage.observed_credits/paidReady:null,
    cost_per_ready_usd:paidReady&&price.credit_unit_cost_usd!=null&&usage.unobserved===0?usage.observed_credits*price.credit_unit_cost_usd/paidReady:null,
    pricing_status:price.credit_unit_cost_usd==null?'unit_credit_price_unavailable':'configured',zero_paid_ready:paidReady===0,
    stale_expired_ready_removed:removed,previously_confirmed_ready:readyHistory.size,stale_expired_removal_percent:pct(removed,readyHistory.size),
    identity_duplicate_rate_by_source:Object.fromEntries(candidates.map(r=>[r.producer_name,{candidate_ids:r.candidate_ids,linked_entities:r.linked_entities,percent:pct(Math.max(0,r.candidate_ids-r.linked_entities),r.candidate_ids)}])),
    definitions:'New READY/day counts first source-proved READY per entity in the London day, never renewals. Paid yield/cost uses first confirmed READY with city-search origin only, including later expiries; free structured READY is not credited to paid queries. Null cost with zero READY is undefined, not zero. Duplicate rate is excess distinct linked producer candidate IDs per distinct entity; replayed receipt versions are excluded. Removal rate is previously proved READY now withheld due to stale/expired evidence.'}};
}
