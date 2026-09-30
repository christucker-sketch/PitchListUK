#!/usr/bin/env node
import fs from 'node:fs';
import {createHttpFetchProvider} from '../../platform/findpitches-v2/providers/fetch/http.mjs';
import {extractSupportedPlaceEvidence,extractSupportedAreaEvidence} from '../../platform/findpitches-v2/enrichment/run-batch.mjs';
import {projectPracticalOpportunity} from '../../platform/findpitches-v2/customer/practical-readiness.mjs';

const API='https://api.cloudflare.com/client/v4';
const DB='6732bcc9-a172-4d38-ad4d-7660ed13392f';
const account=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
const token=String(process.env.CLOUDFLARE_API_TOKEN||'').trim();
if(!account||!token)throw new Error('gb_place_preview_credentials_missing');
const fetchProvider=createHttpFetchProvider();

async function query(sql,params=[]){
 if(!/^\s*(?:SELECT|WITH)\b/i.test(sql)||/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|REPLACE)\b/i.test(sql))throw new Error('gb_place_preview_non_read_only_sql');
 const response=await fetch(API+'/accounts/'+encodeURIComponent(account)+'/d1/database/'+DB+'/query',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(20000)});
 const payload=await response.json();
 if(!response.ok||payload?.success!==true||payload?.result?.[0]?.success!==true)throw new Error('gb_place_preview_d1_http_'+response.status);
 return payload.result[0].results||[];
}

const now=new Date();
const source=await query(`
 SELECT c.id,c.market,c.region_code,c.canonical_url,c.application_url,c.event_name,c.organiser,c.geography_json,c.last_checked,e.enrichment_json
 FROM candidates c JOIN candidate_enrichment e ON e.candidate_id=c.id AND e.source_last_checked>=c.last_checked
 WHERE c.status='validated' AND c.market='GB' ORDER BY c.region_code,c.id LIMIT 600`);
const missing=source.filter(row=>!projectPracticalOpportunity({...row,candidate_id:row.id,geography:parse(row.geography_json)},parse(row.enrichment_json),{now}).opportunity.location);
const selected=spreadByRegion(missing,60);
const outcomes=[];
for(const row of selected){
 const urls=[...new Set([row.canonical_url,row.application_url].filter(Boolean))].slice(0,2);
 const docs=[];const failures=[];
 for(const url of urls){
  try{const page=await fetchProvider.fetch(url);docs.push({url:page.final_url,text:plain(page.body)});}catch(error){failures.push({url,error:String(error?.message||error).slice(0,120)});}
 }
 const geography=parse(row.geography_json);
 const place=extractSupportedPlaceEvidence(geography,docs);
 const area=place?null:extractSupportedAreaEvidence(geography,docs);
 outcomes.push({id:row.id,region_code:row.region_code,event_name:row.event_name,recovered:place||area||null,urls_attempted:urls.length,urls_fetched:docs.length,failures});
}
const place=outcomes.filter(x=>x.recovered?.precision==='place').length;
const area=outcomes.filter(x=>x.recovered?.precision==='area').length;
const summary={at:now.toISOString(),gb_current_enrichment:source.length,gb_missing_practical_location:missing.length,sample_size:selected.length,recovered_place:place,recovered_area:area,recovered_total:place+area,still_missing:selected.length-place-area,records_with_fetch_failure:outcomes.filter(x=>x.failures.length).length,estimated_sample_recovery_rate:selected.length?Number(((place+area)/selected.length).toFixed(4)):0};
fs.writeFileSync('gb-place-recovery-preview.json',JSON.stringify({summary,outcomes},null,2));
console.log(JSON.stringify(summary,null,2));

function spreadByRegion(rows,limit){
 const by=new Map();for(const row of rows){const key=String(row.region_code||'unknown');if(!by.has(key))by.set(key,[]);by.get(key).push(row);}
 const keys=[...by.keys()].sort(),out=[];let round=0;
 while(out.length<limit){let added=false;for(const key of keys){const item=by.get(key)?.[round];if(item){out.push(item);added=true;if(out.length>=limit)break;}}if(!added)break;round++;}
 return out;
}
function plain(html){return String(html||'').replace(/<script\b[\s\S]*?<\/script>/gi,' ').replace(/<style\b[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&#39;/g,"'").replace(/&quot;/gi,'"').replace(/\s+/g,' ').trim();}
function parse(v){try{return JSON.parse(v||'{}');}catch{return {};}}