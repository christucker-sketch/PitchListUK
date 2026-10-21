import test from 'node:test';import assert from 'node:assert/strict';
import {CJS_ORIGIN,CJS_HOME,CJS_TRADE,CJS_INTAKE_SCRIPTS,CJS_ADAPTER_VERSION,cjsEventURL,parseCJSEvent,parseCJSIntake,verifyCJSBundle,fetchCJSProgramme} from '../../platform/findpitches-v3/cjs-events.mjs';
import {compareProof,verifyDocument,applicationScope} from '../../platform/findpitches-v3/verification.mjs';
const NOW='2026-10-21T12:00:00Z',url=CJS_ORIGIN+'/events/example-market-1st-november-2026';
const event=()=>({id:'0123456789abcdef',name:'Example Market',slug:'example-market-1st-november-2026',links:{canonical:'/events/example-market-1st-november-2026/',slug:'/events/example-market-1st-november-2026/',view:CJS_ORIGIN+'/events/0123456789abcdef/'},startDate:{timestamp:Date.parse('2026-11-01')/1000,formatted:'01/11/2026'},endDate:{timestamp:Date.parse('2026-11-02')/1000,formatted:'02/11/2026'},formattedDate:'Sunday 1st to Monday 2nd November 2026',location:{name:'Example Hall',formattedAddress:'Example Hall, Example Town, CV8 1QJ',postcode:'CV8 1QJ',town:{name:'Example Town',lat:1,lng:1},lat:2,lng:2},cancelled:false,clientType:{name:'Public'},eventType:{name:'Retail market'}});
const doc=(url,html)=>({requested_url:url,url,http_status:200,fetched_at:NOW,html});
function source(e=event()) {return doc(url,`<title>Example Market - Example Hall - CJ’s Events Warwickshire</title><link rel="canonical" href="${url}/"><main><h1>${e.name}</h1><p>${e.formattedDate}</p><div>${e.location.formattedAddress}</div><p>Buy local goods at the market.</p><h2>Upcoming Events</h2><p>Other Event, tomorrow, OTHER POSTCODE</p></main><script>self.__next_f.push(${JSON.stringify([1,'a:'+JSON.stringify(['$','Component',null,{event:e}])+'\n'])})</script>`);}
test('CJS binds one explicit event, its visible dates and physical address; keeps ranges unsplit and no centre pins',()=>{
 const r=parseCJSEvent(source());assert.equal(r.source_identifier,'cjs:0123456789abcdef');assert.equal(r.start,'2026-11-01');assert.equal(r.end,'2026-11-02');assert.equal(r.postcode,'CV81QJ');for(const key of ['country','lat','lng','coordinates','application_state'])assert.equal(r[key],undefined);
});
test('CJS excludes indexes, foreign routes, conflicting canonical/IDs, cancellation and non-trader events',()=>{
 for(const u of [CJS_HOME,CJS_ORIGIN+'/events',CJS_TRADE,'https://example.org/events/example',url+'?country=GB',CJS_ORIGIN+'@example.org/events/abc'])assert.equal(cjsEventURL(u),false);
 for(const change of [e=>({...e,cancelled:true}),e=>({...e,clientType:{name:'Private'}}),e=>({...e,eventType:{name:'Visitor ticketing'}}),e=>({...e,slug:'different-event'}),e=>({...e,id:'unknown'})])assert.throws(()=>parseCJSEvent(source(change(event()))));
 assert.throws(()=>parseCJSEvent({...source(),html:source().html.replace(`href="${url}/"`,'href="https://example.org/"')}),/canonical/);
});
test('footer/related evidence, hidden controls and source date contradictions cannot prove an event',()=>{
 const d=source();for(const html of [d.html.replace('<h1>','<h1 hidden>'),d.html.replace('<p>Sunday 1st to Monday 2nd November 2026</p>','<footer>Sunday 1st to Monday 2nd November 2026</footer>'),d.html.replace('<div>Example Hall, Example Town, CV8 1QJ</div>','<nav>Example Hall, Example Town, CV8 1QJ</nav>'),d.html.replace('Buy local goods','Applications closed. Buy local goods')])assert.throws(()=>parseCJSEvent({...d,html}));
 const e=event();e.startDate.timestamp+=86400;assert.throws(()=>parseCJSEvent(source(e)),/consistent_date/);
 const e2=event();e2.endDate={timestamp:Date.parse('2026-10-31')/1000,formatted:'31/10/2026'};assert.throws(()=>parseCJSEvent(source(e2)),/contradictory/);
});
test('explicit recurring occurrence keeps its own ID/date when the declared canonical is a bound series parent',()=>{
 const e=event();e.isRecurring=true;e.links.canonical='/events/example-market-1st-october-2026/';const d=source(e);d.html=d.html.replace(`href="${url}/"`,`href="${CJS_ORIGIN+e.links.canonical}"`);const r=parseCJSEvent(d);assert.equal(r.canonical_scope,'series_reference_not_entity_identity');assert.equal(r.url,url);assert.equal(r.source_identifier,'cjs:0123456789abcdef');assert.equal(r.start,'2026-11-01');
 for(const changed of [e=>({...e,isRecurring:false}),e=>({...e,links:{...e.links,slug:'/events/example-market-1st-october-2026/'}}),e=>({...e,links:{...e.links,view:CJS_ORIGIN+'/events/ffffffffffffffff/'}})]){const other=source(changed(e));other.html=other.html.replace(`href="${url}/"`,`href="${CJS_ORIGIN+e.links.canonical}"`);assert.throws(()=>parseCJSEvent(other));}
 const unrelated={...d,html:d.html.replaceAll('example-market-1st-october','unrelated-fair-1st-october')};assert.throws(()=>parseCJSEvent(unrelated),/canonical/);
});
function intake(){const home=doc(CJS_HOME,`<title>CJ’s Events Warwickshire</title><main><a href="${CJS_TRADE}">Apply to Trade</a></main>`),trade=doc(CJS_TRADE,`<title>Become a trader - CJ's Events Warwickshire</title><main><h1>Become a Trader</h1><p>Sign up to become a Trader, and join the brilliant local businesses promoting and selling their products and services at our events.</p><form><input name="full_name"><input name="company_name"><input name="email"><select name="category"></select><textarea name="bio"></textarea><input type="file"><input type="file"><p>Public Liability Insurance</p><button type="submit">Submit application</button></form></main>${CJS_INTAKE_SCRIPTS.map(s=>`<script src="${s.url}"></script>`).join('')}`);return {home,trade};}
test('CJS intake requires explicit main-content operator invitation, active form and reviewed live uploader/handler',()=>{
 const {home,trade}=intake();assert.throws(()=>parseCJSIntake(home,trade,[],null),/reviewed_intake_scripts/);
 for(const [from,to]of [['<form>','<form disabled>'],['<input name="company_name">','<input name="company_name" disabled>'],['type="submit"','type="submit" aria-disabled="true"']])assert.throws(()=>parseCJSIntake(home,{...trade,html:trade.html.replace(from,to)},[],null),/active_prospective|bound_trader|required_document/);
 assert.throws(()=>parseCJSIntake({...home,html:home.html.replace('<main>','<nav>').replace('</main>','</nav>')},trade,[],null));
 const scripts=CJS_INTAKE_SCRIPTS.map(s=>({requested_url:s.url,url:s.url,http_status:200,content_type:'application/javascript',javascript:'forged',content_hash:s.sha256,document_kind:'cjs_intake_script'}));assert.throws(()=>parseCJSIntake(home,trade,scripts,null),/changed_requires_review/);
});
test('CJS proof dispatch and identity checks remain fail-closed for fabricated bundles or identifiers',()=>{
 const documents=Array.from({length:8},()=>source()),d={document_kind:'cjs_official_bundle',adapter_version:CJS_ADAPTER_VERSION,url,requested_url:url,source_identifier:'cjs:0123456789abcdef',fetched_at:NOW,documents};assert.notEqual(verifyCJSBundle(d,{now:NOW}).status,'verified');assert.equal(verifyDocument(d,{now:NOW}).profile,'cjseventswarwickshire');
 assert.ok(compareProof({source_platform:'cjseventswarwickshire',source_identifier:'cjs:other'},{facts:{source_identifier:'cjs:0123456789abcdef'}}).includes('source_event_identity_mismatch'));
 assert.ok(applicationScope({profile:'cjseventswarwickshire',facts:{}}).reasons.includes('trader_application_purpose_not_proved'));
});
test('CJS bounded batches reject excessive, duplicate or unapproved URLs before any network request',async()=>{
 let calls=0;const fetcher=async()=>{calls++;throw Error('not expected');};for(const eventURLs of [[],Array(11).fill(url),[url,url],['https://example.org/events/other']])await assert.rejects(fetchCJSProgramme({eventURLs,fetcher}));assert.equal(calls,0);
});
