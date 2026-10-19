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
const APPLY=String(process.env.DOCX_BOUNDED_RECOVERY_APPLY||'').trim()==='1';
const BATCH_ID=String(process.env.DOCX_BOUNDED_RECOVERY_BATCH_ID||'').trim();
const TARGET_IDS=String(process.env.DOCX_BOUNDED_RECOVERY_IDS||'').split(',').map(x=>x.trim()).filter(Boolean).slice(0,12);
if(!account||!token)throw new Error('docx_bounded_recovery_credentials_missing');
if(!BATCH_ID)throw new Error('docx_bounded_recovery_batch_id_missing');
if(!TARGET_IDS.length)throw new Error('docx_bounded_recovery_target_ids_missing');

async function query(sql,params=[]){
 const response=await fetch(API+'/accounts/'+encodeURIComponent(account)+'/d1/database/'+DB+'/query',{
  method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},
  body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(20000)
 });
 const payload=await response.json();
 if(!response.ok||payload?.success!==true||payload?.result?.[0]?.success!==true){
  throw new Error('docx_bounded_recovery_d1_http_'+response.status+':'+JSON.stringify(payload?.errors||[]));
 }
 return {rows:payload.result[0].results||[],meta:payload.result[0].meta||{}};
}
async function read(sql,params=[]){
 if(!/^\s*(?:SELECT|WITH)\b/i.test(sql)||/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|REPLACE)\b/i.test(sql))throw new Error('docx_bounded_recovery_read_sql_rejected');
 return (await query(sql,params)).rows;
}
async function write(sql,params=[]){
 if(!APPLY)throw new Error('docx_bounded_recovery_write_without_apply');
 if(!/^\s*(?:INSERT|UPDATE)\b/i.test(sql)||/\b(?:DELETE|ALTER|DROP|CREATE|REPLACE)\b/i.test(sql))throw new Error('docx_bounded_recovery_write_sql_rejected');
 return query(sql,params);
}

const markerKey='docx_bounded_recovery:'+BATCH_ID;
const existing=(await read('SELECT value,updated_at FROM runtime_meta WHERE key=?',[markerKey]))[0]||null;
if(existing){
 const output={ok:true,applied:false,already_complete:true,batch_id:BATCH_ID,marker:existing};
 fs.writeFileSync('docx-bounded-recovery-result.json',JSON.stringify(output,null,2));
 console.log(JSON.stringify(output,null,2));
 process.exit(0);
}

const placeholders=TARGET_IDS.map(()=>'?').join(',');
const rows=await read(`
 SELECT c.id,c.market,c.region_code,c.canonical_url,c.application_url,c.event_name,c.organiser,
        c.geography_json,c.evidence_json,c.score,c.status,c.last_checked,
        e.enrichment_json,e.source_last_checked
 FROM candidates c
 LEFT JOIN candidate_enrichment e ON e.candidate_id=c.id
 WHERE c.id IN (${placeholders})
 ORDER BY c.id ASC
`,TARGET_IDS);

const fetchProvider=createHttpFetchProvider();
const evaluator=createDefaultCandidateEvaluator({fetchProvider,now:()=>new Date()});
const outcomes=[];

