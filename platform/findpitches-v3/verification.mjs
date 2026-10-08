import {stableJson} from './contract.mjs';
import {parseHtml,nodes,first,text,hasClass,decode} from './source-dom.mjs';
import {safeSourceUrl} from './source-document.mjs';
import {verifyUKBundle} from './uk-sources.mjs';

export const VERIFIER_VERSION='source-proof-v1';
export const APPLICATION_POLICY_VERSION='current-application-v1.10';
const COUNTRIES={us:'US',usa:'US','united states':'US','united states of america':'US',gb:'GB',uk:'GB','united kingdom':'GB',england:'GB',scotland:'GB',wales:'GB','northern ireland':'GB',au:'AU',australia:'AU',ca:'CA',canada:'CA',nz:'NZ','new zealand':'NZ',ie:'IE',ireland:'IE',fr:'FR',france:'FR',de:'DE',germany:'DE',kr:'KR','south korea':'KR'};
const TYPES=new Set(['Event','Festival','BusinessEvent','ExhibitionEvent','SaleEvent']);
const clean=v=>decode(String(v??'')).replace(/\s+/g,' ').trim();
const token=v=>clean(v).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export const country=v=>COUNTRIES[clean(typeof v==='object'?v?.name:v).toLowerCase()]??null;
export function calendarDate(v) {
  const m=String(v??'').match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T)/);if(!m)return null;
  const day=m.slice(1).join('-'),date=new Date(day+'T12:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===day?day:null;
}
function route(v,base) {try {const u=new URL(v,base);if(!safeSourceUrl(u.href))return null;for(const k of [...u.searchParams.keys()])if(/^(?:utm_|srsltid|aff|fbclid)/i.test(k))u.searchParams.delete(k);u.hash='';return u.href;}catch{return null;}}
function sameRoute(a,b){return route(a,a)===route(b,b)&&Boolean(route(a,a));}
function vendorId(v){try {const u=new URL(v);return /(?:^|\.)eventeny\.com$/.test(u.hostname)&&u.pathname==='/events/vendor/'?u.searchParams.get('id'):null;}catch{return null;}}
export function eventenyParentId(value) {try{const u=new URL(value);return /(?:^|\.)eventeny\.com$/.test(u.hostname)?u.pathname.match(/^\/events\/[^/]+-(\d+)\/?$/)?.[1]??null:null;}catch{return null;}}
export function provedEventSourceUrl(report) {
  if(report.event_source_url)return report.event_source_url;
  try{return JSON.parse(report.evidence?.find(e=>e.kind==='event_json_ld')?.excerpt??'null')?.url??null;}catch{return null;}
}
function flatten(data,out=[]) {if(Array.isArray(data))for(const x of data)flatten(x,out);else if(data&&typeof data==='object'){out.push(data);if(data['@graph'])flatten(data['@graph'],out);}return out;}
function eventShape(e) {
  const address=e.location?.address??{},org=e.organizer??e.organiser;
  return {event_name:clean(e.name)||null,country:country(address.addressCountry),location:clean([e.location?.name,address.streetAddress,address.addressLocality,address.addressRegion,address.postalCode].filter(Boolean).join(', '))||null,
    organiser:clean(typeof org==='string'?org:org?.name)||null,event_start:calendarDate(e.startDate),event_end:calendarDate(e.endDate)||calendarDate(e.startDate),
    street:clean(address.streetAddress),locality:clean(address.addressLocality),event_url:e.url??null};
}
function eventNameEditionConflict(facts) {
  if(!facts.event_start)return false;
  const start=facts.event_start.slice(0,4),end=(facts.event_end??facts.event_start).slice(0,4);
  return [...String(facts.event_name??'').matchAll(/\b(20\d{2})\b/g)].some(m=>m[1]<start||m[1]>end);
}
const explicitState=s=>/^(?:join (?:the )?waitlist|waitlist(?: only)?|applications? (?:are )?waitlist only)$/i.test(clean(s))?'WAITLIST':/^(?:applications? (?:are )?closed|sold out|fully booked|applications? (?:are )?not open)$/i.test(clean(s))?'CLOSED':null;
export function applicationScope(report) {
  const heading=report.application_heading??report.evidence?.find(e=>e.kind==='main_heading')?.excerpt??'';
  if(report.profile==='myntimage')return {heading,audience:'traders',reasons:report.application_scope_proof?.trader_application===true||report.application_scope_proof?.trader_application===1?[]:['trader_application_purpose_not_proved']};
  if(report.profile!=='eventeny')return {heading,audience:'traders',reasons:[]};
  const description=report.application_scope_proof?.application_description??report.application_scope_proof?.evidence?.find(e=>e.kind==='application_description')?.excerpt??'';
  const role=report.application_scope_proof?.application_role??applicationRole(description,heading);
  if(['performer','treat_stop'].includes(role))return {heading,audience:'non_trader',reasons:['application_is_not_a_trader_opportunity']};
  const assertions=report.application_scope_proof?.event_date_assertions??applicationDateAssertions(description),facts=report.facts??{};
  if(assertions.some(date=>!calendarDate(date)||facts.event_start&&date<facts.event_start||facts.event_end&&date>facts.event_end))return {heading,audience:'uncertain_edition',reasons:['contradictory_application_description_dates']};
  if(/\byoung entrepreneurs?\b|\byouth (?:vendors?|entrepreneurs?)\b/i.test(heading)||report.application_scope_proof?.age_restricted||ageRestricted(description))return {heading,audience:'restricted_age',reasons:['application_restricted_audience_requires_review']};
  if(/\b(?:performers?|performances?|entertainers?|entertainment|volunteers?)\b/i.test(heading)||/^rental application\b/i.test(heading)||/\bparade (?:application|registration|entry)\b/i.test(heading)||/\bstop registration\b/i.test(heading)
    ||/\b(?:hockey|sports?|adult) league\b|\b(?:rib|cook.?off|competition) team registration\b|\b(?:radio|advertising|advertisement|ad) (?:opportunity|application|package|space|ads?)\b|\b(?:sponsor|sponsorship) (?:application|registration|package)\b|\b(?:chalk artists?|grants?|scholarships?|relocation assistance)\b/i.test(heading))return {heading,audience:'non_trader',reasons:['application_is_not_a_trader_opportunity']};
  const members=/\bchamber (?:of commerce )?members?\b|\bmembers? only\b|\bmerchants? only\b|\b(?:invitation|invite) only\b|\b(?:returning|existing) vendors? only\b/i.test(heading);
  if(members&&!/\bnon[ -]?members?\b|\bdiscount\b/i.test(heading))return {heading,audience:'restricted_membership',reasons:['application_restricted_audience_requires_review']};
  const nonprofit=/\b(?:non[ -]?profits?|charit(?:y|ies|able))\b/i.test(heading),mixed=nonprofit&&/\bcommercial\b/i.test(heading)||/\bbusiness(?:es)?\s*\/\s*non[ -]?profits?\b/i.test(heading);
  if(nonprofit&&!mixed)return {heading,audience:'nonprofit_only',reasons:['application_restricted_audience_requires_review']};
  if(report.application_scope_proof?.restricted_audience)return {heading,audience:'restricted_membership',reasons:['application_restricted_audience_requires_review']};
  if(/\b(?:sponsors?|sponsorship|advertisers?)\b/i.test(heading)&&!report.application_scope_proof?.guaranteed_vendor_space)return {heading,audience:'conditional_sponsor',reasons:['sponsor_trading_entitlement_not_proved']};
  // A platform vendor URL also hosts sports registration, advertising and other
  // forms. Prove trading purpose in this application's heading/description.
  const titleProof=/\b(?:vendors?|traders?|stallholders?|exhibitors?|artisans?|crafters?|merchants?|retail|vending|sellers?|food (?:vendors?|trucks?|booths?))\b/i.test(heading);
  if(!titleProof&&!mixed&&!report.application_scope_proof?.trader_application)return {heading,audience:'unproved',reasons:['trader_application_purpose_not_proved']};
  return {heading,audience:nonprofit?'commercial_and_nonprofit':'traders',reasons:[]};
}
function ageRestricted(description) {
  return /\b(?:aged?|ages?)\s+\d{1,2}\s+(?:and|or) (?:under|younger)\b|\b(?:applicants?|vendors?|participants?) (?:must be|are required to be) (?:under|younger than) \d{1,2}\b/i.test(description);
}
function applicationRole(description,heading) {
  if(/\b(?:performers?|performances?)\b/i.test(heading))return 'performer';
  const selling=description.split(/[.!?]/).some(s=>!/\b(?:may not|must not|cannot|do not|no selling|prohibited)\b/i.test(s)&&/\bsell(?:ing)? (?:your |their |handmade )?(?:products?|goods?|food)\b/i.test(s));
  if(!selling&&/\bprimary role\b[^.!?]{0,80}\bhand out candy\b/i.test(description))return 'treat_stop';
  return 'not_stated';
}
function applicationDateAssertions(description) {
  const dates=[];
  // Only explicit event-date assertions in this application's own description.
  // Historical years, photo requirements and dates elsewhere on the page do
  // not create a conflict. Partial dates cannot supply an inferred year.
  for(const clause of description.matchAll(/\b(?:will (?:be held|take place)|takes? place|held on|scheduled for)\b[^.!?]{0,300}/gi)) {
    for(const m of clause[0].matchAll(/\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+(\d{1,2})(?:st|nd|rd|th)?\s*,?\s+(20\d{2})\b/gi)) {
      const date=new Date(m[1]+' '+m[2]+', '+m[3]+' 12:00:00 UTC');
      if(Number.isFinite(date.getTime()))dates.push(date.getUTCDate()===Number(m[2])?date.toISOString().slice(0,10):'invalid_explicit_date');
    }
  }
  return [...new Set(dates)].slice(0,50);
}

