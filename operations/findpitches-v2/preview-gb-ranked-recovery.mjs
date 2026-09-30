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
if(!account||!token)throw new Error('gb_ranked_preview_credentials_missing');

async function query(sql,params=[]){
 if(!/^\s*(?:SELECT|WITH)\b/i.test(sql)||/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|REPLACE)\b/i.test(sql))throw new Error('gb_ranked_preview_non_read_only_sql');
 const response=await fetch(API+'/accounts/'+encodeURIComponent(account)+'/d1/database/'+DB+'/query',{
  method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},
  body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(20000)
 });
 const payload=await response.json();
 if(!response.ok||payload?.success!==true||payload?.result?.[0]?.success!==true)throw new Error('gb_ranked_preview_d1_http_'+response.status);
 return payload.result[0].results||[];
}

const rows=await query(`
SELECT c.id,c.market,c.region_code,c.canonical_url,c.application_url,c.event_name,c.organiser,
       c.geography_json,c.evidence_json,c.last_checked,e.enrichment_json
FROM candidates c
LEFT JOIN candidate_enrichment e ON e.candidate_id=c.id AND e.source_last_checked>=c.last_checked
WHERE c.status='validated' AND c.market='GB'
  AND (
    e.candidate_id IS NULL OR
    (json_extract(e.enrichment_json,'$.location.value') IS NULL
     AND json_extract(e.enrichment_json,'$.location_area.value') IS NULL)
  )
ORDER BY c.last_checked ASC,c.id ASC
LIMIT 500
`);

const ranked=rows.map(row=>({...row,recovery_score:score(row)}))
 .sort((a,b)=>b.recovery_score.score-a.recovery_score.score||a.id.localeCompare(b.id))
 .slice(0,20);

const fetchProvider=createHttpFetchProvider();
const evaluator=createDefaultCandidateEvaluator({fetchProvider,now:()=>new Date()});
const outcomes=[];
for(let i=0;i<ranked.length;i+=4){
 const chunk=ranked.slice(i,i+4);
 const part=await Promise.all(chunk.map(async row=>{
  const geo=parse(row.geography_json);
  const location=String(geo.discovery_location||geo.locality||geo.region||row.region_code||'').trim();
  try{
   const evaluated=await evaluator({market:getMarket('GB'),region_code:row.region_code,location,result:{url:row.canonical_url,title:row.event_name}});
   if(evaluated.status!=='validated'){
    return {
     id:row.id,title:row.event_name,url:row.canonical_url,score:row.recovery_score.score,reasons:row.recovery_score.reasons,
     classifier_status:evaluated.status,rejection_reason:evaluated.rejection_reason,practical_usable:false
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
   const correction=(evaluated.evidence||[]).find(x=>x?.type==='region_correction')||null;
   return {
    id:row.id,title:row.event_name,url:row.canonical_url,score:row.recovery_score.score,reasons:row.recovery_score.reasons,
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
   return {id:row.id,title:row.event_name,url:row.canonical_url,score:row.recovery_score.score,reasons:row.recovery_score.reasons,classifier_status:'error',practical_usable:false,error:String(error?.message||error)};
  }
 }));
 outcomes.push(...part);
}

const output={
 at:new Date().toISOString(),
 sampled:outcomes.length,
 classifier_validated:outcomes.filter(x=>x.classifier_status==='validated').length,
 classifier_rejected:outcomes.filter(x=>x.classifier_status==='rejected').length,
 classifier_errors:outcomes.filter(x=>x.classifier_status==='error').length,
 region_corrections:outcomes.filter(x=>x.region_correction).length,
 recovered_locations:outcomes.filter(x=>x.recovered_location).length,
 practical_usable:outcomes.filter(x=>x.practical_usable).length,
 outcomes
};
fs.writeFileSync('gb-ranked-recovery-preview.json',JSON.stringify(output,null,2));
console.log(JSON.stringify({...output,outcomes:undefined},null,2));

function score(row){
 const geo=parse(row.geography_json),evidence=parseArray(row.evidence_json);
 const haystack=[row.event_name,row.organiser,row.canonical_url,row.application_url,geo?.region,geo?.locality,geo?.subregion,...evidence.flatMap(item=>[item?.title,item?.snippet,item?.excerpt,item?.value])].filter(Boolean).join(' ');
 let score=0;const reasons=[];const add=(n,r)=>{score+=n;reasons.push(r);};
 if(geo?.locality)add(30,'stored_locality');
 if(/\b(?:venue|where|location|showground|showgrounds|park|hall|centre|center|square|racecourse|palace|castle|arena|stadium)\b/i.test(haystack))add(20,'venue_or_location_terms');
 if(/\b(?:festival|fair|market|show|expo|exhibition|fete|carnival|parade)\b/i.test(haystack))add(10,'event_term');
 if(/\b(?:apply|application|vendor|trader|stallholder|exhibitor|pitch)\b/i.test(haystack))add(10,'application_term');
 if(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2},\s*[A-Z][a-z]+(?:shire)?\b/.test(haystack))add(20,'place_comma_region_shape');
 if(/\b(?:instagram|facebook|twitter|x\.com|tiktok)\b/i.test([row.canonical_url,row.application_url].filter(Boolean).join(' '))){score-=40;reasons.push('social_source');}
 if(/\b(?:terms|privacy|cookie|legal|procurement|supplier|tender|rfp)\b/i.test([row.canonical_url,row.application_url].filter(Boolean).join(' '))){score-=35;reasons.push('policy_or_procurement');}
 if(/\b(?:fair trader scheme|purchasing vendor|homechoice|business directory|trade account|wholesale account|gypsy pitch|traveller pitch)\b/i.test(haystack)){score-=30;reasons.push('known_non_event_pattern');}
 return {score,reasons:[...new Set(reasons)]};
}
function parse(v){try{return JSON.parse(v||'{}');}catch{return {};}}
function parseArray(v){try{const x=JSON.parse(v||'[]');return Array.isArray(x)?x:[];}catch{return [];}}
