import {sql} from './store.mjs';
import {assessEligibility} from './pipeline.mjs';
import {compareProof,applicationScope,VERIFIER_VERSION,calendarDate} from './verification.mjs';
import {budgetDay} from './serper-usage.mjs';
import {ukSourceStatus} from './uk-store.mjs';

export const COMMERCIAL_PRODUCERS=['independent-structured','legacy_v2','city-search','source-led-search','platform-catalogue','uk-official','legacy-global-uk','legacy_mk1'];
export const INVENTORY_SQL=`SELECT e.*,
 (SELECT json_group_object(f.field_name,json(f.value_json)) FROM selected_facts f WHERE f.entity_id=e.id) AS fields_json,
 (SELECT json_group_array(DISTINCT p.producer_name) FROM entity_records er JOIN producer_records p ON p.id=er.record_id WHERE er.entity_id=e.id AND p.producer_name IN ('independent-structured','legacy_v2','city-search','source-led-search','platform-catalogue','uk-official','legacy-global-uk','legacy_mk1')) AS producers_json,
 (SELECT p.producer_name FROM entity_records er JOIN producer_records p ON p.id=er.record_id WHERE er.entity_id=e.id AND p.validation_status='accepted' AND p.producer_name IN ('independent-structured','legacy_v2','city-search','source-led-search','platform-catalogue','uk-official','legacy-global-uk','legacy_mk1')
  AND COALESCE(json_extract(p.normalized_json,'$.provenance.diagnostic'),0)<>1 AND COALESCE(json_extract(p.normalized_json,'$.provenance[0].diagnostic'),0)<>1
  ORDER BY p.received_at,p.id LIMIT 1) AS origin,
 (SELECT COUNT(*) FROM selected_facts f JOIN legacy_quality_holds h ON h.record_id=f.record_id WHERE f.entity_id=e.id) AS quality_holds,
 (SELECT COUNT(*) FROM conflicts c WHERE c.entity_id=e.id AND c.resolved=0) AS conflicts,
 r.status AS cached_readiness,r.entity_revision AS readiness_revision,
 v.sequence AS proof_sequence,v.entity_revision AS proof_revision,v.status AS proof_status,
 json_object('status',v.status,'facts',json(json_extract(v.report_json,'$.facts')),'reasons',json(json_extract(v.report_json,'$.reasons')),'profile',json_extract(v.report_json,'$.profile'),'source_url',json_extract(v.report_json,'$.source_url'),'application_heading',COALESCE(json_extract(v.report_json,'$.application_heading'),(SELECT json_extract(h.value,'$.excerpt') FROM json_each(v.report_json,'$.evidence') h WHERE json_extract(h.value,'$.kind')='main_heading' LIMIT 1)),'application_scope_proof',json_object('trader_application',json_extract(v.report_json,'$.application_scope_proof.trader_application'),'restricted_audience',json_extract(v.report_json,'$.application_scope_proof.restricted_audience'),'guaranteed_vendor_space',json_extract(v.report_json,'$.application_scope_proof.guaranteed_vendor_space'),
      'application_role',json_extract(v.report_json,'$.application_scope_proof.application_role'),
      'age_restricted',json_extract(v.report_json,'$.application_scope_proof.age_restricted'),
      'event_date_assertions',json(json_extract(v.report_json,'$.application_scope_proof.event_date_assertions')),
      'application_description',CASE WHEN (json_type(v.report_json,'$.application_scope_proof.event_date_assertions') IS NULL OR json_type(v.report_json,'$.application_scope_proof.application_role') IS NULL) THEN
        (SELECT json_extract(d.value,'$.excerpt') FROM json_each(v.report_json,'$.application_scope_proof.evidence') d WHERE json_extract(d.value,'$.kind')='application_description' LIMIT 1) END),'event_source_url',COALESCE(json_extract(v.report_json,'$.event_source_url'),
      (SELECT CASE WHEN json_valid(json_extract(d.value,'$.excerpt')) THEN json_extract(json_extract(d.value,'$.excerpt'),'$.url') END FROM json_each(v.report_json,'$.evidence') d WHERE json_extract(d.value,'$.kind')='event_json_ld' LIMIT 1)),
    'application_landing_url',json_extract(v.report_json,'$.application_landing_url'),'evidence',json((SELECT json_group_array(json_object('kind',json_extract(x.value,'$.kind'))) FROM json_each(v.report_json,'$.evidence') x))) AS proof_json,
 v.checked_at,v.expires_at,v.verifier_version
 FROM entities e LEFT JOIN readiness r ON r.entity_id=e.id
 LEFT JOIN source_verifications v ON v.sequence=(SELECT MAX(sequence) FROM source_verifications WHERE entity_id=e.id)
 WHERE e.id>? ORDER BY e.id LIMIT 250`;
