// Bounded read-only native-origin probes. Auth setup uses retained synthetic
// TEST identities; no Checkout, provider writes, email, source or customer edits.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {customerContext} from './customer-context.mjs';

export async function auditNativePreview({credentialsFile,customerDirectory}) {
  const ctx=await customerContext({credentialsFile,customerDirectory}),started=new Date().toISOString();
  await ctx.call('/preview/access',{method:'POST',operator:true});
  const timings=[],checks=[],issues=[];
  const check=(name,passed)=>{checks.push({check:name,passed:Boolean(passed)});if(!passed)issues.push(name);};
  let calls=0;
  async function get(route,{cookie=true}={}) {
    if(++calls>70)throw Error('preview_probe_budget_exceeded');
    const start=performance.now(),r=await ctx.fetcher(ctx.state.url+route,{headers:cookie?{Cookie:[...ctx.cookieJar].map(([k,v])=>k+'='+v).join('; ')}:{},redirect:'manual',signal:AbortSignal.timeout(60000)});
    const text=await r.text();let data;try{data=JSON.parse(text);}catch{}
    timings.push({route,status:r.status,duration_ms:Math.round(performance.now()-start)});
    return {status:r.status,data,text,headers:r.headers};
  }
  check('uninvited_html_denied',(await get('/',{cookie:false})).status===401);
  check('uninvited_search_denied',(await get('/api/v3/opportunities?market=GB',{cookie:false})).status===401);
  const home=await get('/');
  check('private_home_200',home.status===200);
  check('security_headers',home.headers.get('content-security-policy')?.includes("frame-ancestors 'none'")&&home.headers.get('x-content-type-options')==='nosniff'&&home.headers.get('cache-control')==='private, no-store'&&home.headers.get('strict-transport-security')?.includes('31536000'));
  check('private_noindex',home.headers.get('x-robots-tag')?.includes('noindex'));
  check('robots_disallow',(await get('/robots.txt')).text.includes('Disallow: /'));
  check('sitemap_empty',!(await get('/sitemap.xml')).text.includes('<loc>'));
  const markets=(await get('/api/v3/markets')).data.markets;
  check('radius_and_geocoder_honest',markets.every(m=>m.search.radius===false&&m.search.geocoder==='none'));
  const summaries=[];
  for(const market of ['GB','US','CA','AU','NZ']) {
    const res=await get('/api/v3/opportunities?market='+market+'&page_size=100');
    const d=res.data;
    check(market+'_country_scope',res.status===200&&d.results.every(o=>o.market===market));
    check(market+'_free_redaction',d.results.every(o=>o.access.locked&&o.access.application_url===null&&o.access.source_url===null&&!('_restricted' in o)&&!('_proof' in o)));
    const n=Object.values(d.facets.types).reduce((a,b)=>a+b,0)+(d.facets.unclassified_types??0);
    check(market+'_type_facet_accounting',n===d.total);
    check(market+'_date_facet_accounting',Object.values(d.facets.months).reduce((a,b)=>a+b,0)+d.facets.undated===d.total);
    summaries.push({market,total:d.total,sampled:d.results.length,with_verified_region:d.results.filter(o=>o.location.region_id).length,facets:d.facets});
    if(market==='GB') {
      const two=(await get('/api/v3/opportunities?market=GB&page_size=2&page=2')).data;
      check('distinct_pagination',two.results.every(o=>!d.results.slice(0,2).some(x=>x.id===o.id)));
      const detail=await get('/api/v3/opportunities/'+d.results[0].id);
      check('detail_free_redaction',detail.data.opportunity.access.locked&&!detail.data.opportunity.access.application_url&&!detail.data.opportunity.access.source_url);
      const region=Object.entries(d.facets.regions).find(([,n])=>n>0);
      if(region){const filtered=(await get('/api/v3/opportunities?market=GB&region='+encodeURIComponent(region[0])+'&page_size=100')).data;check('verified_region_filter_accounting',filtered.total===region[1]&&filtered.results.every(o=>o.location.region_id));}
    }
  }
  const literal=(await get('/api/v3/opportunities?market=GB&q=Cambridge&page_size=100')).data;
  check('literal_location_without_inferred_region',literal.location.kind==='unresolved'&&literal.results.every(o=>o.location.label.toLowerCase().includes('cambridge')));
  check('honest_empty',(await get('/api/v3/opportunities?market=GB&q=fp-never-a-location-000000')).data.total===0);
  const radius=await get('/api/v3/opportunities?market=GB&radius_km=50');
  check('unsupported_radius_rejected',radius.status===400&&radius.data.error==='radius_unavailable');
  const nearest=await get('/api/v3/opportunities?market=GB&sort=nearest');
  check('unsupported_nearest_rejected',nearest.status===400&&nearest.data.error==='radius_unavailable');
  check('invalid_market_rejected',(await get('/api/v3/opportunities?market=XX')).status===404);
  check('invalid_region_rejected',(await get('/api/v3/opportunities?market=GB&region=made-up-region')).status===400);
  for(let i=0;i<3;i++){await get('/api/v3/opportunities?market=GB&page_size=25');await get('/api/v3/session');}
  // Reuse a retained TEST fixture if it still has canonical paid-through
  // access. Never manufacture Pro or create another provider subscription.
  const retained=JSON.parse(fs.readFileSync(path.join(customerDirectory,'test-journey-state-private.json'))).accounts?.active;
  let proCoverage={available:false,reason:'no_retained_active_fixture'};
  if(retained?.email&&/^v3-[^@]+@example\.com$/.test(retained.email)) {
    const link=(await ctx.call('/preview/test-login',{method:'POST',operator:true,body:{email:retained.email}})).data.dev_link;
    await ctx.call(link);
    const active=await get('/api/v3/session');
    if(['pro','trial'].includes(active.data.access.tier)&&active.data.access.market==='GB') {
      const gb=await get('/api/v3/opportunities?market=GB&page_size=2'),us=await get('/api/v3/opportunities?market=US&page_size=2');
      check('retained_canonical_Pro_GB_links',gb.data.results.every(o=>!o.access.locked&&/^https:\/\//.test(o.access.application_url??'')));
      check('retained_GB_Pro_cannot_unlock_US',us.data.results.every(o=>o.access.locked&&!o.access.application_url&&!o.access.source_url));
      proCoverage={available:true,tier:active.data.access.tier,market:'GB',canonical_refresh:true,provider_writes:0};
    } else proCoverage={available:false,reason:'retained_fixture_no_current_GB_entitlement'};
  }
  const state=JSON.parse(fs.readFileSync(path.join(customerDirectory,'hosted-journey-private.json')));
  if(!/^v3-[^@]+@example\.com$/.test(state.email)||!state.completed_at)throw Error('retained_completed_test_fixture_required');
  const session=(await ctx.call('/preview/test-login',{method:'POST',operator:true,body:{email:state.email,next:'/account.html'}})).data;
  const privateFile=path.join(customerDirectory,'operational-session-private.json');
  fs.writeFileSync(privateFile,JSON.stringify({origin:ctx.state.url,dev_link:new URL(session.dev_link,ctx.state.url).href}),{mode:0o600});
  const report={schema:'findpitches-v3-native-origin-audit-v1',started_at:started,as_of:new Date().toISOString(),origin:ctx.state.url,read_only:true,http_get_probes:calls,auth_setup:{private_preview_grant:1,retained_test_challenges:retained?.email?2:1,messages:0},positive_Pro_coverage:proCoverage,checks,passed:checks.filter(c=>c.passed).length,total:checks.length,issues,timings,markets:summaries,provider_writes:0,source_writes:0,real_customer_writes:0,publication_enabled:false,production_cutover_enabled:false,paid_queries:0};
  fs.writeFileSync(path.join(customerDirectory,'operational-api-report.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const a=process.argv.slice(2),get=k=>a[a.indexOf(k)+1];
  try{const r=await auditNativePreview({credentialsFile:get('--credentials'),customerDirectory:get('--customer-dir')});console.log(JSON.stringify({as_of:r.as_of,passed:r.passed,total:r.total,issues:r.issues,http_get_probes:r.http_get_probes,markets:r.markets.map(({market,total})=>({market,total}))}));}
  catch{console.error('native_preview_audit_failed');process.exitCode=1;}
}
