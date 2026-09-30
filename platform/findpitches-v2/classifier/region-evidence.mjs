import { enabledGeographies } from '../geography/catalog.mjs';

export function resolveEvidenceRegion({
  market,
  expectedRegionCode,
  body
} = {}) {
  const code=String(market||'').trim().toUpperCase();
  if(code!=='GB')return null;
  const expected=String(expectedRegionCode||'').trim().toUpperCase();
  const geos=enabledGeographies('GB');

  const structured=structuredEventRegions(body,geos);
  const structuredDecision=decision(structured,expected,geos,'schema_event_region',.97);
  if(structuredDecision)return structuredDecision;

  const contextual=contextualEventRegions(body,geos);
  return decision(contextual,expected,geos,'event_context_region',.9);
}

function decision(codes,expected,geos,kind,confidence){
 const unique=[...new Set(codes)].filter(Boolean);
 if(unique.length!==1)return null;
 const regionCode=unique[0];
 if(!regionCode||regionCode===expected)return null;
 const region=geos.find(item=>String(item.code).toUpperCase()===regionCode);
 if(!region)return null;
 return Object.freeze({
  from_region_code:expected||null,
  region_code:regionCode,
  region:region.name,
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
    if(mapped)result.push(mapped);
   }
  }
 }
 return result;
}

function contextualEventRegions(body,geos){
 const text=htmlToLines(stripSiteChrome(body));
 const result=[];
 for(const line of text.split(/\n+/).map(x=>x.trim()).filter(Boolean)){
  if(line.length>600||!eventContext(line))continue;
  const hits=[];
  for(const item of geos){
   const variants=[item.name,...(item.aliases||[])]
    .map(value=>String(value||'').trim())
    .filter(value=>value.length>=4);
   if(variants.some(value=>phraseMention(line,value)))hits.push(String(item.code).toUpperCase());
  }
  const unique=[...new Set(hits)];
  if(unique.length===1)result.push(unique[0]);
 }
 return result;
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
