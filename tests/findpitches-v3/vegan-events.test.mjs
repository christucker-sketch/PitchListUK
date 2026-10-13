import test from 'node:test';import assert from 'node:assert/strict';
import {VEGAN_ORIGIN,VEGAN_HOME,VEGAN_TRADE,VEGAN_ADAPTER_VERSION,veganEventURL,parseVeganProgramme,parseVeganTrade,parseVeganEvent,parseVeganForm,fetchVeganProgramme,fetchVeganBundle,verifyVeganBundle} from '../../platform/findpitches-v3/vegan-events.mjs';
import {postcodeURL} from '../../platform/findpitches-v3/uk-event-geography.mjs';
const NOW='2026-10-13T12:00:00.000Z',OLD='2026-10-13T11:30:00.000Z',ID='1FAIpQLSsyntheticTraderForm1234567890',FORM='https://docs.google.com/forms/d/e/'+ID+'/viewform?usp=header',UPLOAD='https://docs.google.com/forms/d/e/1FAIpQLSsyntheticUploader1234567890/viewform?usp=header',EVENT=VEGAN_ORIGIN+'/exhibitor/river-vegan-festival';
const doc=(url,html,overrides={})=>({url,requested_url:url,http_status:200,fetched_at:NOW,html,...overrides});
const escape=v=>v.replace(/&/g,'&amp;').replace(/"/g,'&quot;');
function source({date='2026-11-22',dateText='22 November 2026',title='River Vegan Festival',address='1 River Road, York YO24 1AD, UK',upload=false}={}){
 const fields=[['Which festival are you applying for?',0,null],['Your Email',0,null],['Tell us more about your business / charity?',1,null],['I would like to book the following stall type',2,['Caterer','Business','Charity']],['Is your business / charity 100% vegan?',2,['Yes','No']]];
 const questions=fields.map(([label,type,options],i)=>[101+i,label,null,type,[[901+i,options?.map(v=>[v,null,null,null,0])??null,1]]]);
 if(upload)questions.push([120,'IMPORTANT: Your booking is not complete until you upload your documents. Upload your documents here: '+UPLOAD,null,1,[[920,null,0]]]);
 const model=[null,['Event Timing: '+dateText+', 10.30am - 4.30pm\nEvent Address: River Hall, '+address.replace(/, UK$/,''),questions,null,null,null,null,null,null,title+' Trade Application']];model[14]='e/'+ID;
 const rendered=questions.filter(q=>q[0]<120).map(q=>`<div jsmodel="CP1oW" data-params="${escape('%.@.'+JSON.stringify(q))}"><div id="heading-${q[0]}" role="heading">${q[1]}</div>${q[3]===2?q[4][0][1].map(o=>`<div role="radio" data-value="${o[0]}" aria-label="${o[0]}" aria-disabled="true"></div><span>${o[0]}</span>`).join(''):`<${q[3]===1?'textarea':'input type="text"'} disabled aria-disabled="true" aria-labelledby="heading-${q[0]}">${q[3]===1?'</textarea>':''}`}</div>`).join('');
 const home=doc(VEGAN_HOME,`<main><h1>Our Events</h1><section><p>${dateText}</p><h2>${title}</h2><a href="${VEGAN_ORIGIN}/cus-events/river-vegan-festival">Visitor</a><a href="${EVENT}">Exhibitor</a></section></main>`);
 const trade=doc(VEGAN_TRADE,`<main><h1>Trade</h1><h2>Vegan Events UK</h2><h2>2025 Events</h2><h2>Exhibitor Applications</h2><section><h2>${title} - ${dateText}</h2><a href="${FORM}">Book A Stall</a></section></main>`);
 const event=doc(EVENT,`<main><h2>Exhibitor</h2><h1>${title}</h1><p>${address}</p><p>Fantastic stalls at River Hall, ${address.replace(/, UK$/,'')}.</p><p>${dateText}</p></main>`);
 const form=doc(FORM,`<html><body><form id="mG61Hd" method="POST" action="https://docs.google.com/forms/d/e/${ID}/formResponse" jsmodel="TOfxwf Q91hve" data-clean-viewform-url="${FORM}">${rendered}<div role="button" aria-label="Submit" tabindex="0" jscontroller="VXdfxd" jsaction="click:cOuCgd">Submit</div></form><script>var FB_PUBLIC_LOAD_DATA_ = ${JSON.stringify(model)};</script></body></html>`);
 const documents=[event,trade,form,...upload?[{url:UPLOAD,requested_url:UPLOAD,http_status:401,fetched_at:NOW,reason:'source_http_401'}]:[]];
 const bundle={document_kind:'vegan_events_official_bundle',adapter_version:VEGAN_ADAPTER_VERSION,url:EVENT,requested_url:EVENT,source_identifier:'vegan-events:river-vegan-festival:'+date,fetched_at:NOW,documents};
 return {home,trade,event,form,bundle,model};
}

test('one exact dated event and its active published trader form verify without inventing geography or erasing the stale generic heading',()=>{
 const s=source(),before=JSON.stringify(s.bundle),r=verifyVeganBundle(s.bundle,{now:NOW});assert.equal(r.status,'verified');assert.equal(r.facts.event_name,'River Vegan Festival');assert.equal(r.facts.country,'GB');assert.equal(r.facts.event_start,'2026-11-22');assert.equal(r.facts.event_end,'2026-11-22');assert.equal(r.facts.application_state,'OPEN_NOW');assert.equal(r.application_scope_proof.guaranteed_vendor_space,false);
 const retained=r.evidence.find(e=>e.kind==='retained_generic_heading_edition');assert.deepEqual(JSON.parse(retained.excerpt).original_headings,['2025 Events']);assert.equal(JSON.stringify(s.bundle),before);
 assert.equal(parseVeganForm(s.form,parseVeganEvent(s.event)).initial_native_controls_disabled,true);assert.equal(parseVeganProgramme(s.home,s.trade).rows.length,1);
});

test('mandatory document uploader account gates produce useful WATCH evidence with UNKNOWN state, never full proof or a guaranteed pitch',()=>{
 const s=source({upload:true}),r=verifyVeganBundle(s.bundle,{now:NOW});assert.equal(r.status,'partial');assert.deepEqual(r.reasons,['vegan_required_document_upload_account_gate']);assert.equal(r.facts.application_state,'UNKNOWN');assert.equal(r.application_dependencies.required_document_upload,UPLOAD);assert.ok(r.evidence.some(e=>e.kind==='mandatory_application_document_dependency'));
 s.bundle.documents.pop();assert.equal(verifyVeganBundle(s.bundle,{now:NOW}).reasons[0],'vegan_required_document_upload_operational_proof_missing');
});

test('wrong edition, unrelated event/form route and mismatched actual venue are quarantined rather than repaired',()=>{
 const s=source();for(const change of ['date','title','venue','identifier']){const b=structuredClone(s.bundle);if(change==='date')b.documents[2].html=b.documents[2].html.replaceAll('22 November 2026','21 November 2026');if(change==='title')b.documents[2].html=b.documents[2].html.replaceAll('River Vegan Festival','Mountain Vegan Festival');if(change==='venue')b.documents[2].html=b.documents[2].html.replaceAll('YO24 1AD','CF64 2NS');if(change==='identifier')b.source_identifier='vegan-events:river-vegan-festival:2027-11-22';const r=verifyVeganBundle(b,{now:NOW});assert.equal(r.status,'quarantine',change);assert.equal(r.facts.application_state,undefined);}
});

test('closed/disabled Submit, selectively disabled controls, newsletter schemas and unbound schema metadata never qualify',()=>{
 const s=source();for(const change of ['submit','hidden','selective','question','schema','capacity']){const b=structuredClone(s.bundle);let html=b.documents[2].html;if(change==='submit')html=html.replace('role="button"','role="button" aria-disabled="true"');if(change==='hidden')html=html.replace('<form ','<form hidden ');if(change==='selective')html=html.replace('disabled aria-disabled="true"','aria-disabled="false"');if(change==='question')html=html.replaceAll('Tell us more about your business / charity?','Sign up for our newsletter');if(change==='schema')html=html.replace('var FB_PUBLIC_LOAD_DATA_', 'var UNRELATED_LOAD_DATA');if(change==='capacity')html=html.replace('</form>','<p>Business stalls are sold out</p></form>');b.documents[2].html=html;const r=verifyVeganBundle(b,{now:NOW});assert.notEqual(r.status,'verified',change);assert.notEqual(r.facts.application_state,'OPEN_NOW',change);}
});

test('proof uses the earliest source clock and actual postal country; future clocks, stale editions and different postal receipts fail closed',()=>{
 const s=source(),b=structuredClone(s.bundle);b.documents[1].fetched_at=OLD;b.fetched_at=OLD;assert.equal(verifyVeganBundle(b,{now:NOW}).checked_at,OLD);assert.equal(verifyVeganBundle(b,{now:NOW}).status,'verified');
 b.fetched_at=NOW;assert.equal(verifyVeganBundle(b,{now:NOW}).status,'unverified');b.documents[1].fetched_at='2026-10-14T12:00:00.000Z';assert.equal(verifyVeganBundle(b,{now:NOW}).status,'unverified');
 const stale=source({date:'2025-11-22',dateText:'22 November 2025'});const r=verifyVeganBundle(stale.bundle,{now:NOW});assert.equal(r.status,'partial');assert.ok(r.reasons.includes('stale_edition'));assert.equal(r.facts.application_state,'UNKNOWN');
 const missing=source({address:'1 River Road, York YO24 1AD'});assert.equal(verifyVeganBundle(missing.bundle,{now:NOW}).reasons[0],'verified_country_missing');
 const geo={url:postcodeURL('YO241AD'),requested_url:postcodeURL('YO241AD'),http_status:200,fetched_at:NOW,json_text:JSON.stringify({status:200,result:{postcode:'YO24 1AD',country:'England',region:'Yorkshire and The Humber'}})};missing.bundle.documents.push(geo);assert.equal(verifyVeganBundle(missing.bundle,{now:NOW}).facts.country,'GB');geo.json_text=JSON.stringify({status:200,result:{postcode:'CF64 2NS',country:'Wales'}});assert.equal(verifyVeganBundle(missing.bundle,{now:NOW}).status,'quarantine');
});

test('a dated discovery card pointing at a different real event cannot silently become that event during fetching',async()=>{
 const s=source(),home={...s.home,html:s.home.html.replace('22 November 2026','23 November 2026')},calls=[];
 const result=await fetchVeganProgramme({now:NOW,fetcher:async url=>{calls.push(url);return new Response(({[VEGAN_HOME]:home,[VEGAN_TRADE]:s.trade,[EVENT]:s.event})[url]?.html??'',{headers:{'content-type':'text/html'}})}});
 assert.equal(result.bundles.length,0);assert.ok(result.held.length);assert.equal(calls.includes(FORM),false);
});

test('programme fetching admits only exact official leaves, bounds actual HTTP visits, and rechecks every original source without paid calls',async()=>{
 const s=source(),documents=new Map([[VEGAN_TRADE,s.trade],[VEGAN_HOME,s.home],[EVENT,s.event],[FORM,s.form]]),visits=[];let calls=0;
 const fetcher=async url=>{calls++;assert.ok(documents.has(url));return new Response(documents.get(url).html,{headers:{'content-type':'text/html'}})};
 const b=await fetchVeganBundle(EVENT,null,{fetcher,now:NOW,visit:d=>visits.push(d.url)});assert.equal(verifyVeganBundle(b,{now:NOW}).status,'verified');assert.equal(calls,3);assert.equal(visits.length,3);
 await fetchVeganBundle(EVENT,b.source_identifier,{fetcher,now:NOW});assert.equal(calls,6);
 assert.equal(veganEventURL(VEGAN_HOME),false);assert.equal(veganEventURL(EVENT+'?market=US'),false);assert.equal(veganEventURL('https://social.example/exhibitor/river-vegan-festival'),false);
 await assert.rejects(fetchVeganProgramme({url:VEGAN_HOME,fetcher,now:NOW}),/bounded_official/);await assert.rejects(fetchVeganProgramme({maxGroups:51,fetcher,now:NOW}),/bounded_official/);
 calls=0;const limited=await fetchVeganProgramme({url:EVENT,fetcher,now:NOW,maxVisits:1});assert.equal(calls,1);assert.equal(limited.bundles.length,0);assert.equal(limited.actual_visits,1);
});

test('the larger official-source opt-in remains bounded and does not admit oversized external forms or programme explosions',()=>{
 const s=source(),large={...s.trade,html:'<!--'+'.'.repeat(1100000)+'-->'+s.trade.html};assert.equal(parseVeganTrade(large).rows.length,1);
 assert.throws(()=>parseVeganTrade({...s.trade,html:'x'.repeat(2097153)}),/size_limit/);
 assert.throws(()=>parseVeganForm({...s.form,html:'x'.repeat(1048577)},parseVeganEvent(s.event)),/size_limit/);
 const repeated={...s.trade,html:s.trade.html.replace('</main>',s.trade.html.match(/<section>[\s\S]*?<\/section>/)[0].repeat(50)+'</main>')};assert.throws(()=>parseVeganTrade(repeated),/bounded_trade_cards/);
});
