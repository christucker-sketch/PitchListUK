import test from 'node:test';
import assert from 'node:assert/strict';
import {database,seed,record,NOW} from './helpers.mjs';
import {documentFixture} from './verification-fixture.mjs';
import {verifyDocument} from '../../platform/findpitches-v3/verification.mjs';
import {recordVerification,verifyEntitySource,verificationGate} from '../../platform/findpitches-v3/verification-store.mjs';
import {evaluateReadiness,assessEligibility} from '../../platform/findpitches-v3/pipeline.mjs';
import {loadEntity,sql} from '../../platform/findpitches-v3/store.mjs';
import {renewalAdmission,renewalRetryCurrent,renewalStatus} from '../../platform/findpitches-v3/source-renewal.mjs';
import {calendarHorizon,eventenyVisibleClosing,sourceDatePast,sourceWindowOpen} from '../../platform/findpitches-v3/source-calendar.mjs';
import {fetchSourceDocument} from '../../platform/findpitches-v3/source-document.mjs';
import {fetchProofDocument} from '../../platform/findpitches-v3/proof-document.mjs';

const at=n=>new Date(Date.parse(NOW)+n*60000).toISOString();
const bad=async()=>new Response('',{status:502});
const count=async(db,table)=>(await sql(db,'SELECT COUNT(*) n FROM '+table).first()).n;
async function positive(db){const s=await seed(db,record(),{environment:'shadow'});const proof=await recordVerification(db,s.entity.id,documentFixture(),{now:NOW});await evaluateReadiness(db,s.entity.id,{now:NOW});return {...s,proof};}

test('failed renewal preserves exact active proof and its TTL, then expires without inventing evidence',async t=>{
 const db=database(t),{entity,proof}=await positive(db),before=await sql(db,'SELECT * FROM source_verifications WHERE id=?',proof.verification_id).first(),facts=(await sql(db,'SELECT * FROM source_facts ORDER BY id').all()).results;
 const failure=await verifyEntitySource(db,entity.id,{now:at(60),fetcher:bad});
 assert.equal(failure.report.status,'unverified');assert.equal(failure.active_proof_unchanged,true);assert.equal(failure.retry_at,at(65));assert.equal(await count(db,'source_verifications'),1);assert.equal(await count(db,'source_renewal_attempts'),1);
 assert.deepEqual(await sql(db,'SELECT * FROM source_verifications WHERE id=?',proof.verification_id).first(),before);
 assert.equal((await sql(db,"SELECT available_at FROM jobs WHERE stage='readiness' AND dedupe_key=?",entity.id+':proof-expiry:'+proof.verification_id).first()).available_at,before.expires_at);
 assert.deepEqual((await sql(db,'SELECT * FROM source_facts ORDER BY id').all()).results,facts);
 assert.equal((await evaluateReadiness(db,entity.id,{now:at(60)})).status,'ready');
 assert.equal((await verificationGate(db,await loadEntity(db,entity.id),{now:at(1440)})).status,'unverified');
 assert.equal((await evaluateReadiness(db,entity.id,{now:at(1440)})).status,'watch');
 for(const q of ['UPDATE source_renewal_attempts SET reason=\'fixed\'','DELETE FROM source_renewal_attempts'])await assert.rejects(sql(db,q).run(),/immutable/);
});

test('a failed first visit creates immutable attempt custody and WATCH, never source proof',async t=>{
 const db=database(t),{entity}=await seed(db,record(),{environment:'shadow'}),result=await verifyEntitySource(db,entity.id,{now:NOW,fetcher:bad});
 assert.equal(result.verification_id,null);assert.ok(result.attempt_id);assert.equal(await count(db,'source_verifications'),0);assert.equal(await count(db,'source_documents'),1);assert.equal((await evaluateReadiness(db,entity.id,{now:NOW})).status,'watch');
 const telemetry=await renewalStatus(db,NOW);assert.equal(telemetry.health,'degraded');assert.equal(telemetry.last_24h.transient_failures,1);assert.equal(telemetry.waiting.entities,1);
});

