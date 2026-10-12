// CCA is a multi-event booking programme. A control, dated event row,
// venue address and current trader form must agree before one event is READY.
import {hash,stableJson} from './contract.mjs';
import {parseHtml,nodes,first,text} from './source-dom.mjs';
import {fetchSourceDocument} from './source-document.mjs';
import {ukDate} from './uk-sources.mjs';

export const CCA_ADAPTER_VERSION='cca-dated-trader-booking-v1';
export const CCA_ORIGIN='https://www.creativecrafts-online.co.uk';
export const CCA_BOOKING=CCA_ORIGIN+'/booking-form/';
const NEXT=CCA_BOOKING+'Next-Step.asp',DIRECTIONS=CCA_ORIGIN+'/craft-event-directions/';
const norm=s=>String(s??'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const absolute=(s,base)=>{try{return new URL(s,base).href;}catch{return null;}};
const postcode=s=>String(s??'').replace(/\s/g,'').toUpperCase();
const date=s=>ukDate(s,String(s??'').match(/\b(20\d{2})$/)?.[1]);
const inactive=(root,control)=>control.attrs.disabled!==undefined||control.attrs.readonly!==undefined||control.attrs.type==='hidden'||nodes(root,n=>n.start<=control.start&&n.end>=control.end&&(n.attrs?.hidden!==undefined||n.attrs?.['aria-hidden']==='true'||n.tag==='fieldset'&&n.attrs.disabled!==undefined)).length>0;
export function ccaVenueUrl(value) {try{const u=new URL(value);return u.origin===CCA_ORIGIN&&!u.username&&!u.password&&!u.search&&!u.hash&&/^\/craft-events\/\d+\/[^/]+$/.test(u.pathname);}catch{return false;}}
const docRoot=(doc,url)=>{if(!doc||doc.reason||doc.requested_url!==url||doc.url!==url||!doc.html)throw Error('cca_source_route_or_document_missing');return parseHtml(doc.html);};
function branded(root) {return nodes(root,n=>n.tag==='meta'&&['description','subject'].includes(n.attrs.name?.toLowerCase())).some(n=>/\bCreative Crafts Association\b/.test(n.attrs.content??''));}
export function parseCCABooking(document) {
  const root=docRoot(document,CCA_BOOKING),forms=nodes(root,n=>n.tag==='form',{scoped:true});
  const form=forms[0];if(!branded(root)||forms.length!==1||form.attrs.name!=='Booking_Form'||form.attrs.method?.toLowerCase()!=='post'||absolute(form.attrs.action,CCA_BOOKING)!==NEXT||!/^Please choose the event\(s\) that you wish to make a booking for:/i.test(text(form)))throw Error('cca_dated_booking_structure_changed');
  if(!nodes(form,n=>n.tag==='input'&&n.attrs.type==='submit'&&!inactive(root,n)&&/^PROCEED\s*>>$/.test(n.attrs.value??''),{scoped:true}).length)throw Error('cca_application_submit_not_proved');
  const choices=[],labels=nodes(form,n=>n.tag==='label',{scoped:true}),seen=new Set();
  for(const control of nodes(form,n=>n.tag==='input'&&n.attrs.type==='checkbox'&&/^checkboxG\d+$/.test(n.attrs.id??''),{scoped:true})) {
    if(control.attrs.name!==control.attrs.id||seen.has(control.attrs.id))throw Error('cca_duplicate_or_unbound_event_control');seen.add(control.attrs.id);
    const bound=labels.filter(n=>n.attrs.for===control.attrs.id);if(bound.length!==1)throw Error('cca_exact_label_required');
    const title=text(first(bound[0],n=>n.tag==='b')),label=text(bound[0]);
    const dates=label.match(/\((\d{1,2}\s+[A-Za-z]+\s+20\d{2})\s*-\s*(\d{1,2}\s+[A-Za-z]+\s+20\d{2})\)\s*$/);
    const start=dates&&date(dates[1]),end=dates&&date(dates[2]);
    const reason=!title||!start||!end?'cca_explicit_event_dates_required':end<start?'contradictory_event_dates':/^Gazebo space\b/i.test(title)?'cca_space_variant_excluded':inactive(root,control)?'application_closed':null;
    choices.push({control_id:control.attrs.id,source_identifier:control.attrs.id+':'+(start??'unknown')+':'+(end??'unknown'),title,start,end,reason,label});
  }
  if(!choices.length||choices.length>100)throw Error('cca_bounded_event_controls_required');return choices;
}
export function ccaVenues(document) {
  const root=docRoot(document,DIRECTIONS),entries=[];
  for(const a of nodes(root,n=>n.tag==='a'&&ccaVenueUrl(n.attrs.href),{scoped:true})) {
    const id=new URL(a.attrs.href).pathname.split('/')[2],next=nodes(root,n=>n.tag==='iframe'&&n.start>a.end)[0];
    const prior=nodes(root,n=>n.tag==='a'&&n.attrs.name==='Location'+id&&n.end<=a.start).at(-1);
    if(!prior||a.start-prior.end>250||!next||next.start-a.end>4000)continue;
    const segment=document.html.slice(a.end,next.start),slice=parseHtml(segment);
    if(nodes(slice,n=>n.tag==='a'&&ccaVenueUrl(n.attrs.href)).length)continue;
    const address=text(slice),matches=[...address.matchAll(/\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/g)];
    // Some venue entries repeat the same postcode in their driving notes.
    // Repetition is corroboration; two different codes remain ambiguous.
    if(!matches.length||new Set(matches.map(m=>postcode(m[1]))).size!==1)continue;
    entries.push({url:a.attrs.href,venue:text(a),id,postcode:matches[0][1],address:address.slice(0,matches[0].index+matches[0][0].length)});
  }
  return [...new Map(entries.map(v=>[v.url,v])).values()];
}
function venueRows(document,venue) {
  const root=docRoot(document,venue.url),headings=nodes(root,n=>n.tag==='h1',{scoped:true});
  const heading=text(headings[0]),headingYears=heading.match(/\bfor\s+(20\d{2})(?:\s*[-–]\s*(20\d{2}))?$/i);
  if(headings.length!==1||!headingYears||norm(heading.slice(0,headingYears.index))!==norm('Craft Shows and Events at '+venue.venue))throw Error('cca_source_event_identity_mismatch');
  const rows=[];
  for(const table of nodes(root,n=>n.tag==='table'&&n.attrs.id==='events',{scoped:true})) {
    let month=null,year=null;
    for(const tr of nodes(table,n=>n.tag==='tr',{scoped:true})) {
      const cells=tr.children.filter(n=>n.tag==='td'||n.tag==='th');
      if(cells.length===1) {const m=text(cells[0]).match(/^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d{2})$/i);if(m){month=m[1];year=m[2];}continue;}
      if(cells.length!==2||!month||!year)continue;
      const day=text(cells[0]).replace(/\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/g,'').replace(/\s*(?:st|nd|rd|th)\b/g,'').trim();
      const m=day.match(/^(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?$/);if(!m)continue;
      const start=date(m[1]+' '+month+' '+year),end=date((m[2]??m[1])+' '+month+' '+year);
      const weekday=text(cells[0]).match(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/g)??[],days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
      const weekdayValid=start&&end&&(!weekday.length||weekday[0]===days[new Date(start+'T12:00:00Z').getUTCDay()]&&weekday.at(-1)===days[new Date(end+'T12:00:00Z').getUTCDay()]);
      const editionValid=Number(year)>=Number(headingYears[1])&&Number(year)<=Number(headingYears[2]??headingYears[1]);
      const links=nodes(cells[1],n=>n.tag==='a'&&n.attrs.href,{scoped:true}).map(n=>absolute(n.attrs.href,document.url));
      const apps=links.filter(u=>{try{const x=new URL(u);return x.origin===CCA_ORIGIN&&x.pathname==='/booking-form/'&&x.searchParams.size===1&&date(x.searchParams.get('event_date'))===start;}catch{return false;}});
      const direction=links.includes(DIRECTIONS+'#Location'+venue.id);
      // The title is the event cell's text; image-only action links add no title.
      rows.push({title:text(cells[1]),start,end,booking:apps.length===1&&direction,weekday_valid:Boolean(weekdayValid),edition_valid:editionValid});
    }
  }
  return rows;
}
export const ccaPostcodeUrl=p=>'https://api.postcodes.io/postcodes/'+encodeURIComponent(p.replace(/\s/g,''));
async function fetchPostcode(p,{fetcher,now}) {
  const url=ccaPostcodeUrl(p),meta={requested_url:url,url,fetched_at:now};
  try {
    const r=await fetcher(url,{redirect:'manual',headers:{Accept:'application/json','User-Agent':'FindPitches-V3-Shadow-Verification/1.0'},signal:AbortSignal.timeout(12000)});
    if(!r.ok)return {...meta,http_status:r.status,reason:'postcode_http_'+r.status};
    if(!/application\/json/i.test(r.headers.get('content-type')??''))return {...meta,http_status:r.status,reason:'cca_postcode_format_not_proved'};
    const reader=r.body.getReader(),parts=[];let size=0;try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>65536){await reader.cancel();return {...meta,reason:'cca_postcode_size_limit'};}parts.push(value);}}finally{reader.releaseLock();}
    const bytes=new Uint8Array(size);let i=0;for(const p of parts){bytes.set(p,i);i+=p.length;}
    const raw=new TextDecoder().decode(bytes);JSON.parse(raw);return {...meta,http_status:r.status,json_text:raw,content_hash:await hash(raw)};
  }catch{return {...meta,reason:'cca_postcode_fetch_failed'};}
}
function traderForm(document) {
  const root=docRoot(document,NEXT),forms=nodes(root,n=>n.tag==='form',{scoped:true}),f=forms[0];
  if(!branded(root)||forms.length!==1||f.attrs.name!=='Booking_Form'||f.attrs.method?.toLowerCase()!=='post'||absolute(f.attrs.action,NEXT)!==CCA_BOOKING+'Next-Step2_new.asp')return false;
  const bound=(name,tag,label)=>nodes(f,n=>n.tag==='tr',{scoped:true}).some(tr=>{const cells=tr.children.filter(n=>n.tag==='td');return cells.length===2&&label.test(text(cells[0]))&&nodes(cells[1],n=>n.tag===tag&&n.attrs.name===name&&['text',''].includes(n.attrs.type??'')&&!inactive(root,n),{scoped:true}).length===1;});
  return bound('Trading_name','input',/^Trading Name\s*\*?$/i)&&nodes(f,n=>n.tag==='textarea'&&n.attrs.name==='Crafts'&&!inactive(root,n),{scoped:true}).length===1&&/\b(?:crafts?|products?)\b/i.test(text(f))&&nodes(f,n=>n.tag==='input'&&n.attrs.type==='submit'&&!inactive(root,n)&&/^PROCEED\s*>>$/.test(n.attrs.value??''),{scoped:true}).length===1;
}
export function verifyCCABundle(document,{now,version,applicationPolicy}) {
  const report={version,application_policy:applicationPolicy,source_url:document.url,checked_at:document.fetched_at,profile:'creativecrafts',adapter_version:CCA_ADAPTER_VERSION,status:'unverified',page_kind:'unproved',facts:{},reasons:[],evidence:[]};
  try {
    if(document.adapter_version!==CCA_ADAPTER_VERSION||!Array.isArray(document.documents)||document.documents.length!==5||!ccaVenueUrl(document.url)||document.requested_url!==document.url)throw Error('cca_bundle_structure_changed');
    const docs=document.documents,clocks=docs.map(d=>Date.parse(d.fetched_at));
    if(clocks.some(t=>!Number.isFinite(t)||t>Date.parse(now))||document.fetched_at!==new Date(Math.min(...clocks)).toISOString())throw Error('cca_source_bundle_freshness_invalid');
    const booking=docs.find(d=>d.url===CCA_BOOKING),choices=parseCCABooking(booking),choice=choices.find(c=>c.source_identifier===document.source_identifier);
    if(!choice)throw Error('cca_source_event_identity_mismatch');
    if(choice.reason)throw Error(choice.reason);
    const directions=docs.find(d=>d.url===DIRECTIONS),venue=ccaVenues(directions).find(v=>v.url===document.url);
    if(!venue)throw Error('cca_venue_address_binding_required');
    const event=docs.find(d=>d.url===document.url),rows=venueRows(event,venue).filter(r=>norm(r.title)===norm(choice.title));
    if(rows.length!==1||rows[0].start!==choice.start||rows[0].end!==choice.end||!rows[0].weekday_valid||!rows[0].edition_valid)throw Error('contradictory_event_dates_or_identity');
    if(!rows[0].booking)throw Error('cca_exact_event_application_route_required');
    const facts=report.facts={event_name:choice.title,organiser:'Creative Crafts Association',location:venue.venue+', '+venue.address,event_start:choice.start,event_end:choice.end,canonical_url:event.url,source_platform:'creativecrafts',source_identifier:choice.source_identifier,application_url:CCA_BOOKING,application_state:'UNKNOWN'};
    report.page_kind='event';
    const geo=docs.find(d=>d.json_text);let nation=null,region=null;
    try{const data=JSON.parse(geo?.json_text),r=data.result;if(!geo.reason&&geo.url===ccaPostcodeUrl(venue.postcode)&&geo.requested_url===geo.url&&data.status===200&&postcode(r.postcode)===postcode(venue.postcode)&&['England','Scotland','Wales','Northern Ireland'].includes(r.country)){nation=r.country;region=r.region??r.admin_district;}}catch{}
    if(nation){facts.country='GB';facts.region_code=region??nation;facts.location+=', '+nation;report.nation=nation;}else report.reasons.push('verified_country_missing');
    const eventText=text(docRoot(event,event.url));
    if(/\b(?:this (?:event|venue|market|fair) (?:is|takes place|will be held)(?: located)?(?:\s+in(?: the)?)?|(?:event|venue) country\s*:)\s+(?:United States(?: of America)?|USA|US|Canada|Australia|New Zealand|Ireland|France|Germany)\b/i.test(eventText))report.reasons.push('contradictory_event_country_assertion');
    if(choice.end<now.slice(0,10))report.reasons.push('stale_edition');
    // The organiser explicitly directs bookings within three days to telephone.
    if(Date.parse(choice.start)-Date.parse(now.slice(0,10))<=3*86400000)report.reasons.push('cca_near_event_availability_requires_enquiry');
    const next=docs.find(d=>d.url===NEXT),purpose=traderForm(next),restricted=/\b(?:members? only|invitation only|(?:returning|existing) (?:vendors?|traders?|exhibitors?) only|non[ -]?profits? only|charit(?:y|ies) only|wait(?:ing)?\s*list|(?:applications?|bookings?|registration) (?:are |is )?(?:closed|not open)|not accepting (?:applications?|bookings?)|fully booked|sold out|(?:event |fair |market )?(?:cancelled|canceled|postponed))\b/i.test(text(docRoot(booking,CCA_BOOKING))+' '+text(docRoot(next,NEXT))+' '+text(docRoot(event,event.url)));
    if(!purpose)report.reasons.push('trader_application_purpose_not_proved');if(restricted)report.reasons.push('restricted_or_closed_application');
    report.application_heading='Creative Crafts Association Craft & Gift Booking Form';report.application_scope_proof={trader_application:purpose,restricted_audience:restricted};
    report.evidence=[{kind:'exact_dated_booking_control',source_url:CCA_BOOKING,excerpt:stableJson({control_id:choice.control_id,label:choice.label})},{kind:'official_event_row',source_url:event.url,excerpt:stableJson(rows[0])},{kind:'official_venue_postcode',source_url:DIRECTIONS,excerpt:stableJson(venue)},{kind:'exact_postcode_country',source_url:geo?.url,excerpt:stableJson({postcode:venue.postcode,nation,region})},{kind:'current_trader_form',source_url:NEXT,excerpt:stableJson({trading_name_and_crafts:purpose,method:'post',action:CCA_BOOKING+'Next-Step2_new.asp',booking_state:'application request; organiser acceptance required'})}];
    // Country postcode centroids are deliberately not emitted as venue pins.
    if(!report.reasons.length)facts.application_state='OPEN_NOW';
    report.status=restricted||report.reasons.some(r=>r.startsWith('contradictory_'))?'quarantine':report.reasons.length?'partial':'verified';
  }catch(e){report.reasons=[/^[a-z_]+$/.test(e.message)?e.message:'cca_source_structure_changed'];report.status=/identity|contradictory/.test(e.message)?'quarantine':'unverified';}
  return report;
}
// Discovery shares fresh raw programme pages; rechecks use a new complete bundle.
export async function fetchCCAProgramme({fetcher=fetch,now=new Date().toISOString(),visit=null,url=null,sourceIdentifier=null}={}) {
  const read=async u=>{const doc=await fetchSourceDocument(u,{fetcher,now});if(visit)await visit(doc);return doc;};
  const booking=await read(CCA_BOOKING),choices=parseCCABooking(booking),next=await read(NEXT),directions=await read(DIRECTIONS),venues=ccaVenues(directions),bundles=[],held=[];
  for(const choice of choices)if(choice.reason)held.push({source_identifier:choice.source_identifier,reason:choice.reason});
  const viable=choices.filter(c=>!c.reason&&c.end>=now.slice(0,10)&&(!sourceIdentifier||c.source_identifier===sourceIdentifier));
  // Only a dated row with exact title may join a booking option to a venue.
  const eligibleVenues=venues.filter(v=>(!url||v.url===url)&&!/^Gazebo\b/i.test(v.venue));
  if(eligibleVenues.length>100)throw Error('cca_bounded_venue_list_required');
  for(const venue of eligibleVenues) {
    // Discovery is bounded to venues named in a current choice. This is only a
    // fetch filter; the exact dated event row below is the proof.
    if(!viable.some(c=>norm(venue.venue).split(' ').filter(w=>w.length>3&&norm(c.title).split(' ').includes(w)).length>=2))continue;
    const event=await read(venue.url);let rows;try{rows=venueRows(event,venue);}catch{continue;}
    const selected=viable.filter(c=>rows.some(r=>norm(r.title)===norm(c.title)));
    if(!selected.length)continue;
    const geo=await fetchPostcode(venue.postcode,{fetcher,now});if(visit)await visit(geo);
    const documents=[event,booking,next,directions,geo],fetched_at=new Date(Math.min(...documents.map(d=>Date.parse(d.fetched_at)))).toISOString();
    for(const choice of selected)bundles.push({document_kind:'cca_official_bundle',adapter_version:CCA_ADAPTER_VERSION,requested_url:venue.url,url:venue.url,source_identifier:choice.source_identifier,fetched_at,documents,content_hash:await hash(documents)});
  }
  for(const choice of viable)if(!bundles.some(b=>b.source_identifier===choice.source_identifier))held.push({source_identifier:choice.source_identifier,reason:'cca_event_venue_binding_missing'});
  return {bundles,held};
}
export async function fetchCCABundle(url,sourceIdentifier,options={}) {
  const result=await fetchCCAProgramme({...options,url,sourceIdentifier});
  return result.bundles.find(b=>b.source_identifier===sourceIdentifier)??{document_kind:'cca_official_bundle',adapter_version:CCA_ADAPTER_VERSION,url,requested_url:url,source_identifier:sourceIdentifier,fetched_at:options.now??new Date().toISOString(),documents:[],reason:'cca_current_dated_event_not_proved'};
}
