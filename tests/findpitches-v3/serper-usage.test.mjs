import test from 'node:test';
import assert from 'node:assert/strict';
import {database,NOW} from './helpers.mjs';
import {sql} from '../../platform/findpitches-v3/store.mjs';
import {acquireCity} from '../../platform/findpitches-v3/acquisition.mjs';
import {budgetDay,nextBudgetDay,serperStatus} from '../../platform/findpitches-v3/serper-usage.mjs';
const ENV={V3_CITY_ENABLED:'true',V3_DAILY_QUERY_LIMIT:'1000',SERPER_API_KEY:'recorded-test-provider-key'};
async function configured(t,limits='') {
  const db=database(t);
  await sql(db,"INSERT INTO quality_gates VALUES ('structured-100-preservation',100,0,'{}','unit-gate',?)",NOW).run();
  await sql(db,'UPDATE serper_policy SET bulk_enabled=1'+limits+' WHERE id=1').run();
  return db;
}
test('concurrent runs cannot exceed the daily reservation budget; status exposes pause and unknown billing',async t=>{
  const db=await configured(t,',max_queries_per_day=2,max_credits_per_day=2');let calls=0;
  const fetcher=async()=>{calls++;return Response.json({organic:[]});};
  const results=await Promise.allSettled(Array.from({length:6},(_,i)=>acquireCity(db,{city:'austin-tx',query_limit:1},ENV,{fetcher,now:NOW,runId:'parallel-'+i})));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,2);assert.equal(calls,2);
  const status=await serperStatus(db,NOW);assert.equal(status.paused,true);assert.equal(status.pause_reason,'daily_budget_reached');
  assert.equal(status.usage.day_queries_attempted,2);assert.equal(status.usage.credits_consumed,null);assert.equal(status.remaining.daily_queries,0);
  const tomorrow='2026-10-06T23:00:00.000Z';await acquireCity(db,{city:'austin-tx',query_limit:1},ENV,{fetcher,now:tomorrow,runId:'next-day'});assert.equal(calls,3);
});
test('rolling hourly limits expire exactly one hour later and per-run limits reject before billing',async t=>{
  const db=await configured(t,',max_queries_per_run=1,max_queries_per_hour=1,max_credits_per_hour=1');let calls=0;
  const fetcher=async()=>{calls++;return Response.json({credits:1,organic:[]});};
  await assert.rejects(acquireCity(db,{city:'austin-tx',query_limit:2},ENV,{fetcher,now:NOW,runId:'too-many'}),/run_query_limit/);
  await acquireCity(db,{city:'austin-tx',query_limit:1},ENV,{fetcher,now:NOW,runId:'first'});
  await assert.rejects(acquireCity(db,{city:'austin-tx',query_limit:1},ENV,{fetcher,now:'2026-10-06T12:59:59.999Z',runId:'blocked'}),/exhausted/);
  await acquireCity(db,{city:'austin-tx',query_limit:1},ENV,{fetcher,now:'2026-10-06T13:00:00.000Z',runId:'hour-reset'});assert.equal(calls,2);
});
test('observable excessive credits pause further requests; uncertainties retain their budget reservation',async t=>{
  const db=await configured(t);let calls=0;
  const fetcher=async()=>{calls++;return Response.json({credits:2,organic:[]});};
  await assert.rejects(acquireCity(db,{city:'austin-tx',query_limit:2},ENV,{fetcher,now:NOW,runId:'unexpected-credit'}),/credit_charge_requires_operator_review/);
  assert.equal(calls,1);const status=await serperStatus(db,NOW);assert.equal(status.paused,true);
  assert.equal(status.pause_reason,'provider_credit_charge_exceeded_reservation');assert.equal(status.usage.day_credit_budget_units,2);
  assert.equal(status.runs[0].credits_consumed,2);assert.equal(status.runs[0].cost_usd,null);
  await assert.rejects(acquireCity(db,{city:'austin-tx',query_limit:1},ENV,{fetcher,now:NOW,runId:'paused'}),/exhausted/);assert.equal(calls,1);
});
test('canary grants cannot bypass the same daily budget',async t=>{
  const db=await configured(t,',max_queries_per_day=1,max_credits_per_day=1');let calls=0;
  const fetcher=async()=>{calls++;return Response.json({credits:1,organic:[]});};
  await acquireCity(db,{city:'austin-tx',query_limit:1},ENV,{fetcher,now:NOW,runId:'daily-used'});
  const runId='canary_12345678-1234-1234-1234-123456789abc';
  await assert.rejects(acquireCity(db,{city:'austin-tx',query_limit:1,run_id:runId,canary:true},{...ENV,V3_CITY_ENABLED:'false',V3_CANARY_RUN_ID:runId,V3_CANARY_EXPIRES_AT:'2026-10-06T12:05:00.000Z'},{fetcher,now:NOW,runId}),/exhausted/);assert.equal(calls,1);
});
test('monetary candidate cost uses unique candidates and preserves observable credits on HTTP failures',async t=>{
  const db=await configured(t);await sql(db,'UPDATE serper_policy SET credit_unit_cost_usd=0.002 WHERE id=1').run();
  const item={title:'River Arts Festival Vendors',link:'https://example.org/river-festival',snippet:'Vendors apply for stalls'};
  await acquireCity(db,{city:'austin-tx',query_limit:2},ENV,{now:NOW,runId:'duplicate-results',fetcher:async()=>Response.json({credits:1,organic:[item,item]})});
  const run=(await serperStatus(db,NOW)).runs.find(r=>r.run_id==='duplicate-results');
  assert.equal(run.candidates_produced,4);assert.equal(run.unique_candidates,1);assert.equal(run.duplicate_candidate_occurrences,3);
  assert.equal(run.cost_per_candidate_usd,0.004);assert.equal(run.cost_per_candidate_occurrence_usd,0.001);assert.equal(run.cost_per_ready_opportunity_usd,null);
  await assert.rejects(acquireCity(db,{city:'austin-tx',query_limit:1},ENV,{now:NOW,runId:'http-credit-observation',fetcher:async()=>Response.json({credits:0,message:ENV.SERPER_API_KEY},{status:429})}),/search_provider_http_429/);
  const failure=(await serperStatus(db,NOW)).runs.find(r=>r.run_id==='http-credit-observation');assert.equal(failure.credits_consumed,0);assert.equal(failure.credit_budget_units,1);
});
test('London budget boundaries account for both DST transitions',()=>{
  assert.equal(budgetDay('2026-10-06T23:00:00.000Z'),'2026-10-07');
  assert.equal(nextBudgetDay('2026-03-29T00:00:00.000Z'),'2026-03-29T23:00:00.000Z');
  assert.equal(nextBudgetDay('2026-10-24T23:00:00.000Z'),'2026-10-26T00:00:00.000Z');
});
