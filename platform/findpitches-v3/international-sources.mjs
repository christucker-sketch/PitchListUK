import {parseHtml,nodes,first,text} from './source-dom.mjs';
import {stableJson} from './contract.mjs';
import {safeSourceUrl} from './source-document.mjs';
import {VENUE_COORDINATE_POLICY,eventVenueCoordinates} from './source-coordinates.mjs';

const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
const token=v=>clean(v).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
function route(value,base){try{const u=new URL(value,base);return safeSourceUrl(u.href)?u.href.replace(/\/$/,''):null;}catch{return null;}}
function objects(value,out=[]){if(Array.isArray(value))for(const v of value)objects(v,out);else if(value&&typeof value==='object'){out.push(value);if(value['@graph'])objects(value['@graph'],out);}return out;}
function sourceObjects(root){const out=[];for(const n of nodes(root,n=>n.tag==='script'&&n.attrs.type==='application/ld+json')){try{objects(JSON.parse(text(n,{scoped:false})),out);}catch{}}return out;}
function result(document,profile,version,policy){return {version,application_policy:policy,profile,source_url:document.url,checked_at:document.fetched_at,page_kind:'unproved',status:'partial',facts:{},reasons:[],evidence:[]};}
function finish(report){report.reasons=[...new Set(report.reasons)];report.status=report.reasons.some(r=>/identity_|contradictory_|stale_edition|event_cancelled/.test(r))?'quarantine':report.reasons.length?'partial':'verified';return report;}

// Read only literal JSON strings in Next's public HTML data frames. Never
// execute page scripts, follow component references, or fetch private APIs.
function clueMartResources(root){
  let stream='';for(const n of nodes(root,n=>n.tag==='script')){const m=text(n,{scoped:false}).match(/^self\.__next_f\.push\(([\s\S]*)\)\s*;?$/);if(!m)continue;try{const a=JSON.parse(m[1]);if(a[0]===1&&typeof a[1]==='string')stream+=a[1];}catch{}}
  const resources=[];let visited=0;
  function walk(value,depth=0){if(depth>50||++visited>50000)throw Error('cluemart_data_limit');if(!value||typeof value!=='object')return;if(value.kind==='event'&&value.resourceType==='application'&&value.event)resources.push(value);for(const v of Object.values(value))walk(v,depth+1);}
  for(const line of stream.split('\n')){const at=line.indexOf(':');if(!/^[a-f\d]+$/.test(line.slice(0,at)))continue;let value;try{value=JSON.parse(line.slice(at+1));}catch{continue;}walk(value);}
  return resources;
}

