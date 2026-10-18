import test from 'node:test';import assert from 'node:assert/strict';
import {automaticWatchDecision} from '../../platform/findpitches-v3/source-renewal.mjs';
import {evaluateReadiness,runStage} from '../../platform/findpitches-v3/pipeline.mjs';
import {recordVerification,verificationGate} from '../../platform/findpitches-v3/verification-store.mjs';
import {enqueue} from '../../platform/findpitches-v3/jobs.mjs';
import {sql,loadEntity,ingestRecords} from '../../platform/findpitches-v3/store.mjs';
import {record,database,seed,NOW} from './helpers.mjs';import {documentFixture} from './verification-fixture.mjs';
const at=hours=>new Date(Date.parse(NOW)+hours*3600000).toISOString();
test('READY retains the original 24h proof TTL and its due 22h early refresh; expired READY is never deferred a week',()=>{
 const entity={event_end:'2026-11-22'},verification={expires_at:at(24)},base={now:NOW,assessedAt:NOW,readinessStatus:'ready',verification};assert.equal(automaticWatchDecision(entity,base).at,at(22));assert.equal(automaticWatchDecision(entity,{...base,now:at(22),scheduledRefresh:true}).at,at(22));assert.equal(automaticWatchDecision(entity,{...base,now:at(25)}).at,at(25));assert.equal(verification.expires_at,at(24));
});
test('unproved discovery is weekly, near-event WATCH remains daily, and a missing end cannot prove a past event',()=>{
 const base={now:NOW,assessedAt:NOW,readinessStatus:'watch'};assert.equal(automaticWatchDecision({},base).at,at(168));assert.equal(automaticWatchDecision({event_start:'2026-10-12'},base).at,at(24));assert.equal(automaticWatchDecision({event_start:'2026-09-01'},base).schedule,true);assert.equal(automaticWatchDecision({event_end:'2026-10-05'},base).schedule,false);assert.equal(automaticWatchDecision({event_end:'2026-10-06'},base).schedule,true);
 const proof={checked_at:NOW};assert.equal(automaticWatchDecision({},{...base,now:at(24),assessedAt:at(24),verification:proof}).at,at(168));
});
test('conflicts, quality holds and non-trader/index sources require new evidence/review, without becoming complete or READY',()=>{
 const base={now:NOW,assessedAt:NOW,readinessStatus:'blocked'};for(const extra of [{conflicts:1},{qualityHolds:1},{verification:{reasons:['platform_index_is_not_an_opportunity']}},{verification:{reasons:['application_is_not_a_trader_opportunity']}}])assert.equal(automaticWatchDecision({}, {...base,...extra}).schedule,false);
});
test('an old daily WATCH pointer defers to one weekly job while preserving the exact existing producer request and all facts',async t=>{
 const db=database(t),{entity}=await seed(db),before=(await sql(db,'SELECT * FROM source_facts ORDER BY id').all()).results;
 await sql(db,'INSERT INTO recheck_requests VALUES (?,?,?)',entity.id,NOW,'older_exact_request').run();await enqueue(db,'watch','old-daily-watch',{entity_id:entity.id},NOW,at(24));
 const result=await runStage(db,'watch',{now:at(24)});assert.equal(result.result.phase,'automatic_recheck_deferred');assert.equal(result.result.not_before,at(168));assert.equal(result.result.producer_request_cleared,false);assert.deepEqual({...await sql(db,'SELECT * FROM recheck_requests').first()},{entity_id:entity.id,requested_at:NOW,reason:'older_exact_request'});assert.deepEqual((await sql(db,'SELECT * FROM source_facts ORDER BY id').all()).results,before);assert.equal((await sql(db,"SELECT COUNT(*) n FROM jobs WHERE stage='watch' AND status='ready' AND available_at=?",at(168)).first()).n,1);assert.equal((await sql(db,'SELECT COUNT(*) n FROM source_verifications').first()).n,0);
});
test('a source-proved READY refresh is actually admitted at its early scheduled time, with no stale expiry extension',async t=>{
 const db=database(t),{entity}=await seed(db),proof=await recordVerification(db,entity.id,documentFixture(),{now:NOW});await evaluateReadiness(db,entity.id,{now:NOW});const before=await sql(db,'SELECT * FROM source_verifications WHERE id=?',proof.verification_id).first(),result=await runStage(db,'watch',{now:at(22)});assert.equal(result.result.phase,'producer_recheck_requested');assert.deepEqual(await sql(db,'SELECT * FROM source_verifications WHERE id=?',proof.verification_id).first(),before);assert.notEqual((await verificationGate(db,await loadEntity(db,entity.id),{now:at(25)})).status,'verified');
});
test('an already queued past-event watch completes without recreating producer demand; fresh producer input still reconciles normally',async t=>{
 const db=database(t),{entity}=await seed(db,record({event_start:'2026-10-01',event_end:'2026-10-02'}));await enqueue(db,'watch','old-past-pointer',{entity_id:entity.id},NOW);const result=await runStage(db,'watch',{now:NOW});assert.equal(result.result.phase,'automatic_recheck_review_required');assert.equal((await sql(db,'SELECT COUNT(*) n FROM recheck_requests').first()).n,0);assert.notEqual((await evaluateReadiness(db,entity.id,{now:NOW})).status,'ready');
 const delivered=await ingestRecords(db,[record({event_start:'2026-10-01',event_end:'2026-10-02',last_checked:at(1),lifecycle_event:'UPDATED'})],{environment:'test',now:at(1)});assert.equal(delivered.accepted,1);assert.equal((await sql(db,"SELECT COUNT(*) n FROM jobs WHERE stage='reconcile' AND status='ready'").first()).n,1);
});
test('expired non-trader proof stays unverified and stops recurring work instead of being revived or deferred forever',async t=>{
 const db=database(t),{entity}=await seed(db),document=documentFixture();document.html=document.html.replace('Vendor Application | 2026','Volunteer Application | 2026');const proof=await recordVerification(db,entity.id,document,{now:NOW});await evaluateReadiness(db,entity.id,{now:NOW});const prior=await sql(db,'SELECT * FROM source_verifications WHERE id=?',proof.verification_id).first();
 await enqueue(db,'watch','legacy-review-pointer',{entity_id:entity.id},NOW,at(48));const result=await runStage(db,'watch',{now:at(48)});assert.equal(result.result.reason,'source_purpose_review_required');assert.equal(result.result.phase,'automatic_recheck_review_required');assert.notEqual((await verificationGate(db,await loadEntity(db,entity.id),{now:at(48)})).status,'verified');assert.deepEqual(await sql(db,'SELECT * FROM source_verifications WHERE id=?',proof.verification_id).first(),prior);assert.equal((await sql(db,"SELECT COUNT(*) n FROM jobs WHERE stage='watch' AND created_at=?",at(48)).first()).n,0);
});
