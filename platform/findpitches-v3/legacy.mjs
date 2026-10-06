import {EXPORT_SCHEMA,FIELDS,hash,publicHttps,platformId} from './contract.mjs';

export const LEGACY_AUTHORITIES=Object.freeze({retained_structured:85,retained_excerpt:60,direct_event:90,direct_heading:80,source_route:60,historical_state:40});
export function legacySourceUrl(value) {
  if(!publicHttps(value))return false;
  const host=new URL(value).hostname;
  return !/^\d+(?:\.\d+){3}$/.test(host)&&!host.endsWith('.internal')&&!host.endsWith('.localhost');
}
export function cleanText(value) {
  return String(value??'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
    .replace(/<[^>]+>/g,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&nbsp;/gi,' ')
    .replace(/&#(\d+);/g,(_,n)=>Number(n)<=0x10ffff?String.fromCodePoint(Number(n)):' ').replace(/\s+/g,' ').trim();
}
export function specificEventName(value) {
  const text=cleanText(value);
  return text.length>=8&&text.length<=500&&!/^(?:home|events?|vendors?|vendor application|vendor registration|exhibitor application|applications?|apply now|contact us|eventeny|index)(?:\s*[-|:].*)?$/i.test(text);
}
export function supportedTradingHeading(value,{retained=false}={}) {
  const text=cleanText(value).replace(/([a-z])([A-Z])/g,'$1 $2').replace(/([A-Za-z])(\d)/g,'$1 $2');
  const trading=/\b(?:markets?|festivals?|fairs?|expos?|exhibitions?|shows?|trade\s?shows?|bazaars?|carnivals?|fetes?|fêtes?)\b/i;
  return specificEventName(text)&&(trading.test(text)||!retained&&/\bevents?\b/i.test(text))
    &&!/\b(?:procurement|purchasing bids|request for proposals|journal|stakeholder feedback|news|marketing|blog|log ?in|sign ?in|enter credentials|access denied|create (?:an? )?account)\b/i.test(text);
}
function date(value) {return typeof value==='string'&&/^\d{4}-\d\d-\d\d(?:T.*)?$/.test(value)&&Number.isFinite(Date.parse(value))?value.slice(0,10):null;}
function values(value) {return Array.isArray(value)?value:value?[value]:[];}
function events(value,out=[]) {
  if(Array.isArray(value))for(const v of value)events(v,out);
  else if(value&&typeof value==='object') {
    if(values(value['@type']).some(t=>typeof t==='string'&&/(?:^|\/)Event$/.test(t)))out.push(value);
    for(const [key,v] of Object.entries(value))if(key!=='@context'&&v&&typeof v==='object')events(v,out);
  }
  return out;
}
export async function extractLegacyPage(html,url,{now=new Date().toISOString()}={}) {
  const text=cleanText(html).slice(0,100000),ld=[];
  for(const m of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {ld.push(...events(JSON.parse(m[1])));}catch {/* Unparseable markup supplies no facts. */}
  }
  const named=ld.filter(e=>specificEventName(e.name));
  // A listing page with several events cannot establish which historical record it is.
  if(named.length>1)return {reason:'multiple_source_events_require_review',url,content_hash:await hash(html),checked_at:now};
  const vendor=/\b(vendors?|stallholders?|exhibitors?|traders?|craft fair|farmers.? market)\b/i.test(text)
    &&/\b(apply|application|registration|enquir|contact the organi[sz]er|book a (?:stall|table|booth))\w*/i.test(text);
  const e=named[0];let fields={},kind='direct_event';
  if(e&&vendor) {
    const location=e.location??{},address=location.address??{};
    fields={event_name:cleanText(e.name),organiser:cleanText(e.organizer?.name)||null,
      location:typeof location==='string'?cleanText(location):[location.name,address.streetAddress,address.addressLocality,address.addressRegion,address.postalCode].filter(v=>typeof v==='string').join(', ')||null,
      event_start:date(e.startDate),event_end:date(e.endDate)};
    const country=typeof address.addressCountry==='object'?address.addressCountry.name:address.addressCountry;
    fields.source_country=country??null;
  } else {
    kind='direct_heading';
    const heading=cleanText(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]);
    const title=cleanText(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]);
    const name=specificEventName(heading)?heading:specificEventName(title)?title:null;
    // A real title and explicit event/trading context are both necessary. Ordinary
    // supplier procurement and journal/news pages cannot pass on 'vendor' alone.
    if(!name||!vendor||!supportedTradingHeading(name))
      return {reason:'source_does_not_establish_specific_trading_event',url,content_hash:await hash(html),checked_at:now};
    fields={event_name:name};
  }
  const state='UNKNOWN'; // An application phrase does not prove current availability.
  let application=null;
  for(const link of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const label=cleanText(link[2]);
    if(!/\b(vendor|stallholder|exhibitor|trader)\b/i.test(label)||!/\b(apply|application|register|registration|book)\b/i.test(label))continue;
    try {const route=new URL(link[1].replace(/&amp;/g,'&'),url).toString();if(legacySourceUrl(route)&&!/\/events\/applications\/?(?:\?|$)/i.test(route)){application=route;break;}}catch {}
  }
  fields={...fields,canonical_url:url,application_url:application,application_state:state,lifecycle_state:'WATCH'};
  const evidence={source:url,kind,excerpt:text.slice(0,12000),structured_event:e?{name:e.name,startDate:e.startDate,endDate:e.endDate,location:e.location,organizer:e.organizer}:undefined,content_sha256:await hash(html),fetched_at:now};
  return {fields,evidence,kind,url,content_hash:evidence.content_sha256,checked_at:now};
}
export async function fetchLegacySource(url,{fetcher=fetch,now=new Date().toISOString()}={}) {
  let current=url;const visited=[];
  try {
    for(let redirects=0;redirects<=3;redirects++) {
      if(!legacySourceUrl(current))return {reason:'unsafe_original_source_url',url,checked_at:now};
      if(visited.includes(current))return {reason:'source_redirect_loop',url,checked_at:now};
      visited.push(current);
      const response=await fetcher(current,{redirect:'manual',headers:{'User-Agent':'FindPitches-V3-Shadow-Recovery/1.0','Accept':'text/html,application/xhtml+xml'},signal:AbortSignal.timeout(12000)});
      if([301,302,303,307,308].includes(response.status)) {current=new URL(response.headers.get('location'),current).toString();continue;}
      if(!response.ok) {
        const header=response.headers.get('retry-after');
        const requestedDelay=header&&/^\d+$/.test(header)?Number(header):header?Math.ceil((Date.parse(header)-Date.parse(now))/1000):null;
        const retryAfter=response.status===429?Math.min(3600,Math.max(60,Number.isFinite(requestedDelay)?requestedDelay:900)):null;
        return {reason:'source_http_'+response.status,url,checked_at:now,...retryAfter?{retry_after_seconds:retryAfter}:{}};
      }
      if(!/(?:text\/html|application\/xhtml\+xml)/i.test(response.headers.get('content-type')??''))return {reason:'source_format_requires_review',url,checked_at:now};
      const reader=response.body.getReader(),parts=[];let size=0;
      try {for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1048576){await reader.cancel();return {reason:'source_response_size_limit',url,checked_at:now};}parts.push(value);}}
      finally {reader.releaseLock();}
      const bytes=new Uint8Array(size);let at=0;for(const part of parts){bytes.set(part,at);at+=part.length;}
      const page=await extractLegacyPage(new TextDecoder().decode(bytes),current,{now});
      return {...page,requested_url:url,redirect_chain:visited};
    }
    return {reason:'source_redirect_limit',url,checked_at:now};
  } catch {return {reason:'source_fetch_failed',url,checked_at:now};}
}
export function legacyRecord({id,market,fields,fieldEvidence,evidence,provenance,lastChecked,firstSeen,lastSeen}) {
  const source=fields.application_url??fields.canonical_url;
  const canonical={...fields,application_state:fields.application_state??'UNKNOWN',lifecycle_state:fields.lifecycle_state??'WATCH',source_identifier:fields.source_identifier??platformId(source)};
  const proofs={...fieldEvidence};
  for(const field of ['application_state','lifecycle_state','source_identifier'])if(canonical[field]!=null&&!proofs[field])
    proofs[field]={kind:field==='source_identifier'?'source_route':'historical_state',source,excerpt:field==='source_identifier'?source:'Historical availability requires audit; no current opening is asserted.'};
  return {schema_version:EXPORT_SCHEMA,opportunity_id:id,country_code:market,...canonical,
    first_seen:firstSeen??null,last_seen:lastSeen??null,last_checked:lastChecked??null,evidence,provenance,field_evidence:proofs,
    legacy_v2:{audit_status:'pending',shadow_only:true},publication_eligible:false,promotion_eligible:false};
}
export function fieldEvidence(fields,{kind,source,excerpt}) {
  return Object.fromEntries(FIELDS.filter(f=>fields[f]!==null&&fields[f]!==undefined).map(f=>[f,{kind:f==='application_state'&&fields[f]==='UNKNOWN'?'historical_state':kind,source,excerpt:String(excerpt).slice(0,3000)}]));
}
