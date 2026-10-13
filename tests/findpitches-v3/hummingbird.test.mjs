import test from 'node:test';
import assert from 'node:assert/strict';
import {
 HUMMINGBIRD_ADAPTER_VERSION,HUMMINGBIRD_TRADE,HUMMINGBIRD_CALENDAR,HUMMINGBIRD_CALENDAR_SHA256,
 hummingbirdGroups,hummingbirdGroup,hummingbirdIdentifier,hummingbirdVenue,hummingbirdRawSHA256,
 hummingbirdVisitorAddress,hummingbirdProgrammeBinding,verifyHummingbirdBundle,
} from '../../platform/findpitches-v3/hummingbird.mjs';

// Synthetic source shapes only. No production receipts or reviewed image bytes
// are committed; successful live image custody is a separate operational check.
const NOW='2026-10-13T12:00:00.000Z';
const doc=(url,html)=>({requested_url:url,url,http_status:200,fetched_at:NOW,html});
const hull=html=>doc('https://hullminster.org/',html);
const physical='<footer><div id="siteInfo"><span class="site-address">Hull Minster, South Church Side, Hull, England, HU1, United Kingdom</span></div></footer>';
const rufford=html=>doc('https://ruffordabbey.co.uk/how-to-get-here/',html);
const ruffordAddress='<footer><p>Rufford Abbey Country Park<br>Ollerton<br>Nottinghamshire<br>NG22 9DF</p></footer>';
const programme=html=>doc('https://ruffordabbey.co.uk/events/',html);
const card=(date,title,description,route)=>`<div class="event-card-body"><div class="event-dates">${date}</div><h4>${title}</h4><p>${description}</p><a href="https://ruffordabbey.co.uk/events/${route}/">View event</a></div>`;
const twilight=()=>card('30 Oct','Twilight at Rufford','Rufford Abbey Country Park has a mini courtyard market open until 7pm.','twilight-at-rufford');
const market=()=>card('25 Oct','Abbey Artisan and Makers Market','Rufford Abbey Country Park market delivered in collaboration with Little Hummingbird Events.','abbey-artisan-and-makers-market');
const hessle=html=>doc('https://www.hessletowncouncil.gov.uk/contact/',html);
const hessleAddress='<main><div class="address">Town Hall<br>South Lane<br>Hessle<br>East Yorkshire<br>HU13 0RR</div></main>';
const hessleProgramme=html=>doc('https://www.hessletowncouncil.gov.uk/council_events/community-makers-market-2/',html);
const hessleMarket=`<main><div class="event_information">Event Information Date 10am - 3pm at Hessle Town Hall, HU13 0RR</div><p>Hosted by Little Hummingbird Events</p><a href="${HUMMINGBIRD_TRADE}">To apply for a stand at the Community Makers Market, please click here.</a></main>`;

test('reviewed calendar preserves 30 distinct identities, literal aliases and two unsplit ranges',()=>{
 const groups=hummingbirdGroups();assert.equal(groups.length,30);assert.equal(new Set(groups.map(r=>r.source_identifier)).size,30);
 assert.equal(groups.filter(r=>hummingbirdVenue(r.label)).length,14);
 const ranges=groups.filter(r=>r.date!==r.end_date);assert.deepEqual(ranges.map(r=>[r.label,r.date,r.end_date]),[['VANTOM VILLAGE','2026-11-06','2026-11-08'],['HULL CITY CENTRE XMAS WEEKEND','2026-11-21','2026-11-22']]);
 assert.equal(hummingbirdIdentifier('HORNSEA VILLAGE','2026-10-16'),'little-hummingbird:HORNSEA%20VILLAGE:2026-10-16');
 assert.equal(hummingbirdVenue('HORNSEA'),null);assert.equal(hummingbirdVenue('LEEDS CORN X CHRISTMAS'),null);
 assert.throws(()=>hummingbirdIdentifier('VANTOM VILLAGE','2026-11-07'),/reviewed_dated_group/);
 const first=groups[0];first.label='Changed';assert.equal(hummingbirdGroup(first.source_identifier).label,'HORNSEA VILLAGE');
 assert.equal(groups.filter(r=>r.label==='HULL CITY CENTRE MAKERS').length,2);
});

