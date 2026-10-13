import test from 'node:test';
import assert from 'node:assert/strict';
import {database,seed,record} from './helpers.mjs';
import {recordVerification,verificationGate,sourceFetchRequired} from '../../platform/findpitches-v3/verification-store.mjs';
import {loadEntity,sql} from '../../platform/findpitches-v3/store.mjs';
import {enqueue} from '../../platform/findpitches-v3/jobs.mjs';
import {evaluateReadiness} from '../../platform/findpitches-v3/pipeline.mjs';
import worker from '../../platform/findpitches-v3/worker.mjs';

test('replayed delivery preserves a current failed source receipt, its expiry and WATCH without another fetch',async t=>{
  const db=database(t),{entity}=await seed(db,record(),{environment:'shadow'}),now=new Date().toISOString();
  const negative=await recordVerification(db,entity.id,{requested_url:entity.application_url,fetched_at:now,reason:'source_http_520'},{now});
  const before=await sql(db,'SELECT * FROM source_verifications WHERE id=?',negative.verification_id).first();
  await enqueue(db,'enrichment','fresh-negative-delivery',{entity_id:entity.id},now);
  const fetched=t.mock.method(globalThis,'fetch',async()=>{throw Error('unexpected_source_fetch');});
  const response=await worker.fetch(new Request('https://shadow.test/tick',{method:'POST',headers:{Authorization:'Bearer synthetic-operator-fixture-32-characters','Content-Type':'application/json'},body:'{"limit":1}'}),
    {V3_ROLE:'enrichment',FINDPITCHES_V3_DB:db,V3_OPERATOR_TOKEN:'synthetic-operator-fixture-32-characters'});
  assert.equal(response.status,200);assert.equal((await response.json()).results[0].phase,'complete');assert.equal(fetched.mock.callCount(),0);
  assert.deepEqual(await sql(db,'SELECT * FROM source_verifications WHERE id=?',negative.verification_id).first(),before);
  assert.equal((await sql(db,'SELECT COUNT(*) n FROM source_verifications WHERE entity_id=?',entity.id).first()).n,1);
  assert.equal((await evaluateReadiness(db,entity.id,{now})).status,'watch');
});

test('missing, expired, revision-changed and explicitly requested proof still needs the original source',async t=>{
  const db=database(t),{entity}=await seed(db,record(),{environment:'shadow'}),now='2026-10-06T13:00:00.000Z';
  assert.equal(sourceFetchRequired(await verificationGate(db,entity,{now}),{now}),true);
  const receipt=await recordVerification(db,entity.id,{requested_url:entity.application_url,fetched_at:now,reason:'source_http_403'},{now});
  const gate=await verificationGate(db,entity,{now});assert.equal(sourceFetchRequired(gate,{now}),false);
  assert.equal(sourceFetchRequired(gate,{now,refreshVerificationId:receipt.verification_id}),true);
  assert.equal(sourceFetchRequired(gate,{now,refreshVerificationId:'superseded-request'}),false);
  const expired='2026-10-07T13:00:00.000Z';assert.equal(sourceFetchRequired(await verificationGate(db,entity,{now:expired}),{now:expired}),true);
  await sql(db,'UPDATE entities SET revision=revision+1 WHERE id=?',entity.id).run();
  assert.equal(sourceFetchRequired(await verificationGate(db,await loadEntity(db,entity.id),{now}),{now}),true);
});
