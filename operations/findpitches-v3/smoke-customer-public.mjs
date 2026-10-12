// Real hostname, anonymous reads and rejected unsafe requests only. No mail,
// customer/session/Checkout creation, signed fake provider events or TLS bypass.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {proxyFetch} from './cloudflare-api.mjs';import {pauseCustomerProduction} from './pause-customer-production.mjs';
export async function smokeCustomerPublic({productionDirectory,fetcher=proxyFetch(),checkoutEnabled=false}){
 if(typeof checkoutEnabled!=='boolean')throw Error('explicit_checkout_state_required');
 const origin='https://findpitches.com',checks=[],counts={},held=['ent_dda1403e0c99eb5b1c1871f37c325cb2','ent_93d86b9d0147d8aa91ea8eea541d86b8'];
 const report={schema:'findpitches-v3-public-smoke-v1',started_at:new Date().toISOString(),passed:false,checks,country_counts:counts,customer_objects_created:0,messages_sent:0,certificate_bypass:false,expected_checkout_enabled:checkoutEnabled},save=()=>fs.writeFileSync(path.join(productionDirectory,'public-smoke.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});save();
 const check=(name,ok)=>{checks.push({name,passed:!!ok});save();if(!ok)throw Error('public_smoke_check_failed');};
 const get=async(p,opts={})=>{const start=Date.now(),r=await fetcher(origin+p,{...opts,redirect:'manual',signal:AbortSignal.timeout(45000)});return {status:r.status,headers:r.headers,text:await r.text(),duration_ms:Date.now()-start};},json=async p=>{const r=await get(p);check('json_'+new URL(p,origin).pathname,r.status===200);return JSON.parse(r.text);};
 try{
  const health=await json('/health');check('public_production_health',health.mode==='production_public'&&health.publication_enabled===true);
  for(const homePath of ['/','/index.html']){const home=await get(homePath);check('owned_homepage_'+homePath,home.status===200&&/^text\/html/.test(home.headers.get('content-type')??'')&&/FindPitches/.test(home.text)&&/index,follow/.test(home.headers.get('x-robots-tag')??''));check('truthful_homepage_'+homePath,!home.text.includes('Never other people'));}
  const session=await json('/api/v3/session');check('anonymous_free_no_alert_delivery',session.access.tier==='free'&&session.capabilities.alerts_delivery===false);
  let detail;
  for(const country of ['GB','US']){const data=await json('/api/v3/opportunities?market='+country+'&page_size=5');counts[country]=data.total;check(country+'_real_ready_redacted',data.results.length>0&&data.results.every(r=>r.id.startsWith('ent_')&&r.market===country&&r.access.locked&&!r.access.application_url&&!r.access.source_url));check(country+'_no_duplicate_or_held_identity',new Set(data.results.map(r=>r.id)).size===data.results.length&&!data.results.some(r=>held.includes(r.id)));detail??=data.results[0];}
  const d=await get(detail.canonical_path);check('public_event_identity_indexable',d.status===200&&/index,follow/.test(d.headers.get('x-robots-tag')??'')&&d.text.includes(detail.id));
  for(const id of held)check('held_'+id,(await get('/api/v3/opportunities/'+id)).status===404);
  for(const p of ['/account.html','/pricing.html','/alerts.html']){const r=await get(p);check('private_noindex_'+p,r.status===200&&/noindex/.test(r.headers.get('x-robots-tag')??''));}
  const plans=await json('/api/v3/billing/plans?market=US&currency=EUR');check('global_eur_price_checkout_state',plans.plans[1].scope==='global'&&plans.plans[1].currency==='EUR'&&plans.plans[1].price===5.99&&plans.plans[1].checkout_enabled===checkoutEnabled);
  check('unsafe_signin_csrf_rejected',(await get('/api/v3/session/link',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status===403);
  check('operator_private',(await get('/ops/preflight')).status===403);check('preview_provisioning_unavailable',(await get('/preview/test-login',{method:'POST'})).status===404);check('unsigned_live_webhook_rejected',(await get('/api/v3/stripe/webhook',{method:'POST',body:'{}'})).status===403);
  const robots=await get('/robots.txt');check('public_robots_private_paths',robots.status===200&&!robots.text.includes('Disallow: /\n')&&robots.text.includes('Disallow: /api/')&&robots.text.includes('Sitemap: https://findpitches.com/sitemap.xml'));
  const sitemap=await get('/sitemap.xml');check('proof_filtered_sitemap',sitemap.status===200&&sitemap.text.includes('<urlset')&&!held.some(id=>sitemap.text.includes(id)));
  const www=await fetcher('https://www.findpitches.com/uk/find-pitches/',{redirect:'manual',signal:AbortSignal.timeout(30000)});check('www_redirect_to_owned_apex',www.status===301&&www.headers.get('location')===origin+'/uk/find-pitches/');
  report.passed=true;report.as_of=new Date().toISOString();save();return report;
 }catch(e){report.as_of=new Date().toISOString();report.error='public_smoke_failed';save();throw e;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const a=process.argv.slice(2),get=n=>a[a.indexOf(n)+1],productionDirectory=get('--production-dir');try{const state=a.includes('--checkout-state')?get('--checkout-state'):'closed';if(!['closed','live'].includes(state))throw Error('explicit_checkout_state_required');console.log(JSON.stringify(await smokeCustomerPublic({productionDirectory,checkoutEnabled:state==='live'})));}catch{if(a.includes('--credentials')){try{console.error(JSON.stringify(await pauseCustomerProduction({credentialsFile:get('--credentials'),productionDirectory})));}catch{console.error('public_smoke_failed_manual_pause_required');}}process.exitCode=1;}}
