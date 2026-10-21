import test from 'node:test';import assert from 'node:assert/strict';
import {LOCALSTALLS_HANDLER,localstallsEventURL,localstallsEnquiryCandidate,verifyLocalStallsEnquiry,fetchLocalStallsEnquiry} from '../../platform/findpitches-v3/localstalls-enquiry.mjs';
import {verifyDocument,compareProof} from '../../platform/findpitches-v3/verification.mjs';
import {fetchProofDocument} from '../../platform/findpitches-v3/proof-document.mjs';
const NOW='2026-10-21T12:00:00.000Z',URL='https://localstalls.com/uk/event/example/future-craft-fair',CONTACT='https://localstalls.com/organisation/42/contact';
function source(){const event={'@type':'Event',name:'Future Craft Fair',url:URL,startDate:'2026-11-28',endDate:'2026-11-28',location:{name:'Example Hall',address:{streetAddress:'1 Example Street',addressLocality:'Example',addressCountry:'GB'}},organizer:{name:'Example Organiser'}};
 return {requested_url:URL,url:URL,http_status:200,fetched_at:NOW,html:`<head><meta name="csrf-token" content="synthetic-test-only"><script type="application/ld+json">${JSON.stringify(event)}</script></head><main><h1>Future Craft Fair</h1><div class="ls-ev-sec"><h2>About this market</h2><p>Stallholders can sell handmade goods; stall fee £15.</p></div><div id="ls-ev-dates"><span class="ls-dchip is-next"><b>Sat 28 Nov</b><span>Next date</span></span></div><div id="ls-ev-contact"><h2>Contact event manager</h2><form id="ls-ev-form"><input type="text" id="contact-form-fullname" name="full_name"><input type="email" id="contact-form-email" name="email"><textarea id="contact-form-message" name="comment" placeholder="Your message — stall enquiries"></textarea><div id="ls-ev-form-ok">Thanks — your message is on its way to Example Organiser.</div><button type="submit" id="contact-form-submit-btn">Send message</button></form></div></main><script>window.LS_EVENT = { id:42, name:"Future Craft Fair", recaptchaKey:"synthetic-public-key", contactUrl:"${CONTACT}", externalApply:false, };</script><script src="${LOCALSTALLS_HANDLER.url}"></script><script src="https://www.google.com/recaptcha/api.js?render=synthetic-public-key"></script>`};}
