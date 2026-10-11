import test from 'node:test';
import assert from 'node:assert/strict';
import {database,seed,record,NOW} from './helpers.mjs';
import {documentFixture} from './verification-fixture.mjs';
import {recordVerification} from '../../platform/findpitches-v3/verification-store.mjs';
import {evaluateReadiness} from '../../platform/findpitches-v3/pipeline.mjs';
import {ingestRecords,sql} from '../../platform/findpitches-v3/store.mjs';
import {stagingCatalogue,LATEST_STRUCTURED_POLICY_SQL} from '../../platform/findpitches-v3/staging.mjs';

async function fixture(t){
  const db=database(t),input=record({channel:'current',export_readiness:'READY',confidence:{level:'HIGH'}});
  const {entity}=await seed(db,input,{environment:'shadow'});
  await recordVerification(db,entity.id,documentFixture(),{now:NOW});await evaluateReadiness(db,entity.id,{now:NOW});
  assert.equal((await stagingCatalogue(db,{now:NOW})).items.length,1);
  return {db,input,entity};
}
// Model accepted evidence linked by reconciliation before selections change.
// The policy must withhold unsuitable current receipts even while the READY
// cache and stronger original facts remain intact.
async function append(f,changes,received_at){
  const result=await ingestRecords(f.db,[{...f.input,...changes}],{environment:'shadow',now:received_at});
  assert.equal(result.accepted,1);assert.equal(result.record_ids.length,1);
  await sql(f.db,'INSERT OR IGNORE INTO entity_records VALUES (?,?)',result.record_ids[0],f.entity.id).run();
  return result.record_ids[0];
}
const before=async db=>JSON.stringify((await sql(db,'SELECT * FROM field_selections ORDER BY entity_id,field_name').all()).results);

test('compact policy retains nullable legacy metadata and withholds every unsuitable producer disposition',async t=>{
  for(const changes of [{confidence:{level:'LOW'}},{channel:'watch'},{channel:'held'},{channel:'retired'},{export_readiness:'WATCH'},{export_readiness:'QUARANTINED'}]){
    const f=await fixture(t),original=await before(f.db);
    await append(f,{...changes,last_checked:'2026-10-06T12:01:00.000Z'},'2026-10-06T12:02:00.000Z');
    const snapshot=await stagingCatalogue(f.db,{now:NOW});assert.equal(snapshot.shadow_ready,1);assert.equal(snapshot.items.length,0);assert.equal(snapshot.producer_policy_withheld,1);
    assert.equal(await before(f.db),original);assert.equal((await sql(f.db,'SELECT COUNT(*) AS n FROM customer_projections').first()).n,0);
  }
  const f=await fixture(t);await append(f,{confidence:null,channel:null,export_readiness:null,last_checked:'2026-10-06T12:01:00.000Z'},'2026-10-06T12:02:00.000Z');
  assert.equal((await stagingCatalogue(f.db,{now:NOW})).items.length,1);
});

test('an older source export arriving later cannot defeat the latest held receipt; replay adds no entity',async t=>{
  const f=await fixture(t),hold={confidence:{level:'LOW'},last_checked:'2026-10-06T12:01:00.000Z'};
  await append(f,hold,'2026-10-06T12:02:00.000Z');
  await append(f,{provenance:[{description:'late replay of original source clock'}]},'2026-10-06T12:03:00.000Z');
  await append(f,hold,'2026-10-06T12:04:00.000Z');
  const snapshot=await stagingCatalogue(f.db,{now:NOW});assert.equal(snapshot.items.length,0);assert.equal(snapshot.producer_policy_withheld,1);
  assert.equal((await sql(f.db,'SELECT COUNT(*) AS n FROM entities').first()).n,1);
});

test('source-clock ties use received-at, then record ID, without dropping an unsuitable winner',async t=>{
  const f=await fixture(t),checked='2026-10-06T12:01:00.000Z',received='2026-10-06T12:02:00.000Z';
  await append(f,{last_checked:checked,provenance:[{description:'earlier arrival'}]},'2026-10-06T12:01:30.000Z');
  await append(f,{last_checked:checked,confidence:{level:'LOW'}},received);
  let snapshot=await stagingCatalogue(f.db,{now:NOW});assert.equal(snapshot.items.length,0);
  const rows=(await sql(f.db,LATEST_STRUCTURED_POLICY_SQL).all()).results;assert.equal(rows.length,1);assert.equal(rows[0].confidence_level,'LOW');
  await append(f,{last_checked:checked,provenance:[{description:'tied arrival'}]},received);
  const winner=await sql(f.db,"SELECT id,json_extract(normalized_json,'$.confidence.level') AS confidence FROM producer_records WHERE received_at=? ORDER BY id DESC LIMIT 1",received).first();
  snapshot=await stagingCatalogue(f.db,{now:NOW});assert.equal(snapshot.items.length,winner.confidence==='LOW'?0:1);
  assert.equal((await sql(f.db,LATEST_STRUCTURED_POLICY_SQL).all()).results[0].confidence_level,winner.confidence);
  assert.equal((await sql(f.db,'SELECT COUNT(*) AS n FROM entities').first()).n,1);
});

test('compact policy does not bypass proof expiry, revision mismatch, conflicts or test/control exclusion',async t=>{
  const f=await fixture(t),original=await before(f.db);
  assert.equal((await stagingCatalogue(f.db,{now:'2026-10-08T12:00:00.000Z'})).items.length,0);
  await sql(f.db,"INSERT INTO conflicts VALUES ('held-fixture',?,?,?,'equal_authority_disagreement',0,?)",f.entity.id,(await sql(f.db,'SELECT record_id FROM entity_records LIMIT 1').first()).record_id,'organiser',NOW).run();
  assert.equal((await stagingCatalogue(f.db,{now:NOW})).items.length,0);assert.equal(await before(f.db),original);
  const {entity:control}=await seed(f.db,record({opportunity_id:'control',application_url:'https://www.eventeny.com/events/vendor/?id=9',canonical_url:'https://www.eventeny.com/events/vendor/?id=9'}),{environment:'test'});
  assert.equal((await stagingCatalogue(f.db,{now:NOW})).items.some(r=>r.id===control.id),false);
  const fresh=await fixture(t);
  await assert.rejects(sql(fresh.db,'UPDATE readiness SET entity_revision=entity_revision-1 WHERE entity_id=?',fresh.entity.id).run(),/current_source_proof_required/);
  await sql(fresh.db,'UPDATE entities SET revision=revision+1 WHERE id=?',fresh.entity.id).run();
  assert.equal((await stagingCatalogue(fresh.db,{now:NOW})).items.length,0);
});
