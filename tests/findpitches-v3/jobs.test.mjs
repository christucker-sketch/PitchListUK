import test from 'node:test';
import assert from 'node:assert/strict';
import { database,NOW,seed } from './helpers.mjs';
import { sql } from '../../platform/findpitches-v3/store.mjs';
import { enqueue,claimJob,finishJob,failJob,heartbeat,requeueDead } from '../../platform/findpitches-v3/jobs.mjs';
import { runStage,drainPipeline } from '../../platform/findpitches-v3/pipeline.mjs';
test('atomic claims, expiry recovery and lease tokens prevent stale completion',async t=>{
  const db=database(t);await enqueue(db,'eligibility','unique',{entity_id:'missing'},NOW);await enqueue(db,'eligibility','unique',{entity_id:'missing'},NOW);
  const first=await claimJob(db,'eligibility',{now:NOW,leaseMs:1000});assert.ok(first);
  assert.equal(await claimJob(db,'eligibility',{now:NOW}),null);
  const later='2026-10-06T12:00:02.000Z',second=await claimJob(db,'eligibility',{now:later});assert.equal(second.attempts,2);assert.notEqual(second.lease_token,first.lease_token);
  await assert.rejects(finishJob(db,first,later),/ownership/);await assert.rejects(heartbeat(db,first,{now:later}),/ownership/);
  await failJob(db,first,new Error('stale'),later);assert.equal((await sql(db,'SELECT status FROM jobs WHERE id=?',second.id).first()).status,'leased');
  await heartbeat(db,second,{now:later});await finishJob(db,second,later);
});
test('bounded retries dead-letter and explicit requeue work without resetting completed jobs',async t=>{
  const db=database(t);await enqueue(db,'eligibility','missing',{entity_id:'missing'},NOW);
  await sql(db,"UPDATE jobs SET max_attempts=1 WHERE stage='eligibility'").run();
  assert.equal((await runStage(db,'eligibility',{now:NOW})).phase,'failed');
  const job=await sql(db,'SELECT * FROM jobs').first();assert.equal(job.status,'dead');assert.equal(await claimJob(db,'eligibility',{now:NOW}),null);
  assert.equal((await requeueDead(db,job.id,NOW)).meta.changes,1);assert.equal((await requeueDead(db,job.id,NOW)).meta.changes,0);
  const lease=await claimJob(db,'eligibility',{now:NOW});await finishJob(db,lease,NOW);assert.equal((await requeueDead(db,job.id,NOW)).meta.changes,0);
});
test('watch requests producer rechecks and reassesses time-dependent closure without changing source facts',async t=>{
  const db=database(t),{entity}=await seed(db);const later='2026-12-01T12:00:00.000Z';
  assert.equal((await runStage(db,'watch',{now:later})).phase,'complete');await drainPipeline(db,{now:later});
  assert.equal((await sql(db,'SELECT status FROM readiness WHERE entity_id=?',entity.id).first()).status,'blocked');
  assert.ok(await sql(db,'SELECT * FROM recheck_requests WHERE entity_id=?',entity.id).first());
  assert.equal((await sql(db,"SELECT COUNT(*) AS n FROM source_facts WHERE field_name='event_name'").first()).n,1);
});
