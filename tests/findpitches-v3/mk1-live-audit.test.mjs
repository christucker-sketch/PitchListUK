import test from 'node:test';
import assert from 'node:assert/strict';
import {hash,normalizeExport} from '../../platform/findpitches-v3/contract.mjs';
import {verifyDocument} from '../../platform/findpitches-v3/verification.mjs';
import {parseHtml,first,text,nodes} from '../../platform/findpitches-v3/source-dom.mjs';
import {assessMk1Listing} from '../../platform/findpitches-v3/mk1-audit.mjs';
import {fetchLiveMk1Catalogue,fetchMk1Attachment,mk1AuditedRecord,importMk1Source} from '../../platform/findpitches-v3/mk1-source.mjs';
import {retainedUkLiteral,applyNegativeDocumentReview} from '../../operations/findpitches-v3/audit-mk1-live.mjs';
import {database,NOW} from './helpers.mjs';
import {sql,ingestRecords,loadEntity} from '../../platform/findpitches-v3/store.mjs';
import {commercialStatus} from '../../platform/findpitches-v3/commercial.mjs';
import {reconcileRecord} from '../../platform/findpitches-v3/pipeline.mjs';

const URL='https://www.northamptontowncouncil.gov.uk/food-vendor-application';
async function fixture(extra='') {
  const html='<html><head><title>Food Vendor Application | Northampton Town Council</title></head><body class="menu-inline mobile-nav-layout"><main><p>APPLY NOW! Northampton\'s Annual Fireworks Spectacular</p><p>Sunday 1st November 2026 | The Racecourse, Northampton</p><p>Northampton Town Council\'s fireworks display</p><form method="post" action="'+URL+'#form"><h2>FOOD VENDOR &amp; REFRESHMENT STALL APPLICATION FORM</h2><label>Business Name</label><input type="text"><input type="text"><label>What type of food or drink do you sell?</label><textarea></textarea><input type="submit"></form>'+extra+'</main><footer>USA <a href="https://unrelated.example/apply">Vendor application</a></footer></body></html>';
  return {market:'GB',original:{id:'uk-fixture',event_name:'Old misleading title',organiser:'Query organiser',location:'Query city',event_start:'2099-01-01',application_url:URL,source_url:URL},document:{requested_url:URL,url:URL,http_status:200,fetched_at:NOW,html,content_hash:await hash(html)},gitRef:'a'.repeat(40),snapshotHash:'b'.repeat(64),now:NOW};
}
test('council proof binds actual local venue, date and active trader form rather than customer fields or footer geography',async()=>{
  const f=await fixture(),before=JSON.stringify(f.original),proof=verifyDocument(f.document,{now:NOW});assert.equal(proof.status,'verified');assert.equal(proof.facts.country,'GB');assert.equal(proof.facts.location,'The Racecourse, Northampton');
  const {record}=await mk1AuditedRecord(f);assert.notEqual(record.event_name,f.original.event_name);assert.equal(record.event_start,'2026-11-01');assert.equal(record.application_state,'OPEN_NOW');assert.equal(JSON.stringify(f.original),before);assert.equal(record.legacy_mk1.original_fields.location,'Query city');
  assert.equal(normalizeExport(record,{producer:'legacy_mk1'}).errors.length,0);
  assert.ok(normalizeExport({...record,country_code:'US'},{producer:'legacy_mk1'}).errors.includes('mk1_uk_source_custody_required'));
});
test('closure, waitlist, past edition and lost submit control prevent council READY proof',async()=>{
  for(const extra of ['<p>Applications are closed</p>','<p>Waitlist only</p>'])assert.notEqual(verifyDocument((await fixture(extra)).document,{now:NOW}).status,'verified');
  const f=await fixture();assert.notEqual(verifyDocument(f.document,{now:'2026-11-02T12:00:00Z'}).status,'verified');
  assert.notEqual(verifyDocument({...f.document,html:f.document.html.replace('<input type="submit">','<input type="submit" disabled>')},{now:NOW}).status,'verified');
});
test('theme menu classes retain the page content while child navigation and footer remain excluded',()=>{
  const root=parseHtml('<html><body class="mobile-nav menu-inline"><main>Market venue</main><nav><a href="/apply">Vendor application</a></nav><footer>Foreign venue</footer></body></html>');
  assert.equal(text(first(root,n=>n.tag==='body')),'Market venue');assert.equal(nodes(root,n=>n.tag==='a',{scoped:true}).length,0);
});
test('live UK probe sends only an anonymous bounded GET and omits account and locked fields',async()=>{
  let captured;const result=await fetchLiveMk1Catalogue({fetcher:async(url,options)=>{captured={url,options};return Response.json({total:290,rows:[{id:'one',country:'United Kingdom',event_name:'Fair',application_url:'private-link-fixture'}],account_email:'private-account-fixture'});}});
  assert.equal(captured.url,'https://pitchlist.uk/api/customer-opportunities/search?limit=50');assert.equal(captured.options.redirect,'manual');assert.equal(captured.options.headers.Authorization,undefined);assert.equal(JSON.stringify(result).includes('private-account-fixture'),false);assert.equal(JSON.stringify(result).includes('private-link-fixture'),false);
  await assert.rejects(fetchLiveMk1Catalogue({fetcher:async()=>Response.json({total:1,rows:[{country:'United States'}]})}),/country_conflict/);
});
test('binary audit checks PDF type, signature and public redirects without trusting a filename',async()=>{
  const pdf=await fetchMk1Attachment('https://source.example/application.pdf',{fetcher:async()=>new Response('%PDF-1.4\nfixture',{headers:{'Content-Type':'application/pdf'}})});assert.match(pdf.content_sha256,/^[a-f0-9]{64}$/);assert.ok(pdf.pdf_base64);
  const fake=await fetchMk1Attachment('https://source.example/application.pdf',{fetcher:async()=>new Response('login',{headers:{'Content-Type':'application/pdf'}})});assert.equal(fake.reason,'source_attachment_pdf_signature_missing');
  let calls=0;const privateRedirect=await fetchMk1Attachment('https://source.example/application.pdf',{fetcher:async()=>{calls++;return new Response(null,{status:302,headers:{Location:'https://127.0.0.1/private'}});}});assert.equal(privateRedirect.reason,'unsafe_original_source_url');assert.equal(calls,1);
});
test('PDF application admission requires a reviewed edition hash matching the native source bytes',async t=>{
  const db=database(t),f=await fixture(),url='https://council.gov.uk/river-market',pdfUrl='https://council.gov.uk/market-form.pdf';
  await sql(db,'UPDATE commercial_acquisition_policy SET manual_paused=1').run();await sql(db,"INSERT INTO quality_gates VALUES ('structured-100-preservation',100,0,'{}','pdf-fixture',?)",NOW).run();
  const html='<title>River Market | River Council</title><main><h1>River Market</h1><p>River Market trades every Wednesday and Saturday.</p><a href="'+pdfUrl+'">Market trader application form</a></main>',pdf='%PDF-1.4\ncurrent-edition-fixture';
  const original={...f.original,source_url:url,application_url:pdfUrl},body={market:'GB',audit_mode:'source_review',original,gitRef:f.gitRef,snapshotHash:f.snapshotHash};
  const fetcher=async u=>new Response(u===pdfUrl?pdf:html,{headers:{'Content-Type':u===pdfUrl?'application/pdf':'text/html'}});
  const pending=await importMk1Source(db,body,{fetcher,now:NOW});assert.equal(pending.status,'held');assert.deepEqual(pending.reasons,['current_relevant_application_pdf_review_required']);
  const changed=await importMk1Source(db,{...body,reviewedPdfHashes:['0'.repeat(64)]},{fetcher,now:NOW});assert.equal(changed.status,'held');assert.equal((await sql(db,'SELECT COUNT(*) AS n FROM producer_records').first()).n,0);
  const attachment=await fetchMk1Attachment(pdfUrl,{fetcher,now:NOW});
  const accepted=await importMk1Source(db,{...body,reviewedPdfHashes:[attachment.content_sha256]},{fetcher,now:NOW});assert.equal(accepted.status,'imported');assert.equal(accepted.readiness,'watch');
  assert.equal((await sql(db,'SELECT COUNT(*) AS n FROM source_documents WHERE content_hash=?',attachment.content_sha256).first()).n,1);
});
test('guidance, closed forms and uncertain country stay outside source-approved shadow imports',async()=>{
  const f=await fixture();for(const [html,grade] of [['<title>Food business registration</title><main>Register your food business</main>','reference_only'],['<title>We are not accepting further vendor applications at this time</title>','not_current']]) {
    const d={...f.document,html,content_hash:await hash(html),url:'https://other.example/page',requested_url:'https://other.example/page'},o={...f.original,source_url:d.url};assert.equal(assessMk1Listing({original:o,source:d,now:NOW}).grade,grade);assert.equal((await mk1AuditedRecord({...f,original:o,document:d})).record,undefined);
  }
  const html='<title>River Market</title><main><p>Weekly vendor market in Query city.</p><form method="post"><label>Business name</label><label>Products</label><button>Submit</button></form></main>',d={...f.document,url:'https://organiser.example/market',requested_url:'https://organiser.example/market',html,content_hash:await hash(html)};
  const result=assessMk1Listing({original:{...f.original,source_url:d.url},source:d,now:NOW});assert.equal(result.kind,'geography_unproved');
});
test('native UK audit import uses its own proof, remains attributable and preserves replayed source facts',async t=>{
  const db=database(t),f=await fixture();await sql(db,'UPDATE commercial_acquisition_policy SET manual_paused=1').run();await sql(db,"INSERT INTO quality_gates VALUES ('structured-100-preservation',100,0,'{}','audit-fixture',?)",NOW).run();
  const body={...f,audit_mode:'source_review'},fetcher=async()=>new Response(f.document.html,{headers:{'Content-Type':'text/html'}}),result=await importMk1Source(db,body,{fetcher,now:NOW});assert.equal(result.readiness,'ready');
  const facts=(await sql(db,'SELECT * FROM source_facts ORDER BY id').all()).results;const replay=await importMk1Source(db,body,{fetcher,now:NOW});assert.equal(replay.duplicate,true);assert.deepEqual((await sql(db,'SELECT * FROM source_facts ORDER BY id').all()).results,facts);
  const commercial=await commercialStatus(db,NOW);assert.equal(commercial.by_origin.legacy_mk1.ready,1);assert.equal(commercial.ready_by_country.GB,1);assert.equal((await sql(db,'SELECT COUNT(*) AS n FROM customer_projections').first()).n,0);
});
test('specific current trader form supersedes an older unrelated route additively without promoting availability',async t=>{
  const db=database(t),f=await fixture(),url='https://council.gov.uk/river-christmas-market';
  await sql(db,'UPDATE commercial_acquisition_policy SET manual_paused=1').run();await sql(db,"INSERT INTO quality_gates VALUES ('structured-100-preservation',100,0,'{}','route-fixture',?)",NOW).run();
  const html='<title>River Christmas Market | River Council</title><main><h1>River Christmas Market</h1><p>River Christmas Market takes place on 13 December 2026.</p><form method="post" action="'+url+'#apply"><h2>Stallholder application form</h2><label>Business name</label><input type="text"><label>Products</label><textarea></textarea><button type="submit">Apply</button></form></main>';
  const original={...f.original,source_url:url,application_url:'https://council.gov.uk/unrelated-meadow-form'},document={...f.document,url,requested_url:url,html,content_hash:await hash(html)},args={...f,original,document};
  const prepared=await mk1AuditedRecord(args);assert.equal(prepared.audit.grade,'usable_minor_gaps');
  const old={...prepared.record,application_url:original.application_url,field_evidence:{...prepared.record.field_evidence,application_url:{kind:'direct_heading',source:url,excerpt:'Retained historical application link'}}};
  const ingested=await ingestRecords(db,[old],{producer:'legacy_mk1',now:NOW}),identity=await reconcileRecord(db,ingested.record_ids[0],{now:NOW});
  const before=(await sql(db,'SELECT * FROM source_facts ORDER BY id').all()).results,raw=await sql(db,'SELECT * FROM producer_records WHERE id=?',ingested.record_ids[0]).first();
  const result=await importMk1Source(db,{...args,audit_mode:'source_review'},{fetcher:async()=>new Response(html,{headers:{'Content-Type':'text/html'}}),now:NOW});
  assert.equal(result.entity_id,identity.entity_id);assert.equal(result.readiness,'watch');assert.equal(result.application_route_evidence.reason,'stronger_evidence');
  const current=await loadEntity(db,result.entity_id);assert.equal(current.application_url,url);assert.equal(current.application_state,'UNKNOWN');assert.equal(current.selections.application_url.authority,95);
  for(const fact of before)assert.deepEqual(await sql(db,'SELECT * FROM source_facts WHERE id=?',fact.id).first(),fact);
  assert.deepEqual(await sql(db,'SELECT * FROM producer_records WHERE id=?',raw.id).first(),raw);
  const external=html.replace(url+'#apply','https://unrelated.example/newsletter');assert.notEqual(assessMk1Listing({original,source:{...document,html:external},now:NOW}).grade,'usable_minor_gaps');
  const newsletter=html.replace('Stallholder application form','Business newsletter');assert.notEqual(assessMk1Listing({original,source:{...document,html:newsletter},now:NOW}).grade,'usable_minor_gaps');
});
test('retained catalogue parser reads JSON as data and rejects international contamination',()=>{
  const uk={total:1,rows:[{country:'United Kingdom',market_domain:'pitchlist.uk',event_name:'Brace } in title'}]};assert.deepEqual(retainedUkLiteral('export const snapshot = '+JSON.stringify(uk)+';'),uk);
  assert.throws(()=>retainedUkLiteral('export const snapshot = '+JSON.stringify({...uk,rows:[{country:'United States',market_domain:'findpitches.com'}]})+';'),/uk_only/);
});
test('offline PDF reviews are bound to retained bytes and can withhold but never promote imports',()=>{
  const doc={requested_url:'https://council.gov.uk/form.pdf',content_sha256:'a'.repeat(64)},review={url:doc.requested_url,sha256:doc.content_sha256,excerpt:'Applications April 2025–March 2026',grade:'not_current',kind:'expired_application_document'};
  const held=applyNegativeDocumentReview({grade:'questionable',facts:{application_state:'UNKNOWN'}},doc,review);assert.equal(held.grade,'not_current');assert.deepEqual(held.facts,{});assert.equal(held.document_review.content_sha256,doc.content_sha256);
  assert.throws(()=>applyNegativeDocumentReview({},doc,{...review,grade:'clearly_usable'}),/custody/);
  assert.throws(()=>applyNegativeDocumentReview({},doc,{...review,sha256:'b'.repeat(64)}),/custody/);
  assert.throws(()=>applyNegativeDocumentReview({},doc,{...review,url:'https://unrelated.example/form.pdf'}),/custody/);
});
