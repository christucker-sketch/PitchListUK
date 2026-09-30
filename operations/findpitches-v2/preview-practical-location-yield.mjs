#!/usr/bin/env node
import { createHttpFetchProvider } from '../../platform/findpitches-v2/providers/fetch/http.mjs';
import { extractSupportedAreaEvidence } from '../../platform/findpitches-v2/enrichment/run-batch.mjs';

const API='https://api.cloudflare.com/client/v4';
const DB='6732bcc9-a172-4d38-ad4d-7660ed13392f';
const account=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
const token=String(process.env.CLOUDFLARE_API_TOKEN||'').trim();
if(!account||!token)throw new Error('practical_preview_cloudflare_credentials_missing');

async function query(sql,params=[]){
 if(!/^\s*(?:SELECT|WITH)\b/i.test(sql)||/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|REPLACE)\b/i.test(sql))throw new Error('practical_preview_non_read_only_sql');
 const response=await fetch(API+'/accounts/'+encodeURIComponent(account)+'/d1/database/'+DB+'/query',{
  method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},
  body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(20000)
 });
 const payload=await response.json();
 if(!response.ok||payload?.success!==true||payload?.result?.[0]?.success!==true)throw new Error('practical_preview_d1_http_'+response.status);
 return payload.result[0].results||[];
}

const rows=await query(`
 SELECT c.id,c.market,c.canonical_url,c.application_url,c.geography_json
 FROM candidates c
 JOIN candidate_enrichment e ON e.candidate_id=c.id AND e.source_last_checked>=c.last_checked
 WHERE c.status='validated'
   AND c.market IN ('US','GB')
   AND (json_extract(e.enrichment_json,'$.location') IS NULL
        OR NULLIF(TRIM(json_extract(e.enrichment_json,'$.location.value')),'') IS NULL)
 ORDER BY c.market,c.id
 LIMIT 80`);

const provider=createHttpFetchProvider({timeoutMs:12000});
const summary={selected:rows.length,by_market:{},recovered:0,place:0,area:0,no_match:0,fetch_failure_records:0,pages_fetched:0};
for(const row of rows){
 const market=row.market;
 if(!summary.by_market[market])summary.by_market[market]={selected:0,recovered:0,place:0,area:0,no_match:0,fetch_failure_records:0};
 summary.by_market[market].selected++;
 const pages=[];let failed=false;
 for(const url of [...new Set([row.canonical_url,row.application_url].filter(Boolean))].slice(0,2)){
  try{
   const page=await provider.fetch(url);
   pages.push({url:page.final_url,text:plain(page.body)});
   summary.pages_fetched++;
  }catch{failed=true;}
 }
 if(failed){summary.fetch_failure_records++;summary.by_market[market].fetch_failure_records++;}
 const geography=parse(row.geography_json);
 const field=extractSupportedAreaEvidence(geography,pages);
 if(field){
  summary.recovered++;summary.by_market[market].recovered++;
  summary[field.precision]++;summary.by_market[market][field.precision]++;
 }else{
  summary.no_match++;summary.by_market[market].no_match++;
 }
}
console.log(JSON.stringify(summary,null,2));
function parse(v){try{return JSON.parse(v||'{}');}catch{return {};}}
function plain(html){return String(html||'').replace(/<script\b[\s\S]*?<\/script>/gi,' ').replace(/<style\b[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&#39;/g,"'").replace(/&quot;/gi,'"').replace(/\s+/g,' ').trim();}
