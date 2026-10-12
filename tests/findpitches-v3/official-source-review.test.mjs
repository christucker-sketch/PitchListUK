import test from 'node:test';import assert from 'node:assert/strict';
import {documents,fetcherFor} from './cca-fixture.mjs';
import {database,NOW,record,seed} from './helpers.mjs';
import {sql,loadEntity,ingestRecords} from '../../platform/findpitches-v3/store.mjs';
import {startUKRun,discoverUKSource,importUKCandidate} from '../../platform/findpitches-v3/uk-store.mjs';
import {CCA_BOOKING} from '../../platform/findpitches-v3/creative-crafts.mjs';
import {reviewOfficialCandidate,reviewOfficialIdentity} from '../../platform/findpitches-v3/official-source-review.mjs';
import {reconcileRecord,evaluateReadiness} from '../../platform/findpitches-v3/pipeline.mjs';
import {reverifyRetainedSource} from '../../platform/findpitches-v3/verification-store.mjs';
import {commercialRows,inventoryFromRows} from '../../platform/findpitches-v3/commercial.mjs';
import worker from '../../platform/findpitches-v3/worker.mjs';
const OLD='https://www.ukcraftfairs.com/craft-events/26556/x',REASON='Reviewed exact source dates and named venue; current official dated trader form supersedes unverified directory metadata.';
async function setup(t) {
  const db=database(t);await sql(db,"INSERT INTO quality_gates VALUES ('structured-100-preservation',100,0,'{}','review_fixture',?)",NOW).run();await sql(db,'UPDATE commercial_acquisition_policy SET manual_paused=1').run();
  const old=record({country_code:'GB',event_name:'Pumpkin Festival Lowther Gardens Lytham.',organiser:'UKCraftFairs.com',location:'Lowther Gardens, Lytham St Annes, Lancashire',event_start:'2026-10-24',event_end:'2026-10-25',source_platform:'ukcraftfairs',source_identifier:null,application_state:'ENQUIRY_AVAILABLE',canonical_url:OLD,application_url:OLD});
  const {entity,recordId}=await seed(db,old,{producer:'independent-structured',environment:'shadow'}),fetcher=fetcherFor(documents()),sourceRun=await startUKRun(db,{max_visits:6},NOW),found=await discoverUKSource(db,{run_id:sourceRun.id,url:CCA_BOOKING},{fetcher,now:NOW}),candidate=found.candidates.find(c=>c.date==='2026-10-24');
  const held=await importUKCandidate(db,candidate.id,{now:NOW,fetcher});assert.equal(held.status,'held');
  const reviewRun=await startUKRun(db,{max_visits:10,max_candidates:2},NOW),current=await loadEntity(db,entity.id),body={run_id:reviewRun.id,candidate_id:candidate.id,entity_id:entity.id,expected_revision:current.revision,reason:REASON};return {db,entity:current,old,recordId,fetcher,body,candidate};
}
test('review joins one source-proved event with complete immutable lineage, stronger selected facts and no duplicate ID',async t=>{
  const {db,entity,recordId,fetcher,body,candidate}=await setup(t),raw=await sql(db,'SELECT * FROM producer_records WHERE id=?',recordId).first(),facts=(await sql(db,'SELECT * FROM source_facts WHERE record_id=? ORDER BY id',recordId).all()).results;
  const result=await reviewOfficialCandidate(db,body,{fetcher,now:NOW});assert.equal(result.readiness,'ready');assert.equal(result.entity_id,entity.id);assert.equal(result.original_identity_outcome,'PROBABLE_MATCH');assert.equal((await sql(db,'SELECT COUNT(*) n FROM entities').first()).n,1);
  assert.deepEqual(await sql(db,'SELECT * FROM producer_records WHERE id=?',recordId).first(),raw);assert.deepEqual((await sql(db,'SELECT * FROM source_facts WHERE record_id=? ORDER BY id',recordId).all()).results,facts);
  const reviewed=await loadEntity(db,entity.id);assert.equal(reviewed.organiser,'Creative Crafts Association');assert.equal(reviewed.source_platform,'creativecrafts');assert.equal(reviewed.application_state,'OPEN_NOW');assert.equal(reviewed.market,'GB');assert.equal(reviewed.edition,entity.edition);
  const record=(await sql(db,'SELECT record_id FROM uk_source_progress WHERE candidate_id=?',candidate.id).first()).record_id,decision=await reconcileRecord(db,record,{now:NOW});assert.equal(decision.outcome,'REVIEWED_MATCH');assert.equal(decision.entity_id,entity.id);assert.equal((await sql(db,'SELECT outcome FROM reconciliation_decisions WHERE record_id=?',record).first()).outcome,'PROBABLE_MATCH');
  const originalCustody=await sql(db,'SELECT entity_id,identity_outcome,status FROM uk_source_progress WHERE candidate_id=?',candidate.id).first();assert.equal(originalCustody.entity_id,null);assert.equal(originalCustody.identity_outcome,'PROBABLE_MATCH');assert.equal(originalCustody.status,'held');
  await assert.rejects(sql(db,'DELETE FROM official_source_supersessions').run(),/immutable/);await assert.rejects(sql(db,'DELETE FROM official_source_review_outcomes').run(),/immutable/);
  const replay=await reviewOfficialCandidate(db,body,{fetcher:()=>{throw Error('replay_must_not_fetch');},now:NOW});assert.equal(replay.replay,true);assert.equal(replay.proof_clock_reset,false);
  assert.equal(inventoryFromRows(await commercialRows(db),{now:NOW}).totals.ready,1);assert.equal((await sql(db,'SELECT COUNT(*) n FROM customer_projections').first()).n,0);assert.equal((await sql(db,'SELECT COUNT(*) n FROM publication_queue').first()).n,0);
  await assert.rejects(sql(db,"UPDATE producer_records SET raw_json='{}' WHERE id=?",result.review_id).run(),/immutable/);await assert.rejects(reverifyRetainedSource(db,entity.id,{now:'2026-10-07T12:00:01.000Z'}),/expired/);
});
test('unchanged directory redelivery converges without reverting official fields; explicit closure holds',async t=>{
  const {db,entity,old,fetcher,body}=await setup(t);await reviewOfficialCandidate(db,body,{fetcher,now:NOW});
  const receipt=await ingestRecords(db,[{...old,last_checked:'2026-10-06T12:00:01.000Z',lifecycle_event:'UNCHANGED'}],{producer:'independent-structured',environment:'shadow',now:'2026-10-06T12:00:01.000Z'}),decision=await reconcileRecord(db,receipt.record_ids[0],{now:NOW});assert.equal(decision.entity_id,entity.id);assert.equal((await loadEntity(db,entity.id)).organiser,'Creative Crafts Association');assert.equal((await loadEntity(db,entity.id)).application_state,'OPEN_NOW');assert.equal((await sql(db,'SELECT COUNT(*) n FROM conflicts WHERE resolved=0').first()).n,0);
  const closed=await ingestRecords(db,[{...old,last_checked:'2026-10-06T12:00:02.000Z',application_state:'CLOSED',lifecycle_event:'CLOSED'}],{producer:'independent-structured',environment:'shadow',now:'2026-10-06T12:00:02.000Z'});await reconcileRecord(db,closed.record_ids[0],{now:NOW});assert.notEqual((await evaluateReadiness(db,entity.id,{now:NOW})).status,'ready');
});
test('review rejects stale revision, ambiguous identity, closed source and arbitrary fields before supersession',async t=>{
  const {db,fetcher,body}=await setup(t);
  await assert.rejects(reviewOfficialCandidate(db,{...body,expected_revision:body.expected_revision+1},{fetcher,now:NOW}),/revision_changed/);
  await assert.rejects(reviewOfficialCandidate(db,{...body,force:true},{fetcher,now:NOW}),/explicit_bounded/);
  await assert.rejects(reviewOfficialCandidate(db,{...body,reason:' '.repeat(30)},{fetcher:()=>{throw Error('invalid_reason_must_not_fetch');},now:NOW}),/explicit_bounded/);
  const closed=documents();closed.find(d=>d.url.endsWith('Next-Step.asp')).html+='<p>Join the waitlist</p>';
  await assert.rejects(reviewOfficialCandidate(db,body,{fetcher:fetcherFor(closed),now:NOW}),/current_dated_trader_proof/);
  assert.equal((await sql(db,"SELECT COUNT(*) n FROM producer_records WHERE producer_name='operator-review:official-source'").first()).n,0);
});
test('review requires matching country, edition, full date range and exact named venue; not an inference repair',()=>{
  const facts={country:'GB',event_name:'Christmas at Dobbies Southport',event_start:'2026-11-06',event_end:'2026-11-08',application_state:'OPEN_NOW',canonical_url:'https://www.creativecrafts-online.co.uk/craft-events/16/Dobbies-Garden-World-Southport'},r={status:'verified',profile:'creativecrafts',source_url:facts.canonical_url,facts},e={environment:'shadow',shadow_only:1,market:'GB',source_platform:'ukcraftfairs',canonical_url:OLD,organiser:'UKCraftFairs.com',event_name:facts.event_name,location:'Dobbies Garden World Southport, Merseyside',event_start:facts.event_start,event_end:facts.event_end,edition:'2026',application_state:'ENQUIRY_AVAILABLE'},incoming={market:'GB',...facts};
  for(const change of [{market:'US'},{edition:'2027'},{event_end:'2026-11-07'},{location:'Dobbies Garden World Liverpool'},{application_state:'CLOSED'},{organiser:'A different operator'}])assert.throws(()=>reviewOfficialIdentity({...e,...change},incoming,r,{venue:'Dobbies Garden World Southport'}));
});
test('ingest-only token cannot issue official identity/field review',async t=>{
  const db=database(t),r=await worker.fetch(new Request('https://shadow.test/uk/review',{method:'POST',headers:{Authorization:'Bearer ingest-only-fixture','Content-Type':'application/json'},body:'{}'}),{FINDPITCHES_V3_DB:db,V3_ROLE:'enrichment',V3_INGEST_TOKEN:'ingest-only-fixture',V3_OPERATOR_TOKEN:'different-operator-fixture'});assert.equal(r.status,401);
});
test('post-commit outcome failure resumes exact custody without new visits, facts, identities or proof clock',async t=>{
  const {db,entity,fetcher,body,candidate}=await setup(t);
  await db.exec("CREATE TRIGGER fixture_outcome_failure BEFORE INSERT ON official_source_review_outcomes BEGIN SELECT RAISE(ABORT,'injected_outcome_failure'); END;");
  await assert.rejects(reviewOfficialCandidate(db,body,{fetcher,now:NOW}),/injected_outcome_failure/);
  const before=await sql(db,`SELECT (SELECT COUNT(*) FROM producer_records) receipts,(SELECT COUNT(*) FROM source_facts) facts,(SELECT COUNT(*) FROM source_verifications) verifications,
    (SELECT checked FROM uk_source_runs WHERE id=?) checked,(SELECT visits_reserved FROM uk_source_runs WHERE id=?) visits`,body.run_id,body.run_id).first();
  assert.equal((await sql(db,'SELECT status FROM uk_source_runs WHERE id=?',body.run_id).first()).status,'paused');
  assert.equal((await sql(db,'SELECT status FROM uk_source_progress WHERE candidate_id=?',candidate.id).first()).status,'failed');
  await db.exec('DROP TRIGGER fixture_outcome_failure;');
  await assert.rejects(reviewOfficialCandidate(db,{...body,run_id:'a_different_run'},{fetcher:()=>{throw Error('must_not_fetch');},now:NOW}),/original_run_required/);
  const resumed=await reviewOfficialCandidate(db,body,{fetcher:()=>{throw Error('must_not_fetch');},now:'2026-10-06T13:00:00.000Z'});
  assert.equal(resumed.recovered,true);assert.equal(resumed.proof_clock_reset,false);assert.equal(resumed.readiness,'ready');
  assert.deepEqual(await sql(db,`SELECT (SELECT COUNT(*) FROM producer_records) receipts,(SELECT COUNT(*) FROM source_facts) facts,(SELECT COUNT(*) FROM source_verifications) verifications,
    (SELECT checked FROM uk_source_runs WHERE id=?) checked,(SELECT visits_reserved FROM uk_source_runs WHERE id=?) visits`,body.run_id,body.run_id).first(),before);
  assert.equal((await sql(db,'SELECT checked_at FROM source_verifications WHERE entity_id=? ORDER BY sequence DESC LIMIT 1',entity.id).first()).checked_at,NOW);
  assert.equal((await sql(db,'SELECT entity_id FROM uk_source_progress WHERE candidate_id=?',candidate.id).first()).entity_id,null);
});
test('recovery cannot promote expired reviewed proof or undo a newer failed source verification',async t=>{
  for(const newer of [false,true]) {
    const {db,entity,fetcher,body}=await setup(t);
    await db.exec("CREATE TRIGGER fixture_outcome_failure BEFORE INSERT ON official_source_review_outcomes BEGIN SELECT RAISE(ABORT,'injected_outcome_failure'); END;");
    await assert.rejects(reviewOfficialCandidate(db,body,{fetcher,now:NOW}),/injected_outcome_failure/);await db.exec('DROP TRIGGER fixture_outcome_failure;');
    if(newer) {
      const {recordVerification}=await import('../../platform/findpitches-v3/verification-store.mjs'),current=await loadEntity(db,entity.id);
      await recordVerification(db,entity.id,{requested_url:current.canonical_url,url:current.canonical_url,http_status:520,html:'',fetched_at:'2026-10-06T12:30:00.000Z',reason:'source_http_520'},{now:'2026-10-06T12:30:00.000Z',addEvidence:false});
    }
    const before=(await sql(db,'SELECT COUNT(*) n FROM source_verifications').first()).n;
    const resumed=await reviewOfficialCandidate(db,body,{fetcher:()=>{throw Error('must_not_fetch');},now:newer?'2026-10-06T13:00:00.000Z':'2026-10-07T13:00:00.000Z'});
    assert.equal(resumed.recovered,true);assert.notEqual(resumed.readiness,'ready');assert.equal((await sql(db,'SELECT COUNT(*) n FROM source_verifications').first()).n,before);
  }
});
test('a proven fully rolled-back review can retry under a new bounded grant without refunding the failed grant',async t=>{
  const {db,entity,fetcher,body}=await setup(t);
  await db.exec("CREATE TRIGGER fixture_transaction_failure BEFORE INSERT ON producer_records WHEN NEW.producer_name='operator-review:official-source' BEGIN SELECT RAISE(ABORT,'injected_transaction_failure'); END;");
  await assert.rejects(reviewOfficialCandidate(db,body,{fetcher,now:NOW}),/injected_transaction_failure/);
  assert.equal((await sql(db,"SELECT COUNT(*) n FROM producer_records WHERE producer_name='operator-review:official-source'").first()).n,0);
  assert.equal((await loadEntity(db,entity.id)).revision,entity.revision);
  const failedGrant=await sql(db,'SELECT checked,visits_reserved,status FROM uk_source_runs WHERE id=?',body.run_id).first();assert.equal(failedGrant.checked,1);assert.equal(failedGrant.visits_reserved,5);assert.equal(failedGrant.status,'paused');
  await db.exec('DROP TRIGGER fixture_transaction_failure;');
  const next=await startUKRun(db,{max_visits:5,max_candidates:1},NOW),result=await reviewOfficialCandidate(db,{...body,run_id:next.id},{fetcher,now:NOW});assert.equal(result.readiness,'ready');
  assert.deepEqual(await sql(db,'SELECT checked,visits_reserved,status FROM uk_source_runs WHERE id=?',body.run_id).first(),failedGrant);
  assert.equal((await sql(db,'SELECT visits_reserved FROM uk_source_runs WHERE id=?',next.id).first()).visits_reserved,5);
});
