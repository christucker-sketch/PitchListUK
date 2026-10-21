// Dated applications proved by the organiser's reviewed calendar bytes, current
// published trader widget, linked visitor venue and independent postal receipt.
// A new calendar image requires a new evidence review; no OCR/query inference.
import {hash,stableJson} from './contract.mjs';
import {HUMMINGBIRD_CALENDAR,HUMMINGBIRD_CALENDAR_SHA256,HUMMINGBIRD_CALENDARS,hummingbirdCalendar} from './hummingbird-calendars.mjs';
export {HUMMINGBIRD_CALENDAR,HUMMINGBIRD_CALENDAR_SHA256,HUMMINGBIRD_CALENDARS,hummingbirdCalendar};
import {parseHtml,nodes,first,text,hasClass} from './source-dom.mjs';
import {fetchSourceDocument} from './source-document.mjs';
import {fetchUKPostcode,postcodeProof,ukPostcode} from './uk-event-geography.mjs';

export const HUMMINGBIRD_ADAPTER_VERSION='hummingbird-reviewed-calendar-trader-widget-v3';
export const HUMMINGBIRD_TRADE='https://www.littlehummingbirdevents.co.uk/trade-with-us';
export const HUMMINGBIRD_VENUES='https://www.littlehummingbirdevents.co.uk/venues';
const WIDGET='comp-m60lzk8q',SUBMIT='comp-m60my6rk',FORMS_APP='14ce1214-b278-a7e4-1373-00cebd1bef7c';
const clean=v=>String(v??'').replace(/[\u200b-\u200d\ufeff]/g,'').replace(/\s+/g,' ').trim();
const norm=v=>clean(v).toLowerCase().replace(/[’‘]/g,"'");
const sameURL=(a,b)=>{try{const x=new URL(a),y=new URL(b);return x.href.replace(/\/$/,'')===y.href.replace(/\/$/,'')&&!x.username&&!x.password&&!x.search&&!x.hash;}catch{return false;}};
const VENUES=Object.freeze({
 'HORNSEA VILLAGE':Object.freeze({label:'HORNSEA VILLAGE',name:'Hornsea Village',link:'https://hornseavillage.com',url:'https://hornseavillage.com',postcode:'HU181UT'}),
 THORESBY:Object.freeze({label:'THORESBY',name:'Thoresby Park',link:'https://thoresby.com/explore-thoresby/shopping-and-courtyard-cafe/',url:'https://thoresby.com/explore-thoresby/opening-times-and-car-park/',contact:'https://thoresby.com/contact-us/',postcode:'NG229EP'}),
 'FLEMINGATE SHOPPING CENTRE':Object.freeze({label:'FLEMINGATE SHOPPING CENTRE',name:'Flemingate Shopping Centre',link:'https://flemingate.co.uk',url:'https://flemingate.co.uk/getting-here/',postcode:'HU170NQ'}),
 'TEMPLE NEWSAM ESTATE':Object.freeze({label:'TEMPLE NEWSAM ESTATE',name:'Temple Newsam',link:'https://museumsandgalleries.leeds.gov.uk/temple-newsam/',url:'https://museumsandgalleries.leeds.gov.uk/visit-temple-newsam-dt79',postcode:'LS150AE'}),
 'RUFFORD ABBEY':Object.freeze({label:'RUFFORD ABBEY',name:'Rufford Abbey Country Park',url:'https://ruffordabbey.co.uk/how-to-get-here/',postcode:'NG229DF',programme:'https://ruffordabbey.co.uk/events/'}),
 'RUFFORD ABBEY NIGHT':Object.freeze({label:'RUFFORD ABBEY NIGHT',name:'Rufford Abbey Country Park',url:'https://ruffordabbey.co.uk/how-to-get-here/',postcode:'NG229DF',programme:'https://ruffordabbey.co.uk/events/'}),
 'HESSLE TOWN HALL':Object.freeze({label:'HESSLE TOWN HALL',name:'Hessle Town Hall',url:'https://www.hessletowncouncil.gov.uk/contact/',postcode:'HU130RR',programme:'https://www.hessletowncouncil.gov.uk/council_events/community-makers-market-2/'}),
 'HULL MINSTER':Object.freeze({label:'HULL MINSTER',name:'Hull Minster',url:'https://hullminster.org/',physical_country:true}),
});
export const hummingbirdURL=u=>sameURL(u,HUMMINGBIRD_TRADE);
export const hummingbirdVenue=label=>VENUES[label]??null;
export const hummingbirdGroups=(calendarUrl=HUMMINGBIRD_CALENDAR)=>(hummingbirdCalendar(calendarUrl)?.rows??[]).map(r=>({...r}));
export const hummingbirdGroup=(identifier,calendarUrl=null)=>{const r=(calendarUrl?hummingbirdCalendar(calendarUrl)?.rows??[]:HUMMINGBIRD_CALENDARS.flatMap(c=>c.rows)).find(r=>r.source_identifier===identifier);return r?{...r}:null;};
export function hummingbirdIdentifier(label,date){const r=HUMMINGBIRD_CALENDARS.flatMap(c=>c.rows).find(r=>r.label===label&&r.date===date);if(!r)throw Error('hummingbird_reviewed_dated_group_required');return r.source_identifier;}

