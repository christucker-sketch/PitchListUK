#!/usr/bin/env node
// Bounded read-only recall preview for explicit venue extraction.
// No Serper, no D1 writes, no IDs/URLs/source text emitted.
import { createHttpFetchProvider } from '../../platform/findpitches-v2/providers/fetch/http.mjs';
import { extractNamedFields } from '../../platform/findpitches-v2/enrichment/named-fields.mjs';

const API='https://api.cloudflare.com/client/v4';
const DB='6732bcc9-a172-4d38-ad4d-7660ed13392f';
const account=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
const token=String(process.env.CLOUDFLARE_API_TOKEN||'').trim();
if(!account||!token)throw new Error('location_preview_cloudflare_credentials_missing');
async function query(sql,params=[]){
 if(!/^\s*(?:SELECT|WITH)\b/i.test(sql)||/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|REPLACE)\b/i.test(sql))throw new Error('location_preview_non_read_only_sql');
 const response=await fetch(API+'/accounts/'+encodeURIComponent(account)+'/d1/database/'+DB+'/query',{
  method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},
  body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(20000)
 });
 const payload=await response.json();
 if(!response.ok||payload?.success!==true||payload?.result?.[0]?.success!==true)throw new Error('location_preview_d1_http_'+response.status);
 return payload.result[0].results||[];
}
const rows=await query(`
 SELECT c.id,c.canonical_url,c.application_url
 FROM candidates c
 JOIN candidate_enrichment e ON e.candidate_id=c.id AND e.source_last_checked>=c.last_checked
 WHERE c.status='validated' AND c.market='US'
   AND (json_extract(e.enrichment_json,'$.location') IS NULL
        OR NULLIF(TRIM(json_extract(e.enrichment_json,'$.location.value')),'') IS NULL)
 ORDER BY c.id ASC LIMIT 12`);
const provider=createHttpFetchProvider({timeoutMs:12000});
const summary={selected:rows.length,records_with_pages:0,recovered_explicit_location:0,no_location:0,records_with_fetch_failure:0,label_classes:{},source_markers:{}};
for(const row of rows){
 const pages=[];let failed=false;
 for(const url of [...new Set([row.canonical_url,row.application_url].filter(Boolean))].slice(0,2)){
  try{const page=await provider.fetch(url);pages.push({url:page.final_url,body:page.body});}
  catch{failed=true;}
 }
 if(failed)summary.records_with_fetch_failure++;
 if(pages.length)summary.records_with_pages++;
 const combined=pages.map(p=>String(p.body||'')).join('\n');
 const markerTests={
  jsonld_event_location:/<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?["@]?type["']?\s*:\s*["']Event["'][\s\S]*?["']location["']\s*:/i,
  schema_location:/["']location["']\s*:\s*\{[\s\S]{0,1200}?["'](?:name|address)["']\s*:/i,
  microdata_event:/itemtype=["'][^"']*schema\.org\/Event/i,
  microdata_location:/itemprop=["'](?:location|address)["']/i,
  map_link:/https?:\/\/(?:www\.)?(?:google\.[^/"']+\/maps|maps\.google\.[^/"']+|maps\.apple\.com)/i,
  venue_word:/\bvenue\b/i,
  location_word:/\blocation\b/i,
  address_word:/\baddress\b/i,
  where_label:/\bwhere\s*[:\-]/i,
  held_at:/\b(?:held\s+at|takes?\s+place\s+at|taking\s+place\s+at)\b/i
 };
 for(const [key,re] of Object.entries(markerTests)){
  if(re.test(combined))summary.source_markers[key]=(summary.source_markers[key]||0)+1;
 }
 const location=extractNamedFields(pages).location;
 if(!location){summary.no_location++;continue;}
 summary.recovered_explicit_location++;
 const excerpt=String(location.evidence?.[0]?.excerpt||'').toLowerCase();
 const key=/event\s+address/.test(excerpt)?'event_address':
  /event\s+site/.test(excerpt)?'event_site':
  /event\s+(?:venue|location)/.test(excerpt)?'event_venue_or_location':
  /festival\s+(?:venue|location|site)/.test(excerpt)?'festival_label':
  /fair\s+(?:venue|location|site)/.test(excerpt)?'fair_label':
  /market\s+(?:venue|location)/.test(excerpt)?'market_label':
  /\bwhere\s*[:\-]/.test(excerpt)?'where_with_event_context':
  /(?:held\s+at|taking\s+place\s+at|takes\s+place\s+at)/.test(excerpt)?'held_at':
  /\bvenue\s*[:\-]/.test(excerpt)?'venue_label':'other_explicit';
 summary.label_classes[key]=(summary.label_classes[key]||0)+1;
}
console.log(JSON.stringify(summary,null,2));