export function verifyClueMart(document,{now,version,policy,country,calendarDate,eventShape}){
  const report=result(document,'cluemart',version,policy),u=new URL(document.url),slug=u.pathname.match(/^\/application\/([a-z0-9-]+)\/?$/)?.[1];
  if(!slug){report.page_kind='directory';report.status='quarantine';report.reasons=['platform_index_is_not_an_opportunity'];return report;}
  const root=parseHtml(document.html),all=sourceObjects(root),events=all.filter(o=>(Array.isArray(o['@type'])?o['@type']:[o['@type']]).includes('Event'));
  const sourceTitle=text(first(root,n=>n.tag==='title'),{scoped:false}).replace(/\s*[|–-]\s*ClueMart\s*$/i,'');
  if(/^(?:demo|test)(?:[- ]|$)/i.test(slug)||/^(?:demo|test)\b/i.test(sourceTitle)){report.page_kind='diagnostic';report.status='quarantine';report.reasons=['platform_demo_listing'];return report;}
  const unique=new Map(events.map(e=>[stableJson(eventShape(e)),e]));
  if(unique.size!==1){report.reasons=[unique.size?'multiple_or_contradictory_events':'single_event_source_data_missing'];return finish(report);}
  const event=[...unique.values()][0],facts=eventShape(event);delete facts.street;delete facts.locality;delete facts.event_url;
  const resources=clueMartResources(root),matching=resources.filter(r=>r.event.slug===slug&&token(r.event.name)===token(event.name));
  const title=sourceTitle;
  if(route(event.url,document.url)!==route(document.url,document.url)||token(title)!==token(event.name)||resources.length>1||resources.length&&matching.length!==1||route(document.requested_url,document.url)!==route(document.url,document.url))report.reasons.push('source_application_identity_mismatch');
  const data=matching[0]?.event;
  if(data){
    if(data.active!==true||data.deletedAt)report.reasons.push('event_cancelled_or_unavailable');
    if(data.location?.country&&country(data.location.country)!==facts.country)report.reasons.push('contradictory_country');
    const sourceDates=(data.dateTime??[]).map(d=>{const m=String(d.startDate??'').match(/^(\d{2})-(\d{2})-(\d{4})$/);return m?calendarDate(m[3]+'-'+m[2]+'-'+m[1]):null;}).filter(Boolean);
    if(sourceDates.length&&facts.event_start&&!sourceDates.includes(facts.event_start))report.reasons.push('contradictory_event_dates');
    report.evidence.push({kind:'cluemart_public_event_binding',excerpt:stableJson({slug:data.slug,name:data.name,active:data.active,deletedAt:data.deletedAt,location:data.location,dateTime:data.dateTime}).slice(0,14000)});
  }
  report.page_kind='application_shell';report.facts=facts;report.event_source_url=document.url;
  report.venue_coordinate_policy=VENUE_COORDINATE_POLICY;report.venue_coordinates=eventVenueCoordinates(events,facts,document.url);
  report.evidence.push({kind:'event_json_ld',excerpt:stableJson(event).slice(0,14000)});
  if(!facts.country)report.reasons.push('verified_country_missing');
  if(!event.location?.address?.streetAddress||!event.location?.address?.addressLocality)report.reasons.push('verified_venue_missing');
  if(!facts.event_start)report.reasons.push('verified_event_date_missing');
  // The platform's default SEO organiser is not the market operator.
  if(!facts.organiser||/^cluemart$/i.test(facts.organiser)){facts.organiser=null;report.reasons.push('verified_organiser_missing');}
  if(facts.event_start&&facts.event_end&&facts.event_start>facts.event_end)report.reasons.push('contradictory_event_dates');
  if(facts.event_end&&facts.event_end<now.slice(0,10))report.reasons.push('stale_edition');
  if(/Event(?:Cancelled|Postponed)/.test(String(event.eventStatus??'')))report.reasons.push('event_cancelled_or_postponed');
  const main=first(root,n=>n.tag==='main'),heading=main?text(first(main,n=>n.tag==='h1',{scoped:true})):'',body=text(main);
  facts.application_state='UNKNOWN';
  const form=(main?nodes(main,n=>n.tag==='form',{scoped:true}):[]).filter(f=>{
    const fields=nodes(f,n=>['input','select','textarea'].includes(n.tag)&&n.attrs.type!=='hidden'&&n.attrs.name,{scoped:true});
    const action=route(f.attrs.action,document.url);return action===route(document.url,document.url)&&fields.length>=2&&fields.some(n=>/business|vendor|stall|product/.test(n.attrs.name))&&first(f,n=>n.tag==='button'&&/^submit (?:vendor|stallholder) application$/i.test(text(n)),{scoped:true});
  });
  if(token(heading)===token(event.name)&&form.length===1&&/\b(?:vendor|stallholder) applications? (?:are |now )?open\b/i.test(body)&&!/\b(?:waitlist|applications? (?:are )?closed|sold out|login|sign in)\b/i.test(body)){
    report.page_kind='event';facts.application_url=document.url;facts.application_state='OPEN_NOW';report.application_heading='Stallholder application for '+facts.event_name;
    report.evidence.push({kind:'cluemart_scoped_vendor_form',excerpt:body.slice(0,14000)});
  }else{report.reasons.push('cluemart_trader_application_not_proved','open_vendor_application_not_proved');}
  return finish(report);
}

const IE_COUNTIES=new Set('carlow cavan clare cork donegal dublin galway kerry kildare kilkenny laois leitrim limerick longford louth mayo meath monaghan offaly roscommon sligo tipperary waterford westmeath wexford wicklow'.split(' '));
const NI_COUNTIES=new Set('antrim armagh down fermanagh londonderry derry tyrone'.split(' '));
function listingField(root,label){
  // Elementor's field label and value share a small ancestor wrapper. Keep
  // related listings, the platform contact page and the site footer outside it.
  const candidates=[];function walk(n,parents=[]){if(/^h[1-6]$/.test(n.tag)&&text(n)===label){const wrapper=[...parents].reverse().find(p=>nodes(p,x=>/^h[1-6]$/.test(x.tag),{scoped:true}).length===1&&text(p).startsWith(label+' ')&&text(p).length<=500);if(wrapper)candidates.push(wrapper);}for(const child of n.children??[])walk(child,[...parents,n]);}walk(root);
  return candidates.length===1?text(candidates[0]).slice(label.length).trim():null;
}
function longDate(value,calendarDate){const m=clean(value).match(/^(?:[A-Za-z]+day\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d{2})$/i);if(!m)return null;const months=['january','february','march','april','may','june','july','august','september','october','november','december'];return calendarDate(m[3]+'-'+String(months.indexOf(m[2].toLowerCase())+1).padStart(2,'0')+'-'+m[1].padStart(2,'0'));}

