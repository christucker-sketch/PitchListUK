import test from 'node:test';import assert from 'node:assert/strict';
import {database,record,seed,NOW} from './helpers.mjs';
import {loadEntity,ingestRecords,sql} from '../../platform/findpitches-v3/store.mjs';
import {evaluateReadiness,drainPipeline} from '../../platform/findpitches-v3/pipeline.mjs';
import {recordVerification} from '../../platform/findpitches-v3/verification-store.mjs';
import {commercialRows,commercialEntity} from '../../platform/findpitches-v3/commercial.mjs';
import {stagingCatalogue} from '../../platform/findpitches-v3/staging.mjs';
const URL='https://organiser.example.org/events/river-fair';
const at=h=>new Date(Date.parse(NOW)+h*3600000).toISOString();
const input=()=>record({canonical_url:URL,application_url:URL,source_platform:'organiser_site',channel:'watch',export_readiness:'WATCH',application_state:'UPCOMING_NOT_OPEN',applications_open_on:'2026-10-20',application_state_evidence:'Applications for this edition are not open yet.'});
function standingDocument(when=NOW){const r=record(),event={'@type':'Event',name:r.event_name,url:URL,startDate:r.event_start,endDate:r.event_end,organizer:{name:r.organiser,url:'https://organiser.example.org/'},location:{name:'River Hall',address:{streetAddress:'1 River Street',addressLocality:'Austin',addressRegion:'Texas',addressCountry:'US'}}};return {requested_url:URL,url:URL,http_status:200,fetched_at:when,html:`<script type="application/ld+json">${JSON.stringify(event)}</script><main><h1>${r.event_name}</h1><section><h2>Vendor enquiries</h2><p>For vendor enquiries email <a href="mailto:vendors@organiser.example.org">the trader team</a>.</p></section></main>`};}
test('upcoming intake preserves original state/opening evidence and cannot become READY via a generic standing enquiry',async t=>{
 const db=database(t),raw=input(),{entity,recordId}=await seed(db,raw,{environment:'shadow'});const receipt=await sql(db,'SELECT * FROM producer_records WHERE id=?',recordId).first(),facts=(await sql(db,'SELECT * FROM source_facts ORDER BY id').all()).results;
 assert.equal(JSON.parse(receipt.raw_json).application_state,'UPCOMING_NOT_OPEN');assert.equal(JSON.parse(receipt.raw_json).applications_open_on,'2026-10-20');assert.equal((await loadEntity(db,entity.id)).application_state,'WATCH');
 const proof=await recordVerification(db,entity.id,standingDocument(),{now:NOW});assert.equal(proof.report.status,'verified');assert.equal(proof.report.facts.application_state,'ENQUIRY_AVAILABLE');
 const readiness=await evaluateReadiness(db,entity.id,{now:NOW});assert.equal(readiness.status,'watch');assert.ok(readiness.reasons.includes('producer_applications_not_open_yet'));
 assert.deepEqual(await sql(db,'SELECT * FROM producer_records WHERE id=?',recordId).first(),receipt);const ids=new Set(facts.map(f=>f.id));assert.deepEqual((await sql(db,'SELECT * FROM source_facts ORDER BY id').all()).results.filter(f=>ids.has(f.id)),facts);
 assert.equal((await ingestRecords(db,[raw],{environment:'shadow',now:NOW})).duplicates,1);assert.equal((await stagingCatalogue(db,{now:NOW})).items.length,0);
});
test('current upcoming policy blocks an older READY cache in both commercial and customer read models',async t=>{
 const db=database(t),{entity}=await seed(db,input(),{environment:'shadow'});await recordVerification(db,entity.id,standingDocument(),{now:NOW});await evaluateReadiness(db,entity.id,{now:NOW});await sql(db,"UPDATE readiness SET status='ready' WHERE entity_id=?",entity.id).run();
 const row=(await commercialRows(db)).find(r=>r.id===entity.id),current=commercialEntity(row,NOW);assert.equal(current.ready,false);assert.equal(current.watch,true);assert.ok(current.reasons.includes('producer_applications_not_open_yet'));assert.equal((await stagingCatalogue(db,{now:NOW})).items.length,0);
});
test('stale OPEN replays cannot clear upcoming, while a genuinely newer producer update restores normal proof rules without identity growth',async t=>{
 const db=database(t),raw=input(),open={...raw,channel:'current',export_readiness:'READY',application_state:'OPEN_NOW'}, {entity,recordId}=await seed(db,open,{environment:'shadow'}),original=(await sql(db,'SELECT * FROM source_facts WHERE record_id=? ORDER BY id',recordId).all()).results;
 const deliver=async r=>{const result=await ingestRecords(db,[r],{environment:'shadow',now:at(3)});await drainPipeline(db,{now:at(3)});return result;};
 await deliver({...raw,last_checked:at(1),lifecycle_event:'STATE_CHANGED'});assert.equal((await loadEntity(db,entity.id)).producer_upcoming_not_open,true);
 assert.equal((await deliver(open)).duplicates,1);assert.equal((await loadEntity(db,entity.id)).producer_upcoming_not_open,true);
 const fresh=await deliver({...open,last_checked:at(2),lifecycle_event:'STATE_CHANGED'});assert.equal((await loadEntity(db,entity.id)).producer_upcoming_not_open,false);assert.equal((await sql(db,'SELECT entity_id FROM entity_records WHERE record_id=?',fresh.record_ids[0]).first()).entity_id,entity.id);
 await recordVerification(db,entity.id,standingDocument(at(3)),{now:at(3)});assert.equal((await evaluateReadiness(db,entity.id,{now:at(3)})).status,'ready');assert.equal((await stagingCatalogue(db,{now:at(3)})).items.length,1);assert.equal((await sql(db,'SELECT COUNT(*) n FROM entities').first()).n,1);assert.deepEqual((await sql(db,'SELECT * FROM source_facts WHERE record_id=? ORDER BY id',recordId).all()).results,original);
});
