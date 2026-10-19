#!/usr/bin/env node
import fs from 'node:fs';
import {opportunitySnapshot} from '../../functions/_data/opportunities.mjs';
import {projectPracticalOpportunity} from '../../platform/findpitches-v2/customer/practical-readiness.mjs';

const API='https://api.cloudflare.com/client/v4';
const DB='6732bcc9-a172-4d38-ad4d-7660ed13392f';
const account=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
const token=String(process.env.CLOUDFLARE_API_TOKEN||'').trim();
if(!account||!token)throw new Error('gb_legacy_overlap_credentials_missing');
async function query(sql,params=[]){
 if(!/^\s*(?:SELECT|WITH)\b/i.test(sql)||/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|REPLACE)\b/i.test(sql))throw new Error('gb_legacy_overlap_non_read_only_sql');
 const response=await fetch(API+'/accounts/'+encodeURIComponent(account)+'/d1/database/'+DB+'/query',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(20000)});
 const payload=await response.json();if(!response.ok||payload?.success!==true||payload?.result?.[0]?.success!==true)throw new Error('gb_legacy_overlap_d1_http_'+response.status);
 return payload.result[0].results||[];
}
const legacy=(Array.isArray(opportunitySnapshot?.rows)?opportunitySnapshot.rows:[]).filter(r=>r.quality_status==='customer_ready'||r.publishable===true);
const rows=await query(`SELECT c.id,c.market,c.region_code,c.canonical_url,c.application_url,c.event_name,c.organiser,c.geography_json,c.last_checked,e.enrichment_json FROM candidates c LEFT JOIN candidate_enrichment e ON e.candidate_id=c.id AND e.source_last_checked>=c.last_checked WHERE c.status='validated' AND c.market='GB' ORDER BY c.id`);
const byUrl=new Map();
for(const row of rows){for(const url of [row.canonical_url,row.application_url]){const key=normUrl(url);if(key){if(!byUrl.has(key))byUrl.set(key,[]);byUrl.get(key).push(row);}}}
const matches=[];const matchedIds=new Set();
for(const old of legacy){
 const keys=[old.canonical_url,old.application_url,old.url,old.source_url].map(normUrl).filter(Boolean);
 const candidates=[...new Set(keys.flatMap(k=>byUrl.get(k)||[]))];
 for(const row of candidates){
  if(matchedIds.has(row.id))continue;matchedIds.add(row.id);
  const projected=projectPracticalOpportunity({...row,candidate_id:row.id,geography:parse(row.geography_json)},parse(row.enrichment_json),{now:new Date()});
  matches.push({legacy_title:old.title||old.event_name||null,legacy_location:old.location||null,legacy_county:old.county||null,legacy_region:old.region||null,v2_id:row.id,v2_title:row.event_name,v2_region_code:row.region_code,v2_usable:projected.readiness.ready,v2_location:projected.opportunity.location,v2_location_precision:projected.opportunity.location_precision,v2_missing:projected.readiness.missing,v2_blocked:projected.readiness.blocked,matched_urls:keys.filter(k=>(byUrl.get(k)||[]).some(x=>x.id===row.id))});
 }
}
const summary={at:new Date().toISOString(),legacy_customer_ready:legacy.length,v2_validated_gb:rows.length,legacy_to_v2_url_overlap:matches.length,overlap_usable:matches.filter(x=>x.v2_usable).length,overlap_missing_location:matches.filter(x=>x.v2_missing.includes('location')).length,overlap_with_legacy_location:matches.filter(x=>String(x.legacy_location||'').trim()).length,overlap_missing_v2_but_legacy_has_location:matches.filter(x=>x.v2_missing.includes('location')&&String(x.legacy_location||'').trim()).length};
fs.writeFileSync('gb-legacy-overlap.json',JSON.stringify({summary,matches},null,2));
console.log(JSON.stringify(summary,null,2));
function normUrl(v){try{const u=new URL(String(v||''));u.hash='';for(const k of [...u.searchParams.keys()])if(/^utm_/i.test(k))u.searchParams.delete(k);u.hostname=u.hostname.toLowerCase().replace(/^www\./,'');u.pathname=u.pathname.replace(/\/+$/,'')||'/';return u.toString();}catch{return null;}}
function parse(v){try{return JSON.parse(v||'{}');}catch{return {};}}