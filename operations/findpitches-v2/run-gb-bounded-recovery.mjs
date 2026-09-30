#!/usr/bin/env node
import fs from 'node:fs';
import {createHttpFetchProvider} from '../../platform/findpitches-v2/providers/fetch/http.mjs';
import {createDefaultCandidateEvaluator} from '../../platform/findpitches-v2/engine/evaluator.mjs';
import {previewCandidateEnrichment} from '../../platform/findpitches-v2/enrichment/run-batch.mjs';
import {projectPracticalOpportunity} from '../../platform/findpitches-v2/customer/practical-readiness.mjs';
import {getMarket} from '../../platform/findpitches-v2/markets/registry.mjs';

const API='https://api.cloudflare.com/client/v4';
const DB='6732bcc9-a172-4d38-ad4d-7660ed13392f';
const BATCH_ID=String(process.env.GB_BOUNDED_RECOVERY_BATCH_ID||'2026-09-30-gb-practical-v1').trim();
const LIMIT=Math.max(1,Math.min(Number(process.env.GB_BOUNDED_RECOVERY_LIMIT||12),12));
const APPLY=String(process.env.GB_BOUNDED_RECOVERY_APPLY||'').trim()==='1';
const account=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
const token=String(process.env.CLOUDFLARE_API_TOKEN||'').trim();
if(!account||!token)throw new Error('gb_bounded_recovery_credentials_missing');
if(!BATCH_ID)throw new Error('gb_bounded_recovery_batch_id_missing');

async function query(sql,params=[]){
 const response=await fetch(API+'/accounts/'+encodeURIComponent(account)+'/d1/database/'+DB+'/query',{
  method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},
  body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(20000)
 });
 const payload=await response.json();
 if(!response.ok||payload?.success!==true||payload?.result?.[0]?.success!==true){
  throw new Error('gb_bounded_recovery_d1_http_'+response.status+':'+JSON.stringify(payload?.errors||[]));
 }
 return {rows:payload.result[0].results||[],meta:payload.result[0].meta||{}};
}
async function read(sql,params=[]){
 if(!/^\s*(?:SELECT|WITH)\b/i.test(sql)||/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|REPLACE)\b/i.test(sql))throw new Error('gb_bounded_recovery_read_sql_rejected');
 return (await query(sql,params)).rows;
}
async function write(sql,params=[]){
 if(!APPLY)throw new Error('gb_bounded_recovery_write_without_apply');
 if(!/^\s*(?:INSERT|UPDATE)\b/i.test(sql)||/\b(?:DELETE|ALTER|DROP|CREATE|REPLACE)\b/i.test(sql))throw new Error('gb_bounded_recovery_write_sql_rejected');
 return query(sql,params);
}

const markerKey='gb_bounded_recovery:'+BATCH_ID;
const existing=(await read('SELECT value,updated_at FROM runtime_meta WHERE key=?',[markerKey]))[0]||null;
if(existing){
 const output={ok:true,applied:false,already_complete:true,batch_id:BATCH_ID,marker:existing};
 fs.writeFileSync('gb-bounded-recovery-result.json',JSON.stringify(output,null,2));
 console.log(JSON.stringify(output,null,2));
 process.exit(0);
}

