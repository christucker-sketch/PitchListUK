import test from 'node:test';
import assert from 'node:assert/strict';
import {database,NOW,record} from './helpers.mjs';
import {sql,ingestRecords,loadEntity} from '../../platform/findpitches-v3/store.mjs';
import {hash,stableJson,FIELDS} from '../../platform/findpitches-v3/contract.mjs';
import {reconcileRecord,assessEligibility} from '../../platform/findpitches-v3/pipeline.mjs';
import {reconcileIdentity,attachReviewedIdentityKeys} from '../../platform/findpitches-v3/identity.mjs';
import {trustedOfficialSourceReview} from '../../platform/findpitches-v3/evidence.mjs';
import {CCA_ORIGIN,CCA_BOOKING,fetchCCAProgramme} from '../../platform/findpitches-v3/creative-crafts.mjs';
import {verifyDocument} from '../../platform/findpitches-v3/verification.mjs';
import {bindEvidenceArchive} from '../../platform/findpitches-v3/evidence-archive.mjs';
import {archiveHistoricalDocuments} from '../../platform/findpitches-v3/storage-migration.mjs';
import {archiveBucket} from './storage-fixture.mjs';

const EVENT=CCA_ORIGIN+'/craft-events/26/Lowther-Gardens,-Lytham-St-Annes',NEXT=CCA_BOOKING+'Next-Step.asp',DIRECTIONS=CCA_ORIGIN+'/craft-event-directions/',GEO='https://api.postcodes.io/postcodes/FY85QQ';
const OLD='https://www.ukcraftfairs.com/craft-events/26557/x',LATER='2026-10-06T13:00:00.000Z';
async function officialBundle() {
  const brand='<meta name="description" content="Creative Crafts Association Craft & Gift Booking Form">';
  const documents={
    [CCA_BOOKING]:brand+'<form name="Booking_Form" action="Next-Step.asp" method="post">Please choose the event(s) that you wish to make a booking for:<input type="checkbox" id="checkboxG1678" name="checkboxG1678"><label for="checkboxG1678"><b>Lowther Gardens, Pumpkin Festival Lytham st Annes</b> (24 October 2026 - 25 October 2026)</label><input type="submit" value="PROCEED &gt;&gt;"></form>',
    [NEXT]:brand+'<form name="Booking_Form" action="Next-Step2_new.asp" method="post"><table><tr><td>Trading Name *</td><td><input name="Trading_name"></td></tr><tr><td>Crafts</td><td><textarea name="Crafts"></textarea></td></tr></table><input type="submit" value="PROCEED &gt;&gt;"></form>',
    [DIRECTIONS]:`<a name="Location26"></a><a href="${EVENT}">Lowther Gardens, Lytham St Annes</a><br>West Beach, Lytham<br>FY8 5QQ<br><iframe src="https://maps.example.test/"></iframe>`,
    [EVENT]:`<h1>Craft Shows and Events at Lowther Gardens, Lytham St Annes for 2026</h1><table id="events"><tr><td colspan="2">October 2026</td></tr><tr><td>Sat 24 - Sun 25</td><td>Lowther Gardens, Pumpkin Festival Lytham st Annes<a href="${CCA_BOOKING}?event_date=24 October 2026#October"><img alt="Book Event"></a><a href="${DIRECTIONS}#Location26"><img alt="Location"></a></td></tr></table>`,
    [GEO]:JSON.stringify({status:200,result:{postcode:'FY8 5QQ',country:'England',region:'North West'}}),
  };
  const found=await fetchCCAProgramme({now:NOW,fetcher:async url=>new Response(documents[url]??'',{status:documents[url]?200:404,headers:{'content-type':url===GEO?'application/json':'text/html'}})});
  assert.equal(found.bundles.length,1);return found.bundles[0];
}
async function reviewedFixture(t,{producerName='operator-review:official-source',actor='codex',wrongDocument=false,wrongPrevious=false,noReview=false,oldSourceIdentifier=null,oldAuthority100=false,skipSelections=false}={}) {
  const db=database(t);await sql(db,"INSERT INTO quality_gates VALUES ('structured-100-preservation',100,0,'{}','fixture',?)",NOW).run();
  const bundle=await officialBundle(),proof=verifyDocument(bundle,{now:NOW});assert.equal(proof.status,'verified');
  const oldInput=record({opportunity_id:'old-directory',country_code:'GB',event_name:proof.facts.event_name,organiser:'UKCraftFairs.com',location:proof.facts.location,event_start:proof.facts.event_start,event_end:proof.facts.event_end,source_platform:'ukcraftfairs',source_identifier:oldSourceIdentifier,canonical_url:OLD,application_url:OLD,application_state:'ENQUIRY_AVAILABLE'});
  const original=await ingestRecords(db,[oldInput],{producer:oldAuthority100?'independent-structured':'city-search',environment:'shadow',now:NOW}),originalDecision=await reconcileRecord(db,original.record_ids[0],{now:NOW}),entity=await loadEntity(db,originalDecision.entity_id);
  const candidate=await ingestRecords(db,[{...record(),opportunity_id:'official-cca',country_code:'GB',...proof.facts}],{producer:'uk-official',environment:'shadow',now:NOW}),candidateId=candidate.record_ids[0],held=await reconcileRecord(db,candidateId,{now:NOW});
  assert.equal(held.outcome,'PROBABLE_MATCH');assert.equal(held.entity_id,null);
  // An entity link alone never upgrades this immutable probable decision.
  await sql(db,'INSERT INTO entity_records(record_id,entity_id) VALUES (?,?)',candidateId,entity.id).run();
  if(noReview)return {db,entity,oldInput,candidateId,originalId:original.record_ids[0],held};
  const documentId='doc_'+(await hash(bundle)).slice(0,40),document=structuredClone(bundle);
  if(wrongDocument)document.source_identifier='another-control';
  await sql(db,'INSERT INTO source_documents VALUES (?,?,?,?,?)',documentId,bundle.requested_url,bundle.content_hash,bundle.fetched_at,stableJson(document)).run();
  const previousFieldIds=Object.fromEntries(Object.entries(entity.selections).map(([field,s])=>[field,s.fact_id]));
  if(wrongPrevious)previousFieldIds.organiser=previousFieldIds.location;
  const raw={review_status:'supersession_committed',actor,reason:'Direct official event, dated booking controls and venue proof supersede directory organiser metadata.',previous_field_ids:previousFieldIds,entity_id:entity.id,candidate_record_id:candidateId,original_source_platform:'ukcraftfairs',original_source_identifier:oldSourceIdentifier,original_canonical_url:OLD,reviewed_source_platform:'creativecrafts',reviewed_source_identifier:proof.facts.source_identifier,reviewed_canonical_url:EVENT,document_id:documentId};
  if(oldAuthority100){raw.verified_report=proof;raw.reviewed_facts=proof.facts;raw.previous_revision=entity.revision;}
  const content=stableJson(raw),contentHash=await hash(content),reviewId='review_'+contentHash.slice(0,40);
  await sql(db,`INSERT INTO producer_records(id,producer_name,producer_type,producer_record_id,environment,market,content_hash,raw_json,validation_status,received_at) VALUES (?,?,'enrichment',?,'shadow','GB',?,?,'accepted',?)`,reviewId,producerName,reviewId,contentHash,content,NOW).run();
  await sql(db,'INSERT INTO entity_records VALUES (?,?)',reviewId,entity.id).run();
  const selections=[];
  for(const [field,value] of Object.entries(proof.facts).filter(([field])=>FIELDS.includes(field))) {
    const factId=reviewId+':'+field;
    await sql(db,'INSERT INTO source_facts VALUES (?,?,?,?,100,?,?,?,?)',factId,reviewId,field,stableJson(value),EVENT,stableJson([{document_id:documentId,source_url:EVENT,excerpt:'Source-specific proof'}]),stableJson({kind:'official_source_review',document_id:documentId}),NOW).run();
    await sql(db,'INSERT INTO entity_facts VALUES (?,?)',entity.id,factId).run();
    if(skipSelections)continue;
    if(oldAuthority100&&entity.selections[field])await sql(db,'INSERT INTO official_source_supersessions VALUES (?,?,?,?,?,?,?,?)','sup_'+(await hash([reviewId,field])).slice(0,40),reviewId,entity.id,field,entity.selections[field].fact_id,factId,documentId,NOW).run();
    selections.push(entity.selections[field]?sql(db,'UPDATE field_selections SET fact_id=? WHERE entity_id=? AND field_name=? AND fact_id=?',factId,entity.id,field,entity.selections[field].fact_id):sql(db,'INSERT INTO field_selections VALUES (?,?,?)',entity.id,field,factId));
  }
  for(const statement of selections)await statement.run();
  await sql(db,'UPDATE conflicts SET resolved=1 WHERE record_id=?',candidateId).run();
  return {db,entity:await loadEntity(db,entity.id),oldInput,candidateId,reviewId,documentId,raw,held,originalId:original.record_ids[0]};
}

