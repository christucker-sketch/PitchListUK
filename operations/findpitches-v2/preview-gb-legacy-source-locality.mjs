#!/usr/bin/env node
import fs from 'node:fs';
import {opportunitySnapshot} from '../../functions/_data/opportunities.mjs';
import {createHttpFetchProvider} from '../../platform/findpitches-v2/providers/fetch/http.mjs';
import {createDefaultCandidateEvaluator} from '../../platform/findpitches-v2/engine/evaluator.mjs';
import {previewCandidateEnrichment} from '../../platform/findpitches-v2/enrichment/run-batch.mjs';
import {projectPracticalOpportunity} from '../../platform/findpitches-v2/customer/practical-readiness.mjs';
import {extractHtmlMetadataText} from '../../platform/findpitches-v2/engine/html-metadata.mjs';
import {enabledGeographies} from '../../platform/findpitches-v2/geography/catalog.mjs';
import {getMarket} from '../../platform/findpitches-v2/markets/registry.mjs';

const API='https://api.cloudflare.com/client/v4';
const DB='6732bcc9-a172-4d38-ad4d-7660ed13392f';
const account=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
const token=String(process.env.CLOUDFLARE_API_TOKEN||'').trim();
if(!account||!token)throw new Error('legacy_source_locality_preview_credentials_missing');

async function d1(sql,params=[]){
 if(!/^\s*(?:SELECT|WITH)\b/i.test(sql)||/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|REPLACE)\b/i.test(sql))throw new Error('legacy_source_locality_preview_non_read_only_sql');
 const response=await fetch(API+'/accounts/'+encodeURIComponent(account)+'/d1/database/'+DB+'/query',{
  method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},
  body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(20000)
 });
 const payload=await response.json();
 if(!response.ok||payload?.success!==true||payload?.result?.[0]?.success!==true)throw new Error('legacy_source_locality_preview_d1_http_'+response.status);
 return payload.result[0].results||[];
}

const legacy=(Array.isArray(opportunitySnapshot?.rows)?opportunitySnapshot.rows:[])
 .filter(r=>r.quality_status==='customer_ready'||r.publishable===true);
const rows=await d1(`
 SELECT c.id,c.market,c.region_code,c.canonical_url,c.application_url,c.event_name,c.organiser,
        c.geography_json,c.evidence_json,c.last_checked,e.enrichment_json,e.source_last_checked
 FROM candidates c
 LEFT JOIN candidate_enrichment e ON e.candidate_id=c.id AND e.source_last_checked>=c.last_checked
 WHERE c.status='validated' AND c.market='GB'
 ORDER BY c.id
`);

const byUrl=new Map();
for(const row of rows){
 for(const url of [row.canonical_url,row.application_url]){
  const key=normUrl(url);if(!key)continue;
  if(!byUrl.has(key))byUrl.set(key,[]);
  byUrl.get(key).push(row);
 }
}

const overlap=[];const seen=new Set();
for(const old of legacy){
 const keys=[old.canonical_url,old.application_url,old.url,old.source_url].map(normUrl).filter(Boolean);
 for(const row of [...new Set(keys.flatMap(k=>byUrl.get(k)||[]))]){
  if(seen.has(row.id))continue;seen.add(row.id);
  const projected=projectPracticalOpportunity({...row,candidate_id:row.id,geography:parse(row.geography_json)},parse(row.enrichment_json),{now:new Date()});
  if(projected.readiness.ready||!projected.readiness.missing.includes('location'))continue;
  overlap.push({row,legacy_title:old.title||old.event_name||null,legacy_location:old.location||null});
 }
}

const geos=enabledGeographies('GB');
const fetchProvider=createHttpFetchProvider();
const evaluator=createDefaultCandidateEvaluator({fetchProvider,now:()=>new Date()});
const outcomes=[];

