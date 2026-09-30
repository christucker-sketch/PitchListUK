import { classifyVenueEvidence } from '../enrichment/venue-evidence.mjs';
import { enabledGeographies } from '../geography/catalog.mjs';

export const PRODUCT_READINESS_SCHEMA_VERSION='2026-09-30.practical-v2';

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
  readiness:assessPracticalReadiness(record,{now,locationEvidence:location?.provenance?.evidence?.[0]||null}),
  provenance:Object.freeze(location?{location:location.provenance}:{})
 });
}

export function assessPracticalReadiness(record={}, {now=new Date(),locationEvidence=null}={}){
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
 inspectEvidenceQuality(record,locationEvidence,blocked,now);
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
 const evidence=field.evidence.find(item=>{
  if(!safeHttp(item?.source))return false;
  const excerpt=text(item?.excerpt);if(!excerpt||!normalizedContains(excerpt,name))return false;
  if(/\b(?:registered|head|corporate|business|contact|mailing|postal|billing)\s+(?:office|address|location|headquarters|contact)|\b(?:our\s+office|our\s+address|mail\s+to|contact\s+us|registered\s+at)\b/i.test(excerpt))return false;
  if(String(item?.kind||'')==='schema_event_location')return /["']location["']\s*:/i.test(excerpt);
  return /\b(?:festival|fair|market|event|show|concert|vendor|trader|stallholder|exhibitor|apply|application|held|takes?\s+place|taking\s+place)\b/i.test(excerpt);
 });
 if(!evidence)return null;
 const storedPrecision=['place','area'].includes(String(field.precision||''))?String(field.precision):areaPrecision(name);
 return Object.freeze({value:name,precision:storedPrecision,confidence:finite(field.confidence)??0.72,
  provenance:Object.freeze({evidence:Object.freeze([evidence]),confidence:finite(field.confidence)})});
}
function normalizedContains(haystack,needle){
 const normalize=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
  .replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
 const h=normalize(haystack),n=normalize(needle);
 return n.length>=3&&(' '+h+' ').includes(' '+n+' ');
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

function inspectEvidenceQuality(record,evidence,blocked,now){
 const excerpt=text(evidence?.excerpt);
 if(!excerpt)return;
 const context=[record.location,excerpt].filter(Boolean).join(' ');
 if(crossMarketGeography(record.market,record.location,excerpt))blocked.push(reason('cross_market_geography','location'));
 if(regionEvidenceConflict(record,excerpt))blocked.push(reason('region_evidence_conflict','location'));
 if(staleEventYear(excerpt,now))blocked.push(reason('stale_event_year','location'));
 if(genericNonEventVendorPage(excerpt))blocked.push(reason('generic_non_event_vendor_page','location'));
}
function crossMarketGeography(market,location,excerpt){
 const m=upper(market),loc=String(location||''),ex=String(excerpt||''),textValue=[loc,ex].filter(Boolean).join(' ');
 if(!m||!textValue)return false;
 if(countryMismatch(m,textValue))return true;
 const usStateAfterComma=/,\s*(?:alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new\s+hampshire|new\s+jersey|new\s+mexico|new\s+york|north\s+carolina|north\s+dakota|ohio|oklahoma|oregon|pennsylvania|rhode\s+island|south\s+carolina|south\s+dakota|tennessee|texas|utah|vermont|virginia|washington|west\s+virginia|wisconsin|wyoming)\b(?!\s+(?:co\.?|county)\b)/i;
 const usStateCodeAfterComma=/,\s*(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b/;
 if(m!=='US'&&(usStateAfterComma.test(loc)||usStateAfterComma.test(ex)||usStateCodeAfterComma.test(loc)||usStateCodeAfterComma.test(ex)))return true;
 const canadaProvinceAfterComma=/,\s*(?:alberta|british\s+columbia|manitoba|new\s+brunswick|newfoundland(?:\s+and\s+labrador)?|nova\s+scotia|ontario|prince\s+edward\s+island|qu[eé]bec|saskatchewan|northwest\s+territories|nunavut|yukon)\b/i;
 if(m!=='CA'&&(canadaProvinceAfterComma.test(loc)||canadaProvinceAfterComma.test(ex)))return true;
 return false;
}
function countryMismatch(market,value){
 const v=String(value||'');
 const hasUS=/\b(?:united\s+states|usa|u\.s\.a\.?|u\.s\.)\b/i.test(v)||/\bUS\b/.test(v);
 const hasUK=/\b(?:united\s+kingdom|england|scotland|wales|northern\s+ireland)\b/i.test(v)||/\bUK\b/.test(v);
 const hasCA=/\bcanada\b/i.test(v);
 const hasAU=/\baustralia\b/i.test(v);
 const hasNZ=/\bnew\s+zealand\b/i.test(v);
 const hasSG=/\bsingapore\b/i.test(v);
 const hasHK=/\bhong\s+kong\b/i.test(v);
 if(market==='GB')return hasUS||hasCA||hasAU||hasNZ||hasSG||hasHK;
 if(market==='US')return hasUK||hasCA||hasAU||hasNZ||hasSG||hasHK;
 if(market==='CA')return hasUK||hasUS||hasAU||hasNZ||hasSG||hasHK;
 if(market==='IE')return hasUS||hasCA||hasAU||hasNZ||hasSG||hasHK;
 return false;
}
function regionEvidenceConflict(record,excerpt){
 const market=upper(record?.market),expected=upper(record?.region_code);
 if(!market||!expected||!excerpt)return false;
 let geos=[];try{geos=enabledGeographies(market);}catch{return false;}
 const textValue=String(excerpt||'');
 const mentions=new Set();
 for(const item of geos){
  const variants=[item.name,...(item.aliases||[])].map(v=>String(v||'').trim()).filter(v=>v.length>=4);
  if(variants.some(v=>phraseMention(textValue,v)))mentions.add(String(item.code).toUpperCase());
 }
 if(mentions.size===0||mentions.has(expected))return false;
 return true;
}
function phraseMention(textValue,phrase){
 const h=normalizeGeoText(textValue),n=normalizeGeoText(phrase);
 return n.length>=4&&(' '+h+' ').includes(' '+n+' ');
}
function normalizeGeoText(value){return String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();}
function staleEventYear(excerpt,now){
 const year=now.getUTCFullYear();
 const years=[...String(excerpt||'').matchAll(/\b((?:19|20)\d{2})\b/g)].map(m=>({year:Number(m[1]),index:m.index||0}));
 if(!years.length||years.some(x=>x.year>=year-1))return false;
 const plausibleEditionYears=years.filter(x=>x.year>=year-5&&x.year<=year-2&&!/\b(?:founded|established|formed|created|since|operating\s+since)\b/i.test(excerpt.slice(Math.max(0,x.index-72),Math.min(excerpt.length,x.index+12))));
 if(!plausibleEditionYears.length)return false;
 const event=/\b(?:festival|fair|market|event|show|expo|exhibition|fete|carnival|parade|vendor|trader|stallholder|exhibitor|application|apply|deadline|held|takes?\s+place)\b/i;
 return plausibleEditionYears.some(x=>{
  const start=Math.max(0,x.index-60),end=Math.min(excerpt.length,x.index+64);
  return event.test(excerpt.slice(start,end));
 });
}
function genericNonEventVendorPage(excerpt){
 const v=String(excerpt||'');
 const strongEvent=/\b(?:festival|fair|farmers?\s+market|street\s+market|craft\s+market|event|show|expo|exhibition|fete|carnival|parade|concert)\b/i;
 if(strongEvent.test(v))return false;
 return /\b(?:vendor\s+licen[cs](?:e|ing)|business\s+licen[cs](?:e|ing)|food\s+truck\s+licen[cs](?:e|ing)|permit\s+(?:guide|application|form)|supplier\s+registration|vendor\s+registration|procurement|state\s+employee\s+discount|employee\s+discount\s+program|alcohol(?:ic)?\s+beverage\s+(?:control|services)|\bdabs\b|business\s+directory|vendor\s+directory|beauty\s+salon|salon\s+marketplace|book\s+an?\s+appointment)\b/i.test(v);
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
