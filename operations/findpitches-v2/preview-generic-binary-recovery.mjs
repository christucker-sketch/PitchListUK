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
if(!account||!token)throw new Error('generic_binary_preview_credentials_missing');

async function query(sql,params=[]){
 if(!/^\s*(?:SELECT|WITH)\b/i.test(sql)||/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|REPLACE)\b/i.test(sql))throw new Error('generic_binary_preview_non_read_only_sql');
 const response=await fetch(API+'/accounts/'+encodeURIComponent(account)+'/d1/database/'+DB+'/query',{
  method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},
  body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(20000)
 });
 const payload=await response.json();
 if(!response.ok||payload?.success!==true||payload?.result?.[0]?.success!==true)throw new Error('generic_binary_preview_d1_http_'+response.status);
 return payload.result[0].results||[];
}

const classification=await query(`
 SELECT q.candidate_id,c.market,c.region_code,c.canonical_url,c.application_url,c.event_name,c.organiser,c.geography_json,c.evidence_json,q.status,q.last_error
 FROM classification_queue q
 JOIN candidates c ON c.id=q.candidate_id
 WHERE q.last_error IN (
  'findpitches_v2_fetch_content_type_unsupported:application/octet-stream',
  'findpitches_v2_fetch_content_type_unsupported:application/download'
 )
 ORDER BY q.updated_at DESC
`);

const enrichment=await query(`
 SELECT q.candidate_id,c.market,c.region_code,c.canonical_url,c.application_url,c.event_name,c.organiser,c.geography_json,c.evidence_json,c.last_checked,q.status,q.last_error
 FROM enrichment_queue q
 JOIN candidates c ON c.id=q.candidate_id
 WHERE q.last_error IN (
  'findpitches_v2_fetch_content_type_unsupported:application/octet-stream',
  'findpitches_v2_fetch_content_type_unsupported:application/download'
 )
 ORDER BY q.updated_at DESC
`);

const fetchProvider=createHttpFetchProvider();
const evaluator=createDefaultCandidateEvaluator({fetchProvider,now:()=>new Date()});
const classificationOut=[];
for(const row of classification){
 try{
  const geo=parse(row.geography_json);
  const location=String(geo.discovery_location||geo.locality||geo.region||row.region_code||'').trim();
  const evaluated=await evaluator({
   market:getMarket(row.market),
   region_code:row.region_code,
   location,
   result:{url:row.canonical_url,title:row.event_name}
  });
  classificationOut.push({
   id:row.candidate_id,market:row.market,title:row.event_name,url:row.canonical_url,
   prior_error:row.last_error,status:evaluated.status,rejection_reason:evaluated.rejection_reason||null,
   region_code:evaluated.geography?.region_code||row.region_code,score:evaluated.score
  });
 }catch(error){
  classificationOut.push({id:row.candidate_id,market:row.market,title:row.event_name,url:row.canonical_url,prior_error:row.last_error,status:'error',error:String(error?.message||error)});
 }
}

const enrichmentOut=[];
for(const row of enrichment){
 try{
  const candidate={...row,id:row.candidate_id,candidate_id:row.candidate_id,geography:parse(row.geography_json)};
  const preview=await previewCandidateEnrichment(candidate,{fetchProvider});
  const projected=projectPracticalOpportunity(candidate,preview.enrichment,{now:new Date()});
  enrichmentOut.push({
   id:row.candidate_id,market:row.market,title:row.event_name,canonical_url:row.canonical_url,application_url:row.application_url,
   prior_error:row.last_error,recovered_location:projected.opportunity.location,
   location_precision:projected.opportunity.location_precision,
   practical_usable:Boolean(projected.readiness.ready),
   missing:projected.readiness.missing,blocked:projected.readiness.blocked,
   fetched_urls:preview.fetched_urls
  });
 }catch(error){
  enrichmentOut.push({id:row.candidate_id,market:row.market,title:row.event_name,canonical_url:row.canonical_url,application_url:row.application_url,prior_error:row.last_error,practical_usable:false,error:String(error?.message||error)});
 }
}

const result={
 at:new Date().toISOString(),
 classification:{sampled:classificationOut.length,validated:classificationOut.filter(x=>x.status==='validated').length,rejected:classificationOut.filter(x=>x.status==='rejected').length,errors:classificationOut.filter(x=>x.status==='error').length,outcomes:classificationOut},
 enrichment:{sampled:enrichmentOut.length,recovered_locations:enrichmentOut.filter(x=>x.recovered_location).length,practical_usable:enrichmentOut.filter(x=>x.practical_usable).length,errors:enrichmentOut.filter(x=>x.error).length,outcomes:enrichmentOut}
};
fs.writeFileSync('generic-binary-recovery-preview.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({...result,classification:{...result.classification,outcomes:undefined},enrichment:{...result.enrichment,outcomes:undefined}},null,2));

function parse(v){try{return JSON.parse(v||'{}');}catch{return {};}}