const proof=d=>verifyDocument(d,{now:NOW});
test('event-bound, current, explicit-trader contact form is a candidate, never OPEN or proof by itself',()=>{
 const d=source(),r=proof(d),before=JSON.stringify(d);assert.equal(r.status,'partial');assert.equal(r.facts.application_state,'UNKNOWN');const route=localstallsEnquiryCandidate(d,r);assert.equal(route.contact_url,CONTACT);assert.equal(route.organiser,'Example Organiser');assert.equal(JSON.stringify(d),before);assert.equal(r.usable_route,undefined);
});
test('only exact owned UK event routes qualify; directory, foreign, query and redirect inputs do not',()=>{
 for(const u of [URL+'?event=other','https://localstalls.com/uk/events/','https://localstalls.com/au/event/example/fair','https://other.example/uk/event/example/fair',URL+'#form'])assert.equal(localstallsEventURL(u),false);
 const d=source();assert.equal(localstallsEnquiryCandidate({...d,requested_url:URL+'/other'},proof(d)),null);
});
test('contact config cannot execute code, redirect, duplicate IDs/names or bind another event',()=>{
 for(const [a,b]of [['id:42','id:43'],['name:"Future Craft Fair"','name:"Other Fair"'],['externalApply:false','externalApply:true'],['id:42','id:42,id:42'],['id:42','id:globalThis.sideEffect=true'],[CONTACT,'https://other.example/organisation/42/contact']]){const d=source();d.html=d.html.replace(a,b);assert.equal(localstallsEnquiryCandidate(d,proof(d)),null,a);}
 assert.equal(globalThis.sideEffect,undefined);
});
test('future JSON-LD cannot override a different coming date, weekday or series range',()=>{
 for(const [a,b]of [['Sat 28 Nov','Sun 29 Nov'],['Sat 28 Nov','Fri 28 Nov'],['"endDate":"2026-11-28"','"endDate":"2026-12-31"'],['ls-dchip is-next','ls-dchip']]){const d=source();d.html=d.html.replace(a,b);assert.equal(localstallsEnquiryCandidate(d,proof(d)),null);}
});
test('footer, hidden, disabled, generic or unrelated-organiser forms cannot become trader enquiries',()=>{
 for(const [a,b]of [['<div id="ls-ev-contact">','<footer id="ls-ev-contact">'],['<div id="ls-ev-contact">','<div id="ls-ev-contact" hidden>'],['<form id="ls-ev-form">','<form id="ls-ev-form"><fieldset disabled>'],['type="submit" id=','disabled type="submit" id='],['to Example Organiser.','to Another Organiser.'],['stall enquiries','general question'],['Stallholders can sell handmade goods; stall fee £15.','Visitors enjoy shopping and entertainment.'],['<meta name="csrf-token" content="synthetic-test-only">','']]){const d=source();d.html=d.html.replace(a,b);assert.equal(localstallsEnquiryCandidate(d,proof(d)),null,a);}
});
test('closure, membership restriction, stale edition, date and geography holds remain absolute',()=>{
 for(const phrase of ['Applications closed.','Waitlist only.','We are not accepting traders.','Members only.']){const d=source();d.html=d.html.replace('Stallholders can sell',phrase+' Stallholders can sell');assert.equal(localstallsEnquiryCandidate(d,proof(d)),null);}
 for(const reason of ['stale_edition','verified_country_missing','contradictory_event_dates','selected_event_start_disagrees_with_proof']){const d=source(),r=proof(d);r.reasons.push(reason);assert.equal(localstallsEnquiryCandidate(d,r),null);}
});
test('duplicate document IDs cannot redirect getElementById outside the event form; quarantine is retained',()=>{
 const d=source();d.html='<input id="contact-form-email" name="email">'+d.html;assert.equal(localstallsEnquiryCandidate(d,proof(d)),null);
 const report={...proof(source()),status:'quarantine',reasons:['contradictory_event_dates']};assert.equal(verifyLocalStallsEnquiry({documents:[]},report,{now:NOW}).status,'quarantine');
});
test('a declared handler digest cannot forge reviewed bytes or make synthetic contact controls verified',()=>{
 const d=source(),r=proof(d),handler={requested_url:LOCALSTALLS_HANDLER.url,url:LOCALSTALLS_HANDLER.url,http_status:200,content_type:'application/javascript',fetched_at:NOW,javascript:'forged',content_hash:LOCALSTALLS_HANDLER.sha256},endpoint={requested_url:CONTACT,url:CONTACT,http_status:405,allow:'POST',fetched_at:NOW},bundle={document_kind:'localstalls_enquiry_bundle',requested_url:URL,url:URL,fetched_at:NOW,documents:[d,handler,endpoint]};
 const verified=verifyDocument(bundle,{now:NOW});assert.equal(verified.status,'partial');assert.ok(verified.reasons.includes('localstalls_handler_changed_requires_review'));assert.equal(verified.usable_route,undefined);
 assert.ok(verifyLocalStallsEnquiry({...bundle,documents:[]},r,{now:NOW}).reasons.includes('localstalls_enquiry_bundle_invalid'));
 assert.ok(verifyDocument({...bundle,fetched_at:'2026-10-22T00:00:00Z'},{now:NOW}).reasons.includes('localstalls_enquiry_custody_mismatch'));
});
test('fetch uses GET only, exact handler and source-bound endpoint, retaining original source clocks',async()=>{
 const d=source(),requests=[],fetcher=async(u,o)=>{requests.push({u,method:o.method??'GET',redirect:o.redirect});return u===LOCALSTALLS_HANDLER.url?new Response('not the reviewed handler',{headers:{'Content-Type':'application/javascript'}}):new Response(null,{status:405,headers:{Allow:'POST'}});};
 const bundle=await fetchLocalStallsEnquiry(d,proof(d),{fetcher,now:NOW});assert.deepEqual(requests.map(x=>x.u),[LOCALSTALLS_HANDLER.url,CONTACT]);assert.ok(requests.every(x=>x.method==='GET'&&x.redirect==='manual'));assert.equal(bundle.fetched_at,NOW);assert.equal(bundle.documents[0],d);assert.notEqual(verifyDocument(bundle,{now:NOW}).status,'verified');
 let reads=0;const no=source();no.html=no.html.replace('stall enquiries','other');assert.equal(await fetchLocalStallsEnquiry(no,proof(no),{fetcher:async()=>{reads++;},now:NOW}),no);assert.equal(reads,0);
});
test('normal direct-source dispatch never sends a contact submission',async()=>{
 const d=source(),requests=[],fetcher=async(u,o)=>{requests.push({u,method:o.method??'GET'});if(u===URL)return new Response(d.html,{headers:{'Content-Type':'text/html'}});if(u===LOCALSTALLS_HANDLER.url)return new Response('unreviewed',{headers:{'Content-Type':'application/javascript'}});return new Response(null,{status:405,headers:{Allow:'POST'}});};
 const bundle=await fetchProofDocument(URL,{fetcher,now:NOW});assert.equal(bundle.document_kind,'localstalls_enquiry_bundle');assert.equal(requests.length,3);assert.ok(requests.every(x=>x.method==='GET'));
 const r=proof(d);assert.ok(compareProof({market:'US'},r).includes('source_country_market_mismatch'));
});
