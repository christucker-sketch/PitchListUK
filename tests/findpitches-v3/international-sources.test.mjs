import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {verifyDocument} from '../../platform/findpitches-v3/verification.mjs';
import {recordVerification} from '../../platform/findpitches-v3/verification-store.mjs';
import {evaluateReadiness} from '../../platform/findpitches-v3/pipeline.mjs';
import {sql} from '../../platform/findpitches-v3/store.mjs';
import {database,seed,record} from './helpers.mjs';
import {internationalBlockers} from '../../operations/findpitches-v3/international-conversion.mjs';
const NOW='2026-10-11T13:00:00.000Z';
const CLUE='https://cluemart.co.nz/application/little-river-farmers-market';
const clueHtml=fs.readFileSync(new URL('./fixtures/source-proof/cluemart-application-shell.html',import.meta.url),'utf8');
const document=(url,html)=>({requested_url:url,url,http_status:200,fetched_at:NOW,html});
const marketsFixture=name=>fs.readFileSync(new URL('../../producer/fp-discovery-lab/tests/fixtures/marketsireland_'+name+'.html',import.meta.url),'utf8');

test('ClueMart public event metadata proves geography/date, never its platform organiser or shell availability',()=>{
  const r=verifyDocument(document(CLUE,clueHtml),{now:NOW});assert.equal(r.profile,'cluemart');assert.equal(r.page_kind,'application_shell');assert.equal(r.status,'partial');assert.equal(r.facts.country,'NZ');assert.equal(r.facts.event_start,'2026-10-18');assert.equal(r.facts.organiser,null);assert.equal(r.facts.application_state,'UNKNOWN');assert.equal(r.facts.application_url,undefined);
  assert.ok(r.reasons.includes('cluemart_trader_application_not_proved'));assert.ok(r.reasons.includes('verified_organiser_missing'));
  const withoutMain=verifyDocument(document(CLUE,clueHtml.replace('<main>','<div>').replace('</main>','</div>')),{now:NOW});assert.equal(withoutMain.profile,'cluemart');assert.equal(withoutMain.status,'partial');assert.equal(withoutMain.facts.country,'NZ');assert.ok(withoutMain.reasons.includes('cluemart_trader_application_not_proved'));
});
test('producer ClueMart bare/description/probable-demo fixtures cannot prove READY, and explicit demo routes are excluded',()=>{
  for(const name of ['bare','description_only','dated_probable_test_listing']){const html=fs.readFileSync(new URL('../../producer/fp-discovery-lab/tests/fixtures/cluemart_'+name+'_2026-10-11.html',import.meta.url),'utf8');assert.notEqual(verifyDocument(document(CLUE,html),{now:NOW}).status,'verified',name);}
  const demo=verifyDocument(document('https://cluemart.co.nz/application/demo-market',clueHtml),{now:NOW});assert.equal(demo.status,'quarantine');assert.ok(demo.reasons.includes('platform_demo_listing'));
});
test('ClueMart rejects indexes, crossed slug/redirect identity, contradictory events, stale dates and unavailable resources',()=>{
  assert.equal(verifyDocument(document('https://cluemart.co.nz/events',clueHtml),{now:NOW}).status,'quarantine');
  for(const d of [document(CLUE,clueHtml.replaceAll('little-river-farmers-market','other-market')), {...document(CLUE,clueHtml),requested_url:CLUE.replace('little-river','other')}, document(CLUE,clueHtml.replaceAll('2026-10-18','2025-10-18')),document(CLUE,clueHtml.replace('\\"active\\":true','\\"active\\":false'))])assert.equal(verifyDocument(d,{now:NOW}).status,'quarantine');
  const missing=clueHtml.replaceAll('"addressCountry":"New Zealand"','"addressCountry":null');assert.ok(verifyDocument(document(CLUE,missing),{now:NOW,market:'NZ'}).reasons.includes('verified_country_missing'));
});
test('ClueMart needs a scoped real trader form and named organiser; footer forms and waitlists cannot promote',()=>{
  // Synthetic positive variant, not a claim that the live sampled shell has a form.
  const main='<main><h1>Little River Farmers Market</h1><p>Stallholder applications are open</p><form action="'+CLUE+'"><input name="business_name"><input name="products"><button>Submit stallholder application</button></form></main>';
  const html=clueHtml.replace('"name":"ClueMart"','"name":"Little River Market Trust"').replace('<main>View this market application on ClueMart.</main>',main);
  assert.equal(verifyDocument(document(CLUE,html),{now:NOW}).status,'verified');
  assert.notEqual(verifyDocument(document(CLUE,html.replace('<form','<footer><form').replace('</form>','</form></footer>')),{now:NOW}).status,'verified');
  assert.notEqual(verifyDocument(document(CLUE,html.replace('Stallholder applications are open','Join waitlist')),{now:NOW}).status,'verified');
  assert.notEqual(verifyDocument(document(CLUE,html.replace('action="'+CLUE+'"','action="https://cluemart.co.nz/login"')),{now:NOW}).status,'verified');
});
test('ClueMart shell replay retains original strong producer facts and never creates customer or READY inventory',async t=>{
  const db=database(t),input=record({country_code:'NZ',event_name:'Little River Farmers Market',event_start:'2026-10-11',event_end:'2026-10-11',organiser:'ClueMart',canonical_url:CLUE,application_url:CLUE,source_platform:'cluemart'}),{entity,recordId}=await seed(db,input,{environment:'shadow'});
  const before=(await sql(db,'SELECT * FROM source_facts WHERE record_id=?',recordId).all()).results;
  const r=await recordVerification(db,entity.id,document(CLUE,clueHtml),{now:NOW});assert.notEqual(r.report.status,'verified');assert.notEqual((await evaluateReadiness(db,entity.id,{now:NOW})).status,'ready');assert.deepEqual((await sql(db,'SELECT * FROM source_facts WHERE record_id=?',recordId).all()).results,before);
  assert.equal((await sql(db,'SELECT COUNT(*) AS n FROM customer_projections').first()).n,0);
});
test('MarketsIreland actual open contact listing remains enquiry-only with missing organiser held',()=>{
  const r=verifyDocument(document('https://marketsireland.ie/market/castledermot/',marketsFixture('open')),{now:NOW});assert.equal(r.profile,'marketsireland');assert.equal(r.facts.country,'IE');assert.equal(r.facts.event_start,'2026-12-06');assert.equal(r.facts.application_state,'ENQUIRY_AVAILABLE');assert.equal(r.facts.application_url,'https://marketsireland.ie/market/castledermot/');assert.ok(r.reasons.includes('verified_organiser_missing'));assert.equal(r.status,'partial');
});
test('MarketsIreland ambiguous status is UNKNOWN, Northern Ireland is GB and expected dates are not verified',()=>{
  const r=verifyDocument(document('https://marketsireland.ie/market/yulefest-kilkenny-christmas-market/',marketsFixture('notmanaged')),{now:NOW});assert.equal(r.facts.application_state,'UNKNOWN');assert.ok(r.reasons.includes('application_status_ambiguous'));
  const ni=verifyDocument(document('https://marketsireland.ie/market/belfast-christmas-market/',marketsFixture('belfast')),{now:NOW});assert.equal(ni.facts.country,'GB');assert.ok(ni.reasons.includes('event_date_not_confirmed'));assert.notEqual(ni.status,'verified');
  assert.equal(verifyDocument(document('https://marketsireland.ie/markets/',marketsFixture('open')),{now:NOW}).status,'quarantine');
});
test('international report excludes tests and separates overlapping membership/flags from exclusive dispositions',()=>{
  const rows=[{id:'shadow',market:'NZ',environment:'shadow',origin:'independent-structured',producers_json:'["independent-structured","legacy_v2"]',fields_json:JSON.stringify({event_name:'Market',application_state:'OPEN_NOW',canonical_url:CLUE}),proof_json:'{}'}, {id:'test',market:'NZ',environment:'test',origin:'independent-structured',producers_json:'["independent-structured"]',fields_json:'{}',proof_json:'{}'}, {id:'legacy',market:'AU',environment:'shadow',origin:'legacy_v2',producers_json:'["legacy_v2"]',fields_json:'{}',proof_json:'{}'}];
  const r=internationalBlockers(rows,{now:NOW}).markets.NZ;assert.equal(r.all_commercial.entities,1);assert.equal(r.structured_membership.entities,1);assert.equal(r.all_commercial.ready+r.all_commercial.watch+r.all_commercial.blocked+r.all_commercial.quarantined,1);assert.equal(r.structured_open_by_source['cluemart.co.nz'].blocked,1);assert.equal(r.all_commercial.awaiting_verification,1);
  const au=internationalBlockers(rows,{now:NOW}).markets.AU;assert.equal(au.all_commercial.entities,1);assert.equal(au.structured_membership.entities,0);assert.deepEqual(au.by_source,{});assert.deepEqual(au.sources_without_structured_membership,{domains:1,entities:1});
});