test('actual reviewed source custody upgrades a probable replay while retaining the original immutable identity decision',async t=>{
  const f=await reviewedFixture(t),review=await trustedOfficialSourceReview(f.db,f.entity.id,{candidateRecordId:f.candidateId});assert.ok(review);
  const replay=await reconcileRecord(f.db,f.candidateId,{now:LATER});assert.equal(replay.outcome,'REVIEWED_MATCH');assert.equal(replay.entity_id,f.entity.id);assert.equal(replay.review_receipt_id,f.reviewId);assert.equal(replay.original_decision.outcome,'PROBABLE_MATCH');
  assert.equal((await sql(f.db,'SELECT outcome FROM reconciliation_decisions WHERE record_id=?',f.candidateId).first()).outcome,'PROBABLE_MATCH');
  await assert.rejects(sql(f.db,"UPDATE producer_records SET raw_json='{}' WHERE id=?",f.reviewId).run(),/immutable/);
  await assert.rejects(sql(f.db,"UPDATE source_documents SET document_json='{}' WHERE id=?",f.documentId).run(),/immutable/);
});

test('archived official review retains exact supersession lineage and fails closed if the archive is missing',async t=>{
 const f=await reviewedFixture(t,{oldAuthority100:true}),bucket=archiveBucket();bindEvidenceArchive(f.db,bucket);
 const facts=(await sql(f.db,'SELECT * FROM source_facts ORDER BY id').all()).results;
 await archiveHistoricalDocuments(f.db,[f.documentId],{now:LATER});
 assert.ok(await trustedOfficialSourceReview(f.db,f.entity.id,{candidateRecordId:f.candidateId}));
 const replay=await reconcileRecord(f.db,f.candidateId,{now:LATER});assert.equal(replay.outcome,'REVIEWED_MATCH');assert.equal(replay.entity_id,f.entity.id);assert.equal(replay.original_decision.outcome,'PROBABLE_MATCH');
 assert.deepEqual((await sql(f.db,'SELECT * FROM source_facts ORDER BY id').all()).results,facts);
 bucket.objects.clear();assert.equal(await trustedOfficialSourceReview(f.db,f.entity.id,{candidateRecordId:f.candidateId}),null);
});

