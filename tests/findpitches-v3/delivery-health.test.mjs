import test from 'node:test';
import assert from 'node:assert/strict';
import {database,NOW} from './helpers.mjs';
import worker from '../../platform/findpitches-v3/worker.mjs';
import {noteDeliveryContact,structuredDeliveryStatus} from '../../platform/findpitches-v3/delivery-health.mjs';
test('unchanged-export polls prove cadence without claiming fresh source evidence',async t=>{
  const db=database(t);
  for(const now of ['2026-10-06T11:30:00.000Z','2026-10-06T11:45:00.000Z',NOW])await noteDeliveryContact(db,{kind:'rechecks',now});
  const status=await structuredDeliveryStatus(db,NOW);assert.equal(status.cadence_verified,true);assert.equal(status.freshness_warning,true);assert.equal(status.immutable_receipts,0);
  assert.equal((await structuredDeliveryStatus(db,'2026-10-06T13:00:00.000Z')).host_recently_contacting,false);
});
test('diagnostic polls never masquerade as producer-host activity and auth remains required',async t=>{
  const db=database(t),token='test-delivery-health-token-24-characters',env={FINDPITCHES_V3_DB:db,V3_ROLE:'ingest',V3_INGEST_TOKEN:token};
  assert.equal((await worker.fetch(new Request('https://example.org/rechecks'),env)).status,401);
  assert.equal((await worker.fetch(new Request('https://example.org/rechecks?probe=1',{headers:{Authorization:'Bearer '+token}}),env)).status,200);
  assert.equal((await structuredDeliveryStatus(db,NOW)).last_authenticated_recheck_poll,null);
});