const rows=await read(`
WITH scored AS (
 SELECT c.id,c.market,c.region_code,c.canonical_url,c.application_url,c.event_name,c.organiser,
        c.geography_json,c.evidence_json,c.score,c.status,c.last_checked,
        e.enrichment_json,e.source_last_checked,
        (
          CASE WHEN lower(coalesce(c.event_name,'')) GLOB '*festival*' THEN 4 ELSE 0 END +
          CASE WHEN lower(coalesce(c.event_name,'')) GLOB '*fair*' THEN 3 ELSE 0 END +
          CASE WHEN lower(coalesce(c.event_name,'')) GLOB '*market*' THEN 3 ELSE 0 END +
          CASE WHEN lower(coalesce(c.event_name,'')) GLOB '*show*' THEN 2 ELSE 0 END +
          CASE WHEN lower(coalesce(c.event_name,'')) GLOB '*vendor*' OR lower(coalesce(c.event_name,'')) GLOB '*trader*' OR lower(coalesce(c.event_name,'')) GLOB '*stallholder*' OR lower(coalesce(c.event_name,'')) GLOB '*exhibit*' THEN 3 ELSE 0 END +
          CASE WHEN lower(coalesce(c.application_url,'')) GLOB '*apply*' OR lower(coalesce(c.application_url,'')) GLOB '*application*' THEN 2 ELSE 0 END -
          CASE WHEN lower(coalesce(c.event_name,'')) GLOB '*instagram*' OR lower(coalesce(c.event_name,'')) GLOB '*linkedin*' OR lower(coalesce(c.event_name,'')) GLOB '*directory*' OR lower(coalesce(c.event_name,'')) GLOB '*contact*' OR lower(coalesce(c.event_name,'')) GLOB '*terms*' OR lower(coalesce(c.event_name,'')) GLOB '*account*' OR lower(coalesce(c.event_name,'')) GLOB '*blog*' OR lower(coalesce(c.event_name,'')) GLOB '*news*' THEN 8 ELSE 0 END -
          CASE WHEN lower(coalesce(c.canonical_url,'')) GLOB '*instagram.com*' OR lower(coalesce(c.canonical_url,'')) GLOB '*facebook.com*' OR lower(coalesce(c.canonical_url,'')) GLOB '*x.com/*' OR lower(coalesce(c.canonical_url,'')) GLOB '*twitter.com*' OR lower(coalesce(c.canonical_url,'')) GLOB '*linkedin.com*' THEN 12 ELSE 0 END
        ) AS recovery_score
 FROM candidates c
 LEFT JOIN candidate_enrichment e ON e.candidate_id=c.id AND e.source_last_checked>=c.last_checked
 WHERE c.status='validated' AND c.market='GB'
   AND (
     e.candidate_id IS NULL OR
     (json_extract(e.enrichment_json,'$.location.value') IS NULL
      AND json_extract(e.enrichment_json,'$.location_area.value') IS NULL)
   )
),
ranked AS (
 SELECT *,ROW_NUMBER() OVER (
   PARTITION BY region_code
   ORDER BY recovery_score DESC,last_checked ASC,id ASC
 ) AS rn
 FROM scored
)
SELECT * FROM ranked WHERE rn=1 ORDER BY recovery_score DESC,last_checked ASC,id ASC LIMIT ?
`,[LIMIT]);

const fetchProvider=createHttpFetchProvider();
const evaluator=createDefaultCandidateEvaluator({fetchProvider,now:()=>new Date()});
const now=new Date();
const outcomes=[];

