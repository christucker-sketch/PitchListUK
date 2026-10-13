import {hash,stableJson} from './contract.mjs';import {parseHtml,nodes,first,text,hasClass} from './source-dom.mjs';import {fetchSourceDocument} from './source-document.mjs';import {ukDate} from './uk-sources.mjs';import {fetchUKPostcode,postcodeProof,ukPostcode} from './uk-event-geography.mjs';
export const DUNDEE_ORIGIN='https://www.dundeeheritagetrust.co.uk',DUNDEE_FOOD=DUNDEE_ORIGIN+'/event/verdant-works-christmas-market-food-drinks/',DUNDEE_VENUE=DUNDEE_ORIGIN+'/attraction/verdant-works/';
const clean=v=>String(v??'').replace(/\s+/g,' ').trim(),norm=v=>clean(v).replace(/\s+([,.!?])/g,'$1').toLowerCase();
export const dundeeFoodURL=u=>u===DUNDEE_FOOD||u===DUNDEE_FOOD.slice(0,-1);
function venueAddress(document) {
  if(document?.reason||document?.url!==DUNDEE_VENUE)return null;const dom=parseHtml(document.html),h=first(dom,n=>n.tag==='h1');
  if(norm(text(h))!=='verdant works museum')return null;
  const address=nodes(dom,n=>hasClass(n,'attraction-tab-find-us-address'),{scoped:true});if(address.length!==1)return null;
  const value=text(address[0]).replace(/\s+Get Directions\s*$/i,''),codes=[...value.matchAll(/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/g)].map(m=>ukPostcode(m[0]));
  if(!/^Verdant Works,\s+/i.test(value)||new Set(codes).size!==1)return null;return {address:value,postcode:codes[0]};
}
export async function fetchDundeeBundle(url,{fetcher=fetch,now=new Date().toISOString()}={}) {
  if(!dundeeFoodURL(url))throw Error('dundee_food_event_route_required');const event=await fetchSourceDocument(url,{fetcher,now}),venue=await fetchSourceDocument(DUNDEE_VENUE,{fetcher,now}),address=venueAddress(venue);
  if(!address)return {...event,document_kind:'dundeeheritage_event_bundle',adapter_version:'dundee-dated-food-form-v1',documents:[event,venue],reason:'dundee_named_venue_address_required'};
  const geo=await fetchUKPostcode(address.postcode,{fetcher,now}),documents=[event,venue,geo];return {document_kind:'dundeeheritage_event_bundle',adapter_version:'dundee-dated-food-form-v1',requested_url:url,url:event.url,fetched_at:new Date(Math.min(...documents.map(d=>Date.parse(d.fetched_at)))).toISOString(),content_hash:await hash(documents.map(d=>d.content_hash??d.reason)),documents};
}
export function verifyDundeeBundle(document,{now,version,applicationPolicy}) {
  const report={version,application_policy:applicationPolicy,profile:'dundeeheritage',status:'unverified',page_kind:'event',source_url:document.url,checked_at:document.fetched_at,facts:{},reasons:[],evidence:[]};
  try {
    if(document.reason)throw Error(document.reason);
    if(document.adapter_version!=='dundee-dated-food-form-v1'||!dundeeFoodURL(document.requested_url)||document.url!==DUNDEE_FOOD||document.documents?.length!==3)throw Error('dundee_event_bundle_required');
    const [event,venue,geo]=document.documents;if(event.reason||!event.html||!dundeeFoodURL(event.requested_url)||event.url!==document.url||document.fetched_at!==new Date(Math.min(...document.documents.map(d=>Date.parse(d.fetched_at)))).toISOString()||document.documents.some(d=>!Number.isFinite(Date.parse(d.fetched_at))||Date.parse(d.fetched_at)>Date.parse(now)))throw Error('dundee_source_custody_required');
    const dom=parseHtml(event.html),header=first(dom,n=>hasClass(n,'post-content-header')),body=first(dom,n=>hasClass(n,'post-single-content-event'));
    const title=text(first(header,n=>n.tag==='h1'),{scoped:false});if(title!=='Verdant Works Christmas Market: Food & Drinks'||!body)throw Error('dundee_exact_food_event_required');
    const location=nodes(header,n=>n.tag==='a'&&n.attrs.href===DUNDEE_VENUE);if(location.length!==1||text(location[0])!=='Verdant Works Museum')throw Error('dundee_event_venue_binding_required');
    const content=first(body,n=>hasClass(n,'post-content-block-text')),firstP=nodes(content,n=>n.tag==='p')[0],dateText=text(firstP),match=dateText.match(/^(\d{1,2})\s*(?:&|–|-)\s*(\d{1,2})\s+([A-Za-z]+)\s+(20\d{2})$/);
    if(!match)throw Error('dundee_explicit_header_dates_required');const start=ukDate(match[1]+' '+match[3],match[4]),end=ukDate(match[2]+' '+match[3],match[4]);if(!start||!end||start>end)throw Error('dundee_contradictory_dates');
    const address=venueAddress(venue),country=address&&postcodeProof(geo,address.postcode,{now});if(!country)throw Error('dundee_venue_country_proof_required');
    // Organisation is expressly named by the owning site's registered identity;
    // its office postcode never supplies the event's geography.
    if(!/known as Dundee Heritage Trust/i.test(event.html))throw Error('dundee_official_organiser_required');
    const section=first(body,n=>hasClass(n,'contact-form')),info=text(first(section,n=>hasClass(n,'info'))),heading=text(first(section,n=>n.tag==='h2'),{scoped:false}),forms=nodes(section,n=>n.tag==='form');
    if(heading!=='Apply to be a stallholder'||forms.length!==1||!/local food or drinks producer[\s\S]*stallholder[\s\S]*fill in this form/i.test(info))throw Error('dundee_current_food_trader_form_required');
    const form=forms[0],action=new URL(form.attrs.action??'',event.url);if(form.attrs.method?.toLowerCase()!=='post'||action.origin!==DUNDEE_ORIGIN||action.pathname!==new URL(DUNDEE_FOOD).pathname||action.hash!=='#gf_17'||form.attrs.id!=='gform_17'||form.attrs.disabled!==undefined||form.attrs.hidden!==undefined)throw Error('dundee_bound_active_trader_form_required');
    const fields=[];function visit(node,blocked=false){blocked||=node.attrs?.disabled!==undefined||node.attrs?.hidden!==undefined||/display\s*:\s*none|visibility\s*:\s*hidden/i.test(node.attrs?.style??'');if(['input','textarea','button'].includes(node.tag)&&!blocked&&node.attrs.readonly===undefined)fields.push(node);for(const child of node.children??[])visit(child,blocked);}visit(form);const active=()=>true;
    if(!fields.some(n=>n.tag==='input'&&n.attrs.type==='email'&&active(n))||!fields.some(n=>n.tag==='textarea'&&n.attrs.name==='input_4'&&active(n))||!fields.some(n=>n.tag==='button'&&n.attrs.type==='submit'&&active(n)))throw Error('dundee_bound_active_trader_form_required');
    const notices=nodes(first(section,n=>hasClass(n,'info')),n=>n.tag==='p').map(text);
    const craftNotice='please note we are not accepting applications from artists, crafters & designers, as we are currently full for these stalls.';
    if(notices.some(p=>norm(p)!==craftNotice&&/not accepting|closed|full(?:y booked)?|sold out|wait(?:ing)?\s*list/i.test(p)))throw Error('dundee_food_applications_held');
    if(end<now.slice(0,10))throw Error('stale_edition');
    report.facts={event_name:title,organiser:'Dundee Heritage Trust',location:'Verdant Works Museum, '+address.address,event_start:start,event_end:end,country:'GB',region_code:country.region??country.nation,application_url:DUNDEE_FOOD,application_state:'OPEN_NOW'};
    report.application_heading='Apply to be a stallholder — '+title;report.application_scope_proof={trader_application:true,restricted_audience:false};report.application_audience='food_and_drink_traders';report.nation=country.nation;
    report.evidence=[{kind:'official_event_header',source_url:event.url,excerpt:stableJson({title,dates:dateText,venue:'Verdant Works Museum'})},{kind:'event_bound_food_trader_form',source_url:event.url,excerpt:info},{kind:'official_named_venue_address',source_url:venue.url,excerpt:address.address},{kind:'exact_postcode_country',source_url:geo.url,excerpt:stableJson(country)}];report.status='verified';
  }catch(e){report.reasons=[/^[a-z_]+$/.test(e.message)?e.message:'dundee_source_structure_changed'];report.status=/contradictory|exact_food|binding/.test(report.reasons[0])?'quarantine':'unverified';}
  return report;
}
