#!/usr/bin/env node
import fs from 'node:fs';
import {createHttpFetchProvider} from '../../platform/findpitches-v2/providers/fetch/http.mjs';
import {createDefaultCandidateEvaluator} from '../../platform/findpitches-v2/engine/evaluator.mjs';
import {getMarket} from '../../platform/findpitches-v2/markets/registry.mjs';

const API='https://api.cloudflare.com/client/v4';
const DB='6732bcc9-a172-4d38-ad4d-7660ed13392f';
const account=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
const token=String(process.env.CLOUDFLARE_API_TOKEN||'').trim();
if(!account||!token)throw new Error('gb_classifier_preview_credentials_missing');

async function query(sql,params=[]){
 if(!/^\s*(?:SELECT|WITH)\b/i.test(sql)||/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|REPLACE)\b/i.test(sql))throw new Error('gb_classifier_preview_non_read_only_sql');
 const response=await fetch(API+'/accounts/'+encodeURIComponent(account)+'/d1/database/'+DB+'/query',{
  method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},
  body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(20000)
 });
 const payload=await response.json();
 if(!response.ok||payload?.success!==true||payload?.result?.[0]?.success!==true)throw new Error('gb_classifier_preview_d1_http_'+response.status);
 return payload.result[0].results||[];
}

const rows=await query(`
WITH ranked AS (
 SELECT c.id,c.market,c.region_code,c.canonical_url,c.application_url,c.event_name,c.organiser,
        c.geography_json,c.last_checked,e.enrichment_json,
        ROW_NUMBER() OVER (
          PARTITION BY c.region_code
          ORDER BY CASE WHEN json_extract(e.enrichment_json,'$.location.value') IS NULL
                         AND json_extract(e.enrichment_json,'$.location_area.value') IS NULL THEN 0 ELSE 1 END,
                   c.last_checked DESC,c.id ASC
        ) AS rn
 FROM candidates c
 LEFT JOIN candidate_enrichment e ON e.candidate_id=c.id AND e.source_last_checked>=c.last_checked
 WHERE c.status='validated' AND c.market='GB'
)
SELECT * FROM ranked WHERE rn<=2 ORDER BY region_code ASC,rn ASC LIMIT 64
`);

const evaluator=createDefaultCandidateEvaluator({fetchProvider:createHttpFetchProvider(),now:()=>new Date()});
const outcomes=[];
for(const row of rows){
 const geography=parse(row.geography_json);
 const location=String(geography.discovery_location||geography.region||row.region_code||'').trim();
 try{
  const evaluated=await evaluator({
   market:getMarket('GB'),
   region_code:row.region_code,
   location,
   result:{url:row.canonical_url,title:row.event_name}
  });
  const negative=(evaluated.evidence||[]).filter(x=>x?.type==='market_conflict'||x?.type==='negative_phrase');
  outcomes.push({
   id:row.id,region_code:row.region_code,current_status:'validated',
   title:row.event_name,canonical_url:row.canonical_url,
   preview_status:evaluated.status,rejection_reason:evaluated.rejection_reason,
   score:evaluated.score,location_input:location,
   negative_evidence:negative
  });
 }catch(error){
  outcomes.push({
   id:row.id,region_code:row.region_code,current_status:'validated',
   title:row.event_name,canonical_url:row.canonical_url,
   preview_status:'error',error:String(error?.message||error),location_input:location
  });
 }
}
const result={
 at:new Date().toISOString(),
 sampled:outcomes.length,
 preview_validated:outcomes.filter(x=>x.preview_status==='validated').length,
 preview_held:outcomes.filter(x=>x.preview_status==='held').length,
 preview_rejected:outcomes.filter(x=>x.preview_status==='rejected').length,
 preview_errors:outcomes.filter(x=>x.preview_status==='error').length,
 rejection_reasons:countBy(outcomes.filter(x=>x.preview_status==='rejected'),'rejection_reason'),
 negative_evidence:countEvidence(outcomes),
 outcomes
};
fs.writeFileSync('gb-classifier-recheck-preview.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({...result,outcomes:undefined},null,2));

function countBy(items,key){return items.reduce((o,r)=>(o[r[key]??'null']=(o[r[key]??'null']||0)+1,o),{});}
function countEvidence(items){const o={};for(const row of items)for(const item of row.negative_evidence||[]){const key=item.type+':'+String(item.value||'');o[key]=(o[key]||0)+1;}return o;}
function parse(v){try{return JSON.parse(v||'{}');}catch{return {};}}