// SHA-256 over retained raw bytes is synchronous because source verifiers are
// synchronous. Supplied content_hash fields never substitute for this check.
import {rawSHA256 as sha256} from './raw-sha256.mjs';
export {rawSHA256 as hummingbirdRawSHA256} from './raw-sha256.mjs';
function docRoot(doc,url){if(doc?.reason||doc?.http_status!==200||!sameURL(doc?.requested_url,url)||!sameURL(doc?.url,url)||typeof doc.html!=='string')throw Error('hummingbird_source_document_binding_required');return parseHtml(doc.html);}
function inactive(root,node){return nodes(root,n=>n.start<=node.start&&n.end>=node.end&&(n.attrs?.disabled!==undefined||n.attrs?.readonly!==undefined||n.attrs?.hidden!==undefined||n.attrs?.['aria-disabled']==='true'||n.attrs?.['aria-hidden']==='true'||/display\s*:\s*none|visibility\s*:\s*hidden/i.test(n.attrs?.style??''))).length>0;}
function scriptJSON(root,id){const s=nodes(root,n=>n.tag==='script'&&n.attrs.id===id&&n.attrs.type==='application/json');if(s.length!==1)throw Error('hummingbird_published_widget_binding_required');try{return JSON.parse(text(s[0],{scoped:false}));}catch{throw Error('hummingbird_published_widget_binding_required');}}
function traderWidget(doc){
 const root=docRoot(doc,HUMMINGBIRD_TRADE),body=text(root),widgets=nodes(root,n=>n.attrs?.id===WIDGET,{scoped:true});
 if(widgets.length!==1||inactive(root,widgets[0]))throw Error('hummingbird_active_trader_widget_required');
 const widget=widgets[0],forms=nodes(widget,n=>n.tag==='form',{scoped:true}),form=forms[0];if(forms.length!==1||inactive(root,form))throw Error('hummingbird_active_trader_form_required');
 const model=scriptJSON(root,'wix-viewer-model'),warmup=scriptJSON(root,'wix-warmup-data'),types=warmup.pages?.compIdToTypeMap;
 const scripts=model.siteFeaturesConfigs?.platform?.appsScripts?.urls?.[FORMS_APP];
 if(model.requestUrl!==HUMMINGBIRD_TRADE||model.mode?.qa!==false||model.mode?.debug!==false||model.siteFeaturesConfigs?.platform?.debug?.disablePlatform!==false||types?.[WIDGET]!=='AppWidget'||types?.[SUBMIT]!=='SiteButton'||!Array.isArray(scripts)||!scripts.some(u=>/^https:\/\/static\.parastorage\.com\/services\/forms-viewer\/\d+\.\d+\.\d+\/viewerScript\.bundle\.min\.js$/.test(u)))throw Error('hummingbird_published_widget_binding_required');
 const fields=[['input_comp-m60m84ko','input','TextInput',/^Business Name$/i],['input_comp-m60lzkcf1','input','TextInput',/^Email$/i],['textarea_comp-m60n0u2g','textarea','TextAreaInput',/^Please provide details of what you sell$/i],['textarea_comp-m60n9lgi','textarea','TextAreaInput',/^Dates of the events you wish to book\. Please be specific and use venue names\.$/i]];
 for(const[id,tag,type,label]of fields){const controls=nodes(form,n=>n.tag===tag&&n.attrs.id===id,{scoped:true}),labels=nodes(form,n=>n.tag==='label'&&n.attrs.for===id&&label.test(clean(text(n))),{scoped:true}),component=id.replace(/^(?:input|textarea)_/,'');
  if(controls.length!==1||labels.length!==1||inactive(root,controls[0])||types[component]!==type||id.includes('lzkcf1')&&controls[0].attrs.type!=='email')throw Error('hummingbird_bound_trader_controls_required');
  for(const update of warmup.platform?.ssrPropsUpdates??[])if(update[component]?.disabled===true||update[component]?.hidden===true||update[component]?.readOnly===true)throw Error('hummingbird_bound_trader_controls_required');
 }
 const buttons=nodes(form,n=>n.tag==='button'&&n.attrs['aria-disabled']==='false'&&n.attrs['aria-label']==='Submit'&&clean(text(n))==='Submit',{scoped:true}),submit=nodes(form,n=>n.attrs?.id===SUBMIT,{scoped:true});
 if(buttons.length!==1||submit.length!==1||!(submit[0].start<=buttons[0].start&&submit[0].end>=buttons[0].end)||inactive(root,buttons[0]))throw Error('hummingbird_application_submit_not_proved');
 if(!/Little Hummingbird Events are always on the look out for new traders/i.test(body)||!/Below is our latest updated events calendar and booking form\. To book an event, you simply need to complete the form\./i.test(body)||!/Once we receive your booking we will contact you[^.]{0,150}to confirm bookings\./i.test(body))throw Error('hummingbird_dated_booking_purpose_required');
 // These precise conditional notices apply ONLY to image rows marked Sold Out.
 // The reviewed image has no such marks. Changed/unconditional notices still hold.
 let restrictions=norm(body).replace(/events marked as 'sold out' can still be booked, you will be placed on the waiting list\./g,'').replace(/we do get some trader dropouts at most events for various reasons, so we always keep an updated waiting list\./g,'').replace(/if you are placed on the waiting list, we will confirm this and you will be informed of a pitch when\/if one becomes available\./g,'').replace(/events shown as 'sold out' refer to trader pitches only\./g,'');
 if(/\b(?:sold out|fully booked|wait(?:ing)?\s*list|not accepting (?:traders?|applications?|bookings?)|(?:applications?|bookings?|registration) (?:are |is )?(?:closed|not open)|(?:event|market|fair)s? (?:are |is )?(?:cancelled|canceled|postponed)|members? only|invitation only)\b/.test(restrictions))throw Error('hummingbird_restricted_or_closed_applications');
 const images=nodes(root,n=>n.tag==='img'&&n.attrs.id==='img_comp-mhetx5qm'&&hummingbirdCalendar(n.attrs.src),{scoped:true});
 if(images.length!==1||inactive(root,images[0]))throw Error('hummingbird_current_reviewed_calendar_binding_required');
 return {calendar_url:images[0].attrs.src,widget_id:WIDGET,submit_id:SUBMIT,labels:fields.map(f=>f[0]),published_script:scripts.find(u=>u.includes('/forms-viewer/')),booking_basis:'Dated booking request; organiser confirmation and deposit required. Sold-out rows are waiting list only.'};
}
export function reviewedHummingbirdImage(doc){
 const review=hummingbirdCalendar(doc?.requested_url);
 if(!review||doc?.reason||doc?.http_status!==200||doc.url!==review.url||typeof doc.image_base64!=='string'||doc.image_base64.length>1398104)throw Error('hummingbird_calendar_raw_receipt_required');
 let raw;try{raw=atob(doc.image_base64);}catch{throw Error('hummingbird_calendar_raw_receipt_required');}
 const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0)),digest=sha256(bytes);
 const representation=review.representations.find(r=>r.content_type===doc.content_type&&r.bytes===bytes.length&&r.sha256===digest);
 if(!representation)throw Error('hummingbird_calendar_changed_requires_review');
 return {sha256:digest,byte_count:bytes.length,source_updated:review.source_updated,reviewed_at:review.reviewed_at,reviewer:review.reviewer,review_kind:'visual_exact_dated_rows',sold_out_marks:review.sold_out_marks};
}

