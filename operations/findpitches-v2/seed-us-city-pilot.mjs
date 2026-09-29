#!/usr/bin/env node
// One-shot isolated v2 US city pilot seeder. Only scheduler_jobs inserts.
// Baseline catalogue, existing jobs, v1 and publication are untouched.
import {planCityPilotJobs} from '../../platform/findpitches-v2/geography/us-city-pilot.mjs';

const API='https://api.cloudflare.com/client/v4';
const DB='6732bcc9-a172-4d38-ad4d-7660ed13392f';
const commit=process.env.CITY_PILOT_COMMIT==='true';
const now=new Date();
const jobs=planCityPilotJobs({now});
if(!commit){
 console.log(JSON.stringify({mode:'DRY_RUN',jobs:jobs.map(({id,location,available_at})=>({id,location,available_at}))}));
 process.exit(0);
}
const token=process.env.CLOUDFLARE_API_TOKEN;
const account=process.env.CLOUDFLARE_ACCOUNT_ID;
if(!token||!account)throw new Error('cloudflare_pilot_credentials_missing');
// Fail closed if the public v2 instance is not isolated shadow, is publishing,
// or has no configured Serper account.
const healthResponse=await fetch('https://api.findpitches.com/health',{signal:AbortSignal.timeout(15000)});
if(!healthResponse.ok)throw new Error('city_pilot_health_unavailable');
const health=await healthResponse.json();
if(health.ok!==true||health.service!=='findpitches-v2-shadow'||health.mode!=='shadow'||
   health.database!=='isolated'||health.publication_enabled!==false||
   health.search_configured!==true)throw new Error('city_pilot_live_safety_assertion_failed');
let queryCount=0;
async function query(sql,params=[]){
 if(++queryCount>32)throw new Error('city_pilot_query_budget_exceeded');
 if(!/^\s*(?:SELECT|INSERT OR IGNORE)\b/i.test(sql)||/;\s*\S/.test(sql))throw new Error('city_pilot_sql_not_allowed');
 const response=await fetch(API+'/accounts/'+encodeURIComponent(account)+'/d1/database/'+DB+'/query',{
   method:'POST',headers:{Authorization:'Bearer '+token,'content-type':'application/json'},
   body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(20000)
 });
 const data=await response.json();
 if(!response.ok||data.success!==true||data.result?.[0]?.success!==true){
   throw new Error('city_pilot_d1_query_failed_http_'+response.status);
 }
 return data.result[0];
}
const before=await query("SELECT id, status FROM scheduler_jobs WHERE id LIKE 'city:US:%'");
const existing=new Set((before.results||[]).map(x=>x.id));
let inserted=0;
for(const job of jobs){
 if(existing.has(job.id))continue;
 const result=await query(`INSERT OR IGNORE INTO scheduler_jobs (
   id,market,region_code,location,query_group,priority,status,
   available_at,attempts,created_at,updated_at
 ) VALUES (?,?,?,?,?,0,'ready',?,0,?,?)`,[
   job.id,job.market,job.region_code,job.location,job.query_group,
   job.available_at,now.toISOString(),now.toISOString()
 ]);
 inserted+=Number(result.meta?.changes||0);
}
const after=await query("SELECT id,market,region_code,location,query_group,status,available_at FROM scheduler_jobs WHERE id LIKE 'city:US:%' ORDER BY id");
const rows=after.results||[];
if(!jobs.every(job=>rows.some(row=>row.id===job.id&&row.market==='US'&&
   row.region_code===job.region_code&&row.location===job.location&&row.query_group===1))){
 throw new Error('city_pilot_postwrite_invariants_failed');
}
console.log(JSON.stringify({ok:true,mode:'COMMIT',database:'isolated_v2',
 before:existing.size,inserted,now_total:rows.length,
 planned:jobs.length,earliest:jobs[0].available_at,latest:jobs.at(-1).available_at,
 publication_enabled:false,baseline_catalogue_unchanged:true}));
