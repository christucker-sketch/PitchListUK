// Bounded read-only timings. Never substitute cached proof or customer access.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {shadowContext} from './shadow-context.mjs';
import {customerContext} from './customer-context.mjs';
import {stagingCatalogue,LATEST_STRUCTURED_POLICY_SQL} from '../../platform/findpitches-v3/staging.mjs';
import {previewCookie} from '../../platform/findpitches-v3/customer-security.mjs';

const round=n=>Math.round(n*100)/100;
function timedDatabase(db,measurements){
  function statement(query,params=[]){
    const s=params.length?db.prepare(query).bind(...params):db.prepare(query);
    return {bind:(...args)=>statement(query,args),all:async()=>{
      if(!/^SELECT\b/i.test(query.trim()))throw Error('read_only_profile_required');
      const start=performance.now(),r=await s.all();measurements.push({component:query.includes('FROM entity_records er JOIN producer_records p ON p.id=er.record_id\n    WHERE')?'latest_producer_policy':'inventory_page',wall_ms:round(performance.now()-start),d1_duration_ms:r.meta?.duration??null,rows_read:r.meta?.rows_read??null,rows_returned:r.results?.length??0,response_bytes:new TextEncoder().encode(JSON.stringify(r.results??[])).length});return r;
    }};
  }
  return {prepare:query=>statement(query)};
}
export async function profileCatalogue({credentialsFile,stateDirectory,customerDirectory,previewAccessFile,rounds=3}){
  if(!Number.isInteger(rounds)||rounds<1||rounds>3)throw Error('profile_round_cap_required');
  const ctx=await shadowContext({credentialsFile,stateDirectory}),samples=[];
  for(let i=0;i<rounds;i++){
    const queries=[],start=performance.now(),snapshot=await stagingCatalogue(timedDatabase(ctx.db,queries));
    const countries={};for(const item of snapshot.items)countries[item.country]=(countries[item.country]??0)+1;
    samples.push({sample:i+1,path:'operator_D1_HTTP_snapshot',snapshot_as_of:snapshot.as_of,wall_ms:round(performance.now()-start),private_eligible:snapshot.items.length,private_eligible_by_country:countries,shadow_ready:snapshot.shadow_ready,producer_policy_withheld:snapshot.producer_policy_withheld,queries});
  }
  const indexes=(await ctx.db.prepare("SELECT name,sql FROM sqlite_master WHERE type='index' AND tbl_name='producer_records'").all()).results;
  const latestReceiptPlan=(await ctx.db.prepare('EXPLAIN QUERY PLAN '+LATEST_STRUCTURED_POLICY_SQL).all()).results;
  const customer=await customerContext({credentialsFile,customerDirectory}),http=[];
  const access=JSON.parse(fs.readFileSync(previewAccessFile??path.join(customerDirectory,'browser-access-private.json'))),preview=access.cookies?.find(c=>c.name===previewCookie);
  if(access.base!==customer.state.url||!preview)throw Error('existing_preview_access_required');
  customer.cookieJar.set(previewCookie,preview.value);
  // Existing authorised preview access only; omit every customer session cookie.
  // No invitation, account, sign-in or test session is created by this profiler.
  // GET /session issues CSRF cookie but does not sign in or change entitlement.
  let nativeCoverage='Existing preview invitation only; no customer sign-in.';
  for(const route of ['/api/v3/session','/api/v3/markets','/api/v3/billing/plans?market=GB','/api/v3/billing/plans?market=US','/api/v3/regions?market=US','/api/v3/opportunities?market=GB&page_size=1','/api/v3/opportunities?market=US&page_size=1']){
    const start=performance.now();let r;
    try{r=await customer.call(route,{operator:true});}
    catch(e){if(e.message!=='customer_http_401_preview_access_required')throw e;
      http.push({route,status:401,wall_ms:round(performance.now()-start),error:'existing_preview_invitation_expired'});
      nativeCoverage='Existing invitation is no longer valid; customer boot endpoints were not profiled. No new invitation/session created. Operator GET /preview/status provides the current native service-binding snapshot timing.';
      const statusStart=performance.now(),native=await customer.call('/preview/status',{operator:true});
      http.push({route:'/preview/status',status:native.status,wall_ms:round(performance.now()-statusStart),inventory:native.data.inventory,cache_control:native.headers.get('cache-control')});break;
    }
    http.push({route,status:r.status,wall_ms:round(performance.now()-start),cache_control:r.headers.get('cache-control'),...(Number.isInteger(r.data?.total)?{total:r.data.total}:{})});
  }
  return {schema:'findpitches-v3-catalogue-profile-v1',as_of:new Date().toISOString(),round_cap:3,samples,http_reads:http,native_http_coverage:nativeCoverage,producer_record_indexes:indexes,latest_receipt_query_plan:latestReceiptPlan,
    boot_dependencies:{shell:'Markets and anonymous session in parallel; then plans for currently live markets in parallel; signed-in users also request saved IDs.',finder:'Waits for shell; US then awaits regions before the initial search. Each markets/regions/search endpoint reads a fresh catalogue.',catalogue:'READY inventory is paged at 250. Latest independent-producer policy is read on every snapshot; each producer candidate runs a correlated newer-receipt anti-join with JSON source-clock extraction.'},
    limits:'Single client, bounded sequential samples in the Codex proxy environment. Operator snapshot wall time includes Cloudflare management API round trips; preview endpoint wall time includes network/proxy and service-binding work. This is not browser rendering or production-load evidence.',
    writes:{source_facts:0,identity:0,customer_accounts:0,provider:0,publication:0,paid_queries:0},
    recommendations:['Reduce repeated inventory reads first: use one fresh proof snapshot within each server request and profile a compact batched projection against the same expiry/revision/hold checks.','The newer-receipt query plan already bounds each history by environment/producer/record ID. Profile JSON clock extraction within those histories before proposing an expression index or transactionally maintained latest-receipt pointer; preserve source-clock and received-at/ID tie ordering.','Avoid gating the Finder on billing plans that are only needed by upgrade controls; retain unavailable-price behavior.','Any future cross-request cache needs expiry, source/identity revision, producer-policy invalidation and fail-closed entitlement/redaction checks; do not deploy a stale global catalogue cache.']};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),get=k=>args.includes(k)?args[args.indexOf(k)+1]:undefined;
  try{const out=get('--out');if(!out)throw Error('profile_output_required');const report=await profileCatalogue({credentialsFile:get('--credentials'),stateDirectory:get('--state-dir'),customerDirectory:get('--customer-dir'),previewAccessFile:get('--preview-access')});fs.writeFileSync(out,JSON.stringify(report,null,2));console.log(JSON.stringify({as_of:report.as_of,samples:report.samples.map(({queries,...s})=>({...s,query_count:queries.length,d1_duration_ms:round(queries.reduce((n,q)=>n+(q.d1_duration_ms??0),0))})),http_reads:report.http_reads}));}
  catch(e){console.error(/^[a-z0-9_]+$/.test(e.message)?e.message:'catalogue_profile_failed');process.exitCode=1;}
}
