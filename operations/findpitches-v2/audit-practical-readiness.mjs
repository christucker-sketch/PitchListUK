#!/usr/bin/env node
import { projectPracticalOpportunity } from '../../platform/findpitches-v2/customer/practical-readiness.mjs';

const API='https://api.cloudflare.com/client/v4';
const DB='6732bcc9-a172-4d38-ad4d-7660ed13392f';
const account=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
const token=String(process.env.CLOUDFLARE_API_TOKEN||'').trim();
if(!account||!token)throw new Error('practical_audit_cloudflare_credentials_missing');

async function query(sql,params=[]){
 if(!/^\s*(?:SELECT|WITH)\b/i.test(sql)||/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|REPLACE)\b/i.test(sql))throw new Error('practical_audit_non_read_only_sql');
 const response=await fetch(API+'/accounts/'+encodeURIComponent(account)+'/d1/database/'+DB+'/query',{
  method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},
  body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(20000)
 });
 const payload=await response.json();
 if(!response.ok||payload?.success!==true||payload?.result?.[0]?.success!==true)throw new Error('practical_audit_d1_http_'+response.status);
 return payload.result[0].results||[];
}

const now=new Date();
const totals={current_enrichment:0,usable:0,partial:0,hard_blocked:0,location:{venue:0,place:0,area:0,none:0},missing:{},blocked:{}};
const markets={};
let after='';
for(;;){
 const rows=await query(`
 SELECT c.id,c.market,c.region_code,c.canonical_url,c.application_url,c.event_name,c.organiser,
        c.geography_json,c.event_start,c.event_end,c.deadline,c.last_checked,e.enrichment_json
 FROM candidates c
 JOIN candidate_enrichment e ON e.candidate_id=c.id AND e.source_last_checked>=c.last_checked
 WHERE c.status='validated' AND c.id>?
 ORDER BY c.id ASC LIMIT 100`,[after]);
 if(!rows.length)break;
 for(const row of rows){
  after=row.id;
  const candidate={...row,geography:parse(row.geography_json),candidate_id:row.id};
  const result=projectPracticalOpportunity(candidate,parse(row.enrichment_json),{now});
  const ready=result.readiness.ready;
  const precision=result.opportunity.location_precision||'none';
  const hasPartial=Boolean(result.opportunity.location)&&!ready;
  const market=String(row.market||'unknown');
  if(!markets[market])markets[market]={current_enrichment:0,usable:0,partial:0,hard_blocked:0,location:{venue:0,place:0,area:0,none:0},missing:{},blocked:{}};
  for(const target of [totals,markets[market]]){
   target.current_enrichment++;
   target.location[precision]=(target.location[precision]||0)+1;
   if(ready)target.usable++;
   else if(hasPartial)target.partial++;
   else target.hard_blocked++;
   for(const field of result.readiness.missing)target.missing[field]=(target.missing[field]||0)+1;
   for(const item of result.readiness.blocked){
    const key=String(item.code||'unknown')+':'+String(item.field||'unknown');
    target.blocked[key]=(target.blocked[key]||0)+1;
   }
  }
 }
 if(rows.length<100)break;
}
console.log(JSON.stringify({at:now.toISOString(),totals,markets},null,2));
function parse(v){try{return JSON.parse(v||'{}');}catch{return {};}}