for(const row of rows){
 try{
  const oldGeo=parse(row.geography_json);
  const location=String(oldGeo.discovery_location||oldGeo.locality||oldGeo.region||row.region_code||'').trim();
  const evaluated=await evaluator({
   market:getMarket(row.market),region_code:row.region_code,location,
   result:{url:row.canonical_url,title:row.event_name}
  });
  if(evaluated.status!=='validated'){
   outcomes.push({id:row.id,market:row.market,title:row.event_name,status:'not_written',classifier_status:evaluated.status,rejection_reason:evaluated.rejection_reason});
   continue;
  }

  const timestamp=new Date().toISOString();
  const mergedEvidence=mergeEvidence(parseArray(row.evidence_json),evaluated.evidence||[]);
  const geography=evaluated.geography||oldGeo;
  const candidate={
   ...row,id:row.id,candidate_id:row.id,
   market:row.market,region_code:geography.region_code||row.region_code,
   canonical_url:evaluated.canonical_url||row.canonical_url,
   application_url:evaluated.application_url||row.application_url,
   event_name:evaluated.event_name||row.event_name,
   organiser:evaluated.organiser||row.organiser,
   geography,geography_json:JSON.stringify(geography),
   evidence_json:JSON.stringify(mergedEvidence),
   last_checked:timestamp,status:'validated'
  };

  const preview=await previewCandidateEnrichment(candidate,{fetchProvider});
  const projected=projectPracticalOpportunity(candidate,preview.enrichment,{now:new Date()});
  const correction=(evaluated.evidence||[]).find(x=>x?.type==='region_correction')||null;
  if(!projected.readiness.ready){
   outcomes.push({
    id:row.id,market:row.market,title:row.event_name,status:'not_written',classifier_status:'validated',
    region_correction:correction,recovered_location:projected.opportunity.location||null,
    missing:projected.readiness.missing,blocked:projected.readiness.blocked
   });
   continue;
  }

  if(APPLY){
   const updated=await write(`
     UPDATE candidates SET region_code=?,application_url=?,event_name=?,organiser=?,
       geography_json=?,evidence_json=?,score=?,status='validated',rejection_reason=NULL,last_checked=?
     WHERE id=? AND last_checked=?
   `,[
     candidate.region_code,candidate.application_url,candidate.event_name,candidate.organiser,
     candidate.geography_json,candidate.evidence_json,Number(evaluated.score||0),timestamp,row.id,row.last_checked
   ]);
   if(Number(updated?.meta?.changes||0)!==1){
    outcomes.push({id:row.id,market:row.market,title:row.event_name,status:'skipped_concurrent_update'});
    continue;
   }
   const provenance=Object.fromEntries(Object.entries(preview.enrichment||{}).filter(([,v])=>v?.evidence?.length).map(([k,v])=>[k,{evidence:v.evidence,confidence:v.confidence}]));
   await write(`
     INSERT INTO candidate_enrichment
     (candidate_id,source_last_checked,enrichment_json,provenance_json,fetched_urls_json,enriched_at,updated_at)
     VALUES (?,?,?,?,?,?,?)
     ON CONFLICT(candidate_id) DO UPDATE SET
      source_last_checked=excluded.source_last_checked,enrichment_json=excluded.enrichment_json,
      provenance_json=excluded.provenance_json,fetched_urls_json=excluded.fetched_urls_json,
      enriched_at=excluded.enriched_at,updated_at=excluded.updated_at
   `,[
     row.id,timestamp,JSON.stringify(preview.enrichment),JSON.stringify(provenance),
     JSON.stringify(preview.fetched_urls||[]),timestamp,timestamp
   ]);
   await write(`UPDATE classification_queue SET status='complete',lease_until=NULL,last_error=NULL,updated_at=? WHERE candidate_id=?`,[timestamp,row.id]);
   await write(`UPDATE enrichment_queue SET status='complete',lease_until=NULL,last_error=NULL,source_last_checked=?,updated_at=? WHERE candidate_id=?`,[timestamp,timestamp,row.id]);
  }

  outcomes.push({
   id:row.id,market:row.market,title:row.event_name,status:APPLY?'written':'preview',
   classifier_status:'validated',region_code:candidate.region_code,region_correction:correction,
   recovered_location:projected.opportunity.location,
   location_precision:projected.opportunity.location_precision,practical_usable:true
  });
 }catch(error){
  outcomes.push({id:row.id,market:row.market,title:row.event_name,status:'error',error:String(error?.message||error)});
 }
}

const result={
 ok:true,applied:APPLY,already_complete:false,batch_id:BATCH_ID,
 requested:TARGET_IDS.length,selected:rows.length,
 written:outcomes.filter(x=>x.status==='written').length,
 not_written:outcomes.filter(x=>x.status==='not_written').length,
 concurrent_skips:outcomes.filter(x=>x.status==='skipped_concurrent_update').length,
 errors:outcomes.filter(x=>x.status==='error').length,
 outcomes
};
if(APPLY){
 await write(`
   INSERT INTO runtime_meta (key,value,updated_at) VALUES (?,?,?)
   ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at
 `,[markerKey,JSON.stringify({requested:result.requested,selected:result.selected,written:result.written,not_written:result.not_written,concurrent_skips:result.concurrent_skips,errors:result.errors}),new Date().toISOString()]);
}
fs.writeFileSync('docx-bounded-recovery-result.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({...result,outcomes:undefined},null,2));

function parse(v){try{return JSON.parse(v||'{}');}catch{return {};}}
function parseArray(v){try{const x=JSON.parse(v||'[]');return Array.isArray(x)?x:[];}catch{return [];}}
function mergeEvidence(prior,next){
 const out=[],seen=new Set();
 for(const item of [...prior,...next]){
  if(!item||typeof item!=='object')continue;
  const key=JSON.stringify([item.kind||item.type||null,item.source||item.url||null,item.title||null,item.snippet||item.excerpt||null,item.query_id||null,item.query||null]);
  if(seen.has(key))continue;seen.add(key);out.push(item);
 }
 return out;
}
