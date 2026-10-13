import test from 'node:test';import assert from 'node:assert/strict';
import {verifyDocument,compareProof} from '../../platform/findpitches-v3/verification.mjs';
import {fetchProofDocument} from '../../platform/findpitches-v3/proof-document.mjs';
import {USABLE_ROUTE_POLICY,usableRouteEligible} from '../../platform/findpitches-v3/usable-route.mjs';
import {recordVerification} from '../../platform/findpitches-v3/verification-store.mjs';
import {evaluateReadiness,assessEligibility} from '../../platform/findpitches-v3/pipeline.mjs';
import {commercialRows,inventoryFromRows} from '../../platform/findpitches-v3/commercial.mjs';
import {stagingCatalogue} from '../../platform/findpitches-v3/staging.mjs';
import {mapProof,present} from '../../platform/findpitches-v3/customer-catalogue.mjs';
import {identityCandidateKeys,reconcileIdentity} from '../../platform/findpitches-v3/identity.mjs';
import {database,NOW,record,seed} from './helpers.mjs';import {sql,ingestRecords} from '../../platform/findpitches-v3/store.mjs';
import {documentFixture} from './verification-fixture.mjs';
const receipt=(url,html)=>({url,requested_url:url,http_status:200,fetched_at:NOW,html});
const URL='https://organiser.example.org/events/river-fair',INTAKE='https://organiser.example.org/vendor-registration';
const form=(heading='Vendor registration')=>`<section><h2>${heading}</h2><p>Prospective vendors may register with our standing intake for our events.</p><form method="post" action="/vendor-register"><label>Business name<input name="business"></label><label>Products<textarea name="products"></textarea></label><button type="submit">Register</button></form></section>`;
function document({market='US',body=form(),date='2026-11-21',organiserURL='https://organiser.example.org/',street='1 River Street',title='River Lantern Autumn Craft Market'}={}){
 const event={'@type':'Event',name:title,url:URL,startDate:date,endDate:date,organizer:{name:'River Arts Association',url:organiserURL},location:{name:'River Hall',address:{streetAddress:street,addressLocality:'Austin',addressRegion:'Texas',addressCountry:market}}};
 return {requested_url:URL,url:URL,http_status:200,fetched_at:NOW,html:`<script type="application/ld+json">${JSON.stringify(event)}</script><main><h1>${title}</h1>${body}</main>`};
}
test('standing registration is actionable globally, with exact event/date/location proof and enquiry rather than OPEN',()=>{
 for(const market of ['US','GB','CA','AU','NZ','IE','SG','HK']){const r=verifyDocument(document({market}),{now:NOW});assert.equal(r.status,'verified',r.reasons.join(','));assert.equal(r.facts.country,market);assert.equal(r.facts.application_state,'ENQUIRY_AVAILABLE');assert.equal(r.usable_route.type,'standing_registration');assert.equal(r.usable_route.policy,USABLE_ROUTE_POLICY);assert.ok(usableRouteEligible(r));}
 const r=verifyDocument(document(),{now:NOW});assert.deepEqual(compareProof({market:'US',edition:'2026',application_state:'UNKNOWN'},r),[]);assert.deepEqual(compareProof({market:'US',edition:'2026',application_state:'WATCH'},r),[]);
 assert.ok(compareProof({market:'US',edition:'2026',application_state:'CLOSED'},r).includes('selected_application_state_disagrees_with_proof'));
});
test('current organiser-bound inline enquiry, email and prospective account forms remain distinct route types',()=>{
 for(const [body,type]of [[form('Vendor enquiries'),'trader_enquiry'],[form('Create vendor account registration'),'vendor_portal_registration'],['<section><h2>Vendor enquiries</h2><p>For vendor enquiries email <a href="mailto:traders@organiser.example.org">our trader team</a>.</p></section>','trader_email']]){
  const r=verifyDocument(document({body}),{now:NOW});assert.equal(r.status,'verified',r.reasons.join(','));assert.equal(r.usable_route.type,type);assert.equal(r.facts.application_state,'ENQUIRY_AVAILABLE');
 }
});
test('generic contacts, newsletters, tickets, social, login-only, stale forms and restrictions cannot qualify',()=>{
 const cases=[document({body:form('Contact us').replace('Prospective vendors may register with our standing intake for our events.','Please contact our office.')}),document({body:form().replace('standing intake','newsletter')}),document({body:form()+'<p>Applications are closed.</p>'}),document({body:form().replace('Register</button>','Register</button><p>Existing vendors only</p>')}),document({body:form().replace('method="post"','method="get"')}),document({body:form().replace('<form','<form><fieldset disabled>')}),document({body:form().replace('action="/vendor-register"','action="/login"')}),document({body:'<section><h2>2025 Vendor registration</h2>'+form()+'</section>'}),document({body:'<footer>'+form()+'</footer>'}),document({street:null}),document({date:'2025-11-21'}),document({organiserURL:'https://different-organiser.example.org/'}),document({body:'<section><h2>Vendor registration</h2><a href="https://facebook.com/direct-message">Register vendors</a></section>'}),document({body:'<section><h2>Vendor registration</h2><a href="mailto:traders@organiser.example.org?bcc=victim@example.org">Vendor enquiries</a></section>'})];
 for(const [i,d]of cases.entries())assert.notEqual(verifyDocument(d,{now:NOW}).status,'verified','unsafe case '+i);
});
test('an explicit source invitation follows only bounded organiser-controlled vendor links and validates the actual target',async()=>{
 const parent=document({body:`<section><h2>Vendor registration</h2><p>Prospective vendors register with our standing intake.</p><a href="${INTAKE}">Vendor registration</a></section>`}),child={...parent,requested_url:INTAKE,url:INTAKE,html:'<main><h1>Vendor registration</h1>'+form()+'</main>'};const requests=[];
 const doc=await fetchProofDocument(URL,{now:NOW,fetcher:async u=>{requests.push(u);return new Response(u===URL?parent.html:child.html,{headers:{'Content-Type':'text/html'}});}});
 const r=verifyDocument(doc,{now:NOW});assert.equal(r.status,'verified',r.reasons.join(','));assert.equal(r.facts.application_url,INTAKE);assert.deepEqual(requests,[URL,INTAKE]);
 for(const html of ['<main><h1>Vendor login</h1><form><input name="password"></form></main>','<main><h1>2025 Vendor registration</h1>'+form()+'</main>','<main><h1>Vendor registration</h1>'+form()+'<p>Applications closed</p></main>']){const unsafe=structuredClone(doc);unsafe.documents[1].html=html;assert.notEqual(verifyDocument(unsafe,{now:NOW}).status,'verified');}
 const stale=structuredClone(doc);stale.documents[1].fetched_at='invalid';assert.equal(verifyDocument(stale,{now:NOW}).status,'quarantine');
});
test('standing shared intake never silently merges different event dates or names',()=>{
 const a={...record({canonical_url:URL,application_url:INTAKE,source_platform:'official',source_identifier:null}),market:'US',environment:'shadow'},b={...a,id:'existing',canonical_url:URL+'-december',event_start:'2026-12-21',event_end:'2026-12-21'};
 assert.ok(!identityCandidateKeys(a).includes('url:'+INTAKE));assert.equal(reconcileIdentity(a,[b]).outcome,'NEW_ENTITY');
});
test('Eventeny prospective Start Registration binds the same vendor ID and active offer window, not a visitor/login control',()=>{
 const d=documentFixture();d.html=d.html.replace('<button>Start Application</button>','<a href="?id=52126&amp;state=biz_pro">Start Registration</a>');
 const r=verifyDocument(d,{now:NOW});assert.equal(r.status,'verified',r.reasons.join(','));assert.equal(r.usable_route.type,'vendor_portal_registration');assert.equal(r.facts.application_state,'OPEN_NOW');assert.ok(usableRouteEligible(r));
 for(const mutate of [d=>d.html=d.html.replace('id=52126&amp;state','id=99999&amp;state'),d=>d.html=d.html.replace('<a href="?id','<a aria-disabled="true" href="?id'),d=>d.html=d.html.replace('2026-09-01T12:00:00Z','2027-09-01T12:00:00Z'),d=>d.html=d.html.replace('2026-11-20T23:59:00Z','2026-10-05T23:59:00Z'),d=>d.html=d.html.replace('Vendor Application | 2026','Volunteer Registration'),d=>d.html=d.html.replace('</main>','<p>Applications closed</p></main>')]){const bad=structuredClone(d);mutate(bad);assert.notEqual(verifyDocument(bad,{now:NOW}).status,'verified');}
});
test('normal readiness/commercial/customer path accepts only proved routes, preserves source facts and redacts email action for Free',async t=>{
 const db=database(t),d=document({body:'<section><h2>Vendor enquiries</h2><p>For vendor enquiries email <a href="mailto:traders@organiser.example.org">the vendor team</a>.</p></section>'});
 const input=record({canonical_url:URL,application_url:URL,source_platform:'official',source_identifier:null,location:'River Hall, 1 River Street, Austin, Texas',event_end:'2026-11-21',application_state:'UNKNOWN'}),{entity}=await seed(db,input,{environment:'shadow'});
 const before=JSON.stringify((await sql(db,'SELECT * FROM source_facts ORDER BY id').all()).results);await recordVerification(db,entity.id,d,{now:NOW});assert.equal((await evaluateReadiness(db,entity.id,{now:NOW})).status,'ready');assert.equal(JSON.stringify((await sql(db,'SELECT * FROM source_facts ORDER BY id').all()).results),before);
 const inventory=inventoryFromRows(await commercialRows(db),{now:NOW});assert.equal(inventory.totals.ready,1);assert.equal(inventory.ready_by_usable_route_type.trader_email,1);assert.equal(inventory.totals.missing_application_proof,0);
 const snapshot=await stagingCatalogue(db,{now:NOW});assert.equal(snapshot.items.length,1);const row=mapProof(snapshot.items[0],NOW);assert.equal(row.application.status,'enquire');assert.equal(row.application.route_type,'trader_email');assert.ok(!JSON.stringify(present(row,{tier:'free'})).includes('traders@'));assert.equal(present(row,{tier:'pro',scope:'global'}).access.application_action_url,'mailto:traders@organiser.example.org');
 assert.equal((await sql(db,'SELECT COUNT(*) n FROM customer_projections').first()).n,0);assert.equal((await sql(db,'SELECT COUNT(*) n FROM publication_queue').first()).n,0);
 const proof=verifyDocument(d,{now:NOW});for(const override of [{lifecycle_state:'WITHDRAWN'},{application_state:'CLOSED'}])assert.equal(assessEligibility({...input,...override},{now:NOW,proof}).status,'closed');assert.equal(assessEligibility(input,{now:NOW,proof,conflicts:1}).status,'review');
});
test('vendor-scoped Eventeny enquiry proves parent/recipient route and legitimate free account registration; closures and existing-only logins stay held',()=>{
 const parent='https://www.eventeny.com/events/river-lantern-fair-12345/',contact='https://www.eventeny.com/inbox/conversation/?in&to=98765&event=12345&type=2',signup='https://www.eventeny.com/users/signup/?ref=/inbox/?to=98765&event=12345&type=2';
 const d=documentFixture({event:{url:parent}});d.html=d.html.replace('<button>Start Application</button>',`<a href="${contact}">Contact Organizer</a>`);
 const login={...receipt(contact,`<body><a href="${signup}">Sign up for free</a></body>`),url:'https://www.eventeny.com/users/?ref=inbox'},registration=receipt(signup,'<body><form id="signup-email-form" method="post"><input name="user[first_name]"><input name="user[last_name]"><input name="user[email]" type="email"><input name="user[password]" type="password"><button-element type="submit">Create account</button-element></form></body>');
 const documents=[d,login,registration],bundle={document_kind:'global_usable_route_bundle',requested_url:d.url,url:d.url,fetched_at:NOW,documents};
 const r=verifyDocument(bundle,{now:NOW});assert.equal(r.status,'verified',r.reasons.join(','));assert.equal(r.facts.application_state,'ENQUIRY_AVAILABLE');assert.equal(r.usable_route.type,'trader_enquiry');assert.equal(r.usable_route.requires_account,true);assert.equal(r.usable_route.destination,contact);assert.deepEqual(compareProof({market:'US',application_state:'OPEN_NOW'},r),[]);
 for(const mutate of [b=>b.documents[0].html=b.documents[0].html.replaceAll('event=12345','event=11111'),b=>b.documents[1].html=b.documents[1].html.replace('event=12345','event=11111'),b=>b.documents[2].html=b.documents[2].html.replace('Create account','Approved vendors only'),b=>b.documents[2].http_status=403,b=>b.documents[2].html=b.documents[2].html.replace('type="submit"','type="submit" disabled'),b=>b.documents[0].html=b.documents[0].html.replace('</main>','<p>Applications closed</p></main>'),b=>b.documents[0].html=b.documents[0].html.replace('2026-11-20T23:59:00Z','2026-10-05T23:59:00Z')]){const bad=structuredClone(bundle);mutate(bad);assert.notEqual(verifyDocument(bad,{now:NOW}).status,'verified');}
});
test('independent current WATCH needs source proof at least as fresh as the producer hold; held/retired/LOW remain withheld',async t=>{
 const db=database(t),input=record({canonical_url:URL,application_url:URL,source_platform:'official',source_identifier:null,location:'River Hall, 1 River Street, Austin, Texas',event_end:'2026-11-21',application_state:'UNKNOWN',channel:'watch',export_readiness:'WATCH',confidence:{level:'HIGH'}}),{entity}=await seed(db,input,{environment:'shadow'});
 await recordVerification(db,entity.id,document(),{now:NOW});assert.equal((await evaluateReadiness(db,entity.id,{now:NOW})).status,'ready');assert.equal((await stagingCatalogue(db,{now:NOW})).items.length,1);
 const received='2026-10-06T12:02:00.000Z',later={...input,last_checked:'2026-10-06T12:01:00.000Z'},r=await ingestRecords(db,[later],{environment:'shadow',now:received});await sql(db,'INSERT OR IGNORE INTO entity_records VALUES (?,?)',r.record_ids[0],entity.id).run();
 assert.equal((await stagingCatalogue(db,{now:received})).items.length,0,'stale proof must not override newer producer WATCH');
});
