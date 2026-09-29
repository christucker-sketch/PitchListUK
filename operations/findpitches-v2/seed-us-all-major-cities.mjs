#!/usr/bin/env node
// One-shot staged expansion of isolated v2 to the pinned 314 incorporated
// 100k+ Census cities. Only INSERT OR IGNORE of namespaced scheduler jobs;
// existing eight city pilot jobs, ordinary catalogue, candidates and v1 remain
// untouched. All jobs use the existing v2 official-first profile (query_group 1).
import {planAllMajorUsCityJobs} from '../../platform/findpitches-v2/geography/us-all-major-city-jobs.mjs';

const API='https://api.cloudflare.com/client/v4';
const DB='6732bcc9-a172-4d38-ad4d-7660ed13392f';
const now=new Date();
const jobs=planAllMajorUsCityJobs({now,spacingMinutes:15});
if(process.env.US_MAJOR_CITY_COMMIT!=='true'){
 console.log(JSON.stringify({mode:'DRY_RUN',census_major_cities:jobs.length,
  states:new Set(jobs.map(j=>j.state)).size,first:jobs[0].location,
  last:jobs.at(-1).location,first_available:jobs[0].available_at,
  last_available:jobs.at(-1).available_at}));
 process.exit(0);
}
const token=String(process.env.CLOUDFLARE_API_TOKEN||'');
const account=String(process.env.CLOUDFLARE_ACCOUNT_ID||'');
if(!token||!account)throw new Error('major_city_cloudflare_credentials_missing');
const healthResponse=await fetch('https://api.findpitches.com/health',{signal:AbortSignal.timeout(15000)});
if(!healthResponse.ok)throw new Error('major_city_health_unavailable');
const health=await healthResponse.json();
if(health.ok!==true||health.service!=='findpitches-v2-shadow'||health.mode!=='shadow'||
 health.database!=='isolated'||health.publication_enabled!==false||
 health.search_configured!==true||health.us_city_discovery_profile!=='official_first_v1'){
 throw new Error('major_city_v2_runtime_safety_assertion_failed');
}
let queryCount=0;
async function query(sql,params=[]){
 if(++queryCount>55)throw new Error('major_city_d1_query_budget_exceeded');
 if(!/^\s*(?:SELECT|INSERT OR IGNORE)\b/i.test(sql)||/;\s*\S/.test(sql)){
  throw new Error('major_city_disallowed_d1_query');
 }
 const response=await fetch(API+'/accounts/'+encodeURIComponent(account)+'/d1/database/'+DB+'/query',{
  method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},
  body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(20000)
 });
 const payload=await response.json();
 if(!response.ok||payload?.success!==true||payload?.result?.[0]?.success!==true){
  throw new Error('major_city_d1_query_failed_http_'+response.status);
 }
 return payload.result[0];
}
const baselineBefore=await query("SELECT COUNT(*) AS count FROM scheduler_jobs WHERE id NOT LIKE 'city:US:%'");
const before=await query("SELECT id FROM scheduler_jobs WHERE id LIKE 'city:US:%'");
const existing=new Set((before.results||[]).map(row=>row.id));
let inserted=0;
const timestamp=now.toISOString();
const missing=jobs.filter(job=>!existing.has(job.id));
// D1 HTTP query parameter limits vary; keep each INSERT safely below 100
// bindings (8 columns x 8 rows = 64 parameters) and retain resumability.
for(let i=0;i<missing.length;i+=8){
 const slice=missing.slice(i,i+8);
 const values=slice.map(()=>"(?,?,?,?,?,0,'ready',?,0,?,?)").join(',');
 const params=slice.flatMap(job=>[job.id,job.market,job.region_code,
  job.location,job.query_group,job.available_at,timestamp,timestamp]);
 const result=await query(`INSERT OR IGNORE INTO scheduler_jobs (
 id,market,region_code,location,query_group,priority,status,available_at,
 attempts,created_at,updated_at) VALUES ${values}`,params);
 inserted+=Number(result.meta?.changes||0);
}
const after=await query("SELECT id,market,region_code,location,query_group FROM scheduler_jobs WHERE id LIKE 'city:US:%'");
const baselineAfter=await query("SELECT COUNT(*) AS count FROM scheduler_jobs WHERE id NOT LIKE 'city:US:%'");
const rows=new Map((after.results||[]).map(row=>[row.id,row]));
if(jobs.some(job=>{
 const found=rows.get(job.id);
 return !found||found.market!=='US'||found.region_code!==job.region_code||
        found.location!==job.location||Number(found.query_group)!==1;
})){
 throw new Error('major_city_postwrite_jobs_not_complete_or_correct');
}
if(Number(baselineBefore.results?.[0]?.count)!==Number(baselineAfter.results?.[0]?.count)){
 throw new Error('major_city_baseline_job_count_changed');
}
console.log(JSON.stringify({ok:true,mode:'COMMIT',database:'isolated_v2',
 census_major_cities:jobs.length,census_states:new Set(jobs.map(j=>j.state)).size,
 existing_city_jobs:existing.size,inserted,city_jobs_after:rows.size,
 earliest:new Date(Math.min(...jobs.map(j=>Date.parse(j.available_at)))).toISOString(),
 latest:jobs.at(-1).available_at,baseline_jobs_unchanged:true,
 publication_enabled:false,d1_queries:queryCount}));