for(const row of rows){
 const oldGeo=parse(row.geography_json);
 const location=String(oldGeo.discovery_location||oldGeo.region||row.region_code||'').trim();
 try{
  const evaluated=await evaluator({
   market:getMarket('GB'),
   region_code:row.region_code,
   location,
   result:{url:row.canonical_url,title:row.event_name}
  });
  const timestamp=new Date().toISOString();
  const mergedEvidence=mergeEvidence(parseArray(row.evidence_json),evaluated.evidence||[]);
  const correctedRegion=evaluated.geography?.region_code||row.region_code;
  const candidate={
   ...row,id:row.id,candidate_id:row.id,market:'GB',
   region_code:correctedRegion,
   event_name:evaluated.event_name||row.event_name,
   organiser:evaluated.organiser||row.organiser,
   canonical_url:evaluated.canonical_url||row.canonical_url,
   application_url:evaluated.application_url||row.application_url,
   geography:evaluated.geography,
   geography_json:JSON.stringify(evaluated.geography||{}),
   evidence_json:JSON.stringify(mergedEvidence),
   last_checked:timestamp,
   status:evaluated.status
  };

  let enrichment=null,projected=null;
  if(evaluated.status==='validated'){
   const preview=await previewCandidateEnrichment(candidate,{fetchProvider});
   enrichment=preview.enrichment;
   projected=projectPracticalOpportunity(candidate,enrichment,{now});
  }

  if(APPLY){
   const updated=await write(`
     UPDATE candidates SET region_code=?,application_url=?,event_name=?,organiser=?,
       geography_json=?,evidence_json=?,score=?,status=?,rejection_reason=?,last_checked=?
     WHERE id=? AND market='GB' AND status='validated' AND last_checked=?
   `,[
     correctedRegion,evaluated.application_url,evaluated.event_name,evaluated.organiser,
     JSON.stringify(evaluated.geography||{}),JSON.stringify(mergedEvidence),Number(evaluated.score||0),
     evaluated.status,evaluated.rejection_reason,timestamp,row.id,row.last_checked
   ]);
   if(Number(updated?.meta?.changes||0)!==1){
    outcomes.push({id:row.id,title:row.event_name,classifier_status:'skipped_concurrent_update',practical_usable:false});
    continue;
   }
   if(evaluated.status==='validated'&&enrichment){
    const provenance=Object.fromEntries(Object.entries(enrichment).filter(([,v])=>v?.evidence?.length).map(([k,v])=>[k,{evidence:v.evidence,confidence:v.confidence}]));
    await write(`
      INSERT INTO candidate_enrichment
      (candidate_id,source_last_checked,enrichment_json,provenance_json,fetched_urls_json,enriched_at,updated_at)
      VALUES (?,?,?,?,?,?,?)
      ON CONFLICT(candidate_id) DO UPDATE SET
       source_last_checked=excluded.source_last_checked,enrichment_json=excluded.enrichment_json,
       provenance_json=excluded.provenance_json,fetched_urls_json=excluded.fetched_urls_json,
       enriched_at=excluded.enriched_at,updated_at=excluded.updated_at
    `,[
      row.id,timestamp,JSON.stringify(enrichment),JSON.stringify(provenance),'[]',timestamp,timestamp
    ]);
   }
  }

  const correction=(evaluated.evidence||[]).find(x=>x?.type==='region_correction')||null;
  outcomes.push({
   id:row.id,title:row.event_name,old_region_code:row.region_code,region_code:correctedRegion,
   classifier_status:evaluated.status,rejection_reason:evaluated.rejection_reason||null,
   region_correction:correction,
   recovered_location:projected?.opportunity?.location||null,
   location_precision:projected?.opportunity?.location_precision||null,
   practical_usable:Boolean(projected?.readiness?.ready),
   missing:projected?.readiness?.missing||[],
   blocked:projected?.readiness?.blocked||[]
  });
 }catch(error){
  outcomes.push({id:row.id,title:row.event_name,classifier_status:'error',error:String(error?.message||error),practical_usable:false});
 }
}

const summary={
 ok:true,applied:APPLY,already_complete:false,batch_id:BATCH_ID,limit:LIMIT,
 selected:rows.length,
 classifier_validated:outcomes.filter(x=>x.classifier_status==='validated').length,
 classifier_rejected:outcomes.filter(x=>x.classifier_status==='rejected').length,
 classifier_held:outcomes.filter(x=>x.classifier_status==='held').length,
 errors:outcomes.filter(x=>x.classifier_status==='error').length,
 concurrent_skips:outcomes.filter(x=>x.classifier_status==='skipped_concurrent_update').length,
 region_corrections:outcomes.filter(x=>x.region_correction).length,
 recovered_locations:outcomes.filter(x=>x.recovered_location).length,
 practical_usable:outcomes.filter(x=>x.practical_usable).length,
 outcomes
};
if(APPLY){
 await write(`
   INSERT INTO runtime_meta (key,value,updated_at) VALUES (?,?,?)
   ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at
 `,[markerKey,JSON.stringify({selected:summary.selected,validated:summary.classifier_validated,rejected:summary.classifier_rejected,errors:summary.errors,concurrent_skips:summary.concurrent_skips,recovered:summary.recovered_locations,usable:summary.practical_usable}),new Date().toISOString()]);
}
fs.writeFileSync('gb-bounded-recovery-result.json',JSON.stringify(summary,null,2));
console.log(JSON.stringify({...summary,outcomes:undefined},null,2));

function parse(value){try{return JSON.parse(value||'{}');}catch{return {};}}
function parseArray(value){try{const v=JSON.parse(value||'[]');return Array.isArray(v)?v:[];}catch{return [];}}
function mergeEvidence(prior,next){
 const out=[],seen=new Set();
 for(const item of [...prior,...next]){
  if(!item||typeof item!=='object')continue;
  const key=JSON.stringify([item.kind||item.type||null,item.source||item.url||null,item.title||null,item.snippet||item.excerpt||null,item.query_id||null,item.query||null]);
  if(seen.has(key))continue;seen.add(key);out.push(item);
 }
 return out;
}