test('delivery replays cannot bypass backoff; four failures trigger a daily cooldown',async t=>{
 const db=database(t),{entity}=await seed(db,record(),{environment:'shadow'});let calls=0;const fetcher=async()=>{calls++;return bad();};
 let failed=await verifyEntitySource(db,entity.id,{now:NOW,fetcher});
 const replay=await verifyEntitySource(db,entity.id,{now:at(1),fetcher});assert.equal(replay.skipped,'source_retry_backoff');assert.equal(calls,1);
 for(const [minute,next] of [[5,20],[20,80],[80,1520]]){failed=await verifyEntitySource(db,entity.id,{now:at(minute),fetcher});assert.equal(failed.retry_at,at(next));}
 assert.equal(failed.retry_exhausted,true);assert.equal(calls,4);assert.equal((await verifyEntitySource(db,entity.id,{now:at(90),fetcher})).skipped,'source_retry_exhausted');assert.equal(calls,4);
});

test('domain retry admission is bounded atomically and requeues after the next window',async t=>{
 const db=database(t),{entity}=await seed(db,record(),{environment:'shadow'});await verifyEntitySource(db,entity.id,{now:NOW,fetcher:bad});
 for(let i=0;i<16;i++)assert.equal((await renewalAdmission(db,entity,entity.application_url,at(5))).allowed,true);
 const refused=await renewalAdmission(db,entity,entity.application_url,at(5));assert.equal(refused.reason,'source_retry_domain_budget');assert.equal((await sql(db,'SELECT retries FROM source_renewal_domain_windows').first()).retries,16);assert.equal((await renewalAdmission(db,entity,entity.application_url,at(15))).allowed,true);
});

test('successful source proof supersedes old retry pointers without another source visit',async t=>{
 const db=database(t),{entity}=await positive(db),fail=await verifyEntitySource(db,entity.id,{now:at(60),fetcher:bad});assert.equal(await renewalRetryCurrent(db,await loadEntity(db,entity.id),fail.attempt_id),true);
 const doc={...documentFixture(),fetched_at:at(65)},result=await verifyEntitySource(db,entity.id,{now:at(65),fetcher:async()=>new Response(doc.html,{headers:{'content-type':'text/html'}})});
 assert.equal(result.report.status,'verified');assert.equal(await renewalRetryCurrent(db,await loadEntity(db,entity.id),fail.attempt_id),false);assert.equal((await renewalStatus(db,at(65))).waiting.entities,0);
});

test('404, closure and identity revision holds cannot fall back to previous positive proof',async t=>{
 const db=database(t),{entity}=await positive(db);
 await verifyEntitySource(db,entity.id,{now:at(60),fetcher:async()=>new Response('',{status:404})});assert.equal((await verificationGate(db,await loadEntity(db,entity.id),{now:at(60)})).status,'unverified');assert.equal((await evaluateReadiness(db,entity.id,{now:at(60)})).status,'watch');
 const closed={...documentFixture({body:'<p>Applications closed</p>'}),fetched_at:at(65)};await recordVerification(db,entity.id,closed,{now:at(65)});await verifyEntitySource(db,entity.id,{now:at(66),fetcher:bad});assert.notEqual((await evaluateReadiness(db,entity.id,{now:at(66)})).status,'ready');
 await sql(db,'UPDATE entities SET revision=revision+1 WHERE id=?',entity.id).run();assert.equal((await verificationGate(db,await loadEntity(db,entity.id),{now:at(66)})).status,'unverified');
});

test('rate limits retain Retry-After and diagnostics never store exception messages',async t=>{
 const db=database(t),{entity}=await seed(db,record(),{environment:'shadow'});const failure=await verifyEntitySource(db,entity.id,{now:NOW,fetcher:async()=>new Response('',{status:429,headers:{'retry-after':'1800'}})});assert.equal(failure.retry_at,at(30));
 const d=await fetchSourceDocument(entity.application_url,{now:NOW,fetcher:async()=>{throw new TypeError('private token and customer data');}});assert.equal(d.fetch_error_kind,'transport');assert.equal(JSON.stringify(d).includes('private token'),false);
 const timeout=await fetchSourceDocument(entity.application_url,{now:NOW,fetcher:async()=>{throw new DOMException('private timeout context','TimeoutError');}});assert.equal(timeout.fetch_error_kind,'timeout');
});