test('100-authority source supersession requires the immutable exact old/new-fact ledger, not just a reserved receipt',async t=>{
  const without=await reviewedFixture(t,{oldAuthority100:true,skipSelections:true});
  assert.equal(await trustedOfficialSourceReview(without.db,without.entity.id),null);
  assert.equal((await reconcileRecord(without.db,without.candidateId,{now:LATER})).outcome,'PROBABLE_MATCH');
  await assert.rejects(sql(without.db,"UPDATE field_selections SET fact_id=? WHERE entity_id=? AND field_name='organiser'",without.reviewId+':organiser',without.entity.id).run(),/equal_authority_conflict/);
  const approved=await reviewedFixture(t,{oldAuthority100:true}),review=await trustedOfficialSourceReview(approved.db,approved.entity.id);assert.ok(review);
  assert.equal((await reconcileRecord(approved.db,approved.candidateId,{now:LATER})).outcome,'REVIEWED_MATCH');
  const ledger=await sql(approved.db,'SELECT * FROM official_source_supersessions WHERE review_record_id=? LIMIT 1',approved.reviewId).first();assert.ok(ledger);
  await assert.rejects(sql(approved.db,'DELETE FROM official_source_supersessions WHERE id=?',ledger.id).run(),/immutable/);
  await assert.rejects(sql(approved.db,"UPDATE official_source_supersessions SET next_fact_id='forged' WHERE id=?",ledger.id).run(),/immutable/);
});

