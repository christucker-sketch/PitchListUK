// SEO launch fixes (13 Nov 2026 audit): crawlable rendering, canonical internal
// links, server-rendered public content, launch-ready sitemap and coalesced /
// optionally cached catalogue reads. Paid fields must never appear.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {openLocalD1} from '../../operations/findpitches-v3/local-d1.mjs';
import worker,{PUBLIC_RENDER_API} from '../../platform/findpitches-v3/customer-worker.mjs';
import {readCatalogue,catalogueCacheSeconds} from '../../platform/findpitches-v3/customer-catalogue.mjs';
import {displayTitle} from '../../platform/findpitches-v3/customer-ssr.mjs';

const now=()=>new Date().toISOString(),future=()=>new Date(Date.now()+86400000).toISOString();
const PAID=/organiser\.example\.org/;
function setup(t){const db=openLocalD1(':memory:',{migrationsDirectory:new URL('../../operations/findpitches-v3/customer-production-migrations/',import.meta.url)});t.after(()=>db.close());return db;}
function proof(country='US',n='1',extra={}){return {id:'ent_'+n.repeat(32),country,title:'River Festival',organiser:'River Association',location:country==='GB'?'Kent Town Hall':country==='AU'?'Sydney Park':'Oregon Park',event_start:'2099-11-03',event_end:'2099-11-04',application_url:'https://organiser.example.org/apply',application_state:'OPEN_NOW',source_url:'https://organiser.example.org/event',verified_at:new Date(Date.now()-1000).toISOString(),proof_expires_at:future(),entity_revision:1,verification_id:1,...extra};}
const snapshot=items=>({schema:'findpitches-v3-customer-proof-snapshot-v1',as_of:now(),publication_enabled:false,production_cutover_enabled:false,items});
function env(db,items=[proof()]){let reads=0;const e={V3_CUSTOMER_DB:db,V3_CUSTOMER_MODE:'production_public',V3_STRIPE_MODE:'live',V3_CHECKOUT_ENABLED:'live',V3_PUBLIC_ENABLED:'true',V3_ACCOUNT_RECOVERY_ENABLED:'true',V3_PUBLIC_ORIGIN:'https://findpitches.com',V3_SESSION_SECRET:'fixture'.repeat(10),V3_PRODUCTION_OPERATOR_TOKEN:'operator_fixture'.repeat(5),STRIPE_SECRET_KEY:'sk_live_fixture',STRIPE_WEBHOOK_SECRET:'whsec_'+('fixture'.repeat(8)),V3_LIVE_PRODUCT_ID:'prod_fixture',V3_LIVE_PRICE_IDS:JSON.stringify({GBP:'price_GBP',USD:'price_USD',EUR:'price_EUR'}),STRIPE_PORTAL_CONFIGURATION_ID:'bpc_fixture',V3_STAGING_TOKEN:'fixture',
 V3_READY_API:{fetch:async()=>{reads++;return Response.json(snapshot(items));}},
 ASSETS:{fetch:async u=>{try{return new Response(fs.readFileSync(new URL('../../web/findpitches-v3-web/public/'+new URL(u).pathname.slice(1),import.meta.url)));}catch{return new Response('',{status:404});}}}};
 Object.defineProperty(e,'reads',{get:()=>reads});return e;}
const get=(e,p,init)=>worker.fetch(new Request(e.V3_PUBLIC_ORIGIN+p,init),e);

// Google robots.txt semantics: the longest matching rule wins; Allow wins a tie; `$` anchors the end.
function robotsAllows(txt,path){let best=null;for(const line of txt.split('\n')){const m=line.match(/^(Allow|Disallow):\s*(\S*)$/);if(!m||!m[2])continue;const anchored=m[2].endsWith('$'),rule=anchored?m[2].slice(0,-1):m[2];
 const hit=anchored?path===rule:path.startsWith(rule);if(hit&&(!best||m[2].length>best.len||m[2].length===best.len&&m[1]==='Allow'))best={len:m[2].length,allow:m[1]==='Allow'};}return best?best.allow:true;}

