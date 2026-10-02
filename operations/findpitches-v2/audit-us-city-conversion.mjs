#!/usr/bin/env node
import fs from 'node:fs';
import { projectPracticalOpportunity } from '../../platform/findpitches-v2/customer/practical-readiness.mjs';

const API='https://api.cloudflare.com/client/v4';
const DB='6732bcc9-a172-4d38-ad4d-7660ed13392f';
const account=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
const token=String(process.env.CLOUDFLARE_API_TOKEN||'').trim();
if(!account||!token)throw new Error('city_conversion_credentials_missing');

async function query(sql,params=[]){
 if(!/^\s*(?:SELECT|WITH)\b/i.test(sql)||/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|REPLACE)\b/i.test(sql))throw new Error('city_conversion_non_read_only_sql');
 const response=await fetch(API+'/accounts/'+encodeURIComponent(account)+'/d1/database/'+DB+'/query',{
  method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},
  body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(20000)
 });
 const payload=await response.json();
 if(!response.ok||payload?.success!==true||payload?.result?.[0]?.success!==true)throw new Error('city_conversion_d1_http_'+response.status);
 return payload.result[0].results||[];
}

const jobs=await query(`
 SELECT id,region_code,location,attempts,status,available_at,last_error
 FROM scheduler_jobs WHERE market='US' AND query_group=1
 ORDER BY region_code,location,id`);
const byKey=new Map(jobs.map(j=>[key(j.region_code,j.location),{
 id:j.id,state:j.region_code,location:j.location,attempts:Number(j.attempts||0),
 scheduler_status:j.status,last_error:j.last_error||null,
 candidates:0,validated:0,held:0,rejected:0,discovered:0,current_enrichment:0,practical_usable:0,
 precision:{venue:0,place:0,area:0}
}]));

let after='';
const now=new Date();
for(;;){
 const rows=await query(`
 SELECT c.id,c.market,c.region_code,c.event_name,c.organiser,c.canonical_url,c.application_url,
        c.geography_json,c.status,c.last_checked,e.enrichment_json,e.source_last_checked
 FROM candidates c
 LEFT JOIN candidate_enrichment e ON e.candidate_id=c.id
 WHERE c.market='US' AND c.id>? ORDER BY c.id LIMIT 100`,[after]);
 if(!rows.length)break;
 for(const row of rows){
  after=row.id;
  const geography=parse(row.geography_json);
  // Before classification the scheduler target is discovery_location; after
  // classification the evaluator preserves that acquisition label as region.
  // This is attribution only and never event-location evidence.
  const acquisitionLocation=geography.discovery_location||geography.region||null;
  const item=byKey.get(key(row.region_code,acquisitionLocation));
  if(!item)continue;
  item.candidates++;
  if(row.status in item)item[row.status]++;
  if(!row.enrichment_json||String(row.source_last_checked||'')<String(row.last_checked||''))continue;
  item.current_enrichment++;
  if(row.status!=='validated')continue;
  const projected=projectPracticalOpportunity({...row,geography,candidate_id:row.id},parse(row.enrichment_json),{now});
  if(projected.readiness.ready){
    item.practical_usable++;
    const p=projected.opportunity.location_precision||'none';
    if(item.precision[p]!=null)item.precision[p]++;
  }
 }
 if(rows.length<100)break;
}
const rows=[...byKey.values()];
const searched=rows.filter(r=>r.attempts>0);
const withCandidates=rows.filter(r=>r.candidates>0);
const withValidated=rows.filter(r=>r.validated>0);
const withUsable=rows.filter(r=>r.practical_usable>0);
const totals=rows.reduce((a,r)=>{
 for(const f of ['attempts','candidates','validated','held','rejected','discovered','current_enrichment','practical_usable'])a[f]+=r[f];
 for(const p of ['venue','place','area'])a.precision[p]+=r.precision[p];
 return a;
},{attempts:0,candidates:0,validated:0,held:0,rejected:0,discovered:0,current_enrichment:0,practical_usable:0,precision:{venue:0,place:0,area:0}});

const ranked=[...rows].sort((a,b)=>b.practical_usable-a.practical_usable||b.validated-a.validated||b.candidates-a.candidates||a.id.localeCompare(b.id));
const dead=[...rows].filter(r=>r.attempts>0&&r.candidates===0).sort((a,b)=>b.attempts-a.attempts||a.id.localeCompare(b.id));
const candidateNoUsable=[...rows].filter(r=>r.candidates>0&&r.practical_usable===0).sort((a,b)=>b.candidates-a.candidates||a.id.localeCompare(b.id));

const summary={
 at:now.toISOString(),
 city_jobs:rows.length,
 searched_jobs:searched.length,
 jobs_with_candidates:withCandidates.length,
 jobs_with_validated:withValidated.length,
 jobs_with_practical_usable:withUsable.length,
 jobs_without_candidates_after_search:dead.length,
 candidate_generating_jobs_without_usable: candidateNoUsable.length,
 totals,
 conversion:{
  candidate_to_validated:ratio(totals.validated,totals.candidates),
  validated_to_practical_usable:ratio(totals.practical_usable,totals.validated),
  candidate_to_practical_usable:ratio(totals.practical_usable,totals.candidates)
 },
 top_by_practical_usable:ranked.slice(0,20).map(compact),
 top_candidate_no_usable:candidateNoUsable.slice(0,20).map(compact),
 searched_zero_candidate:dead.slice(0,20).map(compact)
};
fs.writeFileSync('us-city-conversion-audit.json',JSON.stringify({summary,rows},null,2));
console.log(JSON.stringify(summary,null,2));

function compact(r){return {id:r.id,state:r.state,location:r.location,attempts:r.attempts,candidates:r.candidates,validated:r.validated,current_enrichment:r.current_enrichment,practical_usable:r.practical_usable,precision:r.precision};}
function key(state,location){return String(state||'').trim().toUpperCase()+'|'+String(location||'').trim().toLowerCase();}
function parse(v){try{return JSON.parse(v||'{}');}catch{return {};}}
function ratio(n,d){return d?Number((100*n/d).toFixed(1)):0;}