test('ordinary links, forged producer metadata, wrong actor/document and mismatched previous facts cannot approve a probable match',async t=>{
  for(const [name,options] of [['link alone',{noReview:true}],['forged producer',{producerName:'enrichment:official_page'}],['wrong actor',{actor:'discovery-producer'}],['wrong document',{wrongDocument:true}],['wrong previous membership',{wrongPrevious:true}]])await t.test(name,async child=>{
    const f=await reviewedFixture(child,options);assert.equal(await trustedOfficialSourceReview(f.db,f.entity.id,{candidateRecordId:f.candidateId}),null);
    assert.equal((await reconcileRecord(f.db,f.candidateId,{now:LATER})).outcome,'PROBABLE_MATCH');
  });
});

test('historical URL and platform aliases require an actual receipt, exact dates and identity corroboration',async t=>{
  for(const oldSourceIdentifier of [null,'26557'])await t.test(oldSourceIdentifier?'platform alias':'URL-only alias',async child=>{
    const f=await reviewedFixture(child,{oldSourceIdentifier}),review=await trustedOfficialSourceReview(f.db,f.entity.id),keys=(await sql(f.db,'SELECT identity_key FROM identity_keys WHERE entity_id=?',f.entity.id).all()).results.map(r=>r.identity_key);
    const incoming={...f.oldInput,market:'GB',environment:'shadow'};
    const forged={...f.entity,reviewed_identity_keys:keys};assert.notEqual(reconcileIdentity(incoming,[forged]).outcome,'EXACT_MATCH');
    assert.throws(()=>attachReviewedIdentityKeys(forged,keys,{entity_id:f.entity.id,raw:f.raw}),/trusted_reviewed_identity_lineage/);
    const actual=attachReviewedIdentityKeys(await loadEntity(f.db,f.entity.id),keys,review);
    assert.equal(reconcileIdentity(incoming,[actual]).reason,'reviewed_historical_source_alias');
    assert.equal(reconcileIdentity({...f.entity,event_end:null},[actual]).reason,'platform_identifier','current explicit platform ID retains ordinary exact-match behaviour');
    if(oldSourceIdentifier)assert.notEqual(reconcileIdentity({...incoming,source_identifier:'different-source-id'},[actual]).outcome,'EXACT_MATCH');
    for(const changes of [{market:'US'},{environment:'test'},{event_start:'2027-10-24',event_end:'2027-10-25'},{event_start:'2026-10-25'},{event_end:'2026-10-26'},{event_start:null},{event_name:'Completely Unrelated Performance',location:'Other County',organiser:'Other Organisation'}])assert.notEqual(reconcileIdentity({...incoming,...changes},[actual]).outcome,'EXACT_MATCH',stableJson(changes));
  });
});

test('refreshed discovery converges through reviewed old aliases and cannot replace official organiser/source facts',async t=>{
  const f=await reviewedFixture(t),oldFacts=(await sql(f.db,'SELECT * FROM source_facts WHERE record_id=? ORDER BY id',f.originalId).all()).results;
  for(const lastChecked of [LATER,'2026-10-06T14:00:00.000Z']) {
    const refreshed=await ingestRecords(f.db,[{...f.oldInput,opportunity_id:'stable-producer-ukcf-id',last_checked:lastChecked,lifecycle_event:'UNCHANGED'}],{producer:'independent-structured',environment:'shadow',now:lastChecked});
    const result=await reconcileRecord(f.db,refreshed.record_ids[0],{now:lastChecked});assert.equal(result.outcome,'EXACT_MATCH');assert.equal(result.entity_id,f.entity.id);
    const current=await loadEntity(f.db,f.entity.id);assert.equal(current.organiser,'Creative Crafts Association');assert.equal(current.source_platform,'creativecrafts');assert.equal(current.canonical_url,EVENT);assert.equal(current.application_state,'OPEN_NOW');
    const decisions=(await sql(f.db,"SELECT decision,reason FROM selection_audit WHERE proposed_fact_id IN (SELECT id FROM source_facts WHERE record_id=?) AND field_name='organiser'",refreshed.record_ids[0]).all()).results;
    assert.deepEqual(decisions.map(r=>[r.decision,r.reason]),[['rejected','weaker_reviewed_source_evidence']]);
  }
  assert.equal((await sql(f.db,'SELECT COUNT(*) AS n FROM entities').first()).n,1);
  assert.equal((await sql(f.db,'SELECT COUNT(*) AS n FROM conflicts WHERE entity_id=? AND resolved=0',f.entity.id).first()).n,0);
  assert.deepEqual((await sql(f.db,'SELECT * FROM source_facts WHERE record_id=? ORDER BY id',f.originalId).all()).results,oldFacts);
});

