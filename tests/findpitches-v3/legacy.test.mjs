import test from 'node:test';
import assert from 'node:assert/strict';
import {database,NOW,record,seed} from './helpers.mjs';
import {sql,loadEntity} from '../../platform/findpitches-v3/store.mjs';
import {drainPipeline} from '../../platform/findpitches-v3/pipeline.mjs';
import {hash,normalizeExport} from '../../platform/findpitches-v3/contract.mjs';
import {fetchLegacySource,extractLegacyPage,supportedTradingHeading} from '../../platform/findpitches-v3/legacy.mjs';
import {importLegacyBatch,completeLegacyRecovery} from '../../platform/findpitches-v3/legacy-store.mjs';
import {legacyUnits,recoverRetained,recoverRefetched,fieldAudit} from '../../operations/findpitches-v3/legacy-recovery.mjs';
function snapshot() {
  const raw=record(),c={id:'old-1',market:'US',source_url:raw.canonical_url,canonical_url:raw.canonical_url,application_url:'https://www.eventeny.com/events/applications/',event_name:'Damaged generic title'};
  const s={producer_id:'source-1',market:'US',...raw,event_name:raw.event_name,matched_candidate_id:c.id,
    evidence_json:JSON.stringify({name:raw.event_name,state:'Applications open'}),provenance_json:JSON.stringify({sources:[{role:'primary',url:raw.canonical_url,http_status:200,content_sha256:'a'.repeat(64)}]})};
  return {schema:'findpitches-legacy-v2-evidence-snapshot-v1',read_only:true,tables:{candidates:[c],customer_opportunities:[{id:c.id,title:'Wrong customer title',application_url:c.application_url}],candidate_enrichment:[],structured_feed_records:[s],structured_feed_candidate_pilot:[]}};
}
test('legacy source evidence repairs customer damage and every historical identity is represented once',()=>{
  const s=snapshot(),units=legacyUnits(s);assert.equal(units.length,1);assert.equal(units[0].references.length,3);
  const recovered=recoverRetained(units[0],'b'.repeat(64));assert.ok(recovered);
  assert.equal(recovered.record.event_name,record().event_name);assert.equal(recovered.record.application_url,record().application_url);
  assert.deepEqual(normalizeExport(recovered.record,{producer:'legacy_v2'}).errors,[]);
  const audit=fieldAudit(units[0],recovered.record);assert.equal(audit.totals.historical_repaired,2);assert.equal(audit.unsupported_customer_values_imported,0);
  s.tables.structured_feed_records=[];assert.equal(recoverRetained(legacyUnits(s)[0],'b'.repeat(64)),null,'Customer fields alone cannot qualify for recovery');
});
test('retained corroborating routes and trailing slash variants preserve source evidence',()=>{
  const s=snapshot(),row=s.tables.structured_feed_records[0];
  row.provenance_json=JSON.stringify({sources:[{role:'primary',url:'https://example.org/event',http_status:200,content_sha256:'a'.repeat(64)},{role:'corroborating',url:row.canonical_url,http_status:200,content_sha256:'b'.repeat(64)}]});
  assert.ok(recoverRetained(legacyUnits(s)[0],'b'.repeat(64)));
  row.canonical_url='https://example.org/event/';row.application_url='https://example.org/event/';row.provenance_json=JSON.stringify({sources:[{role:'primary',url:'https://example.org/event',http_status:200,content_sha256:'a'.repeat(64)}]});
  assert.ok(recoverRetained(legacyUnits(s)[0],'b'.repeat(64)));
});
test('direct source recovery requires specific event evidence, preserves provenance and detects country conflicts',async()=>{
  const html='<h1>River Arts Festival</h1><p>Vendors apply for stalls here</p><script type="application/ld+json">'+JSON.stringify({'@type':'Event',name:'River Arts Festival',startDate:'2027-06-01',location:{name:'Riverside Park',address:{addressLocality:'Austin',addressCountry:'US'}},organizer:{name:'River Arts'}})+'</script>';
  const page=await extractLegacyPage(html,'https://example.org/festival',{now:NOW}),unit={id:'legacy-1',market:'US',references:[{table:'candidates',id:'old-1'}]};
  const recovered=recoverRefetched(unit,page,'a'.repeat(64));assert.equal(recovered.event_start,'2027-06-01');assert.equal(recovered.organiser,'River Arts');assert.equal(recovered.application_state,'UNKNOWN');
  assert.equal(recoverRefetched({...unit,market:'GB'},page,'a'.repeat(64)).country_code,'US','Direct country evidence repairs an incorrect historical discovery market');
  assert.ok((await extractLegacyPage('<h1>Vendor Registration</h1><p>Vendors apply for government procurement</p>','https://example.org/vendor',{now:NOW})).reason);
  const multiple=html+'<script type="application/ld+json">'+JSON.stringify({'@type':'Event',name:'Another River Market'})+'</script>';
  assert.equal((await extractLegacyPage(multiple,'https://example.org/vendor',{now:NOW})).reason,'multiple_source_events_require_review');
});
test('weak heading evidence holds licensing/login and editorial pages while retaining named vendor signup forms',async()=>{
  assert.equal(supportedTradingHeading('Consumer Affairs Regulation Division > Login > Enter Credentials'),false);
  assert.equal(supportedTradingHeading('Event Marketing News'),false);
  assert.equal(supportedTradingHeading('Vendor Sign up - Montana RenaissanceFestival2026'),true);
  const page=await extractLegacyPage('<h1>Consumer Affairs Regulation Division</h1><p>Vendors apply for registration</p>','https://example.org/license',{now:NOW});
  assert.equal(page.reason,'source_does_not_establish_specific_trading_event');
  const cached={fields:{event_name:'Consumer Affairs Regulation Division',canonical_url:'https://example.org/license'},kind:'direct_heading'};
  assert.equal(recoverRefetched({id:'old',market:'US'},cached,'a'.repeat(64)),null);
});
test('quality holds retain raw evidence, block readiness and quarantine unreconciled weak records',async t=>{
  const db=database(t);await sql(db,"INSERT INTO quality_gates VALUES ('structured-100-preservation',100,0,'{}','gate',?)",NOW).run();
  const recovered=recoverRetained(legacyUnits(snapshot())[0],'a'.repeat(64));
  const raw=recovered.record,first=await seed(db,raw,{producer:'legacy_v2',environment:'shadow'});
  const before=(await sql(db,'SELECT raw_json,content_hash FROM producer_records WHERE id=?',first.recordId).first());
  await sql(db,"INSERT INTO legacy_quality_holds VALUES (?,'heading-qualification-v2','source_heading_requires_trading_event_qualification',?)",first.recordId,NOW).run();
  const {evaluateReadiness,reconcileRecord}=await import('../../platform/findpitches-v3/pipeline.mjs');
  const ready=await evaluateReadiness(db,first.entity.id,{now:NOW});assert.equal(ready.status,'blocked');assert.ok(ready.reasons.includes('source_qualification_requires_review'));
  assert.deepEqual(await sql(db,'SELECT raw_json,content_hash FROM producer_records WHERE id=?',first.recordId).first(),before);
  await assert.rejects(sql(db,'DELETE FROM legacy_quality_holds WHERE record_id=?',first.recordId).run(),/immutable/);
  const {ingestRecords}=await import('../../platform/findpitches-v3/store.mjs');
  const imported=await ingestRecords(db,[{...raw,opportunity_id:'new-held'}],{producer:'legacy_v2',environment:'shadow',now:NOW});
  await sql(db,"INSERT INTO legacy_quality_holds VALUES (?,'heading-qualification-v2','review',?)",imported.record_ids[0],NOW).run();
  assert.equal((await reconcileRecord(db,imported.record_ids[0],{now:NOW})).outcome,'REVIEW_REQUIRED');
  assert.equal((await sql(db,'SELECT COUNT(*) AS count FROM entities').first()).count,1);
  await seed(db,record(),{environment:'shadow'});
  assert.equal((await evaluateReadiness(db,first.entity.id,{now:NOW})).status,'ready','Stronger unheld source evidence can qualify the same canonical entity');
});
test('direct re-fetch blocks unsafe redirects and bounds response size without exposing provider errors',async()=>{
  let calls=0;const response=await fetchLegacySource('https://example.org/event',{now:NOW,fetcher:async()=>{calls++;return new Response('',{status:302,headers:{location:'https://127.0.0.1/private'}});}});
  assert.equal(response.reason,'unsafe_original_source_url');assert.equal(calls,1);
  const failure=await fetchLegacySource('https://example.org/event',{now:NOW,fetcher:async()=>{throw Error('sensitive-provider-message');}});assert.equal(failure.reason,'source_fetch_failed');
  const rateLimited=await fetchLegacySource('https://example.org/event',{now:NOW,fetcher:async()=>new Response('',{status:429,headers:{'Retry-After':'120'}})});
  assert.equal(rateLimited.reason,'source_http_429');assert.equal(rateLimited.retry_after_seconds,120);
});
test('legacy imports are shadow-only and replayable, quarantine creates no entity, and stronger V3 evidence wins',async t=>{
  const db=database(t);await sql(db,"INSERT INTO quality_gates VALUES ('structured-100-preservation',100,0,'{}','gate',?)",NOW).run();
  const existing=await seed(db,record(),{environment:'shadow'}),unit=legacyUnits(snapshot())[0],recovered=recoverRetained(unit,'a'.repeat(64));
  const entry={id:unit.id,references:unit.references,category:'retained_evidence',reason:recovered.reason,record:recovered.record,field_audit:fieldAudit(unit,recovered.record),refetch_attempts:0};
  const quarantine={id:'bad-1',references:[{table:'candidates',id:'bad-1'}],category:'quarantine',reason:'insufficient_retained_evidence',record:null,field_audit:{totals:{}},refetch_attempts:0};
  const body={run:{id:'legacy_'+'a'.repeat(64),snapshot_hash:'a'.repeat(64),total_opportunities:2,source_counts:{candidates:2}},entries:[entry,quarantine]};
  await assert.rejects(completeLegacyRecovery(db,body.run.id,{now:NOW}),/incomplete/);
  const result=await importLegacyBatch(db,body,{now:NOW});await completeLegacyRecovery(db,body.run.id,{now:NOW});await drainPipeline(db,{now:NOW});
  const replay=await importLegacyBatch(db,body,{now:NOW});assert.equal(replay.results[0].duplicate,true);
  assert.equal((await sql(db,'SELECT COUNT(*) AS count FROM entities').first()).count,1);
  assert.equal((await sql(db,'SELECT outcome FROM reconciliation_decisions WHERE record_id=?',result.results[0].record_id).first()).outcome,'EXACT_MATCH');
  const entity=await loadEntity(db,existing.entity.id);assert.equal(entity.selections.event_name.authority,100);
  assert.equal((await sql(db,'SELECT status FROM legacy_recovery_runs').first()).status,'complete');
  assert.equal((await sql(db,'SELECT COUNT(*) AS count FROM customer_projections').first()).count,0);
  await assert.rejects(importLegacyBatch(db,{...body,entries:[{...entry,reason:'changed'}]},{now:NOW}),/replay_conflict/);
});
test('revised recovery rules retain the earlier audit and explicitly supersede its run',async t=>{
  const db=database(t),snapshotHash='d'.repeat(64),old='legacy_'+snapshotHash;
  const entry={id:'old-1',references:[{table:'candidates',id:'old-1'}],category:'quarantine',reason:'no_source_proof',record:null,field_audit:{totals:{}},refetch_attempts:0};
  const base={snapshot_hash:snapshotHash,total_opportunities:1,source_counts:{candidates:1}};
  await importLegacyBatch(db,{run:{...base,id:old},entries:[entry]},{now:NOW});
  const revised='legacy_'+await hash([snapshotHash,'evidence-v2']);
  await importLegacyBatch(db,{run:{...base,id:revised,rules_version:'evidence-v2',supersedes:old},entries:[{...entry,reason:'source_rechecked_uncertain'}]},{now:NOW});
  assert.equal((await sql(db,'SELECT superseded_by FROM legacy_recovery_runs WHERE id=?',old).first()).superseded_by,revised);
  assert.equal((await sql(db,'SELECT COUNT(*) AS count FROM legacy_recovery_records').first()).count,2);
  await completeLegacyRecovery(db,revised,{now:NOW});
});
test('bounded legacy batches retain input ordering across mixed replay and reject raced payload changes',async t=>{
  const db=database(t),snapshotHash='e'.repeat(64),run={id:'legacy_'+snapshotHash,snapshot_hash:snapshotHash,total_opportunities:10,source_counts:{candidates:10}};
  const entries=Array.from({length:10},(_,i)=>({id:'old-'+i,references:[{table:'candidates',id:'old-'+i}],category:'quarantine',reason:'no_source_proof',record:null,field_audit:{totals:{}},refetch_attempts:0}));
  await importLegacyBatch(db,{run,entries:entries.slice(4)},{now:NOW});
  const result=await importLegacyBatch(db,{run,entries},{now:NOW});
  assert.deepEqual(result.results.map(row=>row.id),entries.map(entry=>entry.id));
  assert.deepEqual(result.results.map(row=>row.duplicate),[false,false,false,false,true,true,true,true,true,true]);
  assert.equal((await sql(db,'SELECT COUNT(*) AS count FROM producer_records').first()).count,0);
  assert.equal((await sql(db,'SELECT COUNT(*) AS count FROM legacy_recovery_records').first()).count,10);
  await completeLegacyRecovery(db,run.id,{now:NOW});
  await assert.rejects(importLegacyBatch(db,{run,entries:[entries[0],entries[0]]},{now:NOW}),/duplicate_identity/);
  await sql(db,'INSERT INTO legacy_recovery_claims VALUES (?,?,?)',run.id,'raced','f'.repeat(64)).run();
  await assert.rejects(importLegacyBatch(db,{run,entries:[{...entries[0],id:'raced'}]},{now:NOW}),/replay_conflict/);
  assert.equal((await sql(db,'SELECT COUNT(*) AS count FROM legacy_recovery_records').first()).count,10);
});
