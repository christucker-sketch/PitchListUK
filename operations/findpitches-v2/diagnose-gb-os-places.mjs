#!/usr/bin/env node
import fs from 'node:fs';
import {createHttpFetchProvider} from '../../platform/findpitches-v2/providers/fetch/http.mjs';
import {extractHtmlMetadataText} from '../../platform/findpitches-v2/engine/html-metadata.mjs';
import {enabledGeographies} from '../../platform/findpitches-v2/geography/catalog.mjs';

const API='https://api.cloudflare.com/client/v4';
const DB='6732bcc9-a172-4d38-ad4d-7660ed13392f';
const account=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
const token=String(process.env.CLOUDFLARE_API_TOKEN||'').trim();
if(!account||!token)throw new Error('gb_os_places_diagnostic_credentials_missing');

async function d1(sql,params=[]){
 if(!/^\s*(?:SELECT|WITH)\b/i.test(sql)||/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|REPLACE)\b/i.test(sql))throw new Error('gb_os_places_diagnostic_non_read_only_sql');
 const response=await fetch(API+'/accounts/'+encodeURIComponent(account)+'/d1/database/'+DB+'/query',{
  method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},
  body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(20000)
 });
 const payload=await response.json();
 if(!response.ok||payload?.success!==true||payload?.result?.[0]?.success!==true)throw new Error('gb_os_places_diagnostic_d1_http_'+response.status);
 return payload.result[0].results||[];
}

const rows=await d1(`
WITH missing AS (
 SELECT c.id,c.region_code,c.canonical_url,c.event_name,c.last_checked,c.geography_json,
        e.enrichment_json,
        ROW_NUMBER() OVER (
          PARTITION BY c.region_code
          ORDER BY c.score DESC,c.last_checked DESC,c.id ASC
        ) AS rn
 FROM candidates c
 LEFT JOIN candidate_enrichment e ON e.candidate_id=c.id AND e.source_last_checked>=c.last_checked
 WHERE c.status='validated' AND c.market='GB'
   AND (
    e.candidate_id IS NULL OR
    (json_extract(e.enrichment_json,'$.location.value') IS NULL
     AND json_extract(e.enrichment_json,'$.location_area.value') IS NULL)
   )
)
SELECT * FROM missing WHERE rn<=2 ORDER BY rn ASC,region_code ASC,id ASC LIMIT 64
`);

const fetchProvider=createHttpFetchProvider();
const geos=enabledGeographies('GB');
const outcomes=[];

for(let i=0;i<rows.length;i+=6){
 const chunk=rows.slice(i,i+6);
 const part=await Promise.all(chunk.map(async row=>{
  try{
   const page=await fetchProvider.fetch(row.canonical_url);
   const html=String(page.body||'');
   const pageTitle=extractTitle(html)||String(row.event_name||'').trim();
   const metadata=extractHtmlMetadataText(html);
   const candidates=unique([
    ...extractLocalityCandidates(pageTitle),
    ...extractLocalityCandidates(metadata)
   ]).slice(0,4);
   const verifications=[];
   for(const locality of candidates){
    verifications.push(await verifyPlace(locality,row.region_code));
   }
   const accepted=verifications.filter(x=>x.accepted);
   const uniqueAccepted=unique(accepted.map(x=>normalize(x.locality)));
   const recovery=uniqueAccepted.length===1?accepted.find(x=>normalize(x.locality)===uniqueAccepted[0]):null;
   return {
    id:row.id,region_code:row.region_code,title:row.event_name,
    source_title:pageTitle,candidates,verifications,
    recoverable:Boolean(recovery),
    locality:recovery?.locality||null,
    os_place:recovery?.place||null
   };
  }catch(error){
   return {id:row.id,region_code:row.region_code,title:row.event_name,candidates:[],verifications:[],recoverable:false,error:String(error?.message||error)};
  }
 }));
 outcomes.push(...part);
}