test('reviewed open proof survives weaker enquiry/watch/unknown/rolling discovery while retaining those observations',async t=>{
  const f=await reviewedFixture(t);
  for(const [i,state] of ['ENQUIRY_AVAILABLE','WATCH','UNKNOWN','ROLLING'].entries()) {
    const now=`2026-10-06T${String(13+i).padStart(2,'0')}:00:00.000Z`,receipt=await ingestRecords(f.db,[{...f.oldInput,opportunity_id:'weak-directory-states',application_state:state,last_checked:now}],{producer:'independent-structured',environment:'shadow',now});
    assert.equal((await reconcileRecord(f.db,receipt.record_ids[0],{now})).entity_id,f.entity.id);
    assert.equal((await loadEntity(f.db,f.entity.id)).application_state,'OPEN_NOW');
    const audit=await sql(f.db,"SELECT decision,reason FROM selection_audit WHERE entity_id=? AND proposed_fact_id=?",f.entity.id,receipt.record_ids[0]+':application_state').first();
    assert.equal(audit.decision,'rejected');assert.equal(audit.reason,'weaker_reviewed_source_evidence');
    assert.equal((await sql(f.db,'SELECT value_json FROM source_facts WHERE id=?',receipt.record_ids[0]+':application_state').first()).value_json,stableJson(state));
  }
  assert.equal((await sql(f.db,"SELECT COUNT(*) AS n FROM conflicts WHERE entity_id=? AND field_name='application_state' AND resolved=0",f.entity.id).first()).n,0);
});

test('other retained aliases remain unreviewed, and an untrusted equal-authority organiser still creates a conflict',async t=>{
  const actual=await reviewedFixture(t),other='https://ukcraftfairs.com/craft-events/99999/x',profile='https://ukcraftfairs.com/profile/creative-crafts';
  for(const url of [other,profile])await sql(actual.db,'INSERT INTO identity_keys VALUES (?,?,?,?)','shadow','GB','url:'+url,actual.entity.id).run();
  const review=await trustedOfficialSourceReview(actual.db,actual.entity.id),keys=(await sql(actual.db,'SELECT identity_key FROM identity_keys WHERE entity_id=?',actual.entity.id).all()).results.map(r=>r.identity_key),candidate=attachReviewedIdentityKeys(await loadEntity(actual.db,actual.entity.id),keys,review);
  for(const url of [other,profile]) {
    assert.ok(!candidate.reviewed_identity_keys.includes('url:'+url));
    assert.notEqual(reconcileIdentity({...actual.oldInput,market:'GB',environment:'shadow',canonical_url:url,application_url:url},[candidate]).outcome,'EXACT_MATCH');
  }
  assert.ok(candidate.reviewed_identity_keys.every(key=>!key.startsWith('name:')));
  const fake=await reviewedFixture(t,{producerName:'enrichment:official_page'}),receipt=await ingestRecords(fake.db,[{...fake.oldInput,opportunity_id:'fake-review-followup',application_state:'OPEN_NOW',last_checked:LATER}],{producer:'independent-structured',environment:'shadow',now:LATER});
  // Link/selection are explicit local fixture operations: ordinary equal
  // authority rules must still hold without a trusted reviewed receipt.
  await sql(fake.db,'INSERT INTO entity_records VALUES (?,?)',receipt.record_ids[0],fake.entity.id).run();
  const {selectRecordFacts}=await import('../../platform/findpitches-v3/evidence.mjs'),facts=(await sql(fake.db,'SELECT * FROM source_facts WHERE record_id=?',receipt.record_ids[0]).all()).results;
  const decisions=await selectRecordFacts(fake.db,fake.entity.id,facts,{now:LATER}),organiser=decisions.find(d=>d.fact_id.endsWith(':organiser'));
  assert.equal(organiser.decision,'conflict');assert.equal(organiser.reason,'equal_authority_disagreement');
});

