import test from 'node:test';
import assert from 'node:assert/strict';
import {database,NOW} from './helpers.mjs';
import {sql} from '../../platform/findpitches-v3/store.mjs';
import {hash,stableJson} from '../../platform/findpitches-v3/contract.mjs';
import {budgetDay} from '../../platform/findpitches-v3/serper-usage.mjs';
import {startSourceLed,scheduleSourceLed,executeSourceLed,stopSourceLed,verifySourceLedCandidate,sourceLedPlan,sourceLedMetrics,sourceLedRoute,sourceLedStatus,sourceLedStopReason} from '../../platform/findpitches-v3/source-led.mjs';

const ENV={V3_CITY_ENABLED:'false',V3_DAILY_QUERY_LIMIT:'1000',SERPER_API_KEY:'local-fixture-only'};
async function configured(t) {
  const db=database(t);
  await sql(db,"INSERT INTO quality_gates VALUES ('structured-100-preservation',100,0,'{}','gate',?)",NOW).run();
  return db;
}
async function priorUKUsage(db,n) {
  for(let i=0;i<n;i++) {
    const id='previous-uk-'+i;
    await sql(db,"INSERT INTO acquisition_runs(id,city,day,queries_reserved,status,created_at,updated_at) VALUES (?, 'earlier UK programme',?,1,'complete',?,?)",id,budgetDay(NOW),NOW,NOW).run();
    await sql(db,"INSERT INTO serper_usage(id,run_id,query_index,kind,producer,lane,market,query_hash,queries_reserved,credit_units_reserved,status,budget_day,reserved_at) VALUES (?, ?,0,'live','source-led-search','source-led-paid','GB',?,1,1,'complete',?,?)",'usage-'+id,id,id,budgetDay(NOW),NOW).run();
  }
}

test('UK programme has four distinct operator/event-first searches, without changing the international plan',async t=>{
  const international=sourceLedPlan(NOW),uk=sourceLedPlan(NOW,'uk_growth');
  assert.equal(international.length,25);
  assert.deepEqual(international.slice(0,5).map(r=>r.market),['GB','CA','AU','NZ','US']);
  assert.equal(uk.length,4);
  assert.equal(new Set(uk.map(r=>r.query)).size,4);
  assert.ok(uk.every(r=>r.market==='GB'&&r.programme_scope==='uk_growth'));
  assert.ok(uk.every(r=>!international.some(old=>old.query===r.query)));
  assert.ok(uk.some(r=>r.query.includes('2026'))&&uk.some(r=>r.query.includes('2027')));
  for(const r of uk)for(const excluded of ['-site:facebook.com','-site:eventbrite.com','-inurl:login','-inurl:directory','-inurl:news'])assert.ok(r.query.includes(excluded));
  const db=await configured(t),old=await startSourceLed(db,{},NOW);
  const saved=await sql(db,'SELECT plan_json FROM source_led_programmes WHERE id=?',old.id).first();
  await stopSourceLed(db,old.id,'operator_complete',NOW,{latch:false});
  const fresh=await startSourceLed(db,{scope:'uk_growth'},NOW);
  assert.equal(fresh.max_queries,4);assert.equal(fresh.scope,'uk_growth');
  assert.equal(fresh.daily_total_paid_limit,25);assert.equal(fresh.queries_per_country,5);assert.equal(fresh.limits.warmup_queries,4);
  assert.equal((await sql(db,'SELECT plan_json FROM source_led_programmes WHERE id=?',old.id).first()).plan_json,saved.plan_json);
  assert.equal((await sourceLedStatus(db,NOW)).sessions.find(s=>s.id===fresh.id).scope,'uk_growth');
});

test('UK start rejects unknown scopes, oversized budgets and caller-supplied countries/queries/plans',async t=>{
  const db=await configured(t);
  for(const options of [{scope:'all'}, {scope:null}, {scope:'uk_growth',max_queries:0}, {scope:'uk_growth',max_queries:5}, {scope:'uk_growth',max_queries:25},
    {scope:'uk_growth',market:'US'}, {scope:'uk_growth',query:'caller arbitrary query'}, {scope:'uk_growth',plan_json:'[]'}, {scope:'uk_growth',markets:['GB','US']}]) {
    await assert.rejects(startSourceLed(db,options,NOW),/unknown_scope|four_queries|start_fields_invalid/);
  }
  assert.equal((await sql(db,'SELECT COUNT(*) AS n FROM source_led_programmes').first()).n,0);
  assert.equal((await sql(db,'SELECT COUNT(*) AS n FROM serper_usage').first()).n,0);
  assert.throws(()=>sourceLedPlan(NOW,'unrestricted'),/unknown_scope/);
});