function eventenyScopeProof(main,heading) {
  const section=label=>{
    const blocks=nodes(main,n=>['div','section','article'].includes(n.tag)&&text(first(n,x=>x.tag==='h2',{scoped:true}))===label,{scoped:true});
    const candidates=blocks.filter(n=>nodes(n,x=>x.tag==='h2',{scoped:true}).length===1).map(n=>text(n)).filter(s=>s!==label);
    return candidates.sort((a,b)=>b.length-a.length)[0]??'';
  };
  const description=section('About the application'),prices=section('Prices');
  // A contact mailbox or URL containing “vendors” is not proof of a pitch.
  const scopeText=(description+' '+prices).replace(/\b[\w.%+-]+@[\w.-]+\.[a-z]{2,}\b/gi,' ').replace(/https?:\/\/\S+/gi,' ');
  const restricted=/\b(?:must be (?:an? )?(?:active |current )?(?:chamber |association )?member|(?:active |current )?chamber members? only|members? only|invitation only|invite only|(?:returning|existing) vendors? only|non[ -]?profits? only|charit(?:y|ies) only)\b/i.test(description);
  const sellingArt=scopeText.split(/[.!?]/).some(sentence=>!/\b(?:not allowed|may not|must not|cannot|do not|don't|no selling|prohibited|banned)\b/i.test(sentence)
    &&/\bsell(?:ing)? (?:your |their |handmade |unique )*(?:art(?:work)?|work|creations)\b|\b(?:work|artwork|creations) (?:you|they|artists?) (?:(?:would|will) (?:like |want )?to |can |may )sell\b/i.test(sentence));
  const artistTables=/\bartist'?s? alley (?:tables?|spaces?|booths?)\b/i.test(description)&&/\b(?:pricing|price|cost|fee)\b|\$\d/i.test(scopeText);
  const trade=sellingArt||artistTables||/\b(?:vendors?|traders?|stallholders?|exhibitors?|artisans?|crafters?|merchants?|retail|vending|sellers?|booth(?:s| space)?|sell(?:ing)? (?:your |their |handmade )?(?:products?|goods?|food)|food trucks?)\b/i.test(scopeText);
  const guaranteed=scopeText.split(/[.!?]/).some(sentence=>!/\b(?:may|might|possible|potential|optional)\b/i.test(sentence)&&/\b(?:includes?|provides?|receive|will have|are allocated)\b[^.!?]{0,200}\b(?:vendor|trader|stallholder|exhibitor|retail) (?:space|booth|stall|pitch|table)\b/i.test(sentence));
  return {version:'eventeny-trading-purpose-v5',application_role:applicationRole(description,heading),trader_application:trade,restricted_audience:restricted,age_restricted:ageRestricted(description),event_date_assertions:applicationDateAssertions(description),guaranteed_vendor_space:guaranteed,
    evidence:[...description?[{kind:'application_description',excerpt:description.slice(0,16000)}]:[],...prices?[{kind:'application_prices',excerpt:prices.slice(0,8000)}]:[]]};
}

// Discovery metadata (including search market/city) is deliberately absent from parsing.
export function verifyDocument(document,{now=new Date().toISOString()}={}) {
  if(document.document_kind==='uk_official_bundle')return verifyUKBundle(document,{now,version:VERIFIER_VERSION,applicationPolicy:APPLICATION_POLICY_VERSION});
  const report={version:VERIFIER_VERSION,application_policy:APPLICATION_POLICY_VERSION,source_url:document.url??document.requested_url,checked_at:document.fetched_at??now,profile:'generic',status:'unverified',page_kind:'unproved',facts:{},reasons:[],evidence:[]};
  if(document.reason||!document.html){report.reasons.push(document.reason??'source_document_missing');return report;}
  try {
    const u=new URL(document.url),host=u.hostname.replace(/^www\./,''),root=parseHtml(document.html);
    const social=/(?:^|\.)(facebook\.com|instagram\.com|tiktok\.com|x\.com)$/.test(host);
    if(social){report.page_kind='social';report.status='quarantine';report.reasons=['social_page_is_discovery_only'];return report;}
    if(host==='eventeny.com')report.profile='eventeny';else if(host==='localstalls.com')report.profile='localstalls';else if(host==='ukcraftfairs.com')report.profile='ukcraftfairs';else if(/eventbrite\./.test(host))report.profile='eventbrite';else if(host==='marketspread.com')report.profile='marketspread';
    const specific=report.profile==='eventeny'?Boolean(vendorId(document.url)):report.profile==='localstalls'?/^\/[a-z]{2}\/event\/[^/]+\/[^/]+\/?$/.test(u.pathname):report.profile==='ukcraftfairs'?/^\/craft-events\/\d+\//.test(u.pathname):report.profile==='marketspread'?/^\/market\/\d+\//.test(u.pathname):true;
    if(!specific||u.pathname==='/'||/\/(?:directory|vendors|listings|search|events|calendar)\/?$/.test(u.pathname)){report.status='quarantine';report.page_kind='directory';report.reasons=['platform_index_is_not_an_opportunity'];return report;}
    const objects=[];
    for(const script of nodes(root,n=>n.tag==='script'&&n.attrs.type?.toLowerCase()==='application/ld+json')){try{flatten(JSON.parse(text(script,{scoped:false})),objects);}catch{report.reasons.push('invalid_structured_source_data');}}
    if(objects.some(o=>['NewsArticle','BlogPosting','Article'].includes(o['@type']))||/\/(?:news|blog|stories)\//.test(u.pathname)){report.status='quarantine';report.page_kind='editorial';report.reasons.push('editorial_page_is_discovery_only');return report;}
    const events=objects.filter(o=>(Array.isArray(o['@type'])?o['@type']:[o['@type']]).some(t=>TYPES.has(t)));
    // Duplicate JSON-LD blocks with different timezone offsets are common on Eventeny.
    // Calendar dates, geography, organiser and offer states must still agree.
    const groups=new Map();for(const e of events){const shape=eventShape(e);const key=stableJson({...shape,offers:e.offers??null});if(!groups.has(key))groups.set(key,e);}
    if(groups.size>1){report.status='quarantine';report.page_kind='ambiguous';report.reasons.push('multiple_or_contradictory_events');return report;}
    const event=[...groups.values()][0],main=first(root,n=>n.tag==='main'||n.tag==='article')??(['eventeny','marketspread'].includes(report.profile)?first(root,n=>n.tag==='body'):null);
    if(!main){report.reasons.push('event_content_scope_missing');return report;}
    const heading=clean(text(first(main,n=>n.tag==='h1',{scoped:true}))),body=text(main);
    if(!event){report.page_kind=report.profile==='marketspread'?'application_login':'unproved';report.reasons.push('single_event_source_data_missing');return report;}
    const facts=eventShape(event);delete facts.street;delete facts.locality;delete facts.event_url;
    const offers=Array.isArray(event.offers)?event.offers:[event.offers].filter(Boolean);
    let identity=false;
    if(report.profile==='eventeny')identity=heading.length>3&&offers.some(o=>vendorId(route(o.url,document.url))===vendorId(document.url));
    else identity=Boolean(heading&&token(heading)===token(event.name)&&sameRoute(event.url??document.url,document.url));
    if(!identity){report.status='quarantine';report.page_kind='unrelated_event';report.reasons.push('event_identity_not_bound_to_page');return report;}
    report.page_kind='event';report.facts=facts;report.evidence.push({kind:'event_json_ld',excerpt:stableJson(event).slice(0,14000)},{kind:'main_heading',excerpt:heading});
    report.event_source_url=event.url?route(event.url,document.url):null;
    if(report.profile==='eventeny'&&vendorId(document.requested_url)!==vendorId(document.url))report.reasons.push('source_application_identity_mismatch');
    if(report.profile==='eventeny')report.application_scope_proof=eventenyScopeProof(main,heading);
    const scope=applicationScope(report);report.application_heading=scope.heading;report.application_audience=scope.audience;report.reasons.push(...scope.reasons);
    const address=event.location?.address??{};
    if(!facts.country)report.reasons.push('verified_country_missing');
    if(!clean(address.addressLocality)||!clean(address.streetAddress)||/^(?:tba|tbd|to be (?:announced|confirmed))\b/i.test(clean(address.streetAddress)))report.reasons.push('verified_venue_missing');
    if(!facts.event_start)report.reasons.push('verified_event_date_missing');
    if(!facts.organiser||/^(?:eventeny|localstalls|ukcraftfairs|eventbrite|marketspread)$/i.test(facts.organiser))report.reasons.push('verified_organiser_missing');
    if(facts.event_start&&facts.event_end&&facts.event_start>facts.event_end)report.reasons.push('contradictory_event_dates');
    if(eventNameEditionConflict(facts))report.reasons.push('contradictory_event_name_edition');
    if(facts.event_start&&[...heading.matchAll(/\b(20\d{2})\b/g)].some(m=>m[1]!==facts.event_start.slice(0,4)&&m[1]!==facts.event_end?.slice(0,4)))report.reasons.push('contradictory_heading_edition');
    if(/Event(?:Cancelled|Postponed)/.test(String(event.eventStatus??'')))report.reasons.push('event_cancelled_or_postponed');
    if(facts.event_end&&facts.event_end<now.slice(0,10))report.reasons.push('stale_edition');
    const controls=nodes(main,n=>['a','button'].includes(n.tag),{scoped:true});
    const headingState=report.profile==='eventeny'&&/\bwaitlist(?:ed)?\b/i.test(heading)?'WAITLIST':report.profile==='eventeny'&&/^(?:closed|sold out|fully booked)\b/i.test(heading)?'CLOSED':null;
    const state=headingState??nodes(main,n=>['a','button','p','span','div'].includes(n.tag)&&text(n).length<=80,{scoped:true}).map(n=>explicitState(text(n))).find(Boolean);
    facts.application_state=state==='WAITLIST'?'WATCH':state==='CLOSED'?'CLOSED':'UNKNOWN';
    if(report.profile==='eventeny') {
      const own=offers.filter(o=>vendorId(route(o.url,document.url))===vendorId(document.url));
      const states=new Set(own.map(o=>clean(o.availability).split('/').at(-1)));
      if(states.size>1)report.reasons.push('contradictory_application_states');
      const deadlines=new Set(own.map(o=>calendarDate(o.availabilityEnds)).filter(Boolean));
      if(deadlines.size>1)report.reasons.push('contradictory_application_deadlines');
      facts.application_url=route(document.url,document.url);facts.application_deadline=[...deadlines][0]??null;
      const visible=body.match(/Deadline:\s*([A-Z][a-z]{2,8}\s+\d{1,2},\s*20\d{2})/);
      if(visible&&facts.application_deadline){const date=new Date(visible[1]+' 12:00:00 UTC');if(Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)!==facts.application_deadline)report.reasons.push('contradictory_visible_application_deadline');}
      if(!state&&states.size===1&&states.has('InStock')&&own.every(o=>o.availabilityStarts&&Date.parse(o.availabilityStarts)<=Date.parse(now)&&o.availabilityEnds&&Date.parse(o.availabilityEnds)>Date.parse(now))&&/start application/i.test(body))facts.application_state='OPEN_NOW';
      report.evidence.push({kind:'vendor_id_scoped_offers',excerpt:stableJson(own).slice(0,14000)});
    } else if(report.profile==='localstalls') {
      const links=controls.filter(n=>n.tag==='a'&&/^submit application$/i.test(text(n))).map(n=>route(n.attrs.href,document.url)).filter(Boolean);
      const apps=[...new Set(links)].filter(v=>{const a=new URL(v);return a.hostname===u.hostname&&/^\/[a-z]{2}\/application\/[a-f\d-]{36}$/i.test(a.pathname)&&/^[a-f\d-]{36}$/i.test(a.searchParams.get('event')??'');});
      const open=first(main,n=>hasClass(n,'ls-ev-openline'),{scoped:true});
      if(apps.length===1){facts.application_url=apps[0];report.application_landing_url=document.url;if(!state&&/^stallholder applications open$/i.test(text(open)))facts.application_state='OPEN_NOW';report.evidence.push({kind:'event_application_control',excerpt:clean(text(open)+' '+apps[0])});}
      else report.reasons.push('event_application_route_missing_or_ambiguous');
    } else if(report.profile==='generic') {
      // Official event + an explicit, scoped vendor application block. Visitor
      // offers, navigation links, generic contact and form keywords are insufficient.
      let organiserHost=null;try{organiserHost=new URL(event.organizer?.url??event.organiser?.url).hostname;}catch{}
      const vendorBlocks=nodes(main,n=>['section','article'].includes(n.tag)&&/^(?:vendor|trader|stallholder|exhibitor) applications?$/i.test(text(first(n,x=>/^h[2-4]$/.test(x.tag),{scoped:true}))),{scoped:true});
      const proven=new Map();
      for(const block of vendorBlocks) {
        const blockText=text(block),open=/\b(?:vendor|trader|stallholder|exhibitor) applications? (?:are |now )?open\b/i.test(blockText);
        if(!open||/\b(?:closed|waitlist|sold out|volunteer|performer|non[ -]?profits? only|charit(?:y|ies) only|members? only|active chamber members?|invitation only|invite only|(?:returning|existing) vendors? only)\b/i.test(blockText))continue;
        if([...blockText.matchAll(/\b(20\d{2})\b/g)].some(m=>m[1]!==facts.event_start?.slice(0,4)&&m[1]!==facts.event_end?.slice(0,4))){report.reasons.push('contradictory_application_edition');continue;}
        const forms=nodes(block,n=>n.tag==='form',{scoped:true}).filter(form=>{
          const fields=nodes(form,n=>['input','select','textarea'].includes(n.tag)&&n.attrs.type!=='hidden'&&Boolean(n.attrs.name),{scoped:true});
          const submit=first(form,n=>n.tag==='button'&&/^(?:submit|send) (?:your )?(?:(?:vendor|trader|stallholder|exhibitor) )?application$/i.test(text(n)),{scoped:true});
          const action=route(form.attrs.action,document.url);
          return fields.length>=2&&fields.some(n=>/(?:business|product|stall|vendor|trader)/i.test(n.attrs.name))&&submit&&action&&new URL(action).origin===u.origin&&!/\/(?:contact|login|sign-in|register|tickets)(?:\/|$)/i.test(new URL(action).pathname);
        });
        // The currently fetched inline form is the proved route; a link alone
        // cannot prove that its target is a working vendor form rather than a login shell.
        if(forms.length===1)proven.set(document.url,blockText);
      }
      if(organiserHost===u.hostname&&proven.size===1&&!state) {
        const [app,excerpt]=[...proven][0];report.profile='official_vendor';facts.application_url=app;facts.application_state='OPEN_NOW';
        report.application_heading='Vendor application for '+facts.event_name;report.evidence.push({kind:'official_event_vendor_control',excerpt:excerpt.slice(0,14000),url:app});
      } else report.reasons.push('vendor_application_not_proved');
    } else {
      // A visitor ticket offer, contact link or login page never proves vendor availability.
      report.reasons.push('vendor_application_not_proved');
      if(report.profile==='ukcraftfairs'&&/contact (?:the )?organiser/i.test(body))facts.application_state='ENQUIRY_AVAILABLE';
    }
    if(facts.application_deadline&&facts.event_end&&facts.application_deadline>facts.event_end)report.reasons.push('contradictory_application_deadline_after_event');
    if(facts.application_deadline&&facts.application_deadline<now.slice(0,10)){facts.application_state='CLOSED';report.reasons.push('application_deadline_passed');}
    if(facts.application_state!=='OPEN_NOW')report.reasons.push(state==='WAITLIST'?'waitlist_only':facts.application_state==='CLOSED'?'application_closed':'open_vendor_application_not_proved');
    report.reasons=[...new Set(report.reasons)];
    report.status=report.reasons.some(r=>/stale_edition|contradictory_|event_cancelled/.test(r))?'quarantine':report.reasons.length?'partial':'verified';
    return report;
  } catch {report.reasons.push('source_document_cannot_be_verified');return report;}
}

export function compareProof(entity,report) {
  const reasons=[];const f=report.facts;
  if(entity.source_platform==='myntimage'&&f.source_identifier&&entity.source_identifier!==f.source_identifier)reasons.push('source_event_identity_mismatch');
  if(eventNameEditionConflict(f))reasons.push('contradictory_event_name_edition');
  const expected=eventenyParentId(entity.canonical_url),observed=eventenyParentId(provedEventSourceUrl(report));
  if(expected&&expected!==observed)reasons.push(observed?'source_parent_event_identity_mismatch':'source_parent_event_binding_required');
  // This also protects current inventory backed by an older parser report.
  // Retain the source's anomalous date; never invent a corrected deadline.
  if(f.application_deadline&&f.event_end&&f.application_deadline>f.event_end)reasons.push('contradictory_application_deadline_after_event');
  if(f.country&&f.country!==entity.market)reasons.push('source_country_market_mismatch');
  if(f.event_start&&entity.edition&&entity.edition!=='unknown'&&/^\d{4}$/.test(entity.edition)&&entity.edition!==f.event_start.slice(0,4))reasons.push('source_edition_identity_mismatch');
  for(const key of ['event_name','organiser','event_start','event_end'])if(f[key]&&entity[key]&&(key.startsWith('event_')&&key!=='event_name'?calendarDate(f[key])!==calendarDate(entity[key]):token(f[key])!==token(entity[key])))reasons.push('selected_'+key+'_disagrees_with_proof');
  if(f.location&&entity.location){const verified=new Set(token(f.location).split(' '));if(token(entity.location).split(' ').some(t=>!verified.has(t)))reasons.push('selected_location_disagrees_with_proof');}
  if(f.application_deadline&&entity.application_deadline&&calendarDate(f.application_deadline)!==calendarDate(entity.application_deadline))reasons.push('selected_application_deadline_disagrees_with_proof');
  const provedLanding=report.profile==='localstalls'&&report.application_landing_url&&sameRoute(entity.application_url,report.application_landing_url)&&report.evidence?.some(e=>e.kind==='event_application_control');
  if(f.application_url&&entity.application_url&&!sameRoute(f.application_url,entity.application_url)&&!provedLanding)reasons.push('selected_application_url_disagrees_with_proof');
  // A source-confirmed open application corroborates the current availability of a
  // discovery labelled ROLLING. It does not prove perpetual/rolling availability;
  // the commercial state is the proved OPEN_NOW value, with the original retained.
  const currentlyOpen=entity.application_state==='ROLLING'&&f.application_state==='OPEN_NOW';
  if(f.application_state&&entity.application_state&&f.application_state!==entity.application_state&&!currentlyOpen)reasons.push('selected_application_state_disagrees_with_proof');
  return reasons;
}