test('robots.txt lets crawlers fetch the redacted read APIs public pages render from, and nothing private',async t=>{
 const e=env(setup(t)),txt=await (await get(e,'/robots.txt')).text();
 for(const p of ['/api/v3/session','/api/v3/markets','/api/v3/home','/api/v3/stats','/api/v3/seo/page','/api/v3/opportunities/ent_'+'1'.repeat(32),'/api/v3/opportunities','/api/v3/regions','/api/v3/billing/plans','/uk/','/assets/js/shell.js'])assert.equal(robotsAllows(txt,p),true,p);
 for(const p of ['/api/v3/saved','/api/v3/alerts','/api/v3/billing/checkout','/api/v3/billing/summary','/api/v3/billing/portal','/api/v3/session/verify','/api/v3/session/link','/api/v3/inbox/waitlist','/api/v3/stripe/webhook','/ops/preflight','/preview/status','/account.html','/billing.html','/saved.html','/alerts.html'])assert.equal(robotsAllows(txt,p),false,p);
 assert.match(txt,/Sitemap: https:\/\/findpitches\.com\/sitemap\.xml/);
 // The allowed endpoints stay out of the index and are anonymous/redacted.
 const r=await get(e,'/api/v3/opportunities/ent_'+'1'.repeat(32));assert.equal(r.status,200);assert.match(r.headers.get('x-robots-tag'),/noindex/);assert.doesNotMatch(await r.text(),PAID);
 assert.equal(PUBLIC_RENDER_API.some(p=>/saved|alert|checkout|portal|summary|inbox|webhook/.test(p)),false);
});

test('every API path the frontend client reads anonymously is crawlable',()=>{
 const src=fs.readFileSync(new URL('../../web/findpitches-v3-web/public/assets/js/v3-api.js',import.meta.url),'utf8');
 const anonymous=['/session','/markets','/regions','/home','/stats','/seo/page','/opportunities','/opportunities/','/opportunities/by-ids','/opportunities/count','/opportunities/upcoming','/billing/plans'];
 for(const p of anonymous){assert.ok(src.includes("'"+p),p);assert.equal(robotsAllows('Disallow: /api/\n'+PUBLIC_RENDER_API.map(a=>'Allow: '+a).join('\n'),'/api/v3'+p+(p.endsWith('/')?'ent_x':'')),true,p);}
});

function loadRoutes(served){const ctx={window:{FP:{}},document:{querySelector:s=>served&&s.includes('fp-environment')?{content:'production_public'}:null}};
 ctx.window.FP.i18n={current:'en',pathFor:(p,l)=>l==='en'?p:'/lang/'+l+p};vm.runInNewContext(fs.readFileSync(new URL('../../web/findpitches-v3-web/public/assets/js/routes.js',import.meta.url),'utf8'),ctx);return ctx.window.FP;}

test('visible links use canonical clean URLs when served by the Worker; the offline draft keeps file links',()=>{
 const live=loadRoutes(true),id='ent_'+'a'.repeat(32);
 assert.equal(live.routes.href.seo('/uk/south-east/'),'/uk/south-east/');assert.equal(live.routes.href.opportunity(id,'GB'),'/uk/opportunity/'+id+'/');assert.equal(live.routes.href.opportunity(id,'US'),'/us/opportunity/'+id+'/');
 live.i18n.current='fr';assert.equal(live.routes.href.seo('/uk/'),'/lang/fr/uk/');
 assert.equal(live.routes.href.opportunity(id,null),'opportunity.html?id='+id);
 const draft=loadRoutes(false);assert.equal(draft.routes.href.seo('/uk/'),'seo.html?path=%2Fuk%2F');assert.equal(draft.routes.href.opportunity(id,'GB'),'opportunity.html?id='+id);
 // Server route resolution still targets the templates.
 assert.equal(live.routes.draft.opportunity(id),'opportunity.html?id='+id);
 const dir=new URL('../../web/findpitches-v3-web/public/assets/js/',import.meta.url);
 for(const f of ['shell.js','pages/index.js','pages/seo.js','pages/opportunity.js','pages/finder.js'])assert.doesNotMatch(fs.readFileSync(new URL(f,dir),'utf8'),/R\.draft\.(seo|opportunity)\(/,f);
 assert.doesNotMatch(fs.readFileSync(new URL('pages/opportunity.js',dir),'utf8'),/\{type:o\.type\}\)/);
});

test('legacy seo.html links 301 to the clean page; unsafe targets are never redirected',async t=>{
 const e=env(setup(t));
 for(const [from,to] of [['/seo.html?path=%2Fuk%2F','/uk/'],['/seo.html?path=%2Fus%2Fcalifornia%2F','/us/california/'],['/lang/fr/seo.html?path=%2Fuk%2F','/lang/fr/uk/']]){const r=await get(e,from);assert.equal(r.status,301,from);assert.equal(r.headers.get('location'),to);}
 for(const bad of ['//evil.example/','/uk/../../x','https://evil.example/','/UK/','/uk/a/b/c/d/'])assert.notEqual((await get(e,'/seo.html?path='+encodeURIComponent(bad))).status,301,bad);
});

