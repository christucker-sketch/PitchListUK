import { classifyVenueEvidence } from '../enrichment/venue-evidence.mjs';

export const PRODUCT_READINESS_SCHEMA_VERSION='2026-09-30.practical-v1';

const WRAPPER_HOSTS=new Set(['google.com','www.google.com','google.co.uk','www.google.co.uk','google.com.hk','www.google.com.hk']);
const SOCIAL_HOSTS=new Set(['instagram.com','www.instagram.com','facebook.com','www.facebook.com','x.com','www.x.com','twitter.com','www.twitter.com']);
const BLOCKED_PATH_TERMS=Object.freeze(['procurement','supplier','vendor-registration','vendor_registration','rfp','tender']);

export function projectPracticalOpportunity(candidate={},enrichment={}, {now=new Date()}={}){
 const venue=venueLocation(enrichment.location);
 const area=venue?null:supportedArea(enrichment.location_area);
 const location=venue||area;
 const record=Object.freeze({
  id:text(candidate.id??candidate.candidate_id),
  market:upper(candidate.market),
  title:text(value(enrichment.title)??candidate.event_name),
  organiser:text(value(enrichment.organiser)??candidate.organiser),
  region_code:text(value(enrichment.region_code)??candidate.region_code??candidate.geography?.region_code),
  location:location?.value??null,
  location_precision:location?.precision??null,
  location_confidence:location?.confidence??null,
  venue_verified:location?.precision==='venue',
  event_start:text(value(enrichment.event_start)??candidate.event_start),
  event_end:text(value(enrichment.event_end)??candidate.event_end),
  application_deadline:text(value(enrichment.application_deadline)??candidate.deadline),
  canonical_url:text(candidate.canonical_url),
  application_url:text(candidate.application_url),
  last_checked:text(candidate.last_checked)
 });
 return Object.freeze({
  opportunity:record,
  readiness:assessPracticalReadiness(record,{now}),
  provenance:Object.freeze(location?{location:location.provenance}:{})
 });
}

export function assessPracticalReadiness(record={}, {now=new Date()}={}){
 const missing=[],invalid=[],blocked=[];
 for(const field of ['id','market','title','region_code','canonical_url','application_url','last_checked']){
  if(!present(record[field]))missing.push(field);
 }
 if(!present(record.location)||!['venue','place','area'].includes(String(record.location_precision||'')))missing.push('location');
 for(const field of ['canonical_url','application_url'])if(present(record[field])&&!httpUrl(record[field]))invalid.push(field);
 if(present(record.canonical_url))inspectUrl('canonical_url',record.canonical_url,blocked,now);
 if(present(record.application_url))inspectUrl('application_url',record.application_url,blocked,now);
 if(record.event_end&&past(record.event_end,now))blocked.push(reason('event_ended','event_end'));
 if(record.application_deadline&&past(record.application_deadline,now))blocked.push(reason('application_deadline_passed','application_deadline'));
 return Object.freeze({
  schema_version:PRODUCT_READINESS_SCHEMA_VERSION,
  ready:missing.length===0&&invalid.length===0&&blocked.length===0,
  completeness:Object.freeze({
   venue:Boolean(record.venue_verified),
   event_date:present(record.event_start),
   application_deadline:present(record.application_deadline)
  }),
  missing:Object.freeze(missing),invalid:Object.freeze(invalid),blocked:Object.freeze(blocked)
 });
}

function venueLocation(field){
 if(!field||typeof field!=='object'||!('value' in field))return null;
 const check=classifyVenueEvidence(field);if(!check.accepted)return null;
 return Object.freeze({value:text(field.value),precision:'venue',confidence:finite(field.confidence)??0.9,
  provenance:Object.freeze({evidence:Object.freeze([check.evidence]),confidence:finite(field.confidence)})});
}
function supportedArea(field){
 if(!field||typeof field!=='object'||!('value' in field)||!Array.isArray(field.evidence)||!field.evidence.length)return null;
 const name=text(field.value);if(!name)return null;
 const evidence=field.evidence.find(item=>safeHttp(item?.source)&&text(item?.excerpt)?.toLowerCase().includes(name.toLowerCase()));
 if(!evidence)return null;
 return Object.freeze({value:name,precision:areaPrecision(name),confidence:finite(field.confidence)??0.72,
  provenance:Object.freeze({evidence:Object.freeze([evidence]),confidence:finite(field.confidence)})});
}
function areaPrecision(value){
 const v=String(value||'');
 if(/\b(?:county|shire|province|territory|region|district|state)\b/i.test(v))return 'area';
 if(/^[A-Z]{2}$/.test(v))return 'area';
 return 'place';
}
function inspectUrl(field,value,blocked,now){
 let url;try{url=new URL(String(value));}catch{return;}
 const host=url.hostname.toLowerCase(),path=url.pathname.toLowerCase();
 if(WRAPPER_HOSTS.has(host)&&(path==='/url'||url.searchParams.has('url')||url.searchParams.has('q')))blocked.push(reason('search_wrapper_url',field));
 if(SOCIAL_HOSTS.has(host))blocked.push(reason('social_url',field));
 if(BLOCKED_PATH_TERMS.some(term=>path.includes(term)))blocked.push(reason('procurement_or_supplier_url',field));
 const year=now.getUTCFullYear(),years=[...String(value).matchAll(/(?:19|20)\d{2}/g)].map(m=>Number(m[0]));
 if(years.some(y=>y<year-1))blocked.push(reason('stale_year_in_url',field));
}
function reason(code,field){return Object.freeze({code,field});}
function past(value,now){const t=Date.parse(value);return Number.isFinite(t)&&t<now.getTime();}
function value(field){return field&&typeof field==='object'&&!Array.isArray(field)&&'value' in field?field.value:field;}
function text(v){const s=String(v??'').trim();return s||null;}
function upper(v){const s=text(v);return s?s.toUpperCase():null;}
function finite(v){const n=Number(v);return Number.isFinite(n)?n:null;}
function present(v){return v!==null&&v!==undefined&&String(v).trim()!=='';}
function httpUrl(v){try{const u=new URL(String(v));return u.protocol==='http:'||u.protocol==='https:';}catch{return false;}}
function safeHttp(v){return httpUrl(v);}
