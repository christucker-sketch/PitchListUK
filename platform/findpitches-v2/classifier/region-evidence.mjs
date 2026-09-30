import { extractHtmlMetadataText } from '../engine/html-metadata.mjs';
import { enabledGeographies } from '../geography/catalog.mjs';

export function resolveEvidenceRegion({
  market,
  expectedRegionCode,
  body,
  title = null
} = {}) {
  const code=String(market||'').trim().toUpperCase();
  if(!['GB','US'].includes(code))return null;
  const expected=String(expectedRegionCode||'').trim().toUpperCase();
  const geos=enabledGeographies(code);

  const structured=structuredEventRegions(body,geos);
  const structuredDecision=decision(structured,expected,geos,'schema_event_region',.97);
  if(structuredDecision)return structuredDecision;

  if(code==='US'){
    const explicit=explicitUsRegionHits(body,geos,title);
    const explicitDecision=decision(explicit,expected,geos,'explicit_us_state_address',.95);
    if(explicitDecision)return explicitDecision;
  }

  const contextual=contextualEventRegions(body,geos,title);
  return decision(contextual,expected,geos,'event_context_region',.9);
}

function decision(hits,expected,geos,kind,confidence){
 const normalized=(Array.isArray(hits)?hits:[]).map(hit=>typeof hit==='string'?{code:hit,matched:null}:hit).filter(hit=>hit?.code);
 const unique=[...new Set(normalized.map(hit=>String(hit.code).toUpperCase()))];
 if(unique.length!==1)return null;
 const regionCode=unique[0];
 if(!regionCode)return null;
 const region=geos.find(item=>String(item.code).toUpperCase()===regionCode);
 if(!region)return null;
 const matched=normalized.find(hit=>String(hit.code).toUpperCase()===regionCode&&hit.matched)?.matched||null;
 const localityHint=canonicalCityAlias(matched);
 if(regionCode===expected&&!localityHint)return null;
 return Object.freeze({
  from_region_code:expected||null,
  region_code:regionCode,
  region:region.name,
  locality_hint:localityHint,
  region_changed:regionCode!==expected,
  kind,
  confidence
 });
}

function structuredEventRegions(body,geos){
 const result=[];
 const html=String(body||'');
 const re=/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
 let match;
 while((match=re.exec(html))){
  let parsed;try{parsed=JSON.parse(match[1].trim());}catch{continue;}
  for(const event of eventNodes(parsed)){
   const locations=Array.isArray(event.location)?event.location:[event.location];
   for(const loc of locations){
    if(!loc||typeof loc!=='object')continue;
    const address=loc.address&&typeof loc.address==='object'?loc.address:{};
    const mapped=matchRegion(address.addressRegion,geos);
    if(mapped)result.push({code:mapped,matched:null});
   }
  }
 }
 return result;
}

function explicitUsRegionHits(body,geos,title=null){
 const text=[String(title||''),extractHtmlMetadataText(body),htmlToLines(stripSiteChrome(body))].filter(Boolean).join('\n');
 const byCode=new Map(geos.map(item=>[String(item.code).toUpperCase(),item]));
 const hits=[];
 const codePattern=/,\s*(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b/g;
 let match;
 while((match=codePattern.exec(text))){
  const state=byCode.get(match[1]);
  if(state)hits.push({code:state.code,matched:match[1]});
 }
 for(const line of text.split(/\n+/).map(x=>x.trim()).filter(Boolean)){
  if(line.length>600||!eventContext(line))continue;
  for(const item of geos){
   if(phraseMention(line,item.name))hits.push({code:item.code,matched:item.name});
  }
 }
 return hits;
}

function contextualEventRegions(body,geos,title=null){
 const titleText=String(title||'').trim();
 const text=[titleText,extractHtmlMetadataText(body),htmlToLines(stripSiteChrome(body))].filter(Boolean).join('\n');
 const result=[];
 for(const line of text.split(/\n+/).map(x=>x.trim()).filter(Boolean)){
  if(line.length>600||!eventContext(line))continue;
  const hits=[];
  for(const item of geos){
   const variants=[item.name,...(item.aliases||[])]
    .map(value=>String(value||'').trim())
    .filter(value=>value.length>=4);
   for(const variant of variants){
    if(phraseMention(line,variant))hits.push({code:String(item.code).toUpperCase(),matched:variant});
   }
  }
  const unique=[...new Set(hits.map(hit=>hit.code))];
  if(unique.length===1){
   const preferred=hits.find(hit=>isCityAlias(hit.matched))||hits[0];
   result.push(preferred);
  }
 }
 return result;
}

function isCityAlias(value){return Boolean(canonicalCityAlias(value));}
function canonicalCityAlias(value){
 const text=String(value||'').trim();
 const aliases={
  'leeds':'Leeds','bradford':'Bradford','sheffield':'Sheffield','manchester':'Manchester',
  'liverpool':'Liverpool','birmingham':'Birmingham','newcastle upon tyne':'Newcastle upon Tyne',
  'newcastle':'Newcastle upon Tyne'
 };
 return aliases[text.toLowerCase()]||null;
}

function matchRegion(value,geos){
 const needle=normalize(value);
 if(!needle)return null;
 for(const item of geos){
  for(const variant of [item.name,...(item.aliases||[])]){
   if(normalize(variant)===needle)return String(item.code).toUpperCase();
  }
 }
 return null;
}

function eventNodes(value,out=[]){
 if(Array.isArray(value)){for(const item of value)eventNodes(item,out);return out;}
 if(!value||typeof value!=='object')return out;
 if(eventType(value['@type']))out.push(value);
 if(Array.isArray(value['@graph']))for(const item of value['@graph'])eventNodes(item,out);
 return out;
}
function eventType(value){
 const values=Array.isArray(value)?value:[value];
 return values.map(String).some(type=>/(?:^|:)\w*Event$/i.test(type)||/\bEvent$/i.test(type));
}
function stripSiteChrome(value){
 return String(value||'').replace(/<(nav|header|footer|aside)\b[^>]*>[\s\S]*?<\/\1>/gi,' ');
}
function htmlToLines(value){
 return decodeEntities(String(value||'')
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
  .replace(/<\/(?:p|div|h[1-6]|li|section|article|tr)>/gi,'\n')
  .replace(/<br\s*\/?>/gi,'\n')
  .replace(/<[^>]+>/g,' '))
  .replace(/[\t ]+/g,' ').replace(/\n\s+/g,'\n').trim();
}
function eventContext(value){
 return /\b(?:festival|fair|market|event|show|expo|exhibition|vendor|trader|stallholder|exhibitor|apply|application|held|takes?\s+place|taking\s+place)\b/i.test(String(value||''));
}
function phraseMention(text,phrase){
 const h=normalize(text),n=normalize(phrase);
 return n.length>=4&&(' '+h+' ').includes(' '+n+' ');
}
function normalize(value){
 return String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
  .replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
}
function decodeEntities(value){
 return String(value||'')
  .replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'")
  .replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&nbsp;/gi,' ');
}
