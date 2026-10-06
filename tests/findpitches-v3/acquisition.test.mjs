import test from 'node:test';
import assert from 'node:assert/strict';
import { database,NOW } from './helpers.mjs';
import { sql } from '../../platform/findpitches-v3/store.mjs';
import { acquireCity,cityQueries } from '../../platform/findpitches-v3/acquisition.mjs';
const ENV={V3_CITY_ENABLED:'true',V3_DAILY_QUERY_LIMIT:'1',SERPER_API_KEY:'recorded-provider-test-key'};
test('city producer makes no requests without enabled configuration, gate and approved scope',async t=>{
  const db=database(t);let calls=0;const fetcher=async()=>{calls++;throw new Error('must not call');};
  await assert.rejects(acquireCity(db,{city:'austin-tx',query_limit:1},{...ENV,V3_CITY_ENABLED:'false'},{fetcher,now:NOW}),/disabled/);
  await assert.rejects(acquireCity(db,{city:'austin-tx',query_limit:1},ENV,{fetcher,now:NOW}),/gate_required/);
  assert.throws(()=>cityQueries('unapproved'),/not_approved/);assert.equal(calls,0);
});
test('recorded Serper results enter the common evidence model with bounded cost and uncertain state',async t=>{
  const db=database(t); // Gate enforcement is covered above and by the real 100-record test.
  await sql(db,"INSERT INTO quality_gates VALUES ('structured-100-preservation',100,0,'{}','unit-gate',?)",NOW).run();
  let calls=0;const fetcher=async(url,options)=>{
    calls++;assert.equal(url,'https://google.serper.dev/search');assert.equal(JSON.parse(options.body).gl,'us');
    return Response.json({organic:[{title:'Austin River Craft Market',link:'https://example.org/river/apply',snippet:'Vendors may apply for the market'},{title:'Private result',link:'https://127.0.0.1/secret'}]});
  };
  const options={fetcher,now:NOW,runId:'recorded-run'},payload={city:'austin-tx',query_limit:1};
  const result=await acquireCity(db,payload,ENV,options);assert.equal(result.discovered,1);assert.equal(result.imported.accepted,1);
  assert.deepEqual(await acquireCity(db,payload,ENV,options),result);assert.equal(calls,1);
  await assert.rejects(acquireCity(db,payload,ENV,{...options,runId:'over-budget'}),/exhausted/);assert.equal(calls,1);
  const stored=await sql(db,"SELECT normalized_json FROM producer_records WHERE producer_name='city-search'").first();
  assert.equal(JSON.parse(stored.normalized_json).application_state,'UNKNOWN');assert.equal(JSON.parse(stored.normalized_json).publication_eligible,false);
  assert.equal((await sql(db,'SELECT DISTINCT authority FROM source_facts').first()).authority,50);
});
test('uncertain provider failure is retained and never automatically rebilled on retry',async t=>{
  const db=database(t);await sql(db,"INSERT INTO quality_gates VALUES ('structured-100-preservation',100,0,'{}','unit-gate',?)",NOW).run();
  let calls=0;const options={now:NOW,runId:'unknown-outcome',fetcher:async()=>{calls++;throw new Error(ENV.SERPER_API_KEY);}};
  await assert.rejects(acquireCity(db,{city:'austin-tx',query_limit:1},ENV,options),/review_required/);
  await assert.rejects(acquireCity(db,{city:'austin-tx',query_limit:1},ENV,options),/outcome_requires_operator_review/);assert.equal(calls,1);
});