const candidateRows=outcomes.filter(x=>x.candidates?.length);
const recoverable=outcomes.filter(x=>x.recoverable);
const result={
 at:new Date().toISOString(),
 sampled:outcomes.length,
 source_errors:outcomes.filter(x=>x.error).length,
 locality_candidates:candidateRows.length,
 recoverable:recoverable.length,
 recovery_rate:outcomes.length?Number((recoverable.length/outcomes.length).toFixed(4)):0,
 candidate_to_verified_rate:candidateRows.length?Number((recoverable.length/candidateRows.length).toFixed(4)):0,
 by_region:countBy(recoverable,'region_code'),
 localities:recoverable.map(x=>({id:x.id,region_code:x.region_code,title:x.title,locality:x.locality,os_place:x.os_place})),
 outcomes
};
fs.writeFileSync('gb-os-places-diagnostic.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({...result,outcomes:undefined},null,2));

async function verifyPlace(locality,expectedRegionCode){
 const query='https://api.postcodes.io/places?q='+encodeURIComponent(locality)+'&limit=10';
 let response;
 try{response=await fetch(query,{headers:{accept:'application/json'},signal:AbortSignal.timeout(8000)});}
 catch(error){return {locality,accepted:false,reason:'place_api_fetch_error',error:String(error?.message||error)};}
 if(!response.ok)return {locality,accepted:false,reason:'place_api_http_'+response.status};
 const payload=await response.json();
 const exact=(Array.isArray(payload?.result)?payload.result:[]).filter(place=>
  [place?.name_1,place?.name_2].some(name=>normalize(name)===normalize(locality))
 );
 if(!exact.length)return {locality,accepted:false,reason:'no_exact_os_name'};
 const consistent=exact.filter(place=>placeMatchesRegion(place,expectedRegionCode));
 if(!consistent.length)return {locality,accepted:false,reason:'exact_name_wrong_region',matches:compact(exact)};
 const distinct=[...new Map(consistent.map(place=>[String(place.code),place])).values()];
 const adminKeys=unique(distinct.map(place=>adminIdentity(place)));
 if(adminKeys.length!==1)return {locality,accepted:false,reason:'ambiguous_exact_places',matches:compact(distinct)};
 const place=distinct[0];
 return {locality,accepted:true,reason:'exact_os_name_region_verified',place:compactPlace(place)};
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
 const actual=[
  place?.county_unitary,place?.district_borough,place?.region
 ].map(normalize).filter(Boolean);
 return expected.some(name=>actual.some(value=>value===name||value.includes(name)||name.includes(value)));
}

function extractLocalityCandidates(value){
 const text=String(value||'').replace(/\s+/g,' ').trim();
 if(!text)return [];
 const out=[];
 const pipe=text.split(/\s*[|–—]\s*/).map(x=>x.trim()).filter(Boolean);
 if(pipe.length>1){
  for(const part of [pipe[0],pipe[pipe.length-1]])if(candidateName(part))out.push(part);
 }
 const eventPattern=/^(.{2,70}?)\s+(?:food\s+festival|farmers?['’]?\s+market|christmas\s+(?:market|fair)|craft\s+(?:market|fair)|vintage\s+(?:market|fair)|charter\s+market|street\s+market|festival|fair|market|show|expo|exhibition)\b/i;
 const m=text.match(eventPattern);
 if(m&&candidateName(m[1]))out.push(cleanCandidate(m[1]));
 const inPattern=/\b(?:in|at)\s+([A-Z][A-Za-z'’.-]+(?:\s+[A-Z][A-Za-z'’.-]+){0,3})(?=\s*(?:[,.;|–—]|$))/g;
 let hit;while((hit=inPattern.exec(text)))if(candidateName(hit[1]))out.push(cleanCandidate(hit[1]));
 return unique(out.map(cleanCandidate).filter(Boolean));
}

function candidateName(value){
 const v=cleanCandidate(value);
 if(v.length<3||v.length>60)return false;
 if(/\b(?:apply|application|vendor|trader|stallholder|exhibitor|festival|fair|market|show|expo|exhibition|official|home|welcome|tickets?|terms|privacy|contact|events?)\b/i.test(v))return false;
 if(/^\d+$/.test(v))return false;
 return /^[A-Za-z][A-Za-z'’.-]*(?:\s+[A-Za-z][A-Za-z'’.-]*){0,3}$/.test(v);
}

function cleanCandidate(value){
 return String(value||'').replace(/^(?:the\s+)/i,'').replace(/\s+/g,' ').replace(/^[\s,:;-]+|[\s,:;-]+$/g,'').trim();
}
function extractTitle(html){
 const m=String(html||'').match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
 return m?decode(stripTags(m[1])).replace(/\s+/g,' ').trim():null;
}
function stripTags(v){return String(v||'').replace(/<[^>]+>/g,' ');}
function decode(v){return String(v||'').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&nbsp;/gi,' ');}
function normalize(v){return String(v||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();}
function adminIdentity(place){return [place?.country,place?.county_unitary,place?.district_borough,place?.region].map(normalize).join('|');}
function compact(rows){return rows.slice(0,5).map(compactPlace);}
function compactPlace(place){return {code:place?.code,name_1:place?.name_1,name_2:place?.name_2,local_type:place?.local_type,county_unitary:place?.county_unitary,district_borough:place?.district_borough,region:place?.region,country:place?.country,latitude:place?.latitude,longitude:place?.longitude};}
function unique(values){return [...new Set(values.filter(Boolean))];}
function countBy(items,key){return items.reduce((o,r)=>(o[r[key]??'null']=(o[r[key]??'null']||0)+1,o),{});}
