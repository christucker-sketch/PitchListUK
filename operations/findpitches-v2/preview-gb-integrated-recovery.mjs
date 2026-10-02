#!/usr/bin/env node
import fs from 'node:fs';
import {createHttpFetchProvider} from '../../platform/findpitches-v2/providers/fetch/http.mjs';
import {createDefaultCandidateEvaluator} from '../../platform/findpitches-v2/engine/evaluator.mjs';
import {previewCandidateEnrichment} from '../../platform/findpitches-v2/enrichment/run-batch.mjs';
import {projectPracticalOpportunity} from '../../platform/findpitches-v2/customer/practical-readiness.mjs';
import {getMarket} from '../../platform/findpitches-v2/markets/registry.mjs';

const API='https://api.cloudflare.com/client/v4';
const DB='6732bcc9-a172-4d38-ad4d-7660ed13392f';
const account=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
const token=String(process.env.CLOUDFLARE_API_TOKEN||'').trim();
if(!account||!token)throw new Error('gb_integrated_preview_credentials_missing');

async function query(sql,params=[]){
 if(!/^\s*(?:SELECT|WITH)\b/i.test(sql)||/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|REPLACE)\b/i.test(sql))throw new Error('gb_integrated_preview_non_read_only_sql');
 const response=await fetch(API+'/accounts/'+encodeURIComponent(account)+'/d1/database/'+DB+'/query',{
  method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},
  body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(20000)
 });
 const payload=await response.json();
 if(!response.ok||payload?.success!==true||payload?.result?.[0]?.success!==true)throw new Error('gb_integrated_preview_d1_http_'+response.status);
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
SELECT * FROM ranked WHERE rn=1 ORDER BY region_code ASC LIMIT 32
`);

const fetchProvider=createHttpFetchProvider();
const evaluator=createDefaultCandidateEvaluator({fetchProvider,now:()=>new Date()});
const outcomes=[];
for(let i=0;i<rows.length;i+=4){
 const chunk=rows.slice(i,i+4);
 const part=await Promise.all(chunk.map(async row=>{
  const oldGeo=parse(row.geography_json);
  const location=String(oldGeo.discovery_location||oldGeo.region||row.region_code||'').trim();
  try{
   const evaluated=await evaluator({
    market:getMarket('GB'),region_code:row.region_code,location,
    result:{url:row.canonical_url,title:row.event_name}
   });
   const correction=(evaluated.evidence||[]).find(x=>x?.type==='region_correction')||null;
   if(evaluated.status!=='validated'){
    return {
     id:row.id,old_region_code:row.region_code,title:row.event_name,
     classifier_status:evaluated.status,rejection_reason:evaluated.rejection_reason,
     corrected_region_code:evaluated.geography?.region_code||null,
     region_correction:correction,practical_usable:false
    };
   }
   const candidate={
    ...row,id:row.id,candidate_id:row.id,market:'GB',
    region_code:evaluated.geography?.region_code||row.region_code,
    event_name:evaluated.event_name||row.event_name,
    organiser:evaluated.organiser||row.organiser,
    canonical_url:evaluated.canonical_url||row.canonical_url,
    application_url:evaluated.application_url||row.application_url,
    geography:evaluated.geography,
    geography_json:JSON.stringify(evaluated.geography||{}),
    evidence_json:JSON.stringify(evaluated.evidence||[])
   };
   const preview=await previewCandidateEnrichment(candidate,{fetchProvider});
   const projected=projectPracticalOpportunity(candidate,preview.enrichment,{now:new Date()});
   return {
    id:row.id,old_region_code:row.region_code,title:row.event_name,
    classifier_status:evaluated.status,rejection_reason:null,
    corrected_region_code:candidate.region_code,region_correction:correction,
    recovered_location:projected.opportunity.location,
    location_precision:projected.opportunity.location_precision,
    practical_usable:projected.readiness.ready,
    missing:projected.readiness.missing,
    blocked:projected.readiness.blocked,
    evidence:projected.provenance?.location?.evidence?.[0]||null
   };
  }catch(error){
   return {id:row.id,old_region_code:row.region_code,title:row.event_name,classifier_status:'error',practical_usable:false,error:String(error?.message||error)};
  }
 }));
 outcomes.push(...part);
}
const result={
 at:new Date().toISOString(),
 sampled:outcomes.length,
 classifier_validated:outcomes.filter(x=>x.classifier_status==='validated').length,
 classifier_rejected:outcomes.filter(x=>x.classifier_status==='rejected').length,
 classifier_errors:outcomes.filter(x=>x.classifier_status==='error').length,
 region_corrections:outcomes.filter(x=>x.region_correction).length,
 recovered_locations:outcomes.filter(x=>x.recovered_location).length,
 practical_usable:outcomes.filter(x=>x.practical_usable).length,
 practical_usable_rate:outcomes.length?Number((outcomes.filter(x=>x.practical_usable).length/outcomes.length).toFixed(4)):0,
 rejection_reasons:countBy(outcomes.filter(x=>x.classifier_status==='rejected'),'rejection_reason'),
 corrected_regions:countBy(outcomes.filter(x=>x.region_correction),'corrected_region_code'),
 outcomes
};
fs.writeFileSync('gb-integrated-recovery-preview.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({...result,outcomes:undefined},null,2));

function countBy(items,key){return items.reduce((o,r)=>(o[r[key]??'null']=(o[r[key]??'null']||0)+1,o),{});}
function parse(v){try{return JSON.parse(v||'{}');}catch{return {};}}
