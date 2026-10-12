import test from 'node:test';import assert from 'node:assert/strict';
import {CCA_ORIGIN,CCA_BOOKING,CCA_ADAPTER_VERSION,parseCCABooking,fetchCCAProgramme,fetchCCABundle} from '../../platform/findpitches-v3/creative-crafts.mjs';
import {verifyDocument,applicationScope,compareProof} from '../../platform/findpitches-v3/verification.mjs';
import {startUKRun,discoverUKSource,importUKCandidate} from '../../platform/findpitches-v3/uk-store.mjs';
import {sql,loadEntity} from '../../platform/findpitches-v3/store.mjs';
import {identityCandidateKeys,reconcileIdentity} from '../../platform/findpitches-v3/identity.mjs';
import {recordVerification,reverifyRetainedSource,verifyEntitySource} from '../../platform/findpitches-v3/verification-store.mjs';
import {database,NOW} from './helpers.mjs';
const URL=CCA_ORIGIN+'/craft-events/26/Lowther-Gardens,-Lytham-St-Annes',NEXT=CCA_BOOKING+'Next-Step.asp',DIRECTIONS=CCA_ORIGIN+'/craft-event-directions/',GEO='https://api.postcodes.io/postcodes/FY85QQ';
import {documents,fetcherFor,option} from './cca-fixture.mjs';
async function bundle() {return (await fetchCCAProgramme({fetcher:fetcherFor(documents()),now:NOW})).bundles[0];}
test('CCA joins a current exact dated control to its event, venue and trader form without splitting weekends',async()=>{
  const result=await fetchCCAProgramme({fetcher:fetcherFor(documents()),now:NOW});assert.equal(result.bundles.length,2);assert.deepEqual(result.held.map(h=>h.reason).sort(),['cca_space_variant_excluded','contradictory_event_dates']);
  const r=verifyDocument(result.bundles[0],{now:NOW});assert.equal(r.status,'verified');assert.equal(r.facts.country,'GB');assert.equal(r.facts.event_end,'2026-10-25');assert.equal(r.facts.organiser,'Creative Crafts Association');assert.equal(r.facts.application_state,'OPEN_NOW');assert.equal(r.venue_coordinates,undefined);assert.equal(applicationScope(r).audience,'traders');
  assert.ok(compareProof({source_platform:'creativecrafts',source_identifier:'another-control'},r).includes('source_event_identity_mismatch'));
});
test('CCA index/portal/footer/country fields cannot supply opportunity or geography proof',async()=>{
  const b=await bundle();b.documents=b.documents.filter(d=>!d.json_text);b.documents.push({requested_url:GEO,url:GEO,fetched_at:NOW,json_text:JSON.stringify({status:200,result:{postcode:'SW1A 1AA',country:'England'}})});
  assert.ok(verifyDocument(b,{now:NOW}).reasons.includes('verified_country_missing'));
  const portal={...b,url:CCA_BOOKING,requested_url:CCA_BOOKING};assert.notEqual(verifyDocument(portal,{now:NOW}).status,'verified');
  const misplaced=await bundle();misplaced.documents.find(d=>d.url===DIRECTIONS).html='<footer>'+misplaced.documents.find(d=>d.url===DIRECTIONS).html+'</footer>';assert.notEqual(verifyDocument(misplaced,{now:NOW}).status,'verified');
});
test('CCA accepts repeated identical venue postcodes while rejecting conflicting addresses',async()=>{
  const repeated=documents();repeated.find(d=>d.url===DIRECTIONS).html=repeated.find(d=>d.url===DIRECTIONS).html.replace('FY8 5QQ<br>','FY8 5QQ<br>FY85QQ<br>');assert.equal((await fetchCCAProgramme({fetcher:fetcherFor(repeated),now:NOW})).bundles.length,2);
  repeated.find(d=>d.url===DIRECTIONS).html=repeated.find(d=>d.url===DIRECTIONS).html.replace('FY85QQ','SW1A 1AA');assert.equal((await fetchCCAProgramme({fetcher:fetcherFor(repeated),now:NOW})).bundles.length,0);
});
test('CCA exact event rows and active controls block unrelated, contradictory, stale and enquiry-only promotions',async()=>{
  for(const [url,from,to] of [[URL,'Sun 25','Sun 26'],[URL,'24 October 2026#','23 October 2026#'],[URL,'#Location26','#Location99'],[NEXT,'Trading_name','Visitor_name'],[NEXT,'name="Crafts"','name="Biography"'],[CCA_BOOKING,'id="checkboxG1678"','disabled id="checkboxG1678"']]) {
    const b=await bundle();const d=b.documents.find(d=>d.url===url);d.html=d.html.replace(from,to);assert.notEqual(verifyDocument(b,{now:NOW}).status,'verified',from);
  }
  const b=await bundle();assert.ok(verifyDocument(b,{now:'2026-10-23T12:00:00.000Z'}).reasons.includes('cca_near_event_availability_requires_enquiry'));assert.ok(verifyDocument(b,{now:'2026-10-26T12:00:00.000Z'}).reasons.includes('stale_edition'));
  const closed=await bundle();closed.documents.find(d=>d.url===NEXT).html+='<p>Applications are closed</p>';assert.equal(verifyDocument(closed,{now:NOW}).status,'quarantine');
});
test('CCA source freshness, control uniqueness and source-route custody fail closed',async()=>{
  const b=await bundle();b.documents[1].fetched_at='2026-10-05T12:00:00.000Z';assert.notEqual(verifyDocument(b,{now:NOW}).status,'verified');
  const dup=documents().find(d=>d.url===CCA_BOOKING);dup.html=dup.html.replace('</form>',option('checkboxG1678','Another Event','24 October 2026','25 October 2026')+'</form>');assert.throws(()=>parseCCABooking(dup),/duplicate|exact_label/);
  const redirect=await bundle();redirect.documents[0].requested_url=CCA_BOOKING;assert.notEqual(verifyDocument(redirect,{now:NOW}).status,'verified');
  const missing=await fetchCCABundle(URL,'removed-control',{fetcher:fetcherFor(documents()),now:NOW});assert.notEqual(verifyDocument(missing,{now:NOW}).status,'verified');
});
test('CCA closure/waitlist/restricted audience and cancellation evidence on either event or application prevents false READY',async()=>{
  for(const url of [URL,NEXT,CCA_BOOKING])for(const notice of ['Bookings are closed','Join the waiting list','Join the waitlist','Returning vendors only','Not accepting applications','Nonprofits only','Fully booked','Applications are closed','Event cancelled']) {
    const b=await bundle();b.documents.find(d=>d.url===url).html+='<p>'+notice+'</p>';assert.notEqual(verifyDocument(b,{now:NOW}).status,'verified',url+' '+notice);
  }
});
test('CCA disabled or hidden ancestor controls and footer-only trader fields fail closed',async()=>{
  for(const url of [NEXT,CCA_BOOKING])for(const attr of ['disabled','hidden','aria-hidden="true"']) {
    for(const outside of [false,true]) {
      const b=await bundle(),d=b.documents.find(d=>d.url===url);d.html=outside?'<fieldset '+attr+'>'+d.html+'</fieldset>':d.html.replace(/(<form[^>]*>)/,'$1<fieldset '+attr+'>').replace('</form>','</fieldset></form>');assert.notEqual(verifyDocument(b,{now:NOW}).status,'verified',url+' '+attr+' outside='+outside);
    }
  }
  const b=await bundle(),d=b.documents.find(d=>d.url===NEXT);d.html=d.html.replace('<table>','<footer><table>').replace('</table>','</table></footer>');assert.notEqual(verifyDocument(b,{now:NOW}).status,'verified');
  for(const replacement of ['type="hidden" name="Trading_name"','readonly name="Trading_name"']) {
    const value=await bundle();value.documents.find(d=>d.url===NEXT).html=value.documents.find(d=>d.url===NEXT).html.replace('name="Trading_name"',replacement);assert.notEqual(verifyDocument(value,{now:NOW}).status,'verified');
  }
});
test('CCA rejects explicit contradictory heading editions, weekdays and event-country statements',async()=>{
  for(const [from,to] of [['for 2026','for 2025'],['Sat 24','Tue 24'],['Sun 25','Mon 25']]) {
    const b=await bundle();b.documents.find(d=>d.url===URL).html=b.documents.find(d=>d.url===URL).html.replace(from,to);assert.equal(verifyDocument(b,{now:NOW}).status,'quarantine');
  }
  const b=await bundle();b.documents.find(d=>d.url===URL).html+='<p>This event is in the United States.</p>';assert.equal(verifyDocument(b,{now:NOW}).status,'quarantine');
});
test('CCA shared programme/application routes cannot silently merge distinct editions',()=>{
  const input={market:'GB',environment:'shadow',event_start:'2026-10-24',event_name:'Lowther Gardens Pumpkin Festival',organiser:'Creative Crafts Association',canonical_url:URL,application_url:CCA_BOOKING};
  assert.equal(identityCandidateKeys(input).filter(k=>k.startsWith('url:')).length,0);
  const candidate={...input,id:'other',event_start:'2026-12-12',event_name:'Lowther Gardens Christmas'};assert.equal(reconcileIdentity(input,[candidate]).outcome,'NEW_ENTITY');
  const old={...input,id:'old',source_platform:'creativecrafts',source_identifier:'old'},next={...input,source_platform:'creativecrafts',source_identifier:'next'};assert.equal(reconcileIdentity(next,[old]).outcome,'NEW_ENTITY');
});
test('CCA bounded real pipeline retains immutable facts, explicit identities, replay and fresh recheck clocks',async t=>{
  const db=database(t);await sql(db,"INSERT INTO quality_gates VALUES ('structured-100-preservation',100,0,'{}','cca_fixture',?)",NOW).run();await sql(db,'UPDATE commercial_acquisition_policy SET manual_paused=1').run();const fetcher=fetcherFor(documents());
  const run=await startUKRun(db,{max_visits:6,max_candidates:3},NOW),found=await discoverUKSource(db,{run_id:run.id,url:CCA_BOOKING},{fetcher,now:NOW});assert.equal(found.candidates.length,2);assert.equal(found.held_options.length,2);
  const a=await importUKCandidate(db,found.candidates[0].id,{now:NOW,fetcher}),b=await importUKCandidate(db,found.candidates[1].id,{now:NOW,fetcher});assert.equal(a.readiness,'ready');assert.equal(b.readiness,'ready');assert.notEqual(a.entity_id,b.entity_id);
  const replay=await discoverUKSource(db,{run_id:run.id,url:CCA_BOOKING},{fetcher:()=>{throw Error('replay_must_not_fetch');},now:NOW});assert.equal(replay.replay,true);
  const again=await startUKRun(db,{max_visits:6,max_candidates:3},NOW),repeat=await discoverUKSource(db,{run_id:again.id,url:CCA_BOOKING},{fetcher,now:NOW}),linked=await importUKCandidate(db,repeat.candidates[0].id,{now:NOW,fetcher});assert.equal(linked.entity_id,a.entity_id);assert.equal(linked.identity_outcome,'IDEMPOTENT_REPLAY');
  assert.equal((await sql(db,'SELECT COUNT(*) n FROM entities').first()).n,2);assert.equal((await sql(db,'SELECT COUNT(*) n FROM customer_projections').first()).n,0);assert.equal((await sql(db,'SELECT COUNT(*) n FROM publication_queue').first()).n,0);
  const receipt=(await sql(db,'SELECT id FROM producer_records LIMIT 1').first()).id;await assert.rejects(sql(db,'DELETE FROM producer_records WHERE id=?',receipt).run(),/immutable/);await assert.rejects(sql(db,"UPDATE uk_source_candidates SET source_identifier='changed'").run(),/immutable/);
  const source=await loadEntity(db,a.entity_id);assert.equal(source.source_platform,'creativecrafts');const refreshed=await verifyEntitySource(db,a.entity_id,{now:NOW,fetcher});assert.equal(refreshed.report.status,'verified');
  await assert.rejects(reverifyRetainedSource(db,a.entity_id,{now:'2026-10-07T12:00:01.000Z'}),/expired/);
  const older=await bundle();older.fetched_at='2026-10-05T12:00:00.000Z';await assert.rejects(recordVerification(db,a.entity_id,older,{now:NOW}),/older_verification/);
});
test('CCA HTTP budget reserves before fetch and expired shared evidence cannot import',async t=>{
  const db=database(t);await sql(db,"INSERT INTO quality_gates VALUES ('structured-100-preservation',100,0,'{}','cca_fixture',?)",NOW).run();await sql(db,'UPDATE commercial_acquisition_policy SET manual_paused=1').run();let calls=0;const run=await startUKRun(db,{max_visits:1},NOW);
  await assert.rejects(discoverUKSource(db,{run_id:run.id,url:CCA_BOOKING},{now:NOW,fetcher:async u=>{calls++;return fetcherFor(documents())(u);}}),/visit_limit/);assert.equal(calls,1);
  const next=await startUKRun(db,{max_visits:6},NOW),found=await discoverUKSource(db,{run_id:next.id,url:CCA_BOOKING},{now:NOW,fetcher:fetcherFor(documents())});await assert.rejects(importUKCandidate(db,found.candidates[0].id,{now:'2026-10-06T12:05:01.000Z'}),/proof_expired/);
});
test('CCA postcode rate limiting stops the bounded run before further source requests',async t=>{
  const db=database(t);await sql(db,"INSERT INTO quality_gates VALUES ('structured-100-preservation',100,0,'{}','cca_fixture',?)",NOW).run();await sql(db,'UPDATE commercial_acquisition_policy SET manual_paused=1').run();const run=await startUKRun(db,{max_visits:6},NOW);let geoCalls=0;
  await assert.rejects(discoverUKSource(db,{run_id:run.id,url:CCA_BOOKING},{now:NOW,fetcher:async url=>url===GEO?(geoCalls++,new Response('',{status:429})):fetcherFor(documents())(url)}),/rate_limited/);assert.equal(geoCalls,1);
  const stopped=await sql(db,'SELECT status,stop_reason FROM uk_source_runs WHERE id=?',run.id).first();assert.equal(stopped.status,'paused');assert.equal(stopped.stop_reason,'source_rate_limited');
});
