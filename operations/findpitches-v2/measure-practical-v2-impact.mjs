#!/usr/bin/env node
import fs from 'node:fs';
import {projectPracticalOpportunity} from '../../platform/findpitches-v2/customer/practical-readiness.mjs';

const API='https://api.cloudflare.com/client/v4';
const DB='6732bcc9-a172-4d38-ad4d-7660ed13392f';
const account=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
const token=String(process.env.CLOUDFLARE_API_TOKEN||'').trim();
if(!account||!token)throw new Error('practical_v2_impact_credentials_missing');

async function query(sql,params=[]){
 if(!/^\s*(?:SELECT|WITH)\b/i.test(sql)||/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|REPLACE)\b/i.test(sql))throw new Error('practical_v2_impact_non_read_only_sql');
 const response=await fetch(API+'/accounts/'+encodeURIComponent(account)+'/d1/database/'+DB+'/query',{
  method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},
  body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(20000)
 });
 const payload=await response.json();
 if(!response.ok||payload?.success!==true||payload?.result?.[0]?.success!==true)throw new Error('practical_v2_impact_d1_http_'+response.status);
 return payload.result[0].results||[];
}

const NEW_BLOCKERS=new Set(['cross_market_geography','stale_event_year','generic_non_event_vendor_page']);
const now=new Date();
const rows=[];
let after='';
for(;;){
 const batch=await query(`
 SELECT c.id,c.market,c.region_code,c.canonical_url,c.application_url,c.event_name,c.organiser,
        c.geography_json,c.last_checked,e.enrichment_json
 FROM candidates c
 JOIN candidate_enrichment e ON e.candidate_id=c.id AND e.source_last_checked>=c.last_checked
 WHERE c.status='validated' AND c.id>?
 ORDER BY c.id ASC LIMIT 100
 `,[after]);
 if(!batch.length)break;
 for(const row of batch){
  after=row.id;
  const projected=projectPracticalOpportunity({...row,geography:parse(row.geography_json),candidate_id:row.id},parse(row.enrichment_json),{now});
  const r=projected.readiness;
  const oldBlocked=(r.blocked||[]).filter(x=>!NEW_BLOCKERS.has(x.code));
  const v1Ready=(r.missing||[]).length===0&&(r.invalid||[]).length===0&&oldBlocked.length===0;
  if(!v1Ready)continue;
  const newReasons=(r.blocked||[]).filter(x=>NEW_BLOCKERS.has(x.code)).map(x=>x.code);
  rows.push({
   id:row.id,market:row.market,region_code:row.region_code,
   title:projected.opportunity.title,location:projected.opportunity.location,
   location_precision:projected.opportunity.location_precision,
   canonical_url:row.canonical_url,application_url:row.application_url,
   event_start:projected.opportunity.event_start,application_deadline:projected.opportunity.application_deadline,
   v2_ready:r.ready,new_blockers:[...new Set(newReasons)],
   evidence:projected.provenance?.location?.evidence?.[0]||null
  });
 }
 if(batch.length<100)break;
}
const rejected=rows.filter(x=>!x.v2_ready);
const retained=rows.filter(x=>x.v2_ready);
const output={
 at:now.toISOString(),
 baseline_v1_usable:rows.length,
 v2_usable:retained.length,
 removed:rejected.length,
 removal_rate:rows.length?Number((rejected.length/rows.length).toFixed(4)):0,
 baseline_by_market:countBy(rows,'market'),
 retained_by_market:countBy(retained,'market'),
 removed_by_market:countBy(rejected,'market'),
 baseline_by_precision:countBy(rows,'location_precision'),
 retained_by_precision:countBy(retained,'location_precision'),
 removed_by_precision:countBy(rejected,'location_precision'),
 blocker_counts:countReasons(rejected),
 rejected
};
fs.writeFileSync('practical-v2-impact.json',JSON.stringify(output,null,2));
console.log(JSON.stringify({...output,rejected:undefined},null,2));

function countBy(items,key){return items.reduce((o,r)=>(o[r[key]??'null']=(o[r[key]??'null']||0)+1,o),{});}
function countReasons(items){const o={};for(const r of items)for(const code of r.new_blockers)o[code]=(o[code]||0)+1;return o;}
function parse(v){try{return JSON.parse(v||'{}');}catch{return {};}}