for(let i=0;i<overlap.length;i+=4){
 const chunk=overlap.slice(i,i+4);
 const part=await Promise.all(chunk.map(async item=>{
  const row=item.row;
  try{
   const oldGeo=parse(row.geography_json);
   const oldLocation=String(oldGeo.discovery_location||oldGeo.locality||oldGeo.region||row.region_code||'').trim();
   const evaluated=await evaluator({
    market:getMarket('GB'),region_code:row.region_code,location:oldLocation,
    result:{url:row.canonical_url,title:row.event_name}
   });
   if(evaluated.status!=='validated'){
    return {id:row.id,title:row.event_name,legacy_title:item.legacy_title,classifier_status:evaluated.status,rejection_reason:evaluated.rejection_reason,practical_usable:false};
   }
   const correctedRegion=evaluated.geography?.region_code||row.region_code;
   const page=await fetchProvider.fetch(row.canonical_url);
   const sourceText=currentSourceText(page.body,evaluated.event_name||row.event_name);
   const localityCandidates=unique([
    ...extractCurrentLocalities(sourceText.title),
    ...extractCurrentLocalities(sourceText.metadata),
    ...extractBodyLocalities(sourceText.body),
    ...legacyHintLocalities(item.legacy_location).filter(x=>normalizedMention(sourceText.all,x))
   ]).slice(0,12);

   const verified=[];
   for(const locality of localityCandidates){
    const check=await verifyPlace(locality,correctedRegion);
    if(check.accepted)verified.push(check);
   }
   const distinct=unique(verified.map(v=>normalize(v.locality)));
   if(distinct.length!==1){
    return {id:row.id,title:row.event_name,legacy_title:item.legacy_title,classifier_status:'validated',corrected_region_code:correctedRegion,locality_candidates:localityCandidates,verified_localities:verified.map(v=>v.locality),practical_usable:false,reason:distinct.length?'ambiguous_verified_locality':'no_verified_locality'};
   }

   const chosen=verified.find(v=>normalize(v.locality)===distinct[0]);
   if(!normalizedMention(sourceText.all,chosen.locality)){
    return {id:row.id,title:row.event_name,classifier_status:'validated',practical_usable:false,reason:'verified_locality_not_in_current_source'};
   }

   const geography={...(evaluated.geography||oldGeo),region_code:correctedRegion,locality:chosen.locality};
   const candidate={
    ...row,id:row.id,candidate_id:row.id,market:'GB',region_code:correctedRegion,
    event_name:evaluated.event_name||row.event_name,organiser:evaluated.organiser||row.organiser,
    canonical_url:evaluated.canonical_url||row.canonical_url,application_url:evaluated.application_url||row.application_url,
    geography,geography_json:JSON.stringify(geography),evidence_json:JSON.stringify(evaluated.evidence||[])
   };
   const preview=await previewCandidateEnrichment(candidate,{fetchProvider});
   const projected=projectPracticalOpportunity(candidate,preview.enrichment,{now:new Date()});
   return {
    id:row.id,title:row.event_name,legacy_title:item.legacy_title,url:row.canonical_url,
    classifier_status:'validated',corrected_region_code:correctedRegion,
    verified_locality:chosen.locality,os_place:chosen.place,
    recovered_location:projected.opportunity.location,
    location_precision:projected.opportunity.location_precision,
    event_start:projected.opportunity.event_start||null,
    application_deadline:projected.opportunity.application_deadline||null,
    date_lines:String(sourceText.body||'').split(/\n+/).map(x=>x.trim()).filter(x=>/\b(?:20\d{2}|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i.test(x)).slice(0,20),
    practical_usable:projected.readiness.ready,
    missing:projected.readiness.missing,blocked:projected.readiness.blocked,
    evidence:projected.provenance?.location?.evidence?.[0]||null
   };
  }catch(error){
   return {id:row.id,title:row.event_name,legacy_title:item.legacy_title,classifier_status:'error',practical_usable:false,error:String(error?.message||error)};
  }
 }));
 outcomes.push(...part);
}

const result={
 at:new Date().toISOString(),
 legacy_ready:legacy.length,
 overlap_missing_location:overlap.length,
 sampled:outcomes.length,
 classifier_validated:outcomes.filter(x=>x.classifier_status==='validated').length,
 classifier_rejected:outcomes.filter(x=>x.classifier_status==='rejected').length,
 classifier_errors:outcomes.filter(x=>x.classifier_status==='error').length,
 verified_locality:outcomes.filter(x=>x.verified_locality).length,
 recovered_locations:outcomes.filter(x=>x.recovered_location).length,
 practical_usable:outcomes.filter(x=>x.practical_usable).length,
 outcomes
};
fs.writeFileSync('gb-legacy-source-locality-preview.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({...result,outcomes:undefined},null,2));

function currentSourceText(html,fallbackTitle){
 const raw=String(html||'');
 const title=(raw.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]||fallbackTitle||'');
 const metadata=extractHtmlMetadataText(raw);
 const body=decode(stripTags(raw
  .replace(/<(nav|header|footer|aside)\b[^>]*>[\s\S]*?<\/\1>/gi,' ')
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
  .replace(/<\/(?:p|div|h[1-6]|li|section|article|tr)>/gi,'\n')
  .replace(/<br\s*\/?>/gi,'\n')));
 return {title:decode(stripTags(title)),metadata,body,all:[title,metadata,body].join('\n')};
}
function extractCurrentLocalities(value){
 const text=decode(String(value||'')).replace(/\s+/g,' ').trim();if(!text)return [];
 const out=[];
 const patterns=[
  /\b([A-Z][A-Za-z'’.-]+(?:\s+[A-Z][A-Za-z'’.-]+){0,2})\s+(?:farmers?['’]?\s+market|food\s+festival|christmas\s+(?:market|fair)|craft\s+(?:market|fair)|festival|fair|market|show)\b/g,
  /(?:^|[|–—:-]\s*)([A-Z][A-Za-z'’.-]+(?:\s+[A-Z][A-Za-z'’.-]+){0,2})(?=\s*(?:[|–—]|$))/g
 ];
 for(const pattern of patterns){let m;while((m=pattern.exec(text)))if(candidateName(m[1]))out.push(clean(m[1]));}
 return unique(out);
}
function extractBodyLocalities(value){
 const lines=String(value||'').split(/\n+/).map(x=>x.trim()).filter(Boolean);
 const out=[];
 for(const line of lines){
  if(line.length>300)continue;
  const patterns=[
   /\b(?:in|at|near|based\s+in|located\s+in)\s+([A-Z][A-Za-z'’.-]+(?:\s+[A-Z][A-Za-z'’.-]+){0,2})(?=\s*(?:[,.;|–—]|town\s+centre|city\s+centre|$))/g,
   /,\s*([A-Z][A-Za-z'’.-]+(?:\s+[A-Z][A-Za-z'’.-]+){0,2})(?=\s*(?:[,.;|–—]|[A-Z]{1,2}\d|$))/g,
   /\b([A-Z][A-Za-z'’.-]+(?:\s+[A-Z][A-Za-z'’.-]+){0,2})\s+town\s+centre\b/g,
   /\b(?:food|street\s+food|vendor|trader|market)[^.!?]{0,80}\bin\s+([A-Z][A-Za-z'’.-]+(?:\s+[A-Z][A-Za-z'’.-]+){0,2})\b/g
  ];
  for(const pattern of patterns){let m;while((m=pattern.exec(line)))if(candidateName(m[1]))out.push(clean(m[1]));}
 }
 return unique(out);
}
function legacyHintLocalities(value){
 const text=String(value||'').trim();if(!text)return [];
 return unique(text.split(',').map(clean).filter(candidateName));
}
function candidateName(v){
 const x=clean(v);if(x.length<3||x.length>60)return false;
 if(/\b(?:apply|application|vendor|trader|stallholder|exhibitor|festival|fair|market|show|racecourse|park|hall|centre|center|county|region|yorkshire|england|wales|scotland)\b/i.test(x))return false;
 return /^[A-Za-z][A-Za-z'’.-]*(?:\s+[A-Za-z][A-Za-z'’.-]*){0,2}$/.test(x);
}
async function verifyPlace(locality,expectedRegionCode){
 let response;
 try{response=await fetch('https://api.postcodes.io/places?q='+encodeURIComponent(locality)+'&limit=10',{headers:{accept:'application/json'},signal:AbortSignal.timeout(8000)});}
 catch(error){return {locality,accepted:false,reason:'place_api_fetch_error',error:String(error?.message||error)};}
 if(!response.ok)return {locality,accepted:false,reason:'place_api_http_'+response.status};
 const payload=await response.json();
 const exact=(Array.isArray(payload?.result)?payload.result:[]).filter(place=>[place?.name_1,place?.name_2].some(name=>normalize(name)===normalize(locality)));
 if(!exact.length)return {locality,accepted:false,reason:'no_exact_os_name'};
 const consistent=exact.filter(place=>placeMatchesRegion(place,expectedRegionCode));
 if(!consistent.length)return {locality,accepted:false,reason:'exact_name_wrong_region'};
 const admins=unique(consistent.map(adminIdentity));
 if(admins.length!==1)return {locality,accepted:false,reason:'ambiguous_exact_places'};
 return {locality,accepted:true,reason:'current_source_exact_os_name_region_verified',place:compactPlace(consistent[0])};
}
function placeMatchesRegion(place,expectedCode){
 const code=String(expectedCode||'').trim().toUpperCase(),country=normalize(place?.country);
 if(code==='GB-WLS')return country==='wales';
 if(code==='GB-SCT')return country==='scotland';
 if(code==='GB-NIR')return false;
 if(country!=='england')return false;
 const geo=geos.find(item=>String(item.code).toUpperCase()===code);if(!geo)return false;
 const expected=[geo.name,...(geo.aliases||[])].map(normalize).filter(Boolean);
 const actual=[place?.county_unitary,place?.district_borough,place?.region].map(normalize).filter(Boolean);
 return expected.some(name=>actual.some(v=>v===name||v.includes(name)||name.includes(v)));
}
function compactPlace(p){return {code:p?.code,name_1:p?.name_1,name_2:p?.name_2,local_type:p?.local_type,county_unitary:p?.county_unitary,district_borough:p?.district_borough,region:p?.region,country:p?.country};}
function adminIdentity(p){return [p?.country,p?.county_unitary,p?.district_borough,p?.region].map(normalize).join('|');}
function normalizedMention(text,needle){const h=' '+normalize(text)+' ',n=normalize(needle);return n.length>=3&&h.includes(' '+n+' ');}
function normUrl(v){try{const u=new URL(String(v||''));u.hash='';for(const k of [...u.searchParams.keys()])if(/^utm_/i.test(k))u.searchParams.delete(k);u.hostname=u.hostname.toLowerCase().replace(/^www\./,'');u.pathname=u.pathname.replace(/\/+$/,'')||'/';return u.toString();}catch{return null;}}
function stripTags(v){return String(v||'').replace(/<[^>]+>/g,' ');}
function decode(v){return String(v||'').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&nbsp;/gi,' ');}
function clean(v){return String(v||'').replace(/^(?:the\s+)/i,'').replace(/\s+/g,' ').replace(/^[\s,:;-]+|[\s,:;-]+$/g,'').trim();}
function normalize(v){return String(v||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();}
function unique(v){return [...new Set(v.filter(Boolean))];}
function parse(v){try{return JSON.parse(v||'{}');}catch{return {};}}
