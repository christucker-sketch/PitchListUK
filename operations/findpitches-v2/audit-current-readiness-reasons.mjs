#!/usr/bin/env node
// Read-only aggregate replay of the current customer-readiness function.
// Raw candidate URLs/titles are processed in memory and never emitted.
import { projectCustomerOpportunity } from '../../platform/findpitches-v2/customer/project.mjs';

const API='https://api.cloudflare.com/client/v4';
const DB='6732bcc9-a172-4d38-ad4d-7660ed13392f';
const account=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
const token=String(process.env.CLOUDFLARE_API_TOKEN||'').trim();
if(!account||!token)throw new Error('readiness_audit_cloudflare_credentials_missing');

async function query(sql,params=[]){
 if(!/^\s*(?:SELECT|WITH)\b/i.test(sql)||/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|REPLACE)\b/i.test(sql))throw new Error('readiness_audit_non_read_only_sql');
 const response=await fetch(API+'/accounts/'+encodeURIComponent(account)+'/d1/database/'+DB+'/query',{
  method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},
  body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(20000)
 });
 const payload=await response.json();
 if(!response.ok||payload?.success!==true||payload?.result?.[0]?.success!==true)throw new Error('readiness_audit_d1_http_'+response.status);
 return payload.result[0].results||[];
}

const totals={current_enrichment:0,ready:0,not_ready:0,missing:{},invalid:{},blocked:{}};
const markets={};
let after='';
for(;;){
 const rows=await query(`
 SELECT c.id,c.market,c.region_code,c.canonical_url,c.application_url,c.event_name,
        c.organiser,c.geography_json,c.score,c.status,c.last_checked,e.enrichment_json
 FROM candidates c
 JOIN candidate_enrichment e ON e.candidate_id=c.id AND e.source_last_checked>=c.last_checked
 WHERE c.status='validated' AND c.id>?
 ORDER BY c.id ASC LIMIT 100`,[after]);
 if(!rows.length)break;
 for(const row of rows){
  after=row.id;
  const candidate={...row,geography:parse(row.geography_json),candidate_id:row.id};
  const projected=projectCustomerOpportunity(candidate,parse(row.enrichment_json));
  const readiness=projected.readiness;
  const market=String(row.market||'unknown');
  if(!markets[market])markets[market]={current_enrichment:0,ready:0,not_ready:0,missing:{},invalid:{},blocked:{}};
  for(const target of [totals,markets[market]]){
   target.current_enrichment++;
   if(readiness.ready)target.ready++;else target.not_ready++;
   for(const field of readiness.missing)target.missing[field]=(target.missing[field]||0)+1;
   for(const field of readiness.invalid)target.invalid[field]=(target.invalid[field]||0)+1;
   for(const item of readiness.blocked){
    const key=String(item?.code||'unknown')+':'+String(item?.field||'unknown');
    target.blocked[key]=(target.blocked[key]||0)+1;
   }
  }
 }
 if(rows.length<100)break;
}
function sorted(obj){return Object.fromEntries(Object.entries(obj).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])));}
totals.missing=sorted(totals.missing);totals.invalid=sorted(totals.invalid);totals.blocked=sorted(totals.blocked);
for(const value of Object.values(markets)){value.missing=sorted(value.missing);value.invalid=sorted(value.invalid);value.blocked=sorted(value.blocked);}
console.log(JSON.stringify({totals,markets},null,2));
function parse(value){try{return JSON.parse(value||'{}');}catch{return {};}}