export function verifyMarketsIreland(document,{now,version,policy,calendarDate}){
  const report=result(document,'marketsireland',version,policy),u=new URL(document.url);
  if(!/^\/market\/[a-z0-9-]+\/?$/.test(u.pathname)){report.page_kind='directory';report.status='quarantine';report.reasons=['platform_index_is_not_an_opportunity'];return report;}
  const root=parseHtml(document.html),scope=first(root,n=>n.attrs?.['data-elementor-type']==='single-post')??first(root,n=>n.tag==='article')??first(root,n=>n.tag==='main');if(!scope){report.reasons=['event_content_scope_missing'];return report;}
  function prune(n){return {...n,children:(n.children??[]).filter(c=>!['card','header','footer'].includes(c.attrs?.['data-elementor-type'])).map(prune)};}
  const main=prune(scope);
  const canonical=first(root,n=>n.tag==='link'&&n.attrs.rel==='canonical')?.attrs.href,title=text(first(root,n=>n.tag==='title'),{scoped:false}).replace(/\s*[-|]\s*marketsireland\.ie\s*$/i,'');
  const heading=first(main,n=>n.tag==='h2',{scoped:true});
  if(!title||token(text(heading))!==token(title)||route(canonical,document.url)!==route(document.url,document.url)||route(document.requested_url,document.url)!==route(document.url,document.url))report.reasons.push('event_identity_not_bound_to_page');
  const place=listingField(main,'Location'),county=listingField(main,'County'),date=longDate(listingField(main,'Date'),calendarDate),name=listingField(main,'Organiser')??listingField(main,'Organizer');
  const countyToken=token(county).replace(/^county /,''),ni=NI_COUNTIES.has(countyToken),ie=IE_COUNTIES.has(countyToken),bt=/\bBT\d{1,2}\s*\d[A-Z]{2}\b/i.test(place??'');
  report.page_kind='event';report.event_source_url=document.url;report.facts={event_name:title,country:ni||bt?'GB':ie?'IE':null,location:place||null,event_start:date,event_end:date,organiser:name||null,application_state:'UNKNOWN'};
  if(ie&&bt)report.reasons.push('contradictory_country');
  if(!report.facts.country)report.reasons.push('verified_country_missing');
  if(!place||/^(?:tba|tbd|to be)/i.test(place))report.reasons.push('verified_venue_missing');
  if(!date)report.reasons.push('verified_event_date_missing');
  if(!name||/^marketsireland(?:\.ie)?$/i.test(name))report.reasons.push('verified_organiser_missing');
  if(date&&date<now.slice(0,10))report.reasons.push('stale_edition');
  // Existing listings openly disclose estimated/unannounced dates. Retain the
  // listed date but never promote it as confirmed source proof.
  if(/\b(?:dates? (?:had|have) not been (?:formally )?announced|expected, based on prior years|date status:\s*expected)\b/i.test(text(main)))report.reasons.push('event_date_not_confirmed');
  const status=nodes(main,n=>n.tag==='p'&&/^Applications are (?:open for this market|closed or not managed here)$/.test(text(n)),{scoped:true});
  const links=nodes(main,n=>n.tag==='a'&&/^(?:Call|Email)$/.test(text(n)),{scoped:true}).filter(n=>/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/.test(n.attrs.href??'')||/^tel:\+?[\d ()-]{7,30}$/.test(n.attrs.href??''));
  report.evidence.push({kind:'marketsireland_listing_fields',excerpt:stableJson({title,place,county,date,organiser:name,status:status.map(text)}).slice(0,14000)});
  if(status.length===1&&text(status[0])==='Applications are open for this market'&&links.length){
    report.facts.application_url=document.url;report.facts.application_state='ENQUIRY_AVAILABLE';report.application_heading='Contact organiser for '+title;
    report.evidence.push({kind:'market_organiser_contact_route',url:document.url,excerpt:'Event-specific organiser email/telephone controls on the HTTPS listing; enquiry only, no hosted application proved.'});
  }else report.reasons.push(status.some(n=>text(n).includes('closed or not managed'))?'application_status_ambiguous':'event_organiser_contact_route_missing');
  // These listings supply no named organiser today. A platform name, guessed
  // hostname or contact mailbox cannot fill that field.
  return finish(report);
}