function operatorVenue(doc,venue){
 const root=docRoot(doc,HUMMINGBIRD_VENUES),paragraphs=nodes(root,n=>['p','h2','h3'].includes(n.tag),{scoped:true});
 const name=venue.name.toUpperCase(),labels=paragraphs.filter(n=>clean(text(n)).toUpperCase().startsWith(name));if(labels.length!==1)throw Error('hummingbird_named_operator_venue_required');
 const label=labels[0],following=paragraphs.find(n=>n.start>label.end&&Object.values(VENUES).some(v=>clean(text(n)).toUpperCase().startsWith(v.name.toUpperCase()))),end=following?.start??doc.html.length;
 const links=nodes(root,n=>n.tag==='a'&&n.start>=label.start&&n.end<=end&&sameURL(n.attrs.href,venue.link)&&clean(text(n))==='VISIT WEBSITE',{scoped:true});
 if(links.length!==1||links[0].start-label.start>15000)throw Error('hummingbird_operator_venue_route_binding_required');return {name:venue.name,excerpt:clean(text(label)),official_link:links[0].attrs.href};
}
function venueAddress(doc,venue){
 const root=docRoot(doc,venue.url);let values=[];
 if(venue.label==='FLEMINGATE SHOPPING CENTRE')values=nodes(root,n=>n.tag==='p',{scoped:true}).map(n=>clean(text(n))).map(s=>s.match(/\bFind us at (Flemingate, Beverley, East Yorkshire, [A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\./)?.[1]).filter(Boolean);
 if(venue.label==='HORNSEA VILLAGE')values=nodes(root,n=>hasClass(n,'location-details__address'),{scoped:true}).map(n=>clean(text(n))).filter(s=>/^Hornsea Village, Rolston Road, Hornsea, [A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/.test(s));
 if(venue.label==='TEMPLE NEWSAM ESTATE')values=nodes(root,n=>hasClass(n,'richtext'),{scoped:true}).map(n=>clean(text(n))).map(s=>s.match(/^Address (Temple Newsam Temple Newsam Road Leeds [A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\s+Get directions\b/)?.[1]).filter(Boolean);
 if(venue.label==='THORESBY')values=nodes(root,n=>n.tag==='p',{scoped:true}).map(n=>clean(text(n))).map(s=>s.match(/^(Thoresby Estate, Thoresby Park, Newark, Nottinghamshire\. [A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\s*[–-]\s*Get directions$/)?.[1]).filter(Boolean);
 if(venue.label.startsWith('RUFFORD ABBEY')){
  // The named visitor park address is in the real footer. A hidden menu copy
  // and unrelated company/footer postcodes cannot replace this exact block.
  values=nodes(root,n=>n.tag==='footer',{scoped:false}).filter(n=>!inactive(root,n)).flatMap(f=>nodes(f,n=>n.tag==='p',{scoped:false}).filter(n=>!inactive(root,n)).map(n=>clean(text(n,{scoped:false})))).filter(s=>/^Rufford Abbey Country Park Ollerton Nottinghamshire [A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/.test(s));
 }
 if(venue.label==='HESSLE TOWN HALL')values=nodes(root,n=>hasClass(n,'address'),{scoped:true}).filter(n=>!inactive(root,n)).map(n=>clean(text(n))).filter(s=>/^Town Hall South Lane Hessle East Yorkshire [A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/.test(s));
 if(venue.label==='HULL MINSTER'){
  const scopes=nodes(root,n=>n.attrs?.id==='siteInfo',{scoped:false});
  if(scopes.length!==1||inactive(root,scopes[0]))throw Error('hummingbird_official_physical_venue_country_required');
  const addresses=nodes(scopes[0],n=>n.tag==='span'&&hasClass(n,'site-address'),{scoped:false}).filter(n=>!inactive(root,n));
  if(addresses.length!==1||clean(text(addresses[0],{scoped:false}))!=='Hull Minster, South Church Side, Hull, England, HU1, United Kingdom')throw Error('hummingbird_official_physical_venue_country_required');
  return {address:clean(text(addresses[0],{scoped:false})),country:'GB',nation:'England',postcode_district:'HU1',country_basis:'explicit_named_physical_venue_address'};
 }
 values=[...new Set(values)];if(values.length!==1)throw Error('hummingbird_official_visitor_address_required');const codes=[...values[0].matchAll(/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/g)].map(m=>ukPostcode(m[0]));
 if(codes.length!==1||codes[0]!==venue.postcode)throw Error('hummingbird_venue_postcode_changed_requires_review');return {address:values[0],postcode:codes[0]};
}
export function hummingbirdVisitorAddress(document,label){const venue=hummingbirdVenue(label);if(!venue)throw Error('hummingbird_calendar_venue_alias_requires_proof');return venueAddress(document,venue);}
function currentVenueProgramme(doc,venue,row){
 const root=docRoot(doc,venue.programme);let excerpt,route,restrictions;
 if(venue.label.startsWith('RUFFORD ABBEY')){
  const night=venue.label==='RUFFORD ABBEY NIGHT',title=night?'Twilight at Rufford':'Abbey Artisan and Makers Market',date={'2026-10-25':'25 Oct','2026-10-30':'30 Oct','2026-11-29':'29 Nov'}[row.date];
  route='https://ruffordabbey.co.uk/events/'+(night?'twilight-at-rufford/':'abbey-artisan-and-makers-market/');
  const cards=nodes(root,n=>hasClass(n,'event-card-body'),{scoped:true}).filter(n=>!inactive(root,n)&&nodes(n,h=>h.tag==='h4'&&clean(text(h))===title,{scoped:true}).length===1&&nodes(n,d=>hasClass(d,'event-dates')&&clean(text(d))===date,{scoped:true}).length===1&&nodes(n,a=>a.tag==='a'&&sameURL(a.attrs.href,route),{scoped:true}).length===1);
  if(!date||cards.length!==1)throw Error('hummingbird_exact_venue_programme_required');excerpt=clean(text(cards[0]));restrictions=excerpt;
  if(!/Rufford Abbey Country Park/.test(excerpt)||!(night?/mini courtyard market open until 7pm/i:/collaboration with Little Hummingbird Events/i).test(excerpt))throw Error('hummingbird_exact_venue_programme_required');
 }else if(venue.label==='HESSLE TOWN HALL'){
  const body=text(root),locations=nodes(root,n=>hasClass(n,'event_information'),{scoped:true});
  const links=nodes(root,n=>n.tag==='a'&&clean(text(n))==='To apply for a stand at the Community Makers Market, please click here.',{scoped:true}).filter(n=>{try{const u=new URL(n.attrs.href);return !u.username&&!u.password&&!u.hash&&[...u.searchParams.keys()].every(k=>k==='fbclid')&&sameURL(u.origin+u.pathname,HUMMINGBIRD_TRADE);}catch{return false;}});
  if(locations.length!==1||!/at Hessle Town Hall, HU13 0RR\b/.test(text(locations[0]))||!/Hosted by Little Hummingbird Events/.test(body)||links.length!==1||inactive(root,links[0]))throw Error('hummingbird_exact_venue_programme_required');
  excerpt=clean(text(locations[0]))+'; Hosted by Little Hummingbird Events; application for a stand at the Community Makers Market.';route=HUMMINGBIRD_TRADE;restrictions=body;
 }else throw Error('hummingbird_exact_venue_programme_required');
 if(/sold out|fully booked|wait(?:ing)?\s*list|cancelled|canceled|postponed|applications? (?:are )?closed/i.test(restrictions))throw Error('hummingbird_restricted_or_closed_applications');
 return {calendar_label:row.label,official_venue:venue.name,date_from_reviewed_calendar:row.date,programme_excerpt:excerpt,official_route:route,binding_basis:'Exact literal reviewed calendar venue, named official visitor venue and current venue programme; original labels retained.'};
}
export function hummingbirdProgrammeBinding(document,label,date){const row=HUMMINGBIRD_CALENDARS.flatMap(c=>c.rows).find(r=>r.label===label&&r.date===date),venue=hummingbirdVenue(label);if(!row||!venue?.programme)throw Error('hummingbird_exact_venue_programme_required');return currentVenueProgramme(document,venue,row);}
function thoresbyContact(doc,address){
 const root=docRoot(doc,VENUES.THORESBY.contact),visitor=venueAddress({...doc,requested_url:VENUES.THORESBY.url,url:VENUES.THORESBY.url},VENUES.THORESBY);
 const office=nodes(root,n=>n.tag==='p',{scoped:true}).map(n=>clean(text(n))).filter(s=>/^All post should be directed to Thoresby Estate Office, Thoresby Park, Newark, Nottinghamshire\. NG22 9EQ\b/.test(s));
 if(visitor.postcode!==address.postcode||office.length!==1)throw Error('hummingbird_visitor_office_address_scope_required');return {visitor_address:visitor.address,postal_correspondence_address:office[0],visitor_postcode:address.postcode,estate_office_postcode:'NG229EQ',directions_href_is_not_visitor_address_proof:true};
}
export function verifyHummingbirdBundle(document,{now=new Date().toISOString(),version='source-proof-v1',applicationPolicy='current-application-v1.1'}={}){
 const report={version,application_policy:applicationPolicy,adapter_version:HUMMINGBIRD_ADAPTER_VERSION,profile:'littlehummingbird',page_kind:'unproved',source_url:document?.url,checked_at:document?.fetched_at,status:'unverified',facts:{},reasons:[],evidence:[]};
 try{
  if(document?.reason)throw Error(document.reason);let row=hummingbirdGroup(document?.source_identifier);const venue=row&&hummingbirdVenue(row.label);
  if(!row||!hummingbirdURL(document.requested_url)||!hummingbirdURL(document.url)||![HUMMINGBIRD_ADAPTER_VERSION,'hummingbird-reviewed-calendar-trader-widget-v2'].includes(document.adapter_version)||!Array.isArray(document.documents))throw Error('hummingbird_reviewed_event_identity_required');
  if(!venue)throw Error('hummingbird_calendar_venue_alias_requires_proof');
  const docs=document.documents,clocks=docs.map(d=>Date.parse(d.fetched_at)),expected=3+(venue.link?1:0)+(venue.postcode?1:0)+(venue.contact?1:0)+(venue.programme?1:0);if(docs.length!==expected||clocks.some(c=>!Number.isFinite(c)||c>Date.parse(now))||document.fetched_at!==new Date(Math.min(...clocks)).toISOString())throw Error('hummingbird_source_bundle_freshness_invalid');
  const one=url=>{const ds=docs.filter(d=>sameURL(d.url,url));if(ds.length!==1)throw Error('hummingbird_source_document_binding_required');return ds[0];};
  const trade=one(HUMMINGBIRD_TRADE),widget=traderWidget(trade),image=one(widget.calendar_url),calendar=reviewedHummingbirdImage(image),operator=venue.link?one(HUMMINGBIRD_VENUES):null,visitor=one(venue.url),address=venueAddress(visitor,venue),programme=venue.programme?one(venue.programme):null,binding=operator?operatorVenue(operator,venue):programme?currentVenueProgramme(programme,venue,row):{calendar_label:row.label,official_venue:venue.name,binding_basis:'Exact literal reviewed calendar label and named official physical venue address.'},geo=venue.postcode?docs.find(d=>d.document_kind==='uk_postcode_receipt'||d.json_text):null,country=venue.postcode?postcodeProof(geo,address.postcode,{now}):address.country==='GB'?{country:'GB',nation:address.nation,basis:address.country_basis}:null;
  row=hummingbirdGroup(document.source_identifier,widget.calendar_url);if(!row)throw Error('hummingbird_event_removed_from_current_calendar');
  if(!country)throw Error('hummingbird_exact_venue_country_proof_required');const office=venue.contact?thoresbyContact(one(venue.contact),address):null;
  report.page_kind='event';report.facts={event_name:row.label,organiser:'Little Hummingbird Events',location:venue.physical_country?address.address:venue.name+', '+address.address+', '+country.nation,event_start:row.date,event_end:row.end_date,country:'GB',...venue.physical_country?{}:{region_code:country.region??country.nation},canonical_url:HUMMINGBIRD_TRADE,source_platform:'littlehummingbird',source_identifier:row.source_identifier,application_url:HUMMINGBIRD_TRADE,application_state:'UNKNOWN'};
  report.application_heading='Little Hummingbird Events trader booking form';report.application_scope_proof={trader_application:true,restricted_audience:false,guaranteed_vendor_space:false,application_role:'trader'};report.nation=country.nation;
  report.evidence=[{kind:'reviewed_calendar_exact_dated_group',source_url:image.url,excerpt:stableJson({...calendar,label:row.label,start:row.date,end:row.end_date,source_identifier:row.source_identifier})},{kind:'published_event_bound_trader_widget',source_url:trade.url,excerpt:stableJson(widget)},{kind:operator?'operator_named_venue_route':'reviewed_calendar_named_official_venue_binding',source_url:operator?.url??programme?.url??visitor.url,excerpt:stableJson(binding)},{kind:'official_named_visitor_address',source_url:visitor.url,excerpt:stableJson(address)},{kind:geo?'exact_postcode_country':'explicit_named_physical_venue_country',source_url:geo?.url??visitor.url,excerpt:stableJson(country)},...office?[{kind:'visitor_vs_estate_office_scope',source_url:venue.contact,excerpt:stableJson(office)}]:[]];
  if(row.end_date<now.slice(0,10)){report.reasons=['stale_edition'];report.status='partial';}else{report.facts.application_state='OPEN_NOW';report.status='verified';}
 }catch(e){report.reasons=[/^[a-z_]+$/.test(e.message)?e.message:'hummingbird_source_structure_changed'];report.status=/identity|visitor_office|postcode_changed/.test(report.reasons[0])?'quarantine':'unverified';}
 return report;
}
async function fetchCalendar({fetcher,now,url}){
 if(!hummingbirdCalendar(url))throw Error('hummingbird_current_reviewed_calendar_binding_required');
 const meta={requested_url:url,url,fetched_at:now,document_kind:'hummingbird_calendar_image'};
 try{const r=await fetcher(url,{redirect:'manual',headers:{Accept:'image/avif,image/webp,image/png','User-Agent':'FindPitches-V3-Shadow-Verification/1.0'},signal:AbortSignal.timeout(12000)});if(!r.ok)return {...meta,http_status:r.status,reason:'hummingbird_calendar_http_failure'};
  const content_type=r.headers.get('content-type')?.split(';')[0];if(!hummingbirdCalendar(url).representations.some(r=>r.content_type===content_type))return {...meta,http_status:r.status,content_type,reason:'hummingbird_calendar_representation_changed'};
  const parts=[],reader=r.body.getReader();let size=0;try{for(;;){const{done,value}=await reader.read();if(done)break;size+=value.length;if(size>1048576){await reader.cancel();return {...meta,reason:'hummingbird_calendar_size_limit'};}parts.push(value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length;}let raw='';for(let i=0;i<bytes.length;i+=16384)raw+=String.fromCharCode(...bytes.subarray(i,i+16384));return {...meta,http_status:r.status,content_type,bytes:size,image_base64:btoa(raw),content_hash:sha256(bytes)};
 }catch{return {...meta,reason:'hummingbird_calendar_fetch_failed'};}
}
export async function fetchHummingbirdProgramme({fetcher=fetch,now=new Date().toISOString(),visit=null,url=HUMMINGBIRD_TRADE,sourceIdentifier=null}={}){
 if(!hummingbirdURL(url)||sourceIdentifier&&!hummingbirdGroup(sourceIdentifier))throw Error('hummingbird_reviewed_event_identity_required');
 const read=async u=>{const doc=await fetchSourceDocument(u,{fetcher,now});if(visit)await visit(doc);return doc;},trade=await read(HUMMINGBIRD_TRADE),operator=await read(HUMMINGBIRD_VENUES),held=[],bundles=[];
 let widget;try{widget=traderWidget(trade);}catch(e){return {bundles,held:[{source_identifier:sourceIdentifier,reason:e.message}]};}
 const image=await fetchCalendar({fetcher,now,url:widget.calendar_url});if(visit)await visit(image);try{reviewedHummingbirdImage(image);}catch(e){return {bundles,held:[{source_identifier:sourceIdentifier,reason:e.message}]};}
 const selected=hummingbirdGroups(widget.calendar_url).filter(r=>!sourceIdentifier||r.source_identifier===sourceIdentifier),cached=new Map();
 for(const row of selected){const venue=hummingbirdVenue(row.label);if(!venue){held.push({source_identifier:row.source_identifier,reason:'hummingbird_calendar_venue_alias_requires_proof'});continue;}if(row.end_date<now.slice(0,10)){held.push({source_identifier:row.source_identifier,reason:'stale_edition'});continue;}
  if(!cached.has(venue.url)){try{if(venue.link)operatorVenue(operator,venue);const visitor=await read(venue.url),address=venueAddress(visitor,venue),geo=venue.postcode?await fetchUKPostcode(address.postcode,{fetcher,now}):null;if(visit&&geo)await visit(geo);const contact=venue.contact?await read(venue.contact):null,programme=venue.programme?await read(venue.programme):null;cached.set(venue.url,[trade,...venue.link?[operator]:[],image,visitor,...geo?[geo]:[],...contact?[contact]:[],...programme?[programme]:[]]);}catch(e){cached.set(venue.url,{reason:/^[a-z_]+$/.test(e.message)?e.message:'hummingbird_venue_proof_missing'});}}
  const documents=cached.get(venue.url);if(!Array.isArray(documents)){held.push({source_identifier:row.source_identifier,reason:documents.reason});continue;}
  if(venue.programme){try{currentVenueProgramme(documents.find(d=>sameURL(d.url,venue.programme)),venue,row);}catch(e){held.push({source_identifier:row.source_identifier,reason:e.message});continue;}}
  bundles.push({document_kind:'hummingbird_official_bundle',adapter_version:HUMMINGBIRD_ADAPTER_VERSION,requested_url:HUMMINGBIRD_TRADE,url:HUMMINGBIRD_TRADE,source_identifier:row.source_identifier,fetched_at:new Date(Math.min(...documents.map(d=>Date.parse(d.fetched_at)))).toISOString(),documents,content_hash:await hash(documents)});
 }return {bundles,held};
}
export async function fetchHummingbirdBundle(url,sourceIdentifier,options={}){
 if(!hummingbirdGroup(sourceIdentifier))throw Error('hummingbird_reviewed_event_identity_required');const result=await fetchHummingbirdProgramme({...options,url,sourceIdentifier});return result.bundles.find(b=>b.source_identifier===sourceIdentifier)??{document_kind:'hummingbird_official_bundle',adapter_version:HUMMINGBIRD_ADAPTER_VERSION,requested_url:url,url,source_identifier:sourceIdentifier,fetched_at:options.now??new Date().toISOString(),documents:[],reason:result.held[0]?.reason??'hummingbird_current_dated_event_not_proved'};
}