test('UK paid grants replay once, wait for the fourth outcome, then latch zero READY before another charge',async t=>{
  const db=await configured(t),p=await startSourceLed(db,{scope:'uk_growth'},NOW);let calls=0,first;
  for(let i=0;i<3;i++) {
    const grant=await scheduleSourceLed(db,p.id,NOW);first??=grant;
    assert.equal(grant.market,'GB');assert.equal(grant.query_limit,1);
    await executeSourceLed(db,grant.run_id,ENV,{now:NOW,fetcher:async(_url,options)=>{
      calls++;const body=JSON.parse(options.body);assert.equal(body.gl,'gb');return Response.json({credits:1,organic:[]});
    }});
  }
  const replay=await executeSourceLed(db,first.run_id,ENV,{now:NOW,fetcher:()=>{throw Error('replay must not dispatch');}});
  assert.equal(replay.replay,true);assert.equal(calls,3);
  const fourth=await scheduleSourceLed(db,p.id,NOW);
  let release,entered;const response=new Promise(r=>release=r),started=new Promise(r=>entered=r);
  const last=executeSourceLed(db,fourth.run_id,ENV,{now:NOW,fetcher:async()=>{calls++;entered();return response;}});
  await started;
  const waiting=await sourceLedMetrics(db,p.id,NOW);assert.equal(waiting.queries,4);assert.equal(waiting.settled_queries,3);
  await assert.rejects(scheduleSourceLed(db,p.id,NOW),/previous_run_not_settled/);
  assert.equal((await sourceLedStatus(db,NOW)).policy.manual_paused,0);
  release(Response.json({credits:1,organic:[]}));await last;
  const m=await sourceLedMetrics(db,p.id,NOW);assert.equal(m.queries,4);assert.equal(m.settled_queries,4);assert.equal(m.observed_credits,4);assert.equal(m.programme_scope,'uk_growth');
  await assert.rejects(scheduleSourceLed(db,p.id,NOW),/zero_ready_after_uk_warmup/);
  assert.equal(calls,4);
  assert.equal((await sql(db,'SELECT COUNT(*) AS n FROM serper_usage').first()).n,4);
  const status=await sourceLedStatus(db,NOW);assert.equal(status.policy.manual_paused,1);assert.equal(status.policy.pause_reason,'zero_ready_after_uk_warmup');
  await assert.rejects(startSourceLed(db,{scope:'uk_growth'},NOW),/operator_review_required/);
  await assert.rejects(sql(db,"UPDATE source_led_programmes SET status='active' WHERE id=?",p.id).run(),/cannot_reopen/);
});

test('UK country allowance still includes previous programmes and stops before its sixth query',async t=>{
  const db=await configured(t);await priorUKUsage(db,4);
  const p=await startSourceLed(db,{scope:'uk_growth'},NOW),g=await scheduleSourceLed(db,p.id,NOW);let calls=0;
  await executeSourceLed(db,g.run_id,ENV,{now:NOW,fetcher:async()=>{calls++;return Response.json({credits:1,organic:[]});}});
  const next=await scheduleSourceLed(db,p.id,NOW);assert.equal(next.complete,true);assert.equal(next.reason,'country_quota_reached');assert.equal(calls,1);
  const s=await sourceLedStatus(db,NOW);assert.equal(s.policy.queries_per_market,5);assert.equal(s.policy.daily_query_limit,25);assert.equal(s.daily_total_paid_queries,5);
  assert.equal((await sql(db,'SELECT COUNT(*) AS n FROM source_led_grants WHERE programme_id=?',p.id).first()).n,1);
});

test('mutated UK country, query or ceiling is refused and paused before granting a paid request',async t=>{
  for(const change of ['country','query','ceiling'])await t.test(change,async child=>{
    const db=await configured(child),p=await startSourceLed(db,{scope:'uk_growth'},NOW),plan=sourceLedPlan(NOW,'uk_growth');
    if(change==='country')plan[0].market='US';
    if(change==='query')plan[0].query='arbitrary rewritten paid query';
    if(change==='ceiling')await sql(db,'UPDATE source_led_programmes SET max_queries=5 WHERE id=?',p.id).run();
    else await sql(db,'UPDATE source_led_programmes SET plan_json=? WHERE id=?',stableJson(plan),p.id).run();
    await assert.rejects(scheduleSourceLed(db,p.id,NOW),/uk_programme_scope_requires_review/);
    assert.equal((await sql(db,'SELECT COUNT(*) AS n FROM source_led_grants').first()).n,0);
    const s=await sourceLedStatus(db,NOW);assert.equal(s.policy.manual_paused,1);assert.equal(s.daily_total_paid_queries,0);
  });
});

