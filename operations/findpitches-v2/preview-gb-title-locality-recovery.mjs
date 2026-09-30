#!/usr/bin/env node
import fs from 'node:fs';
import {createHttpFetchProvider} from '../../platform/findpitches-v2/providers/fetch/http.mjs';
import {createDefaultCandidateEvaluator} from '../../platform/findpitches-v2/engine/evaluator.mjs';
import {previewCandidateEnrichment} from '../../platform/findpitches-v2/enrichment/run-batch.mjs';
import {projectPracticalOpportunity} from '../../platform/findpitches-v2/customer/practical-readiness.mjs';
import {getMarket} from '../../platform/findpitches-v2/markets/registry.mjs';
import {enabledGeographies} from '../../platform/findpitches-v2/geography/catalog.mjs';

const API='https://api.cloudflare.com/client/v4';
const DB='6732bcc9-a172-4d38-ad4d-7660ed13392f';
const account=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
const token=String(process.env.CLOUDFLARE_API_TOKEN||'').trim();
if(!account||!token)throw new Error('gb_title_locality_preview_credentials_missing');

async function d1(sql,params=[]){
 if(!/^\s*(?:SELECT|WITH)\b/i.test(sql)||/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|REPLACE)\b/i.test(sql))throw new Error('gb_title_locality_preview_non_read_only_sql');
 const response=await fetch(API+'/accounts/'+encodeURIComponent(account)+'/d1/database/'+DB+'/query',{
  method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},
  body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(20000)
 });
 const payload=await response.json();
 if(!response.ok||payload?.success!==true||payload?.result?.[0]?.success!==true)throw new Error('gb_title_locality_preview_d1_http_'+response.status);
 return payload.result[0].results||[];
}

const rows=await d1(`
SELECT c.id,c.market,c.region_code,c.canonical_url,c.application_url,c.event_name,c.organiser,
       c.geography_json,c.evidence_json,c.last_checked
FROM candidates c
LEFT JOIN candidate_enrichment e ON e.candidate_id=c.id AND e.source_last_checked>=c.last_checked
WHERE c.status='validated' AND c.market='GB'
  AND (
    e.candidate_id IS NULL OR
    (json_extract(e.enrichment_json,'$.location.value') IS NULL
     AND json_extract(e.enrichment_json,'$.location_area.value') IS NULL)
  )
ORDER BY c.score DESC,c.last_checked DESC,c.id ASC
LIMIT 400
`);

const geos=enabledGeographies('GB');
const candidates=[];
for(const row of rows){
 const names=extractTitleLocalities(row.event_name);
 for(const locality of names.slice(0,3)){
  const verification=await verifyPlace(locality,row.region_code);
  if(verification.accepted){
   candidates.push({...row,locality,place:verification.place});
   break;
  }
 }
 if(candidates.length>=24)break;
}

const fetchProvider=createHttpFetchProvider();
const evaluator=createDefaultCandidateEvaluator({fetchProvider,now:()=>new Date()});
const outcomes=[];
for(let i=0;i<candidates.length;i+=4){
 const chunk=candidates.slice(i,i+4);
 const part=await Promise.all(chunk.map(async row=>{
  try{
   const oldGeo=parse(row.geography_json);
   const oldLocation=String(oldGeo.discovery_location||oldGeo.region||row.region_code||'').trim();
   const evaluated=await evaluator({
    market:getMarket('GB'),region_code:row.region_code,location:oldLocation,
    result:{url:row.canonical_url,title:row.event_name}
   });
   if(evaluated.status!=='validated'){
    return {id:row.id,title:row.event_name,verified_locality:row.locality,classifier_status:evaluated.status,rejection_reason:evaluated.rejection_reason,practical_usable:false};
   }
   const correctedRegion=evaluated.geography?.region_code||row.region_code;
   const reverified=await verifyPlace(row.locality,correctedRegion);
   if(!reverified.accepted){
    return {id:row.id,title:row.event_name,verified_locality:row.locality,classifier_status:'validated',corrected_region_code:correctedRegion,practical_usable:false,locality_rejected_after_region_correction:true};
   }
   const geography={...(evaluated.geography||{}),locality:row.locality};
   const candidate={
    ...row,id:row.id,candidate_id:row.id,market:'GB',region_code:correctedRegion,
    event_name:evaluated.event_name||row.event_name,organiser:evaluated.organiser||row.organiser,
    canonical_url:evaluated.canonical_url||row.canonical_url,application_url:evaluated.application_url||row.application_url,
    geography,geography_json:JSON.stringify(geography),evidence_json:JSON.stringify(evaluated.evidence||[])
   };
   const preview=await previewCandidateEnrichment(candidate,{fetchProvider});
   const projected=projectPracticalOpportunity(candidate,preview.enrichment,{now:new Date()});
   const correction=(evaluated.evidence||[]).find(x=>x?.type==='region_correction')||null;
   return {
    id:row.id,title:row.event_name,url:row.canonical_url,
    verified_locality:row.locality,os_place:reverified.place,
    classifier_status:'validated',corrected_region_code:correctedRegion,region_correction:correction,
    recovered_location:projected.opportunity.location,location_precision:projected.opportunity.location_precision,
    practical_usable:projected.readiness.ready,missing:projected.readiness.missing,blocked:projected.readiness.blocked,
    evidence:projected.provenance?.location?.evidence?.[0]||null
   };
  }catch(error){
   return {id:row.id,title:row.event_name,verified_locality:row.locality,classifier_status:'error',practical_usable:false,error:String(error?.message||error)};
  }
 }));
 outcomes.push(...part);
}

