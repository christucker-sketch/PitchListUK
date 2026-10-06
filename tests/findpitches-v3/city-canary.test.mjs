import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { database,NOW } from './helpers.mjs';
import { sql } from '../../platform/findpitches-v3/store.mjs';
import { runCityCanary } from '../../operations/findpitches-v3/city-canary.mjs';

test('canary orchestration revokes its one-shot grant after an uncertain provider failure and refuses automatic rebilling',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'v3-canary-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const serperFile=path.join(dir,'serper.env');fs.writeFileSync(serperFile,'SERPER_API_KEY=secret-recorded-serper-key-12345');
  fs.writeFileSync(path.join(dir,'worker-secrets.json'),JSON.stringify({V3_OPERATOR_TOKEN:'operator-test-token-for-canary-12345'}));
  const db=database(t);await sql(db,"INSERT INTO quality_gates VALUES ('structured-100-preservation',100,0,'{}','gate',?)",NOW).run();
  let enabled=0,revoked=0,installed=0,runId;
  const adminFactory=async()=>({db,state:{urls:{acquisition:'https://acquisition.example.org'}},installSerper:async()=>installed++,deploy:async grant=>{if(grant?.canaryRunId){enabled++;runId=grant.canaryRunId;}else revoked++;}});
  const fetcher=async(url)=>{
    if(url.endsWith('/tick'))await sql(db,"INSERT INTO acquisition_runs(id,city,day,queries_reserved,status,created_at,updated_at) VALUES (?,'austin-tx','2026-10-06',1,'failed',?,?)",runId,NOW,NOW).run();
    return Response.json({run_id:runId});
  };
  const options={credentialsFile:'unused',stateDirectory:dir,serperFile};
  await assert.rejects(runCityCanary(options,{adminFactory,fetcher}),/provider_outcome_requires_review/);
  assert.equal(enabled,1);assert.equal(revoked,1);assert.equal(installed,1);
  const text=fs.readFileSync(path.join(dir,'city-canary-report.json'),'utf8');assert.ok(!text.includes('secret-recorded'));assert.equal(JSON.parse(text).query_limit,1);
  await assert.rejects(runCityCanary(options,{adminFactory,fetcher}),/existing_canary_requires_review/);assert.equal(installed,1);
});
