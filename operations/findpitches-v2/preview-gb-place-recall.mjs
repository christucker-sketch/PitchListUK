#!/usr/bin/env node
import fs from 'node:fs';
import {createHttpFetchProvider} from '../../platform/findpitches-v2/providers/fetch/http.mjs';
import {previewCandidateEnrichment} from '../../platform/findpitches-v2/enrichment/run-batch.mjs';
import {projectPracticalOpportunity} from '../../platform/findpitches-v2/customer/practical-readiness.mjs';

const API='https://api.cloudflare.com/client/v4';
const DB='6732bcc9-a172-4d38-ad4d-7660ed13392f';
const account=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
const token=String(process.env.CLOUDFLARE_API_TOKEN||'').trim();
if(!account||!token)throw new Error('gb_place_preview_credentials_missing');

async function query(sql,params=[]){
 if(!/^\s*(?:SELECT|WITH)\b/i.test(sql)||/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|REPLACE)\b/i.test(sql))throw new Error('gb_place_preview_non_read_only_sql');
 const response=await fetch(API+'/accounts/'+encodeURIComponent(account)+'/d1/database/'+DB+'/query',{
  method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},
  body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(20000)
 });
 const payload=await response.json();
 if(!response.ok||payload?.success!==true||payload?.result?.[0]?.success!==true)throw new Error('gb_place_preview_d1_http_'+response.status);
 return payload.result[0].results||[];
}

const rows=await query(`
WITH ranked AS (
 SELECT c.id,c.market,c.region_code,c.canonical_url,c.application_url,c.event_name,c.organiser,
        c.geography_json,c.evidence_json,c.last_checked,e.enrichment_json,
        ROW_NUMBER() OVER (PARTITION BY c.region_code ORDER BY c.last_checked DESC,c.id ASC) AS rn
 FROM candidates c
 JOIN candidate_enrichment e ON e.candidate_id=c.id AND e.source_last_checked>=c.last_checked
 WHERE c.status='validated' AND c.market='GB'
   AND json_extract(e.enrichment_json,'$.location.value') IS NULL
   AND json_extract(e.enrichment_json,'$.location_area.value') IS NULL
)
SELECT * FROM ranked
WHERE rn<=3
ORDER BY rn ASC, region_code ASC, id ASC
LIMIT 48
`);

const fetchProvider=createHttpFetchProvider();
const outcomes=[];
for(const row of rows){
 const candidate={...row,geography:parse(row.geography_json),candidate_id:row.id};
 try{
  const preview=await previewCandidateEnrichment(candidate,{fetchProvider});
  const projected=projectPracticalOpportunity(candidate,preview.enrichment,{now:new Date()});
  const loc=preview.enrichment?.location_area||preview.enrichment?.location||null;
  outcomes.push({
   id:row.id,region_code:row.region_code,title:row.event_name,
   recovered:Boolean(loc?.value),practical_usable:Boolean(projected.readiness.ready),
   value:loc?.value??null,
   precision:loc?.precision??(preview.enrichment?.location?.value?'venue':null),
   blocked:projected.readiness.blocked,missing:projected.readiness.missing,
   evidence:loc?.evidence?.[0]??null,
   fetched_urls:preview.fetched_urls
  });
 }catch(error){
  outcomes.push({id:row.id,region_code:row.region_code,title:row.event_name,recovered:false,error:String(error?.message||error)});
 }
}
const recovered=outcomes.filter(x=>x.recovered);
const usable=outcomes.filter(x=>x.practical_usable);
const result={
 at:new Date().toISOString(),
 sampled:outcomes.length,
 recovered:recovered.length,
 practical_usable:usable.length,
 recovery_rate:outcomes.length?Number((recovered.length/outcomes.length).toFixed(4)):0,
 practical_usable_rate:outcomes.length?Number((usable.length/outcomes.length).toFixed(4)):0,
 by_precision:countBy(recovered,'precision'),
 regions_sampled:[...new Set(outcomes.map(x=>x.region_code))],
 outcomes
};
fs.writeFileSync('gb-place-recall-preview.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({...result,outcomes:undefined},null,2));

function countBy(items,key){return items.reduce((o,r)=>(o[r[key]??'null']=(o[r[key]??'null']||0)+1,o),{});}
function parse(v){try{return JSON.parse(v||'{}');}catch{return {};}}
