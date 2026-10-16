// Bounded anonymous GET measurements. No sign-in, messages, provider/acquisition writes.
import fs from 'node:fs';
import {proxyFetch} from './cloudflare-api.mjs';
const args=process.argv.slice(2),get=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
const samples=Number(get('--samples','5')),output=get('--output');
if(!Number.isInteger(samples)||samples<3||samples>7||!output)throw Error('bounded_samples_and_output_required');
const fetcher=proxyFetch(),base='https://findpitches.com',results=[];
const seed=await fetcher(base+'/api/v3/opportunities?market=GB&limit=1',{signal:AbortSignal.timeout(45000)}),inventory=await seed.json();
if(!seed.ok||!inventory.results?.[0]?.id?.match(/^ent_[a-f0-9]{32}$/))throw Error('public_ready_seed_required');
const id=inventory.results[0].id;
const paths={homepage:'/',finder:'/finder.html?cc=uk',country:'/uk/',category:'/uk/christmas-market-stalls/',listing:'/uk/opportunities/'+id+'/',account:'/account.html',billing:'/billing.html',home_api:'/api/v3/home',catalogue_api:'/api/v3/opportunities?market=GB&limit=30',filter_api:'/api/v3/opportunities?market=GB&q=market&limit=30',map_api:'/api/v3/opportunities?market=US&limit=30&view=map',markets_api:'/api/v3/markets',regions_api:'/api/v3/regions?market=GB',listing_api:'/api/v3/opportunities/'+id};
// Canonical listing paths come from the public response, never a guessed route.
paths.listing=inventory.results[0].canonical_path??('/opportunity.html?id='+id);
if(get('--phase','baseline')==='after')paths.seo_page_api='/api/v3/seo/page?path=%2Fuk%2F';
const report={schema:'findpitches-v3-public-read-profile-v1',started_at:new Date().toISOString(),phase:get('--phase','baseline'),origin:base,samples_per_path:samples,results,passed:false,cache_context:'first observed request and sequential repeats; isolate cold starts are not forced or claimed',worker_cpu_time:'not exposed',component_timing:'only provider Server-Timing when present; separate D1 trace required',live_customer_access:false,writes:0,serper_queries:0};
report.attempted_http_requests=1;
if(args.includes('--resume')&&fs.existsSync(output)){
 const prior=JSON.parse(fs.readFileSync(output));if(prior.schema!==report.schema||prior.origin!==base||prior.samples_per_path!==samples||prior.phase!==report.phase)throw Error('matching_profile_required');
 report.started_at=prior.started_at;report.attempted_http_requests+=prior.attempted_http_requests??(1+prior.results.reduce((n,r)=>n+r.samples.length,0));results.push(...prior.results.filter(r=>r.samples.length===samples&&r.samples.every(s=>s.status===200)&&r.path===paths[r.name]));
}
const save=()=>fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{mode:0o600});save();
const quantile=(a,q)=>[...a].sort((x,y)=>x-y)[Math.max(0,Math.ceil(a.length*q)-1)];
for(const [name,path] of Object.entries(paths)){
 if(results.some(r=>r.name===name))continue;
 const row={name,path,samples:[]};results.push(row);
 for(let i=0;i<samples;i++){
  report.attempted_http_requests++;const start=performance.now(),r=await fetcher(base+path,{redirect:'manual',signal:AbortSignal.timeout(45000)}),headersMs=performance.now()-start,body=await r.arrayBuffer();
  row.samples.push({sequence:i+1,status:r.status,ttfb_ms:Number(headersMs.toFixed(2)),total_ms:Number((performance.now()-start).toFixed(2)),body_bytes:body.byteLength,cache_control:r.headers.get('cache-control'),cache_status:r.headers.get('cf-cache-status'),server_timing:r.headers.get('server-timing')});save();
  if(r.status!==200)throw Error('profile_path_not_successful_'+name);
 }
 row.p50_ms=quantile(row.samples.map(s=>s.total_ms),.5);row.p95_ms=quantile(row.samples.map(s=>s.total_ms),.95);row.first_ms=row.samples[0].total_ms;row.repeats_p50_ms=quantile(row.samples.slice(1).map(s=>s.total_ms),.5);row.body_bytes=row.samples.at(-1).body_bytes;save();
}
report.completed_at=new Date().toISOString();report.passed=true;save();console.log(JSON.stringify({passed:true,paths:results.length,requests:report.attempted_http_requests,results:results.map(({name,p50_ms,p95_ms,body_bytes})=>({name,p50_ms,p95_ms,body_bytes}))}));
