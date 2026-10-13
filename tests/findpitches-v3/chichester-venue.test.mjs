import test from 'node:test';import assert from 'node:assert/strict';
import {NOW} from './helpers.mjs';import {verifyDocument} from '../../platform/findpitches-v3/verification.mjs';
import {UK_ADAPTER_VERSION,fetchMyntBundle} from '../../platform/findpitches-v3/uk-sources.mjs';
import {CHICHESTER_SOURCE as URL,CHICHESTER_ROOM as ROOM,CHICHESTER_HOUSE as HOUSE} from '../../platform/findpitches-v3/chichester-venue.mjs';
const FORM='https://www.emailmeform.com/builder/form/FixtureForm',GEO='https://api.postcodes.io/postcodes/PO191LQ';
const doc=(url,html)=>({requested_url:url,url,fetched_at:NOW,http_status:200,html});
function fixture(){return {document_kind:'uk_official_bundle',adapter_version:UK_ADAPTER_VERSION,url:URL,requested_url:URL,source_identifier:'chichester:2026-11-21',fetched_at:NOW,documents:[
 doc(URL,`<div id="content_area"><h1>Chichester Assembly Rooms</h1><p>Mynt Image welcomes traders. The Assembly Rooms is in North Street Chichester. The hall is on the 1st floor.</p><p>To make a booking please check the availability and fill our application form.</p><h2>Availability - 2026</h2><table><tr><th>Date</th><th>Stall Spaces</th></tr><tr><td>21st November</td><td>5</td></tr></table><script src="https://www.emailmeform.com/builder/forms/jsform/FixtureForm"></script></div>`),
 doc(FORM,`<form method="post" action="${FORM}"><div id="emf-form-title">Chichester Assembly Rooms Booking Form</div><label for="business">Business Name</label><input id="business"><label for="products">Product Description</label><textarea id="products"></textarea><label for="date">21st November 2026</label><input type="checkbox" id="date" value="21st November 2026"><input type="submit" value="Submit"></form>`),
 doc(ROOM,'<div class="page__content">The Assembly Room (c.1782) is on the first floor of the building. Suitable for fairs, exhibitions. A lift is available.</div>'),
 doc(HOUSE,`<div class="page__content">The Council House in North Street, Chichester is a building. Areas of the Council House: <a href="/assembly-room-and-ante-room/">Assembly Room and Ante Room</a></div><footer><div id="text-2"><p>Chichester City Council The Council House North Street Chichester, PO19 1LQ</p></div></footer>`),
 {requested_url:GEO,url:GEO,http_status:200,fetched_at:NOW,json_text:JSON.stringify({status:200,result:{postcode:'PO19 1LQ',country:'England',region:'South East',latitude:50,longitude:0}})}]};}
test('named room/building/address chain proves country, preserving Mynt identity/form and no postal-centre pin',()=>{
 const b=fixture(),r=verifyDocument(b,{now:NOW});assert.equal(r.status,'verified',r.reasons.join(','));assert.equal(r.facts.country,'GB');assert.equal(r.facts.region_code,'South East');assert.equal(r.facts.source_identifier,b.source_identifier);assert.equal(r.facts.application_url,FORM);assert.ok(r.facts.location.startsWith('Chichester Assembly Rooms'));assert.equal(r.venue_coordinates,null);assert.ok(r.evidence.some(e=>e.kind==='official_room_building_address'));
});
test('bare office/footer, wrong room/street/postcode, redirects and another venue cannot join',()=>{
 const mutations=[b=>b.documents[3].html=b.documents[3].html.replace('Areas of the Council House:','Other offices:'),b=>b.documents[3].html=b.documents[3].html.replace('Assembly Room and Ante Room','Council Chamber'),b=>b.documents[3].html=b.documents[3].html.replace('North Street Chichester,','South Street Chichester,'),b=>b.documents[2].html=b.documents[2].html.replace('first floor','ground floor'),b=>b.documents[4].json_text=b.documents[4].json_text.replace('PO19 1LQ','PO19 1AA'),b=>b.documents[2].url='https://other.example/assembly-room/',b=>b.documents[0].html=b.documents[0].html.replaceAll('Chichester Assembly Rooms','Chichester Town Hall')];
 for(const mutate of mutations){const b=fixture();mutate(b);assert.notEqual(verifyDocument(b,{now:NOW}).status,'verified');}
});
test('strong country proof never overrides a closed capacity, wrong trader date or invalid source clock',()=>{
 for(const mutate of [b=>b.documents[0].html=b.documents[0].html.replace('<td>5</td>','<td>0</td>'),b=>b.documents[1].html=b.documents[1].html.replaceAll('21st November 2026','21st November 2025'),b=>b.documents[2].fetched_at='invalid',b=>b.documents[2].fetched_at='2027-01-01T00:00:00.000Z']){const b=fixture();mutate(b);assert.notEqual(verifyDocument(b,{now:NOW}).status,'verified');}
});
test('bounded native fetch retains actual council and postcode receipts and uses earliest source clock',async()=>{
 const b=fixture(),requests=[];const result=await fetchMyntBundle(URL,b.source_identifier,{now:NOW,fetcher:async u=>{requests.push(u);const d=b.documents.find(d=>d.url===u);assert.ok(d);return d.json_text?new Response(d.json_text,{headers:{'Content-Type':'application/json'}}):new Response(d.html,{headers:{'Content-Type':'text/html'}});}});
 assert.deepEqual(requests,[URL,FORM,ROOM,HOUSE,GEO]);assert.equal(result.fetched_at,NOW);assert.equal(verifyDocument(result,{now:NOW}).status,'verified');
 const later=structuredClone(result);later.fetched_at='2026-10-06T13:00:00.000Z';assert.notEqual(verifyDocument(later,{now:'2026-10-06T13:00:00.000Z'}).status,'verified');
});