test('a forged review in another market cannot acquire the entity link required for trusted lineage',async t=>{
  const f=await reviewedFixture(t,{noReview:true}),raw={review_status:'supersession_committed',entity_id:f.entity.id,candidate_record_id:f.candidateId,actor:'codex',reason:'forged market'};
  const content=stableJson(raw),h=await hash(content),id='review_'+h.slice(0,40);
  await sql(f.db,"INSERT INTO producer_records(id,producer_name,producer_type,producer_record_id,environment,market,content_hash,raw_json,validation_status,received_at) VALUES (?,'operator-review:official-source','enrichment',?,'shadow','US',?,?,'accepted',?)",id,id,h,content,NOW).run();
  await assert.rejects(sql(f.db,'INSERT INTO entity_records VALUES (?,?)',id,f.entity.id).run(),/record_scope_mismatch/);
  assert.equal(await trustedOfficialSourceReview(f.db,f.entity.id),null);
  assert.equal((await reconcileRecord(f.db,f.candidateId,{now:LATER})).outcome,'PROBABLE_MATCH');
});

test('equal-authority closure remains a conflict/hold after official supersession, never discarded as old discovery',async t=>{
  const f=await reviewedFixture(t),closed=await ingestRecords(f.db,[{...f.oldInput,opportunity_id:'stable-producer-ukcf-id',application_state:'CLOSED',lifecycle_event:'CLOSED',last_checked:LATER}],{producer:'independent-structured',environment:'shadow',now:LATER});
  const result=await reconcileRecord(f.db,closed.record_ids[0],{now:LATER});assert.equal(result.entity_id,f.entity.id);
  const conflict=await sql(f.db,"SELECT * FROM conflicts WHERE entity_id=? AND field_name='application_state' AND resolved=0",f.entity.id).first();assert.ok(conflict);assert.equal(conflict.reason,'equal_authority_disagreement');
  const current=await loadEntity(f.db,f.entity.id);assert.equal(current.organiser,'Creative Crafts Association');assert.equal(current.lifecycle_state,'CLOSED');
  assert.equal(assessEligibility(current,{now:LATER,conflicts:1}).status,'review');
});

test('ordinary 100-authority same-producer lifecycle transitions retain their existing temporal acceptance',async t=>{
  const db=database(t),initial=record({opportunity_id:'ordinary-lifecycle',application_state:'OPEN_NOW',last_checked:NOW});
  const receipt=await ingestRecords(db,[initial],{environment:'shadow',now:NOW}),first=await reconcileRecord(db,receipt.record_ids[0],{now:NOW});
  for(const [i,state] of ['ROLLING','ENQUIRY_AVAILABLE'].entries()) {
    const now=`2026-10-06T${13+i}:00:00.000Z`,next=await ingestRecords(db,[{...initial,application_state:state,lifecycle_event:'STATE_CHANGED',last_checked:now}],{environment:'shadow',now});
    assert.equal((await reconcileRecord(db,next.record_ids[0],{now})).entity_id,first.entity_id);
    assert.equal((await loadEntity(db,first.entity_id)).application_state,state);
    const audit=await sql(db,'SELECT decision,reason FROM selection_audit WHERE proposed_fact_id=?',next.record_ids[0]+':application_state').first();
    assert.equal(audit.decision,'accepted');assert.equal(audit.reason,'newer_lifecycle_evidence');
  }
  assert.equal((await sql(db,'SELECT COUNT(*) AS n FROM conflicts WHERE entity_id=? AND resolved=0',first.entity_id).first()).n,0);
});

test('reviewed discovery with a changed edition/occurrence cannot silently change the established producer identity',async t=>{
  const f=await reviewedFixture(t),initial=await ingestRecords(f.db,[{...f.oldInput,opportunity_id:'stable-producer-ukcf-id',application_state:'OPEN_NOW',last_checked:LATER}],{producer:'independent-structured',environment:'shadow',now:LATER});
  assert.equal((await reconcileRecord(f.db,initial.record_ids[0],{now:LATER})).entity_id,f.entity.id);
  const changed=await ingestRecords(f.db,[{...f.oldInput,opportunity_id:'stable-producer-ukcf-id',event_start:'2026-10-25',event_end:'2026-10-26',application_state:'OPEN_NOW',last_checked:'2026-10-06T14:00:00.000Z'}],{producer:'independent-structured',environment:'shadow',now:LATER});
  const decision=await reconcileRecord(f.db,changed.record_ids[0],{now:LATER});assert.equal(decision.outcome,'REVIEW_REQUIRED');assert.equal(decision.entity_id,null);
  assert.equal((await loadEntity(f.db,f.entity.id)).event_start,'2026-10-24');assert.equal((await sql(f.db,'SELECT COUNT(*) AS n FROM entities').first()).n,1);
});