const result={
 at:new Date().toISOString(),
 scanned:rows.length,
 title_verified_candidates:candidates.length,
 sampled:outcomes.length,
 classifier_validated:outcomes.filter(x=>x.classifier_status==='validated').length,
 classifier_rejected:outcomes.filter(x=>x.classifier_status==='rejected').length,
 classifier_errors:outcomes.filter(x=>x.classifier_status==='error').length,
 region_corrections:outcomes.filter(x=>x.region_correction).length,
 recovered_locations:outcomes.filter(x=>x.recovered_location).length,
 practical_usable:outcomes.filter(x=>x.practical_usable).length,
 outcomes
};
fs.writeFileSync('gb-title-locality-recovery-preview.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({...result,outcomes:undefined},null,2));

function extractTitleLocalities(value){
 const text=decode(String(value||'')).replace(/\s+/g,' ').trim();
 if(!text)return [];
 const out=[];
 const patterns=[
  /\b([A-Z][A-Za-z'’.-]+(?:\s+[A-Z][A-Za-z'’.-]+){0,2})\s+(?:farmers?['’]?\s+market|christmas\s+(?:market|fair)|food\s+festival|craft\s+(?:market|fair)|vintage\s+(?:market|fair)|street\s+market|festival|fair|market|show)\b/g,
  /^([A-Z][A-Za-z'’.-]+(?:\s+[A-Z][A-Za-z'’.-]+){0,2})\s*[-–—]\s*(?:[A-Z][^|]{2,80})/,
  /,\s*([A-Z][A-Za-z'’.-]+(?:\s+[A-Z][A-Za-z'’.-]+){0,2})\s*,\s*[A-Z][A-Za-z'’.-]+(?:shire)?\b/g
 ];
 for(const pattern of patterns){
  let m;
  if(!pattern.global){m=text.match(pattern);if(m&&candidateName(m[1]))out.push(clean(m[1]));continue;}
  while((m=pattern.exec(text)))if(candidateName(m[1]))out.push(clean(m[1]));
 }
 return unique(out);
}
function candidateName(v){
 const value=clean(v);
 if(value.length<3||value.length>60)return false;
 if(/\b(?:apply|application|vendor|trader|stallholder|exhibitor|festival|fair|market|show|expo|exhibition|official|home|welcome|tickets?|terms|privacy|contact|events?|parish\s+council)\b/i.test(value))return false;
 return /^[A-Za-z][A-Za-z'’.-]*(?:\s+[A-Za-z][A-Za-z'’.-]*){0,2}$/.test(value);
}
async function verifyPlace(locality,expectedRegionCode){
 let response;
 try{
  response=await fetch('https://api.postcodes.io/places?q='+encodeURIComponent(locality)+'&limit=10',{headers:{accept:'application/json'},signal:AbortSignal.timeout(8000)});
 }catch(error){return {locality,accepted:false,reason:'place_api_fetch_error',error:String(error?.message||error)};}
 if(!response.ok)return {locality,accepted:false,reason:'place_api_http_'+response.status};
 const payload=await response.json();
 const exact=(Array.isArray(payload?.result)?payload.result:[]).filter(place=>[place?.name_1,place?.name_2].some(name=>normalize(name)===normalize(locality)));
 if(!exact.length)return {locality,accepted:false,reason:'no_exact_os_name'};
 const consistent=exact.filter(place=>placeMatchesRegion(place,expectedRegionCode));
 if(!consistent.length)return {locality,accepted:false,reason:'exact_name_wrong_region'};
 const distinct=[...new Map(consistent.map(place=>[String(place.code),place])).values()];
 const admins=unique(distinct.map(adminIdentity));
 if(admins.length!==1)return {locality,accepted:false,reason:'ambiguous_exact_places'};
 return {locality,accepted:true,reason:'exact_os_name_region_verified',place:compactPlace(distinct[0])};
}
function placeMatchesRegion(place,expectedCode){
 const code=String(expectedCode||'').trim().toUpperCase();
 const country=normalize(place?.country);
 if(code==='GB-WLS')return country==='wales';
 if(code==='GB-SCT')return country==='scotland';
 if(code==='GB-NIR')return false;
 if(country!=='england')return false;
 const geo=geos.find(item=>String(item.code).toUpperCase()===code);
 if(!geo)return false;
 const expected=[geo.name,...(geo.aliases||[])].map(normalize).filter(Boolean);
 const actual=[place?.county_unitary,place?.district_borough,place?.region].map(normalize).filter(Boolean);
 return expected.some(name=>actual.some(actualName=>actualName===name||actualName.includes(name)||name.includes(actualName)));
}
function compactPlace(place){return {code:place?.code,name_1:place?.name_1,name_2:place?.name_2,local_type:place?.local_type,county_unitary:place?.county_unitary,district_borough:place?.district_borough,region:place?.region,country:place?.country,latitude:place?.latitude,longitude:place?.longitude};}
function adminIdentity(place){return [place?.country,place?.county_unitary,place?.district_borough,place?.region].map(normalize).join('|');}
function clean(v){return String(v||'').replace(/^(?:the\s+)/i,'').replace(/\s+/g,' ').replace(/^[\s,:;-]+|[\s,:;-]+$/g,'').trim();}
function decode(v){return String(v||'').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&nbsp;/gi,' ');}
function normalize(v){return String(v||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();}
function unique(v){return [...new Set(v.filter(Boolean))];}
function parse(v){try{return JSON.parse(v||'{}');}catch{return {};}}