test('raw image digest matches independent NIST SHA-256 vectors',()=>{
 const encode=v=>new TextEncoder().encode(v);
 assert.equal(hummingbirdRawSHA256(encode('')),'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
 assert.equal(hummingbirdRawSHA256(encode('abc')),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
 assert.equal(hummingbirdRawSHA256(encode('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')),'248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
});

test('Rufford accepts only the visible named visitor footer and pins its reviewed postcode',()=>{
 assert.equal(hummingbirdVisitorAddress(rufford(ruffordAddress),'RUFFORD ABBEY').postcode,'NG229DF');
 for(const html of [ruffordAddress.replace('9DF','9EQ'),'<div hidden>'+ruffordAddress+'</div>','<div id="menu-overlay" style="display:none"><p>Rufford Abbey Country Park Ollerton Nottinghamshire NG22 9DF</p></div>','<footer><p>Parkwood Leisure Office, Nottinghamshire NG22 9DF</p></footer>'])assert.throws(()=>hummingbirdVisitorAddress(rufford(html),'RUFFORD ABBEY'));
 assert.throws(()=>hummingbirdVisitorAddress({...rufford(ruffordAddress),requested_url:HUMMINGBIRD_TRADE},'RUFFORD ABBEY'),/source_document_binding/);
});

test('Night label requires its own exact dated Twilight market, never a generic Rufford alias',()=>{
 assert.equal(hummingbirdProgrammeBinding(programme(twilight()),'RUFFORD ABBEY NIGHT','2026-10-30').official_venue,'Rufford Abbey Country Park');
 assert.equal(hummingbirdProgrammeBinding(programme(market()),'RUFFORD ABBEY','2026-10-25').calendar_label,'RUFFORD ABBEY');
 for(const html of [market(),twilight().replace('30 Oct','31 Oct'),twilight().replace('mini courtyard market','visitor light show'),twilight().replace('until 7pm','until 7pm; applications closed'),'<fieldset disabled>'+twilight()+'</fieldset>',twilight()+twilight()])assert.throws(()=>hummingbirdProgrammeBinding(programme(html),'RUFFORD ABBEY NIGHT','2026-10-30'));
});

test('Hessle binds the actual Town Hall address and named commercial application route',()=>{
 assert.equal(hummingbirdVisitorAddress(hessle(hessleAddress),'HESSLE TOWN HALL').postcode,'HU130RR');
 assert.equal(hummingbirdProgrammeBinding(hessleProgramme(hessleMarket),'HESSLE TOWN HALL','2026-11-15').official_venue,'Hessle Town Hall');
 for(const html of [hessleAddress.replace('Town Hall','Council Registered Office'),hessleAddress.replace('0RR','0JG'),'<div hidden>'+hessleAddress+'</div>'])assert.throws(()=>hummingbirdVisitorAddress(hessle(html),'HESSLE TOWN HALL'));
 for(const html of [hessleMarket.replace(HUMMINGBIRD_TRADE,'https://example.org/visitor-tickets'),hessleMarket.replace('HU13 0RR','HU13 0JG'),hessleMarket+'<p>Applications closed</p>',hessleMarket.replace('<a ','<a aria-disabled="true" ')])assert.throws(()=>hummingbirdProgrammeBinding(hessleProgramme(html),'HESSLE TOWN HALL','2026-11-15'));
});

test('Hull proves only its own explicit physical address and country, without office postcode, region or pins',()=>{
 const address=hummingbirdVisitorAddress(hull(physical),'HULL MINSTER');assert.equal(address.country,'GB');assert.equal(address.nation,'England');assert.equal(address.postcode_district,'HU1');
 for(const key of ['postcode','region','region_code','lat','lon','coordinates'])assert.equal(address[key],undefined);
 for(const html of [physical.replace('England','Scotland'),physical.replace('Hull Minster, South Church Side','Hull Minster Parish Office, South Church Side').replace('HU1,','HU1 1RR,'),physical.replace('id="siteInfo"','id="companyOffice"'),'<div hidden>'+physical+'</div>',physical+physical])assert.throws(()=>hummingbirdVisitorAddress(hull(html),'HULL MINSTER'));
});

function traderHTML(){
 const fields=[['input_comp-m60m84ko','input','Business Name','TextInput'],['input_comp-m60lzkcf1','input','Email','TextInput'],['textarea_comp-m60n0u2g','textarea','Please provide details of what you sell','TextAreaInput'],['textarea_comp-m60n9lgi','textarea','Dates of the events you wish to book. Please be specific and use venue names.','TextAreaInput']];
 const types={'comp-m60lzk8q':'AppWidget','comp-m60my6rk':'SiteButton',...Object.fromEntries(fields.map(([id,,,type])=>[id.replace(/^(input|textarea)_/,''),type]))};
 const model={requestUrl:HUMMINGBIRD_TRADE,mode:{qa:false,debug:false},siteFeaturesConfigs:{platform:{debug:{disablePlatform:false},appsScripts:{urls:{'14ce1214-b278-a7e4-1373-00cebd1bef7c':['https://static.parastorage.com/services/forms-viewer/1.2.3/viewerScript.bundle.min.js']}}}}};
 return `<main><p>Little Hummingbird Events are always on the look out for new traders.</p><p>Below is our latest updated events calendar and booking form. To book an event, you simply need to complete the form.</p><p>Once we receive your booking we will contact you within 48 hours to confirm bookings.</p><img id="img_comp-mhetx5qm" src="${HUMMINGBIRD_CALENDAR}"><div id="comp-m60lzk8q"><form>${fields.map(([id,tag,label])=>`<label for="${id}">${label}</label><${tag} id="${id}"${id.includes('lzkcf1')?' type="email"':''}></${tag}>`).join('')}<div id="comp-m60my6rk"><button aria-disabled="false" aria-label="Submit">Submit</button></div></form></div></main><script id="wix-viewer-model" type="application/json">${JSON.stringify(model)}</script><script id="wix-warmup-data" type="application/json">${JSON.stringify({pages:{compIdToTypeMap:types},platform:{ssrPropsUpdates:[]}})}</script>`;
}
function badImageBundle(){return {requested_url:HUMMINGBIRD_TRADE,url:HUMMINGBIRD_TRADE,fetched_at:NOW,adapter_version:HUMMINGBIRD_ADAPTER_VERSION,source_identifier:hummingbirdIdentifier('HULL MINSTER','2026-10-31'),documents:[doc(HUMMINGBIRD_TRADE,traderHTML()),hull(physical),{requested_url:HUMMINGBIRD_CALENDAR,url:HUMMINGBIRD_CALENDAR,http_status:200,content_type:'image/avif',fetched_at:NOW,image_base64:Buffer.alloc(93230).toString('base64'),content_hash:HUMMINGBIRD_CALENDAR_SHA256}]};}
test('fabricated raw image cannot pass using the trusted digest field or shared application portal',()=>{
 const bundle=badImageBundle();assert.deepEqual(verifyHummingbirdBundle(bundle,{now:NOW}).reasons,['hummingbird_calendar_changed_requires_review']);
 const mismatch=badImageBundle();mismatch.source_identifier=HUMMINGBIRD_TRADE;assert.equal(verifyHummingbirdBundle(mismatch,{now:NOW}).status,'quarantine');
 const held=badImageBundle();held.source_identifier=hummingbirdIdentifier('HORNSEA','2026-12-18');assert.deepEqual(verifyHummingbirdBundle(held,{now:NOW}).reasons,['hummingbird_calendar_venue_alias_requires_proof']);
});
test('disabled trader controls, duplicate widgets and newer bundle clocks fail before any image promotion',()=>{
 for(const [from,to] of [['<form>','<form disabled>'],['id="input_comp-m60m84ko"','readonly id="input_comp-m60m84ko"'],['aria-disabled="false"','aria-disabled="true"'],['</main>','<div id="comp-m60lzk8q"></div></main>']]){const b=badImageBundle();b.documents[0].html=b.documents[0].html.replace(from,to);const r=verifyHummingbirdBundle(b,{now:NOW});assert.notEqual(r.status,'verified');assert.ok(!r.reasons.includes('hummingbird_calendar_changed_requires_review'));}
 const b=badImageBundle();b.documents[1].fetched_at='2026-10-12T12:00:00.000Z';assert.deepEqual(verifyHummingbirdBundle(b,{now:NOW}).reasons,['hummingbird_source_bundle_freshness_invalid']);
});