test('a forged foreign-country grant cannot dispatch even when attached to a valid UK plan',async t=>{
  const db=await configured(t),p=await startSourceLed(db,{scope:'uk_growth'},NOW),entry=sourceLedPlan(NOW,'uk_growth')[0];
  await sql(db,"INSERT INTO source_led_grants VALUES ('forged-grant',?,0,'US',?,?,?,'approved',?)",p.id,entry.family,entry.query,await hash(entry.query),NOW).run();
  await sql(db,"UPDATE source_led_programmes SET active_run_id='forged-grant',next_query=1 WHERE id=?",p.id).run();
  let calls=0;
  await assert.rejects(executeSourceLed(db,'forged-grant',ENV,{now:NOW,fetcher:async()=>{calls++;return Response.json({});}}),/uk_grant_scope_requires_review/);
  assert.equal(calls,0);assert.equal((await sql(db,'SELECT COUNT(*) AS n FROM serper_usage').first()).n,0);
  assert.equal((await sourceLedStatus(db,NOW)).policy.pause_reason,'uk_grant_scope_requires_review');
});

test('UK discovery targeting never becomes source country or promotes excluded page families',async t=>{
  const db=await configured(t),p=await startSourceLed(db,{scope:'uk_growth'},NOW),g=await scheduleSourceLed(db,p.id,NOW);
  const urls=['https://facebook.com/events/1','https://organiser.example/news/fair','https://organiser.example/login/step','https://organiser.example/directory/uk','https://organiser.example/events','https://eventbrite.com/e/fair','https://organiser.example/river-fair'];
  await executeSourceLed(db,g.run_id,ENV,{now:NOW,fetcher:async()=>Response.json({credits:1,organic:urls.map(link=>({title:'UK READY from search',link}))})});
  for(const url of urls.slice(0,-1))assert.equal(sourceLedRoute(url,{scope:'uk_growth'}).disposition,'excluded');
  const pending=await sql(db,"SELECT candidate_id FROM source_led_candidate_progress WHERE status='pending'").all();assert.equal(pending.results.length,1);
  const url=urls.at(-1),event={'@type':'Event',name:'River Craft Fair',url,startDate:'2026-11-20',endDate:'2026-11-20',organizer:{name:'River Association',url:'https://organiser.example/'},location:{address:{streetAddress:'1 River Street',addressLocality:'River Town',addressCountry:'CA'}}};
  const html=`<script type="application/ld+json">${JSON.stringify(event)}</script><main><h1>River Craft Fair</h1><section><h2>Vendor applications</h2><p>Vendor applications are open</p><form action="/vendor/submit"><input name="business"><input name="products"><button>Submit vendor application</button></form></section></main>`;
  const result=await verifySourceLedCandidate(db,pending.results[0].candidate_id,{now:NOW,fetcher:async()=>new Response(html,{headers:{'content-type':'text/html'}})});
  assert.equal(result.status,'out_of_market');assert.equal(result.actual_country,'CA');assert.equal(result.record_id,null);
  assert.equal((await sql(db,'SELECT COUNT(*) AS n FROM entities').first()).n,0);
  assert.equal((await sourceLedMetrics(db,p.id,NOW)).excluded_candidates,6);
});

test('UK warm-up waits for candidate/core settlement and keeps all existing unsafe-source guards',()=>{
  const good={programme_scope:'uk_growth',queries:4,settled_queries:4,ready_gained:1,pending_candidates:0,due_jobs:0,preservation_gate:1,candidates:20,duplicate_rate:.2,excluded_mix:.1};
  assert.equal(sourceLedStopReason(good),null);
  assert.equal(sourceLedStopReason({...good,ready_gained:0,settled_queries:3}),null);
  assert.equal(sourceLedStopReason({...good,ready_gained:0,pending_candidates:1}),null);
  assert.equal(sourceLedStopReason({...good,ready_gained:0,due_jobs:1}),null);
  assert.equal(sourceLedStopReason({...good,ready_gained:0}),'zero_ready_after_uk_warmup');
  for(const [change,reason] of [[{duplicate_rate:.8},'duplicate_rate_spike'],[{excluded_mix:.6},'excluded_source_mix_dominant'],[{due_jobs:41},'verification_backlog'],[{source_mutations:1},'source_integrity_failure'],[{customer_rows:1},'shadow_scope_leakage'],[{false_ready_promotions_detected:1},'false_ready_promotion_detected']])assert.equal(sourceLedStopReason({...good,...change}),reason);
});

test('UK grant waits for ordinary due verification work without reserving another query',async t=>{
  const db=await configured(t),p=await startSourceLed(db,{scope:'uk_growth'},NOW);
  await sql(db,"INSERT INTO jobs(id,stage,dedupe_key,payload_json,available_at,created_at,updated_at) VALUES ('pending-proof','enrichment','pending-proof','{}',?,?,?)",NOW,NOW,NOW).run();
  const g=await scheduleSourceLed(db,p.id,NOW);assert.equal(g.waiting,true);assert.equal(g.reason,'uk_verification_settlement_pending');
  assert.equal((await sql(db,'SELECT COUNT(*) AS n FROM source_led_grants').first()).n,0);
  assert.equal((await sql(db,'SELECT COUNT(*) AS n FROM serper_usage').first()).n,0);
});
