// Official programme adapters: raw pages are the proof, never operator labels.
import {hash,stableJson} from './contract.mjs';
import {parseHtml,nodes,first,text,hasClass} from './source-dom.mjs';
import {fetchSourceDocument} from './source-document.mjs';

export const UK_ADAPTER_VERSION='myntimage-dated-stalls-v1';
const MONTHS=['january','february','march','april','may','june','july','august','september','october','november','december'];
const norm=s=>String(s??'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const host=u=>{try{return new URL(u).hostname.replace(/^www\./,'');}catch{return '';}};
export function myntVenueUrl(u) {try{const x=new URL(u);return x.protocol==='https:'&&x.hostname==='www.myntimage.co.uk'&&!x.port&&!x.username&&!x.password&&!x.search&&!x.hash&&/^\/events\/[a-z-]+\/$/.test(x.pathname);}catch{return false;}}
export function ukDate(value,year) {
  const m=String(value).trim().match(/^(\d{1,2})(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)(?:\s+(20\d{2}))?(?:\s*\([^)]*\))?$/i);
  if(!m||m[3]&&Number(m[3])!==Number(year))return null;
  const y=Number(m[3]??year);if(!Number.isInteger(y)||y<2020||y>2100)return null;
  const date=`${y}-${String(MONTHS.indexOf(m[2].toLowerCase())+1).padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  try{return new Date(date+'T12:00:00Z').toISOString().slice(0,10)===date?date:null;}catch{return null;}
}
const content=d=>{if(d.reason||!d.html)throw Error(d.reason??'source_document_missing');return first(parseHtml(d.html),n=>n.attrs?.id==='content_area')??null;};
export function myntVenues(document) {
  if(document.reason||!document.html||document.url!=='https://www.myntimage.co.uk/events/')return [];
  return [...new Set(nodes(parseHtml(document.html),n=>n.tag==='a'&&n.attrs.href).map(n=>{try{return new URL(n.attrs.href,document.url).href;}catch{return '';}}).filter(myntVenueUrl))];
}
export function parseMyntVenue(document) {
  if(!myntVenueUrl(document.url)||document.requested_url!==document.url)throw Error('official_venue_identity_required');
  const main=content(document);if(!main)throw Error('official_source_structure_changed');
  const headings=nodes(main,n=>n.tag==='h1',{scoped:true}),venue=text(headings[0]);
  if(headings.length!==1||!venue||!/(?:mynt\s*image)/i.test(text(first(parseHtml(document.html),n=>n.tag==='title'))+' '+text(main)))throw Error('official_venue_identity_required');
  const slug=new URL(document.url).pathname.split('/')[2],town=slug.replace(/-/g,' ');
  if(!norm(venue).includes(norm(town)))throw Error('official_venue_heading_mismatch');
  const instructions=nodes(main,n=>n.tag==='p',{scoped:true}).map(text).find(s=>/make a booking/i.test(s)&&/availabil(?:i)?ty/i.test(s)&&/application form/i.test(s));
  const scripts=nodes(main,n=>n.tag==='script'&&/^https:\/\/www\.emailmeform\.com\/builder\/forms\/jsform\/[a-zA-Z0-9]+$/.test(n.attrs.src??''));
  if(!instructions||scripts.length!==1)throw Error('dated_application_route_not_proved');
  const formUrl=scripts[0].attrs.src.replace('/forms/jsform/','/form/');
  // Navigation may DISCOVER a venue directions page; its own matching heading
  // and exact map pin must prove location. It never supplies an application.
  const links=nodes(parseHtml(document.html),n=>n.tag==='a'&&n.attrs.href).map(n=>{try{return new URL(n.attrs.href,document.url).href;}catch{return '';}});
  const directions=[...new Set(links.filter(u=>u===`https://www.myntimage.co.uk/directions/${slug}/`))];
  const rows=[],seen=new Map();let year=null,tables=0;
  const allTables=nodes(main,n=>n.tag==='table',{scoped:true});
  for(const node of nodes(main,n=>/^h[1-6]$/.test(n.tag)||n.tag==='table',{scoped:true}).sort((a,b)=>a.start-b.start)) {
    if(node.tag!=='table'){year=Number(text(node).match(/^Availability\s*(?:[-–]\s*)?(20\d{2})(?:\s*\([^)]*\))?$/i)?.[1])||null;continue;}
    if(allTables.some(t=>t!==node&&t.start<node.start&&t.end>node.end))continue;
    if(!year)continue;tables++;
    const nested=nodes(node,n=>n.tag==='table'&&n!==node),tr=nodes(node,n=>n.tag==='tr').filter(r=>!nested.some(t=>t.start<r.start&&t.end>r.end)),header=tr[0]?.children.filter(n=>['th','td'].includes(n.tag)).map(text)??[];
    if(header[0]?.trim()!=='Date'||header[1]?.trim()!=='Stall Spaces')throw Error('official_capacity_table_structure_changed');
    for(const row of tr.slice(1)) {
      const cells=row.children.filter(n=>['th','td'].includes(n.tag)).map(text);if(cells.every(x=>!x))continue;
      const date=ukDate(cells[0],year),capacity=/^\d+$/.test(cells[1]??'')?Number(cells[1]):/^(?:fully booked|full|sold out)$/i.test(cells[1]??'')?0:null;
      if(!date||capacity>10000)throw Error('official_capacity_row_requires_review');
      if(seen.has(date)&&seen.get(date)!==capacity)throw Error('contradictory_dated_capacity');
      if(seen.has(date))continue;seen.set(date,capacity);
      rows.push({date,capacity,source_identifier:`${slug}:${date}`,excerpt:`Availability - ${year}; ${header.join(' | ')}; ${cells.join(' | ')}`});
    }
  }
  if(!tables||!rows.length)throw Error('official_dated_capacity_missing');
  const paragraphs=nodes(main,n=>n.tag==='p',{scoped:true}).map(text);
  // Country must be asserted about this venue, never a contact footer/company.
  const england=paragraphs.find(s=>/\bEngland\b/i.test(s)&&norm(s).includes(norm(town)));
  return {venue,town,slug,rows,form_url:formUrl,directions_url:directions.length===1?directions[0]:null,instructions,country_excerpt:england??null};
}
export function myntPin(document,venue) {
  if(!document||document.reason||document.url!==venue.directions_url||document.requested_url!==document.url)return null;
  const main=content(document),heading=norm(text(first(main,n=>n.tag==='h1'))),full=norm('How to find the '+venue.venue);
  const kind=venue.venue.match(/(?:Town Hall|Guildhall|Corn Exchange|Community Centre|Masonic Hall|Assembly Rooms|Village Hall|Methodist Church)$/i)?.[0];
  const short=kind?norm('How to find the '+venue.town+' '+kind):null;
  if(!main||heading!==full&&heading!==short)return null;
  const maps=nodes(main,n=>n.tag==='div'&&hasClass(n,'module-type-googlemaps'),{scoped:true});
  const coords=[];for(const a of maps.flatMap(n=>nodes(n,x=>x.tag==='a'&&x.attrs.href)))try {
    const u=new URL(a.attrs.href);if(u.protocol!=='https:'||u.hostname!=='www.google.com'||u.pathname!=='/maps/search/')continue;
    const match=u.searchParams.get('query')?.match(/^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/);if(!match)continue;
    const lat=Number(match[1]),lon=Number(match[2]);if(Math.abs(lat)<=90&&Math.abs(lon)<=180)coords.push({lat,lon});
  }catch{}
  const unique=[...new Map(coords.map(c=>[stableJson(c),c])).values()];return unique.length===1?unique[0]:null;
}
export function postcodeLookupUrl(pin){return `https://api.postcodes.io/postcodes?lon=${pin.lon}&lat=${pin.lat}&radius=100&limit=1`;}
export async function fetchPostcodeDocument(pin,{fetcher=fetch,now=new Date().toISOString()}={}) {
  const url=postcodeLookupUrl(pin),meta={requested_url:url,url,fetched_at:now};
  try {
    const r=await fetcher(url,{redirect:'manual',headers:{Accept:'application/json','User-Agent':'FindPitches-V3-Shadow-Verification/1.0'},signal:AbortSignal.timeout(12000)});
    if(!r.ok)return {...meta,reason:'postcode_http_'+r.status,http_status:r.status};
    if(!/application\/json/i.test(r.headers.get('content-type')??''))return {...meta,reason:'postcode_format_not_proved'};
    const reader=r.body.getReader(),parts=[];let size=0;try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>65536){await reader.cancel();return {...meta,reason:'postcode_response_size_limit'};}parts.push(value);}}finally{reader.releaseLock();}
    const bytes=new Uint8Array(size);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length;}
    const raw=new TextDecoder().decode(bytes);JSON.parse(raw);return {...meta,http_status:r.status,json_text:raw,content_hash:await hash(raw)};
  }catch{return {...meta,reason:'postcode_fetch_failed'};}
}
function geoProof(document,pin) {
  if(!pin||document?.reason||document?.url!==postcodeLookupUrl(pin)||document.requested_url!==document.url)return null;
  try{const data=JSON.parse(document.json_text),r=data.result?.[0];if(data.status!==200||data.result.length!==1||!r||!['England','Scotland','Wales','Northern Ireland'].includes(r.country)||!Number.isFinite(r.distance)||r.distance>100||r.distance<0)return null;
    // Corroborate the returned coordinates and declared distance independently.
    const rad=Math.PI/180,dlat=(r.latitude-pin.lat)*rad,dlon=(r.longitude-pin.lon)*rad;
    const a=Math.sin(dlat/2)**2+Math.cos(pin.lat*rad)*Math.cos(r.latitude*rad)*Math.sin(dlon/2)**2;
    const distance=6371000*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));if(!Number.isFinite(distance)||distance>105||Math.abs(distance-r.distance)>10)return null;
    return {country:'GB',nation:r.country,region:r.region??r.admin_district,postcode:r.postcode,excerpt:stableJson({official_venue_pin:pin,postcode:r.postcode,country:r.country,region:r.region,distance_metres:r.distance})};
  }catch{return null;}
}
export function verifyUKBundle(document,{now,version,applicationPolicy}) {
  const report={version,application_policy:applicationPolicy,source_url:document.url,checked_at:document.fetched_at,profile:'myntimage',adapter_version:UK_ADAPTER_VERSION,status:'unverified',page_kind:'unproved',facts:{},reasons:[],evidence:[]};
  try {
    if(document.adapter_version!==UK_ADAPTER_VERSION||!Array.isArray(document.documents)||document.documents.length>4)throw Error('official_bundle_structure_changed');
    const event=document.documents[0],venue=parseMyntVenue(event),row=venue.rows.find(r=>r.source_identifier===document.source_identifier);
    if(!row||document.url!==event.url||document.requested_url!==event.requested_url)throw Error('source_event_identity_mismatch');
    const dates=document.documents.map(d=>Date.parse(d.fetched_at));if(dates.some(x=>!Number.isFinite(x)||x>Date.parse(now))||document.fetched_at!==new Date(Math.min(...dates)).toISOString())throw Error('source_bundle_freshness_invalid');
    report.page_kind='event';const form=document.documents.find(d=>d.requested_url===venue.form_url),directions=document.documents.find(d=>d.requested_url===venue.directions_url),geo=document.documents.find(d=>d.json_text);
    const facts=report.facts={event_name:`${venue.town.replace(/\b\w/g,c=>c.toUpperCase())} Craft and Gift Market — ${row.date}`,organiser:'Mynt Image',location:`${venue.venue}, ${venue.town.replace(/\b\w/g,c=>c.toUpperCase())}`,event_start:row.date,event_end:row.date,canonical_url:event.url,source_platform:'myntimage',source_identifier:row.source_identifier,application_url:venue.form_url,application_state:row.capacity===0?'CLOSED':'UNKNOWN'};
    const pin=directions?myntPin(directions,venue):null,geography=geoProof(geo,pin);
    if(venue.country_excerpt)report.evidence.push({kind:'venue_country_assertion',source_url:event.url,excerpt:venue.country_excerpt});
    if(geography&&venue.country_excerpt&&geography.nation!=='England')report.reasons.push('contradictory_venue_country_proof');
    if(geography){facts.country='GB';facts.region_code=geography.region??geography.nation;facts.location+=`, ${geography.nation}`;report.nation=geography.nation;report.evidence.push({kind:'venue_coordinate_country_proof',source_url:geo.url,excerpt:geography.excerpt});}
    else if(venue.country_excerpt){facts.country='GB';report.nation='England';}
    else report.reasons.push('verified_country_missing');
    report.evidence.push({kind:'official_dated_capacity',source_url:event.url,excerpt:row.excerpt},{kind:'official_booking_instructions',source_url:event.url,excerpt:venue.instructions});
    if(row.date<now.slice(0,10))report.reasons.push('stale_edition');
    if(row.capacity===0)report.reasons.push('application_closed');
    if(row.capacity==null)report.reasons.push('dated_capacity_not_proved');
    if(!form||form.reason||form.url!==venue.form_url||host(form.url)!=='emailmeform.com')report.reasons.push('dated_application_form_not_proved');
    else {
      const root=parseHtml(form.html),forms=nodes(root,n=>n.tag==='form'),f=forms[0];
      const title=text(first(root,n=>n.attrs?.id==='emf-form-title'));
      const marketTitle=norm(title).startsWith(norm(venue.town)+' ')&&/\bcraft\b.*\b(?:markets?|fairs?)\b/i.test(title);
      const venueBookingTitle=norm(title)===norm(venue.venue+' Booking Form');
      if(forms.length!==1||!marketTitle&&!venueBookingTitle)report.reasons.push('application_event_identity_mismatch');
      const labels=f?nodes(f,n=>n.tag==='label').map(n=>text(n)):[],choices=labels.map(s=>ukDate(s,row.date.slice(0,4))).filter(Boolean);
      const datedControls=f?nodes(f,n=>n.tag==='input'&&['checkbox','radio'].includes(n.attrs.type)).filter(n=>n.attrs.disabled===undefined):[];
      const matching=datedControls.some(n=>ukDate(n.attrs.value,row.date.slice(0,4))===row.date&&labels.some((label,i)=>ukDate(label,row.date.slice(0,4))===row.date&&nodes(f,x=>x.tag==='label')[i].attrs.for===n.attrs.id));
      if(!choices.includes(row.date)||!matching)report.reasons.push('exact_event_date_missing_from_application');
      const ownLabels=f?nodes(f,n=>n.tag==='label'):[];
      const boundField=pattern=>ownLabels.some(n=>pattern.test(text(n))&&n.attrs.for&&nodes(f,x=>['input','textarea'].includes(x.tag)&&x.attrs.id===n.attrs.for&&x.attrs.disabled===undefined).length===1);
      const business=boundField(/^Business(?:\s*\/\s*Trading)? Name\s*[:*]?$/i),products=boundField(/^Product(?:s)? Description\s*[:*]?$/i);
      const submit=f&&nodes(f,n=>(n.tag==='input'&&n.attrs.type==='submit'||n.tag==='button')&&n.attrs.disabled===undefined).some(n=>/submit/i.test(n.attrs.value??text(n)));
      if(!f||f.attrs.method?.toLowerCase()!=='post'||f.attrs.action!==form.url||!business||!products||!submit)report.reasons.push('trader_application_purpose_not_proved');
      const own=text(f).replace(/Country \/ Region[\s\S]*?Phone Number/,'Phone Number');
      if(/(?:applications? (?:are )?closed|members? only|invitation only|waitlist only|registration (?:is )?closed)/i.test(own))report.reasons.push('restricted_or_closed_application');
      report.application_heading=title;report.application_scope_proof={trader_application:business&&products,restricted_audience:false};
      report.evidence.push({kind:'exact_dated_trader_form',source_url:form.url,excerpt:stableJson({title,business,products,selected_date:row.date,date_control_present:matching,submit,action:f?.attrs.action})});
      if(row.capacity>0&&!report.reasons.some(r=>/application|identity/.test(r)))facts.application_state='OPEN_NOW';
    }
    report.reasons=[...new Set(report.reasons)];report.status=report.reasons.some(r=>/identity|contradictory|restricted/.test(r))?'quarantine':report.reasons.length?'partial':'verified';
  }catch(e){report.reasons=[/^[a-z_]+$/.test(e.message)?e.message:'official_source_structure_changed'];report.status=/identity|contradictory/.test(e.message)?'quarantine':'unverified';}
  return report;
}
export async function fetchMyntBundle(url,sourceIdentifier,{fetcher=fetch,now=new Date().toISOString(),visit=null}={}) {
  const read=async u=>{const d=await fetchSourceDocument(u,{fetcher,now});if(visit)await visit(d);return d;};
  const event=await read(url),venue=parseMyntVenue(event),form=await read(venue.form_url),documents=[event,form];
  if(venue.directions_url){const directions=await read(venue.directions_url);documents.push(directions);const pin=myntPin(directions,venue);if(pin){const geo=await fetchPostcodeDocument(pin,{fetcher,now});if(visit)await visit(geo);documents.push(geo);}}
  const checked=new Date(Math.min(...documents.map(d=>Date.parse(d.fetched_at)))).toISOString();
  return {document_kind:'uk_official_bundle',adapter_version:UK_ADAPTER_VERSION,requested_url:url,url,source_identifier:sourceIdentifier,fetched_at:checked,documents,content_hash:await hash(documents)};
}