export async function commercialRows(db,{market=null,onlyCachedReady=false,after=''}={}) {
  if(market&&!/^[A-Z]{2}$/.test(market))throw Error('commercial_market_invalid');
  const query=INVENTORY_SQL.replace('WHERE e.id>? ORDER BY',`WHERE ${market?'e.market=? AND ':''}${onlyCachedReady?"e.environment='shadow' AND r.status='ready' AND ":''}e.id>? ORDER BY`);
  const rows=[];for(;;){const page=(await sql(db,query,...(market?[market,after]:[after])).all()).results??[];if(!page.length)break;rows.push(...page);after=page.at(-1).id;}return rows;
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
  const quarantined=!ready&&Boolean(row.quality_holds||row.conflicts||row.proof_status==='quarantine'||fresh&&(comparison.length||scope.reasons.some(r=>r.startsWith('contradictory_'))));
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
  const eventGroups=new Map();
  for(const r of ready){const f=r.proof.facts,key=JSON.stringify([r.market,...['event_name','event_start','event_end','organiser','location'].map(k=>String(f[k]??r.fields[k]??'').normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim())]);eventGroups.set(key,(eventGroups.get(key)??0)+1);}
  const markets={};for(const market of ['GB','US']) {
    const subset=commercial.filter(r=>r.market===market),usable=subset.filter(r=>r.ready),groups=new Set(usable.map(r=>JSON.stringify(['event_name','event_start','event_end','organiser','location'].map(k=>r.proof.facts[k]))));
    const tally=key=>Object.fromEntries([...new Set(usable.map(r=>key(r)))].map(k=>[k,usable.filter(r=>key(r)===k).length]));
    const holds={};for(const r of subset.filter(r=>!r.ready))for(const reason of r.reasons)holds[reason]=(holds[reason]??0)+1;
    markets[market]={ready:usable.length,watch:subset.filter(r=>r.watch).length,quarantined:subset.filter(r=>r.quarantined).length,blocked:subset.filter(r=>r.blocked).length,
      exact_event_groups:groups.size,application_entities:usable.length,organiser_count:new Set(usable.map(r=>r.proof.facts.organiser)).size,
      source_domains:tally(r=>r.domain),source_families:tally(r=>r.proof.profile??'unknown'),ready_by_producer:tally(r=>r.origin),held_reason_breakdown:holds,
      source_proof_freshness:{current_verified:subset.filter(r=>r.verified).length,stale_expired:subset.filter(r=>r.stale_expired).length,oldest_ready_source_check:usable.map(r=>r.checked_at).sort()[0]??null},
      definitions:'READY is source-proved country. WATCH/quarantine/blocked use retained entity market and can include an unverified or disputed country; they are not geography proof. Exact event grouping is advisory and does not alter identity.'};
  }
  return {schema:'findpitches-v3-commercial-inventory-v1',as_of:now,timezone:'Europe/London',markets,gb:markets.GB,us:markets.US,ready_definition:'Shadow entities with current version/revision-matched source proof, current READY assessment, supported vendor application and no identity/evidence/legacy hold. Publication remains disabled.',
    scope:{commercial_entities:commercial.length,test_control_excluded:all.filter(r=>r.environment==='test').length,other_noncommercial_excluded:all.filter(r=>r.environment!=='test'&&!r.commercial).length},
    totals,by_origin:origin,by_source_membership:membership,attribution:'Origin is the earliest accepted non-diagnostic producer receipt linked to the entity. Origin rows are exclusive and sum to the commercial total. Source membership overlaps and must not be summed.',
    status_counts:'READY/WATCH/quarantined/blocked are exclusive current dispositions. Verified, awaiting verification, missing application proof and stale/expired are overlapping flags. Old cached READY alone never qualifies.',
    ready_by_country:byCountry,ready_by_source_domain:byDomain,ready_by_source_platform:byPlatform,ready_by_application_state:byState,
    ready_event_groups:{distinct_exact_field_groups:eventGroups.size,multiple_application_groups:[...eventGroups.values()].filter(n=>n>1).length,additional_application_entities:ready.length-eventGroups.size,definition:'Advisory grouping by proved country, event title, start/end dates, organiser and venue. READY counts distinct application-opportunity entities; this comparison neither merges identity nor proves semantic duplicates.'},
    kpis:{total_customer_ready_opportunities:ready.length,verification_conversion_percent:pct(ready.length,totals.verification_checked),verification_entities_checked:totals.verification_checked,coverage_all_inventory_unverified_presence:coverage(commercial),coverage_ready_source_proof:coverage(ready,true)}};
}
export async function commercialStatus(db,now=new Date().toISOString()) {
  const rows=await commercialRows(db),report=inventoryFromRows(rows,{now}),ids=rows.filter(r=>r.environment==='shadow'&&COMMERCIAL_PRODUCERS.includes(r.origin)).map(r=>r.id),day=budgetDay(now);
  // First confirmed READY, not a renewal or historical unverified cache claim.
  const history=(await sql(db,`SELECT h.entity_id,MIN(h.occurred_at) AS first_ready,json_extract(v.report_json,'$.profile') AS profile,
    json_object('event_name',json_extract(v.report_json,'$.facts.event_name'),'application_deadline',json_extract(v.report_json,'$.facts.application_deadline'),'event_start',json_extract(v.report_json,'$.facts.event_start'),'event_end',json_extract(v.report_json,'$.facts.event_end')) AS chronology_json,
    json_object('trader_application',json_extract(v.report_json,'$.application_scope_proof.trader_application'),
      'restricted_audience',json_extract(v.report_json,'$.application_scope_proof.restricted_audience'),
      'guaranteed_vendor_space',json_extract(v.report_json,'$.application_scope_proof.guaranteed_vendor_space'),
      'application_role',json_extract(v.report_json,'$.application_scope_proof.application_role'),
      'age_restricted',json_extract(v.report_json,'$.application_scope_proof.age_restricted'),
      'event_date_assertions',json(json_extract(v.report_json,'$.application_scope_proof.event_date_assertions')),
      'application_description',CASE WHEN (json_type(v.report_json,'$.application_scope_proof.event_date_assertions') IS NULL OR json_type(v.report_json,'$.application_scope_proof.application_role') IS NULL) THEN
        (SELECT json_extract(d.value,'$.excerpt') FROM json_each(v.report_json,'$.application_scope_proof.evidence') d WHERE json_extract(d.value,'$.kind')='application_description' LIMIT 1) END) AS scope_json,
    COALESCE(json_extract(v.report_json,'$.application_heading'),(SELECT json_extract(x.value,'$.excerpt') FROM json_each(v.report_json,'$.evidence') x WHERE json_extract(x.value,'$.kind')='main_heading' LIMIT 1)) AS application_heading
    FROM commercial_readiness_history h JOIN source_verifications v ON v.id=h.verification_id WHERE h.status='ready' AND h.entity_id IN (SELECT value FROM json_each(?)) GROUP BY h.entity_id,h.verification_id ORDER BY first_ready,MIN(h.sequence)`,JSON.stringify(ids)).all()).results??[];
  const accepted=new Map();for(const r of history)if(!applicationScope({...r,facts:JSON.parse(r.chronology_json),application_scope_proof:JSON.parse(r.scope_json)}).reasons.length&&!compareProof({}, {facts:JSON.parse(r.chronology_json)}).length&&!accepted.has(r.entity_id))accepted.set(r.entity_id,r);
  const first=[...accepted.values()];
  const newToday=first.filter(r=>budgetDay(r.first_ready)===day).length;
  const usage=await sql(db,`SELECT COALESCE(SUM(queries_attempted),0) AS queries, SUM(credits_observed) AS observed_credits, SUM(CASE WHEN credits_observed IS NULL THEN queries_reserved ELSE 0 END) AS unobserved FROM serper_usage`).first();
  const price=await sql(db,'SELECT credit_unit_cost_usd,bulk_enabled FROM serper_policy WHERE id=1').first();
  const paidIds=new Set(rows.filter(r=>r.environment==='shadow'&&['city-search','source-led-search'].includes(r.origin)).map(r=>r.id));
  const paidReady=first.filter(r=>paidIds.has(r.entity_id)).length;
  const candidates=(await sql(db,`SELECT p.producer_name,COUNT(DISTINCT p.producer_record_id) AS candidate_ids,COUNT(DISTINCT er.entity_id) AS linked_entities FROM producer_records p JOIN entity_records er ON er.record_id=p.id JOIN entities e ON e.id=er.entity_id WHERE e.environment='shadow' AND p.producer_name IN ('independent-structured','legacy_v2','city-search','source-led-search','platform-catalogue','uk-official','legacy-global-uk','legacy_mk1') GROUP BY p.producer_name`).all()).results;
  const receipts=(await sql(db,`SELECT p.producer_name,COUNT(*) AS receipts,COUNT(DISTINCT p.producer_record_id) AS candidate_ids,
    SUM(CASE WHEN NOT EXISTS(SELECT 1 FROM entity_records er WHERE er.record_id=p.id) THEN 1 ELSE 0 END) AS unlinked_receipts
    FROM producer_records p WHERE p.environment='shadow' AND p.producer_name IN ('independent-structured','legacy_v2','city-search','source-led-search','platform-catalogue','uk-official','legacy-global-uk','legacy_mk1')
    AND COALESCE(json_extract(p.normalized_json,'$.provenance.diagnostic'),0)<>1 AND COALESCE(json_extract(p.normalized_json,'$.provenance[0].diagnostic'),0)<>1 GROUP BY p.producer_name`).all()).results;
  const readyHistory=new Set(first.map(r=>r.entity_id)),removed=rows.map(r=>commercialEntity(r,now)).filter(r=>r.commercial&&readyHistory.has(r.id)&&!r.ready&&r.stale_expired).length;
  const uk=await ukSourceStatus(db),all=rows.map(r=>commercialEntity(r,now)),current=new Map(all.map(r=>[r.id,r]));
  // History records the transition, while current proof determines whether a
  // withdrawal still applies. A renewal is not a new READY or a withdrawal.
  const todayHistory=(await sql(db,'SELECT entity_id,status,occurred_at FROM commercial_readiness_history WHERE occurred_at>=? ORDER BY sequence',new Date(Date.parse(now)-48*3600000).toISOString()).all()).results??[];
  const withdrawn=new Set();for(const h of todayHistory)if(budgetDay(h.occurred_at)===day&&h.status!=='ready'&&readyHistory.has(h.entity_id)&&!current.get(h.entity_id)?.ready)withdrawn.add(h.entity_id);
  for(const market of ['GB','US']) {
    const m=report.markets[market];m.new_ready_today=first.filter(r=>current.get(r.entity_id)?.market===market&&budgetDay(r.first_ready)===day).length;
    m.withdrawn_ready_today=[...withdrawn].filter(id=>current.get(id)?.market===market).length;
    m.withdrawal_definition='Previously source-proved READY with a recorded non-READY assessment in this London day, currently withheld. Renewals and later same-day re-promotions are excluded; passive TTL expiry is separately reported as stale/expired.';
  }
  const linkedUK=(await sql(db,"SELECT COUNT(*) AS routes_checked,COUNT(DISTINCT p.entity_id) AS distinct_linked_entities,SUM(p.identity_outcome IN ('EXACT_MATCH','IDEMPOTENT_REPLAY')) AS reconciled_matches,SUM(p.status='imported' AND p.reason='ready') AS ready_outcomes FROM uk_source_progress p").first());
  report.gb={...report.markets.GB,programme:uk,routes_checked:linkedUK.routes_checked,direct_source_visits:uk.direct_source_visits,ready_per_100_direct_source_visits:uk.direct_source_visits?pct(linkedUK.ready_outcomes,uk.direct_source_visits):null,
    duplicates_reconciled_matches:linkedUK.reconciled_matches??0,current_programme_ready:all.filter(r=>r.ready&&r.market==='GB'&&r.origin==='uk-official').length,
    yield_definition:'Run READY outcomes per 100 actual adapter HTTP visits; shared event/form documents can prove several distinct dated applications. Current inventory and unique first promotions are reported separately.'};report.markets.GB=report.gb;
  return {...report,source_receipts:receipts,kpis:{...report.kpis,new_ready_today:newToday,new_ready_day:day,first_proof_readiness_history_available:true,
    paid_acquisition_queries:usage.queries,first_confirmed_paid_ready:paidReady,new_ready_per_100_acquisition_queries:usage.queries?Number((100*paidReady/usage.queries).toFixed(2)):null,queries_per_new_paid_ready:paidReady?usage.queries/paidReady:null,paid_credit_cost_per_ready:paidReady&&usage.unobserved===0?usage.observed_credits/paidReady:null,
    cost_per_ready_usd:paidReady&&price.credit_unit_cost_usd!=null&&usage.unobserved===0?usage.observed_credits*price.credit_unit_cost_usd/paidReady:null,
    pricing_status:price.credit_unit_cost_usd==null?'unit_credit_price_unavailable':'configured',zero_paid_ready:paidReady===0,
    stale_expired_ready_removed:removed,previously_confirmed_ready:readyHistory.size,stale_expired_removal_percent:pct(removed,readyHistory.size),
    identity_duplicate_rate_by_source:Object.fromEntries(candidates.map(r=>[r.producer_name,{candidate_ids:r.candidate_ids,linked_entities:r.linked_entities,percent:pct(Math.max(0,r.candidate_ids-r.linked_entities),r.candidate_ids)}])),
    definitions:'New READY/day counts first source-proved READY per entity in the London day, never renewals. Paid yield/cost uses first confirmed READY with a city-search or source-led-search origin only, including later expiries; free structured READY is not credited to paid queries. Null cost with zero READY is undefined, not zero. Duplicate rate is excess distinct linked producer candidate IDs per distinct entity; replayed receipt versions are excluded. Removal rate is previously proved READY now withheld due to stale/expired evidence.'}};
}