test('indexable pages carry server-rendered, Free-redacted content and links instead of an empty shell',async t=>{
 const gb=proof('GB','1',{title:'Salisbury Craft Market — 2099-11-03'}),us=proof('US','2'),e=env(setup(t),[gb,us]);
 const country=await get(e,'/uk/'),html=await country.text();
 assert.equal(country.status,200);assert.match(html,/<main id="page"><div class="wrap section" data-ssr>/);assert.doesNotMatch(html,/class="skel"/);
 assert.match(html,/<h1>[^<]+<\/h1>/);assert.match(html,new RegExp(`<a href="/uk/opportunity/${gb.id}/">Salisbury Craft Market — 3 Nov 2099</a>`));
 // Open Graph only on indexable pages (one fixture listing is below the country page threshold).
 assert.equal(/property="og:title"/.test(html),/^index/.test(country.headers.get('x-robots-tag')));assert.equal((html.match(/<meta name="description"/g)||[]).length,1);
 assert.doesNotMatch(html,/seo\.html\?path=|opportunity\.html\?id=/);assert.doesNotMatch(html,PAID);
 const detail=await get(e,'/uk/opportunity/'+gb.id+'/'),d=await detail.text();
 assert.equal(detail.status,200);assert.equal(detail.headers.get('x-robots-tag'),'index,follow');
 assert.match(d,/<h1>Salisbury Craft Market — 3 Nov 2099<\/h1>/);assert.match(d,/<dt>Organiser<\/dt><dd>River Association<\/dd>/);assert.match(d,/<a href="\/uk\/">United Kingdom<\/a>/);
 assert.match(d,/<meta name="description" content="Salisbury Craft Market — 3 Nov 2099/);assert.match(d,/<title>Salisbury Craft Market — 3 Nov 2099 \| FindPitches<\/title>/);assert.match(d,/property="og:url" content="https:\/\/findpitches\.com\/uk\/opportunity\//);
 assert.match(d,/"@type":"Event","name":"Salisbury Craft Market — 3 Nov 2099"/);
 assert.doesNotMatch(d,PAID);assert.doesNotMatch(d,/class="skel"/);
 // A session cookie or another language keeps the existing client-rendered behaviour.
 const fr=await (await get(e,'/lang/fr/uk/')).text();assert.doesNotMatch(fr,/data-ssr/);
});

test('only launch-ready countries are indexable or in the sitemap; sitemap adds home and organisers with real lastmod',async t=>{
 const us=proof('US','1',{verified_at:'2026-11-10T08:00:00.000Z'}),au=proof('AU','2'),e=env(setup(t),[us,au]);
 const auPage=await get(e,'/au/opportunity/'+au.id+'/');assert.equal(auPage.status,200);assert.equal(auPage.headers.get('x-robots-tag'),'noindex,follow');assert.doesNotMatch(await auPage.text(),/og:title/);
 const usPage=await get(e,'/us/opportunity/'+us.id+'/');assert.equal(usPage.headers.get('x-robots-tag'),'index,follow');
 const xml=await (await get(e,'/sitemap.xml')).text(),locs=[...xml.matchAll(/<loc>([^<]+)<\/loc><lastmod>([^<]+)</g)].map(m=>[m[1],m[2]]);
 assert.ok(locs.some(([l])=>l==='https://findpitches.com/'));assert.ok(locs.some(([l])=>l==='https://findpitches.com/organisers.html'));
 assert.deepEqual(locs.find(([l])=>l.includes(us.id)),['https://findpitches.com/us/opportunity/'+us.id+'/','2026-11-10']);
 assert.equal(locs.some(([l])=>/\/(au|ca|nz|ie|sg|hk|fr)\//.test(l)),false);
 for(const [l] of locs){const r=await worker.fetch(new Request(l),e);assert.equal(r.status,200,l);assert.match(r.headers.get('x-robots-tag'),/^index/,l);}
});

test('concurrent page views share one catalogue read; sequential reads stay fresh unless a cache is configured',async t=>{
 const db=setup(t),e=env(db,[proof('GB'),proof('US','2')]);let release;const gate=new Promise(r=>release=r),inner=e.V3_READY_API.fetch;
 e.V3_READY_API.fetch=async(...a)=>{await gate;return inner(...a);};
 const pages=Array.from({length:12},()=>get(e,'/uk/'));await new Promise(r=>setTimeout(r,20));release();
 for(const r of await Promise.all(pages))assert.equal(r.status,200);assert.equal(e.reads,1);
 await get(e,'/uk/');await get(e,'/us/');assert.equal(e.reads,3);
 assert.equal(catalogueCacheSeconds({}),0);assert.equal(catalogueCacheSeconds({V3_CATALOGUE_CACHE_SECONDS:'30'}),30);assert.equal(catalogueCacheSeconds({V3_CATALOGUE_CACHE_SECONDS:'600'}),60);assert.equal(catalogueCacheSeconds({V3_CATALOGUE_CACHE_SECONDS:'x'}),0);
});

test('optional short cache: scoped reads derive from one validated full snapshot, expiry is enforced per request, and it refreshes after its TTL',async t=>{
 const soon=new Date(Date.now()+5000).toISOString(),short=proof('GB','3',{proof_expires_at:soon}),items=[proof('GB'),proof('US','2'),short];let reads=0,asOf=now();
 const e={V3_STAGING_TOKEN:'fixture',V3_CATALOGUE_CACHE_SECONDS:'30',V3_READY_API:{fetch:async()=>{reads++;return Response.json({...snapshot(items),as_of:asOf});}}};
 const t0=Date.now(),at=ms=>new Date(t0+ms).toISOString();
 assert.equal((await readCatalogue(e,at(0))).rows.length,3);assert.equal(reads,1);
 const one=await readCatalogue(e,at(1000),{ids:[items[1].id]});assert.deepEqual(one.rows.map(r=>r.id),[items[1].id]);assert.equal(one.scope.kind,'ids');
 assert.deepEqual((await readCatalogue(e,at(1000),{market:'US'})).rows.map(r=>r.market),['US']);
 assert.equal((await readCatalogue(e,at(1000),{detailId:items[0].id})).rows.every(r=>r.market==='GB'),true);
 assert.equal(reads,1);
 // The short-lived proof drops out at request time even though the snapshot is cached.
 assert.equal((await readCatalogue(e,at(10000))).rows.some(r=>r.id===short.id),false);assert.equal(reads,1);
 // After the TTL a fresh read is required (and validated against the as_of tolerance).
 asOf=at(31000);await readCatalogue(e,at(31000));assert.equal(reads,2);
 // An unknown detail id is not guessed from the cache: it falls back to a live scoped read.
 await readCatalogue(e,at(31500),{detailId:'ent_'+'f'.repeat(32)}).catch(()=>{});assert.equal(reads,3);
 // A failed read is never cached.
 const bad={V3_STAGING_TOKEN:'fixture',V3_CATALOGUE_CACHE_SECONDS:'30',V3_READY_API:{fetch:async()=>new Response('',{status:500})}};
 await assert.rejects(readCatalogue(bad,now()),/service_unavailable/);
});

test('presentation helpers tidy raw ISO title suffixes without touching other titles',()=>{
 assert.equal(displayTitle('Guildford Craft and Gift Market — 2026-11-20','GB'),'Guildford Craft and Gift Market — 20 Nov 2026');
 assert.equal(displayTitle('Game On Expo','US'),'Game On Expo');assert.equal(displayTitle('Fair 2026-11-20','US'),'Fair 2026-11-20');
});

test('an indexable country page has Open Graph, server-rendered listing links and links to indexable sub-pages',async t=>{
 const items=Array.from({length:30},(_,i)=>proof('GB',(i+1).toString(16),{id:'ent_'+(i+1).toString(16).padStart(32,'0'),title:'Market '+i,event_start:'2099-11-'+String(1+i%28).padStart(2,'0')}));
 const e=env(setup(t),items),r=await get(e,'/uk/'),html=await r.text();
 assert.equal(r.headers.get('x-robots-tag'),'index,follow');assert.match(html,/property="og:title"/);assert.match(html,/property="og:url" content="https:\/\/findpitches\.com\/uk\/"/);
 assert.equal((html.match(/<a href="\/uk\/opportunity\/ent_[0-9a-f]{32}\/">/g)||[]).length,12);
 for(const m of html.matchAll(/<ul class="ssr-links">.*?<\/ul>/gs))for(const [,href] of m[0].matchAll(/href="([^"]+)"/g)){const sub=await get(e,href);assert.equal(sub.status,200,href);assert.match(sub.headers.get('x-robots-tag'),/^index/,href);}
 assert.doesNotMatch(html,PAID);
});
