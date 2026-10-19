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
if(!account||!token)throw new Error('docx_recovery_preview_credentials_missing');

async function query(sql,params=[]){
 if(!/^\s*(?:SELECT|WITH)\b/i.test(sql)||/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|REPLACE)\b/i.test(sql))throw new Error('docx_recovery_preview_non_read_only_sql');
 const response=await fetch(API+'/accounts/'+encodeURIComponent(account)+'/d1/database/'+DB+'/query',{
  method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},
  body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(20000)
 });
 const payload=await response.json();
 if(!response.ok||payload?.success!==true||payload?.result?.[0]?.success!==true)throw new Error('docx_recovery_preview_d1_http_'+response.status);
 return payload.result[0].results||[];
}

const classificationRows=await query(`
 SELECT q.candidate_id,c.market,c.region_code,c.canonical_url,c.application_url,c.event_name,c.organiser,
        c.geography_json,c.evidence_json,c.last_checked,q.status,q.attempts,q.last_error
 FROM classification_queue q JOIN candidates c ON c.id=q.candidate_id
 WHERE q.last_error='findpitches_v2_fetch_content_type_unsupported:application/vnd.openxmlformats-officedocument.wordprocessingml.document'
 ORDER BY q.updated_at DESC
 LIMIT 12
`);

const enrichmentRows=await query(`
 SELECT q.candidate_id,c.market,c.region_code,c.canonical_url,c.application_url,c.event_name,c.organiser,
        c.geography_json,c.evidence_json,c.last_checked,q.status,q.attempts,q.last_error
 FROM enrichment_queue q JOIN candidates c ON c.id=q.candidate_id
 WHERE q.last_error='findpitches_v2_fetch_content_type_unsupported:application/vnd.openxmlformats-officedocument.wordprocessingml.document'
 ORDER BY q.updated_at DESC
 LIMIT 20
`);

const fetchProvider=createHttpFetchProvider();
const evaluator=createDefaultCandidateEvaluator({fetchProvider,now:()=>new Date()});
const classification=[];
for(const row of classificationRows){
 try{
  const geo=parse(row.geography_json);
  const location=String(geo.discovery_location||geo.locality||geo.region||row.region_code||'').trim();
  const evaluated=await evaluator({market:getMarket(row.market),region_code:row.region_code,location,result:{url:row.canonical_url,title:row.event_name}});
  classification.push({
   id:row.candidate_id,market:row.market,title:row.event_name,url:row.canonical_url,
   prior_status:row.status,evaluated_status:evaluated.status,rejection_reason:evaluated.rejection_reason,
   application_url:evaluated.application_url,score:evaluated.score,
   region_code:evaluated.geography?.region_code||row.region_code
  });
 }catch(error){
  classification.push({id:row.candidate_id,market:row.market,title:row.event_name,url:row.canonical_url,prior_status:row.status,evaluated_status:'error',error:String(error?.message||error)});
 }
}

const enrichment=[];
for(const row of enrichmentRows){
 try{
  const oldGeography=parse(row.geography_json);
  const location=String(oldGeography.discovery_location||oldGeography.locality||oldGeography.region||row.region_code||'').trim();
  const evaluated=await evaluator({
   market:getMarket(row.market),region_code:row.region_code,location,
   result:{url:row.canonical_url,title:row.event_name}
  });
  const correction=(evaluated.evidence||[]).find(x=>x?.type==='region_correction')||null;
  if(evaluated.status!=='validated'){
   enrichment.push({
    id:row.candidate_id,market:row.market,title:row.event_name,
    canonical_url:row.canonical_url,application_url:row.application_url,
    prior_status:row.status,classifier_status:evaluated.status,
    rejection_reason:evaluated.rejection_reason,region_correction:correction,
    practical_usable:false
   });
   continue;
  }
  const geography=evaluated.geography||oldGeography;
  const candidate={
   ...row,id:row.candidate_id,candidate_id:row.candidate_id,
   region_code:geography.region_code||row.region_code,
   canonical_url:evaluated.canonical_url||row.canonical_url,
   application_url:evaluated.application_url||row.application_url,
   event_name:evaluated.event_name||row.event_name,
   organiser:evaluated.organiser||row.organiser,
   geography,geography_json:JSON.stringify(geography),
   evidence_json:JSON.stringify(evaluated.evidence||[])
  };
  const preview=await previewCandidateEnrichment(candidate,{fetchProvider});
  const projected=projectPracticalOpportunity(candidate,preview.enrichment,{now:new Date()});
  enrichment.push({
   id:row.candidate_id,market:row.market,title:row.event_name,
   canonical_url:candidate.canonical_url,application_url:candidate.application_url,
   prior_status:row.status,classifier_status:'validated',
   corrected_region_code:candidate.region_code,region_correction:correction,
   recovered_location:projected.opportunity.location,
   location_precision:projected.opportunity.location_precision,
   practical_usable:projected.readiness.ready,
   missing:projected.readiness.missing,blocked:projected.readiness.blocked,
   fetched_urls:preview.fetched_urls
  });
 }catch(error){
  enrichment.push({id:row.candidate_id,market:row.market,title:row.event_name,canonical_url:row.canonical_url,application_url:row.application_url,prior_status:row.status,classifier_status:'error',practical_usable:false,error:String(error?.message||error)});
 }
}

const result={
 at:new Date().toISOString(),
 classification:{
  sampled:classification.length,
  validated:classification.filter(x=>x.evaluated_status==='validated').length,
  held:classification.filter(x=>x.evaluated_status==='held').length,
  rejected:classification.filter(x=>x.evaluated_status==='rejected').length,
  errors:classification.filter(x=>x.evaluated_status==='error').length,
  outcomes:classification
 },
 enrichment:{
  sampled:enrichment.length,
  classifier_validated:enrichment.filter(x=>x.classifier_status==='validated').length,
  classifier_rejected:enrichment.filter(x=>x.classifier_status==='rejected').length,
  classifier_held:enrichment.filter(x=>x.classifier_status==='held').length,
  parsed:enrichment.filter(x=>x.classifier_status==='validated'&&!x.error).length,
  errors:enrichment.filter(x=>x.classifier_status==='error').length,
  recovered_locations:enrichment.filter(x=>x.recovered_location).length,
  practical_usable:enrichment.filter(x=>x.practical_usable).length,
  outcomes:enrichment
 }
};
fs.writeFileSync('docx-recovery-preview.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({
 at:result.at,
 classification:{sampled:result.classification.sampled,validated:result.classification.validated,held:result.classification.held,rejected:result.classification.rejected,errors:result.classification.errors},
 enrichment:{sampled:result.enrichment.sampled,classifier_validated:result.enrichment.classifier_validated,classifier_rejected:result.enrichment.classifier_rejected,classifier_held:result.enrichment.classifier_held,parsed:result.enrichment.parsed,errors:result.enrichment.errors,recovered_locations:result.enrichment.recovered_locations,practical_usable:result.enrichment.practical_usable}
},null,2));

function parse(v){try{return JSON.parse(v||'{}');}catch{return {};}}
