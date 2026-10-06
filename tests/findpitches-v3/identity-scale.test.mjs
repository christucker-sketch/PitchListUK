import test from 'node:test';
import assert from 'node:assert/strict';
import {database,record,NOW} from './helpers.mjs';
import {ingestRecords,sql,linkedEntity} from '../../platform/findpitches-v3/store.mjs';
import {reconcileRecord,runStage} from '../../platform/findpitches-v3/pipeline.mjs';

async function intake(db,raw) {
  const imported=await ingestRecords(db,[raw],{environment:'shadow',now:NOW});
  assert.equal(imported.rejected,0);
  return imported.record_ids[0];
}
async function populate(db,count=110) {
  const records=[];
  for(let i=0;i<count;i++) {
    const raw=record({opportunity_id:'scale-'+i,event_name:`River Lantern Autumn Craft 2026 ${i}`,application_url:`https://www.eventeny.com/events/vendor/?id=${70000+i}`,canonical_url:`https://www.eventeny.com/events/vendor/?id=${70000+i}`});
    const id=await intake(db,raw);
    assert.equal((await reconcileRecord(db,id,{now:NOW})).outcome,'NEW_ENTITY');
    records.push({raw,id});
  }
  return records;
}

test('more than 100 shared year/name tokens do not block distinct platform IDs or exact replay',async t=>{
  const db=database(t),records=await populate(db);
  assert.equal((await sql(db,"SELECT COUNT(*) AS n FROM identity_keys WHERE identity_key='name:2026'").first()).n,110);
  const changed={...records[0].raw,last_checked:'2026-10-06T12:15:00.000Z',lifecycle_event:'UNCHANGED'};
  const updated=await intake(db,changed);
  const result=await reconcileRecord(db,updated,{now:NOW});
  assert.equal(result.outcome,'EXACT_MATCH');
  assert.equal(result.entity_id,(await linkedEntity(db,records[0].id)).id);
  const replay=await ingestRecords(db,[changed],{environment:'shadow',now:NOW});
  assert.equal(replay.duplicates,1);
  assert.equal(replay.inserted,0);
  assert.equal((await sql(db,'SELECT COUNT(*) AS n FROM entities').first()).n,110);
  assert.deepEqual(JSON.parse((await sql(db,'SELECT raw_json FROM producer_records WHERE id=?',records[0].id).first()).raw_json),records[0].raw);
});

test('large unrelated year pools retain a probable cross-source match and genuine ambiguity',async t=>{
  const db=database(t);
  for(let i=0;i<110;i++) {
    const raw=record({opportunity_id:'unrelated-'+i,event_name:`Unique${i} Route${i} 2026`,source_platform:null,application_url:`https://example.org/unrelated/${i}`,canonical_url:`https://example.org/unrelated/${i}`});
    assert.equal((await reconcileRecord(db,await intake(db,raw),{now:NOW})).outcome,'NEW_ENTITY');
  }
  const original=record({opportunity_id:'real-candidate',event_name:'River Lantern Autumn Craft 2026',source_platform:null,application_url:'https://example.org/river-lantern',canonical_url:'https://example.org/river-lantern'});
  const existing=await intake(db,original);
  assert.equal((await reconcileRecord(db,existing,{now:NOW})).outcome,'NEW_ENTITY');
  const other=record({opportunity_id:'other-source',event_name:original.event_name,application_url:'https://www.eventeny.com/events/vendor/?id=99999',canonical_url:'https://www.eventeny.com/events/vendor/?id=99999'});
  const probable=await reconcileRecord(db,await intake(db,other),{now:NOW});
  assert.equal(probable.outcome,'PROBABLE_MATCH');
  assert.deepEqual(probable.candidates,[(await linkedEntity(db,existing)).id]);
  assert.equal(probable.entity_id,null);
  // The indexed exact route and a corroborated cross-source alternative both remain visible.
  const exactRecord=record({opportunity_id:'exact',event_name:'Different Distinctive Topic',organiser:'Other Organisation',location:'London',application_url:other.application_url,canonical_url:other.canonical_url});
  const exactId=await intake(db,exactRecord);
  assert.equal((await reconcileRecord(db,exactId,{now:NOW})).outcome,'NEW_ENTITY');
  const ambiguous=await reconcileRecord(db,await intake(db,{...other,opportunity_id:'ambiguous'}),{now:NOW});
  assert.equal(ambiguous.outcome,'CONFLICT');
  assert.equal(ambiguous.entity_id,null);
  assert.equal(ambiguous.candidates.length,2);
});

test('a genuinely oversized plausible pool completes as review rather than repeated failure or forced merge',async t=>{
  const db=database(t);
  for(let i=0;i<101;i++) {
    const id='ambiguous-'+i;
    await sql(db,'INSERT INTO entities(id,market,environment,shadow_only,created_at,updated_at) VALUES (?,\'US\',\'shadow\',1,?,?)',id,NOW,NOW).run();
    for(const key of ['name:river','name:lantern','name:autumn'])await sql(db,'INSERT INTO identity_keys VALUES (\'shadow\',\'US\',?,?)',key,id).run();
  }
  const raw=record({source_platform:null,application_url:'https://example.org/new-route',canonical_url:'https://example.org/new-route'});
  const id=await intake(db,raw),job=await runStage(db,'reconcile',{now:NOW});
  assert.equal(job.phase,'complete');
  assert.equal(job.result.outcome,'REVIEW_REQUIRED');
  assert.equal(job.result.entity_id,null);
  assert.equal(await linkedEntity(db,id),null);
  assert.equal((await sql(db,'SELECT status FROM jobs WHERE id=?',job.job_id).first()).status,'complete');
  const conflict=await sql(db,'SELECT entity_id,reason FROM conflicts WHERE record_id=?',id).first();
  assert.equal(conflict.entity_id,null);
  assert.equal(conflict.reason,'identity_pool_requires_review');
  assert.equal((await reconcileRecord(db,id,{now:NOW})).outcome,'REVIEW_REQUIRED');
  assert.equal((await sql(db,'SELECT COUNT(*) AS n FROM conflicts WHERE record_id=?',id).first()).n,1);
});