test('a published Eventeny GMT deadline binds to the same vendor offer and retains exact source time',async t=>{
 const now='2026-10-16T09:00:00Z',source=record().application_url,ends='2026-10-16T23:00',body='<p>Deadline: Oct 16, 2026 11:00 pm (GMT-04:00) Eastern Time (US & Canada)</p>',doc={...documentFixture({body,event:{offers:[{'@type':'Offer',url:source,availability:'https://schema.org/InStock',availabilityStarts:'2026-09-01T12:00',availabilityEnds:ends}]}}),fetched_at:now};
 const report=verifyDocument(doc,{now});assert.equal(report.status,'verified');assert.equal(report.application_close_at,'2026-10-17T03:00:00.000Z');assert.equal(report.facts.application_deadline,'2026-10-16');assert.equal(report.facts.application_state,'OPEN_NOW');
 const db=database(t),{entity}=await seed(db,record(),{environment:'shadow'}),receipt=await recordVerification(db,entity.id,doc,{now}),stored=await sql(db,'SELECT expires_at,report_json FROM source_verifications WHERE id=?',receipt.verification_id).first();assert.equal(stored.expires_at,report.application_close_at);assert.equal(JSON.parse(stored.report_json).expiry_policy.closing_instant_inferred,false);assert.equal((await evaluateReadiness(db,entity.id,{now})).status,'ready');
 assert.notEqual((await verificationGate(db,await loadEntity(db,entity.id),{now:report.application_close_at})).status,'verified');
});

test('mismatched visible/source clocks and unzoned same-day times remain conservative',()=>{
 assert.equal(eventenyVisibleClosing('Deadline: Oct 16, 2026 11:00 pm (GMT-04:00)',['2026-10-16T21:00']).contradiction,true);
 assert.equal(eventenyVisibleClosing('Deadline: Oct 16, 2026 11:00 pm (GMT-04:00)',['2026-10-17T03:00:00Z']).instant,'2026-10-17T03:00:00.000Z');
 assert.equal(sourceWindowOpen('2026-10-15T11:00','2026-10-16T23:00','2026-10-16T10:00Z'),false);
 assert.equal(sourceWindowOpen('2026-10-15T11:00','2026-10-17T00:00','2026-10-16T10:00Z'),true);
 assert.equal(sourceWindowOpen('2026-10-15T25:00','2026-10-17T00:00','2026-10-16T10:00Z'),false);
 assert.equal(eventenyVisibleClosing('Deadline: Oct 16, 2026 11:00 pm (GMT+14:59)',['2026-10-16T23:00']).contradiction,true);
});

test('date-only proof horizons include today without fabricating a source closing instant',async t=>{
 const db=database(t),{entity}=await seed(db,record(),{environment:'shadow'}),now='2026-10-16T09:00:00Z',url=record().application_url,doc={...documentFixture({event:{offers:[{'@type':'Offer',url,availability:'https://schema.org/InStock',availabilityStarts:'2026-09-01',availabilityEnds:'2026-10-16'}]}}),fetched_at:now};
 const result=await recordVerification(db,entity.id,doc,{now}),v=await sql(db,'SELECT expires_at,report_json FROM source_verifications WHERE id=?',result.verification_id).first();assert.equal(v.expires_at,'2026-10-16T23:00:00.000Z');assert.equal(JSON.parse(v.report_json).application_close_at,undefined);assert.equal((await evaluateReadiness(db,entity.id,{now})).status,'ready');assert.equal((await evaluateReadiness(db,entity.id,{now:'2026-10-16T23:00:00Z'})).status,'watch');
});

test('event dates and calendar horizons respect the operational day and daylight transitions',()=>{
 assert.equal(calendarHorizon('2026-10-16'),Date.parse('2026-10-16T23:00:00Z'));assert.equal(calendarHorizon('2026-10-25'),Date.parse('2026-10-26T00:00:00Z'));assert.equal(calendarHorizon('2026-03-29'),Date.parse('2026-03-29T23:00:00Z'));assert.equal(calendarHorizon('2026-02-30'),null);
 assert.equal(sourceDatePast('2026-10-16','2026-10-16T12:00Z'),false);assert.equal(sourceDatePast('2026-10-16T10:00:00-04:00','2026-10-16T14:00Z'),true);
 const e={event_name:'Source event',application_url:'https://example.org/apply',application_state:'OPEN_NOW',event_end:'2026-10-16'};assert.equal(assessEligibility(e,{now:'2026-10-16T12:00Z'}).status,'eligible');assert.equal(assessEligibility(e,{now:'2026-10-16T23:00Z'}).status,'closed');
});

test('a complete vendor application uses one source GET and does not expand unrelated contact routes',async()=>{
 const fixture=documentFixture({body:'<a href="/events/vendor/?id=999">Contact organiser</a>'});let calls=0;
 const document=await fetchProofDocument(fixture.url,{now:NOW,fetcher:async url=>{calls++;assert.equal(url,fixture.url);return new Response(fixture.html,{headers:{'content-type':'text/html'}});}});
 assert.equal(calls,1);assert.equal(verifyDocument(document,{now:NOW}).status,'verified');
});
