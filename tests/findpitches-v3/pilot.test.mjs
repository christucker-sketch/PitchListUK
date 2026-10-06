import test from 'node:test';
import assert from 'node:assert/strict';
import {database,NOW} from './helpers.mjs';
import {sql} from '../../platform/findpitches-v3/store.mjs';
import {drainPipeline} from '../../platform/findpitches-v3/pipeline.mjs';
import {acquireCity} from '../../platform/findpitches-v3/acquisition.mjs';
import {startPilot,schedulePilotRun,checkPilot,pilotMetrics,pilotStopReason,pilotPlan} from '../../platform/findpitches-v3/pilot.mjs';
import {reserveSerperQuery} from '../../platform/findpitches-v3/serper-usage.mjs';
const ENV={V3_CITY_ENABLED:'false',V3_DAILY_QUERY_LIMIT:'1000',SERPER_API_KEY:'recorded-provider-test-key'};
async function ready(t){const db=database(t);await sql(db,"INSERT INTO quality_gates VALUES ('structured-100-preservation',100,0,'{}','unit-gate',?)",NOW).run();return db;}
test('diversified controlled pilot stops on poor yield at 12 queries with bulk disabled',async t=>{
  const db=await ready(t),pilot=await startPilot(db,{},NOW);let calls=0;
  for(let n=0;n<6;n++){
    const grant=await schedulePilotRun(db,pilot.id,NOW);
    await acquireCity(db,{...grant,run_id:grant.run_id},ENV,{runId:grant.run_id,now:NOW,fetcher:async()=>{calls++;return Response.json({credits:1,organic:[{title:'Recorded River Trading Festival '+calls,link:'https://recorded-source.example/festival/'+calls}]});}});
    await drainPipeline(db,{now:NOW});
  }
  const metrics=await pilotMetrics(db,pilot.id,NOW);assert.equal(metrics.queries,12);assert.equal(metrics.entities_created,12);assert.equal(metrics.new_ready_opportunities,0);
  await assert.rejects(schedulePilotRun(db,pilot.id,NOW),/poor_ready_yield/);assert.equal(calls,12);
  assert.equal((await sql(db,'SELECT status FROM acquisition_pilots WHERE id=?',pilot.id).first()).status,'paused');
  assert.equal((await sql(db,'SELECT bulk_enabled FROM serper_policy WHERE id=1').first()).bulk_enabled,0);
  assert.equal(new Set((await sql(db,"SELECT market FROM serper_usage WHERE lane='controlled-pilot'").all()).results.map(r=>r.market)).size,3);
  assert.equal(new Set(pilotPlan().flatMap(p=>p.queries)).size,240);
});
test('pilot reservations enforce the smaller cap atomically alongside the 1000-day policy',async t=>{
  const db=await ready(t),pilot=await startPilot(db,{max_queries:2,daily_ceiling:2},NOW),grant=await schedulePilotRun(db,pilot.id,NOW);
  await sql(db,"UPDATE pilot_run_grants SET status='running' WHERE run_id=?",grant.run_id).run();
  await sql(db,"INSERT INTO acquisition_runs(id,city,day,queries_reserved,status,created_at,updated_at) VALUES (?,?,'2026-10-06',2,'reserved',?,?)",grant.run_id,grant.city,NOW,NOW).run();
  const results=await Promise.allSettled(Array.from({length:6},(_,index)=>reserveSerperQuery(db,{runId:grant.run_id,index,query:'recorded '+index,market:'GB',region:'GB-ENG',now:NOW,pilotId:pilot.id})));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,2);assert.equal((await pilotMetrics(db,pilot.id,NOW)).reserved,2);
});
test('concurrent next-run admission cannot issue two grants and an expired grant cannot spend',async t=>{
  const db=await ready(t),pilot=await startPilot(db,{},NOW);
  const admitted=await Promise.allSettled([schedulePilotRun(db,pilot.id,NOW),schedulePilotRun(db,pilot.id,NOW)]);
  assert.equal(admitted.filter(r=>r.status==='fulfilled').length,1);assert.equal((await sql(db,'SELECT COUNT(*) AS n FROM pilot_run_grants').first()).n,1);
  const grant=admitted.find(r=>r.status==='fulfilled').value;let calls=0;
  await assert.rejects(acquireCity(db,grant,ENV,{runId:grant.run_id,now:'2026-10-06T15:00:00.001Z',fetcher:async()=>{calls++;return Response.json({organic:[]});}}),/pilot_not_active/);assert.equal(calls,0);
  await assert.rejects(sql(db,"UPDATE acquisition_pilots SET status='active' WHERE id=?",pilot.id).run(),/cannot_reopen/);
});
test('query replay, overlarge grants, missing authorisation and provider uncertainty cannot rebill',async t=>{
  const db=await ready(t);await assert.rejects(startPilot(db,{daily_ceiling:251,max_queries:251},NOW),/bounded/);
  const pilot=await startPilot(db,{},NOW),grant=await schedulePilotRun(db,pilot.id,NOW);let calls=0;
  await assert.rejects(acquireCity(db,{...grant,query_limit:4},ENV,{runId:grant.run_id,now:NOW,fetcher:async()=>{calls++;return Response.json({organic:[]});}}),/grant_required/);assert.equal(calls,0);
  await assert.rejects(acquireCity(db,grant,ENV,{runId:grant.run_id,now:NOW,fetcher:async()=>{calls++;throw Error('uncertain recorded timeout');}}),/review_required/);
  await assert.rejects(acquireCity(db,grant,ENV,{runId:grant.run_id,now:NOW,fetcher:async()=>{calls++;return Response.json({organic:[]});}}),/operator_review/);assert.equal(calls,1);
});
test('automatic stop criteria cover duplicate spikes, backlog age and integrity/leakage',()=>{
  const ok={queries:12,pending_records:0,entities_created:20,new_ready_opportunities:3,entity_duplicate_rate:.1,due_jobs:0,oldest_due_seconds:0,preservation_gate:1};
  assert.equal(pilotStopReason(ok),null);assert.equal(pilotStopReason({...ok,entity_duplicate_rate:.61}),'duplicate_rate_exceeded');
  assert.equal(pilotStopReason({...ok,oldest_due_seconds:121}),'queue_backlog');assert.equal(pilotStopReason({...ok,due_jobs:41}),'queue_backlog');
  assert.equal(pilotStopReason({...ok,source_mutations:1}),'source_preservation_failed');assert.equal(pilotStopReason({...ok,customer_rows:1}),'shadow_scope_leakage');
});
test('backlog prevents pilot spending before the first query',async t=>{
  const db=await ready(t);await sql(db,"INSERT INTO jobs(id,stage,dedupe_key,payload_json,available_at,created_at,updated_at) VALUES ('aged','reconcile','aged','{}','2026-10-06T11:57:59.000Z',?,?)",NOW,NOW).run();
  await assert.rejects(startPilot(db,{},NOW),/queue_backlog/);assert.equal((await sql(db,'SELECT COUNT(*) AS n FROM serper_usage').first()).n,0);
});
test('duplicate execution of an approved grant can claim paid work only once',async t=>{
  const db=await ready(t),pilot=await startPilot(db,{},NOW),grant=await schedulePilotRun(db,pilot.id,NOW);let calls=0;
  const run=()=>acquireCity(db,grant,ENV,{runId:grant.run_id,now:NOW,fetcher:async()=>{calls++;return Response.json({credits:1,organic:[]});}});
  const results=await Promise.allSettled([run(),run()]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(calls,2);
});
