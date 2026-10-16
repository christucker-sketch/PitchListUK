import {entityId} from './catalogue-scope.mjs';
import {i18n,customerLanguage,customerReturnPath,localisedDocument} from './customer-localisation.mjs';
import {hash} from './contract.mjs';
import {stmt,cookie,cookies,sessionCookie,operator,csrfValue,requireCsrf,customerError,readBody,rateLimit,noteCustomerEvent,same} from './customer-security.mjs';
import {seoResponseData} from './customer-response.mjs';
import {previewAllowed,grantPreview,signedCustomer,needCustomer,issueChallenge,consumeChallenge,requestLogin,logout,updateProfile} from './customer-auth.mjs';
import * as previewBilling from './customer-billing.mjs';
import {liveCustomerAccess,livePlans,liveCheckout,liveConfirmCheckout,livePortal,liveWebhook,verifyLiveBillingSettings,verifyLiveBillingCapabilities,recordLiveStripeFailure} from './customer-live-billing.mjs';
import {reviewSubscriberAssociation} from './customer-recognition.mjs';
import {nativeBillingSummary,nativeBillingChange,nativePaymentStart,nativePaymentConfirm} from './customer-native-billing.mjs';
import {readCatalogue,present,search,countSearch,marketOf,markets,regions,allRegions,resolveLocation,inventory,ancestors,recordInventoryChanges,homepage,upcoming} from './customer-catalogue.mjs';
import {seo,seoConfig,routes} from '../../web/findpitches-v3-web/server/seo-edge.mjs';
import {budgetDay} from './serper-usage.mjs';
import {verifyNativeMailSettings,mailCredentialIsProxyReference} from './customer-mail.mjs';

const CSP="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
const headers={'Content-Security-Policy':CSP,'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Strict-Transport-Security':'max-age=31536000','X-Robots-Tag':'noindex, nofollow','Cache-Control':'private, no-store'};
const response=(data,status=200,setCookies=[])=>{const h=new Headers({...headers,'Content-Type':'application/json'});for(const c of setCookies)h.append('Set-Cookie',c);return new Response(JSON.stringify({ok:true,...data}),{status,headers:h});};
const error=e=>response({ok:false,error:e.code??'internal_error',message:({auth_required:'Sign in to continue.',upgrade_required:'Pro is required for this feature.',service_unavailable:'This service is temporarily unavailable.',billing_state_changed:'Billing has changed. Refresh the page before trying again.',billing_review_required:'We could not verify your billing. No change has been confirmed.',csrf_failed:'Refresh the page and try again.',rate_limited:'Please wait before trying again.',not_found:'This opportunity is unavailable.',subscription_exists:'Manage your existing subscription in billing.',checkout_currency_locked:'You already opened Checkout in another currency. Finish it or wait for it to expire before switching.'})[e.code]??'Please check your request and try again.'},e.status??500);
const text=(value,status=200,extra={})=>new Response(value,{status,headers:{...headers,...extra}});
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const jsonld=value=>JSON.stringify(value).replace(/</g,'\\u003c');
export const FRONTEND_SOURCE='24ad4b61cfc64b7338d5ab44efa816479ad1a57e7e0740893fb338b39c8b3e05';
const production=env=>env.V3_CUSTOMER_MODE==='production_public';
function seoPage(rows,d,ms,rs,access,now,asOf) {
  const market=ms.find(m=>m.code===d.market),others=(d.type==='market'||d.type==='intent')&&market.launch_status==='live'?ms.filter(m=>m.launch_status==='live'&&m.code!==d.market):[],inventories={};
  for(const code of [d.market,...others.map(m=>m.code)])inventories[code]=inventory(rows,code,seoConfig.intentsFor(code),now);
  return {as_of:asOf,markets:ms,regions:rs[d.market],inventory:inventories[d.market],inventories,search:search(rows,{...seo.filters(d),sort:'soonest',page_size:12},access,now)};
}
const customerAccess=(db,env,...args)=>(production(env)?liveCustomerAccess:previewBilling.customerAccess)(db,env,...args);
const plans=(market,env,currency)=>production(env)?livePlans(market,env,currency):previewBilling.plans(market,env);
const checkout=(db,env,...args)=>(production(env)?liveCheckout:previewBilling.checkout)(db,env,...args);
const confirmCheckout=(db,env,...args)=>(production(env)?liveConfirmCheckout:previewBilling.confirmCheckout)(db,env,...args);
const portal=(db,env,...args)=>(production(env)?livePortal:previewBilling.portal)(db,env,...args);
const webhook=(request,env,...args)=>(production(env)?liveWebhook:previewBilling.webhook)(request,env,...args);
const {stripeClient,syncSubscriptions}=previewBilling;
const recoveryPath=p=>p.startsWith('/assets/')||['/account.html','/billing.html','/pricing.html','/pricing/','/api/v3/session','/api/v3/session/link','/api/v3/session/verify','/api/v3/session/logout','/api/v3/session/profile','/api/v3/billing/plans','/api/v3/billing/portal','/api/v3/billing/confirm','/api/v3/billing/summary','/api/v3/billing/change','/api/v3/billing/payment','/api/v3/billing/payment/confirm','/api/v3/saved'].includes(p)||p==='/api/v3/markets';

async function session(db,env,customer,now) {
  const profile=customer?JSON.parse(customer.profile_json):null;
  return {signed_in:Boolean(customer),user:customer?{email:customer.email,business_name:null,contact_name:null,phone:null,market:null,base_postcode:null,specialty:null,regions:[],public_listing_opt_in:false,...profile}:null,
    access:await customerAccess(db,env,customer,{now,refresh:true}),capabilities:{alerts_delivery:false,public_mode:production(env),catalogue_available:!production(env)||env.V3_PUBLIC_ENABLED==='true'}};
}
async function alerts(db,customer,rows,access,now) {
  return Promise.all((await stmt(db,'SELECT * FROM customer_alerts WHERE customer_id=? ORDER BY created_at',customer.id).all()).results.map(async a=>{const query=JSON.parse(a.query_json),s=search(rows,query,access,now);return {id:a.id,name:a.name,query,frequency:a.frequency,paused:Boolean(a.paused),created_at:a.created_at,current_matches:s.total,sample:s.results.slice(0,3)};}));
}
function alertBody(body,old,rows,access,now) {
  if(Object.keys(body).some(k=>!['name','query','frequency','paused'].includes(k)))throw customerError('validation');
  const a={name:old?.name,query:old?JSON.parse(old.query_json):undefined,frequency:old?.frequency??'daily',paused:Boolean(old?.paused),...body};
  if(typeof a.name!=='string'||!a.name.trim()||a.name.length>150||!['instant','daily','weekly'].includes(a.frequency)||typeof a.paused!=='boolean'||!a.query||typeof a.query!=='object'||Array.isArray(a.query))throw customerError('validation');
  if(Object.keys(a.query).some(k=>!['market','q','q_text','place_label','radius_km','types','sells','organiser_types','when','month','region'].includes(k)))throw customerError('validation');
  if(access.scope!=='global'&&a.query.market!==access.market)throw customerError('upgrade_required',402);
  search(rows,a.query,access,now);return a;
}
async function api(request,env,now) {
  const db=env.V3_CUSTOMER_DB,url=new URL(request.url),p=url.pathname.slice('/api/v3'.length),q=Object.fromEntries(url.searchParams),method=request.method;
  if(method!=='GET')await requireCsrf(request,env);
  const body=method==='GET'?{}:await readBody(request),customer=await signedCustomer(request,db,now);
  if(method==='GET'&&p==='/session')return response(await session(db,env,customer,now),200,[cookie('fp_csrf',await csrfValue(env),604800,false)]);
  if(method==='POST'&&p==='/session/link')return response(await requestLogin(request,env,body,{now}));
  if((method==='GET'||method==='POST')&&p==='/session/verify') {
    try{const result=await consumeChallenge(db,method==='GET'?q.token:body.token,now);
      if(method==='GET'){
        // Challenges can only be issued inside an authorised preview or by its
        // operator. Their one-use proof lets an invited mailbox open the preview
        // in a different browser, without putting operator credentials in mail.
        const redirect=text('',303,{Location:result.next});redirect.headers.append('Set-Cookie',result.cookie);if(!production(env))redirect.headers.append('Set-Cookie',await grantPreview(db,now));return redirect;
      }
      return response(await session(db,env,result.customer,now),200,[result.cookie]);}
    catch(e){if(method==='GET'&&e.code==='invalid_link')return text('',303,{Location:customerReturnPath('/account.html?signin=expired',i18n.language(q.lang))});throw e;}
  }
  if(method==='POST'&&p==='/session/logout')return response({},200,[await logout(request,db,now)]);
  if(method==='PATCH'&&p==='/session/profile')return response(await session(db,env,await updateProfile(db,needCustomer(customer),body),now));
  if(method==='GET'&&p==='/billing/plans'){marketOf(q.market??'GB');return response({plans:plans(q.market??'GB',env,q.currency)});}
  if(method==='POST'&&p==='/billing/checkout')return response(await checkout(db,env,needCustomer(customer),body,{now,origin:url.origin}));
  if(method==='POST'&&p==='/billing/confirm'){await confirmCheckout(db,env,needCustomer(customer),body,{now});return response(await session(db,env,customer,now));}
  if(method==='POST'&&p==='/billing/portal')return response(await portal(db,env,needCustomer(customer),{origin:url.origin,locale:customerLanguage(body.locale)}));
  if(['/billing/summary','/billing/change','/billing/payment','/billing/payment/confirm'].includes(p)){
    needCustomer(customer);if(!production(env))throw customerError('service_unavailable',503);
    const options={now,origin:url.origin};
    if(method==='GET'&&p==='/billing/summary')return response({billing:await nativeBillingSummary(db,env,customer,options)});
    if(method==='POST'){
      await rateLimit(db,'billing-management/'+customer.id,{limit:20,now});
      if(p==='/billing/change')return response({billing:await nativeBillingChange(db,env,customer,body,options)});
      if(p==='/billing/payment')return response(await nativePaymentStart(db,env,customer,body,options));
      if(p==='/billing/payment/confirm')return response({billing:await nativePaymentConfirm(db,env,customer,body,options)});
    }
    throw customerError('not_found',404);
  }
  // Saved IDs are customer-owned state, not a catalogue read. Expanded saved
  // records below still require a fresh source-proof snapshot and redaction.
  if(method==='GET'&&p==='/saved'&&!q.expand){needCustomer(customer);const saved=(await stmt(db,'SELECT entity_id FROM saved_opportunities WHERE customer_id=? ORDER BY saved_at DESC',customer.id).all()).results;return response({ids:saved.map(r=>r.entity_id)});}
  // Account/Portal recovery cannot depend on evidence-backend availability.
  if(method==='GET'&&p==='/markets'&&q.registry_only==='true')return response({markets:markets([]).map(m=>({...m,opportunity_count:null})),inventory_available:false});
  if(method==='GET'&&p==='/regions'&&q.registry_only==='true'){marketOf(q.market);return response({regions:allRegions(q.market).map(r=>({...r,opportunity_count:null})),inventory_available:false});}
  if(production(env)&&env.V3_PUBLIC_ENABLED!=='true')throw customerError('service_unavailable',503);
  if(method==='POST'&&/^\/inbox\/(organiser_submission|partnership_enquiry|listing_report|waitlist)$/.test(p)) {
    await rateLimit(db,'inbox/'+(request.headers.get('CF-Connecting-IP')??'local'),{limit:10,now});const id='FP-'+crypto.randomUUID();
    await stmt(db,'INSERT INTO customer_inbox VALUES (?,?,?,?)',id,p.split('/').at(-1),JSON.stringify(body),now).run();return response({reference:id},201);
  }
  // Scope only routes whose complete result is confined to that market/ID set.
  // Global home/counts/SEO/saved/alerts/scheduled reads remain complete.
  let readScope={};
  if(method==='GET'&&['/regions','/opportunities','/opportunities/count','/opportunities/upcoming'].includes(p)&&q.market!==undefined)readScope={market:marketOf(q.market).code};
  else if(method==='POST'&&p==='/seo/inventory')readScope={market:marketOf(body.market).code};
  else if(method==='POST'&&p==='/opportunities/by-ids'){
    if(!Array.isArray(body.ids)||body.ids.length>100||body.ids.some(i=>typeof i!=='string'))throw customerError('validation');
    readScope={ids:body.ids.filter(entityId)};
  }else if(method==='GET'&&/^\/opportunities\/[^/]+$/.test(p)){
    const id=decodeURIComponent(p.split('/').at(-1));if(entityId(id))readScope={detailId:id};
  }
  const snapshot=await readCatalogue(env,now,readScope),rows=snapshot.rows,access=await customerAccess(db,env,customer,{now,refresh:true});
  if(method==='GET'&&p==='/home')return response(homepage(rows,access,now,snapshot.as_of));
  if(method==='GET'&&p==='/seo/page'){
    if(typeof q.path!=='string'||q.path.length>300||!q.path.startsWith('/')||q.path.startsWith('//')||/[?\\#\r\n]/.test(q.path))throw customerError('validation');
    const ms=markets(rows),rs=Object.fromEntries(ms.map(m=>[m.code,regions(m.code,rows)])),d=seo.resolve(q.path,{markets:ms,regions:rs});
    if(d.kind!=='page')throw customerError('not_found',404);
    return response({page:seoPage(rows,d,ms,rs,access,now,snapshot.as_of)});
  }
  if(method==='GET'&&p==='/markets')return response({markets:markets(rows)});
  if(method==='GET'&&p==='/stats')return response({as_of:snapshot.as_of,total:rows.length,sports:rows.filter(r=>r.type==='sport').length,markets:Object.fromEntries(markets(rows).map(m=>[m.code,{count:m.opportunity_count,regions:regions(m.code,rows).filter(r=>r.opportunity_count).length}]))});
  if(method==='GET'&&p==='/regions')return response({regions:regions(q.market,rows)});
  if(method==='GET'&&p==='/geo/resolve')return response({location:resolveLocation(q.market,q.q)});
  if(method==='GET'&&p==='/opportunities')return response(search(rows,q,access,now));
  if(method==='GET'&&p==='/opportunities/count')return response({total:countSearch(rows,q,now)});
  if(method==='GET'&&p==='/opportunities/changes'){needCustomer(customer);const after=Number(q.after??0);if(!Number.isSafeInteger(after)||after<0)throw customerError('validation');const changes=(await stmt(db,'SELECT sequence,entity_id,kind,occurred_at FROM preview_inventory_changes WHERE sequence>? ORDER BY sequence LIMIT 100',after).all()).results;return response({changes,next_cursor:changes.at(-1)?.sequence??after,as_of:now});}
  if(method==='GET'&&p==='/opportunities/upcoming') {
    return response({items:upcoming(rows,{market:q.market,type:q.type,limit:Number(q.limit??10)},now).map(r=>present(r,access))});
  }
  if(method==='POST'&&p==='/opportunities/by-ids'){if(!Array.isArray(body.ids)||body.ids.length>100||body.ids.some(i=>typeof i!=='string'))throw customerError('validation');return response({items:rows.filter(r=>body.ids.includes(r.id)).map(r=>present(r,access))});}
  if(method==='GET'&&/^\/opportunities\/[^/]+$/.test(p)){const row=rows.find(r=>r.id===decodeURIComponent(p.split('/').at(-1)));if(!row)throw customerError('not_found',404);return response({opportunity:{...present(row,access),similar:rows.filter(r=>r.id!==row.id&&r.market===row.market&&r.location.region_id&&r.location.region_id===row.location.region_id).slice(0,4).map(r=>present(r,access)),region_path:ancestors(row.market,row.location.region_id)}});}
  if(method==='POST'&&p==='/seo/inventory')return response(inventory(rows,body.market,body.intents,now));
  if(p==='/saved'||p.startsWith('/saved/')) {
    needCustomer(customer);
    if(method==='GET'){const saved=(await stmt(db,'SELECT entity_id,saved_at FROM saved_opportunities WHERE customer_id=? ORDER BY saved_at DESC',customer.id).all()).results;if(!q.expand)return response({ids:saved.map(r=>r.entity_id)});const items=saved.map(s=>{const row=rows.find(r=>r.id===s.entity_id);return row?{...present(row,access),saved_at:s.saved_at}:null;}).filter(Boolean);return response({items,missing:saved.length-items.length});}
    if(method==='POST'&&p==='/saved'){if(!rows.some(r=>r.id===body.id))throw customerError('not_found',404);const n=await stmt(db,'SELECT COUNT(*) AS n FROM saved_opportunities WHERE customer_id=?',customer.id).first();if(n.n>=500)throw customerError('validation');await stmt(db,'INSERT OR IGNORE INTO saved_opportunities VALUES (?,?,?)',customer.id,body.id,now).run();return response({count:(await stmt(db,'SELECT COUNT(*) AS n FROM saved_opportunities WHERE customer_id=?',customer.id).first()).n});}
    if(method==='DELETE'){await stmt(db,'DELETE FROM saved_opportunities WHERE customer_id=? AND entity_id=?',customer.id,decodeURIComponent(p.split('/').at(-1))).run();return response({count:(await stmt(db,'SELECT COUNT(*) AS n FROM saved_opportunities WHERE customer_id=?',customer.id).first()).n});}
  }
  if(p==='/alerts'||p.startsWith('/alerts/')) {
    needCustomer(customer);if(method==='GET')return response({alerts:await alerts(db,customer,rows,access,now)});
    const id=p.split('/').at(-1),old=p!=='/alerts'?await stmt(db,'SELECT * FROM customer_alerts WHERE id=? AND customer_id=?',id,customer.id).first():null;if(p!=='/alerts'&&!old)throw customerError('not_found',404);
    if(method==='DELETE'){await stmt(db,'DELETE FROM customer_alerts WHERE id=? AND customer_id=?',id,customer.id).run();return response({});}
    if(!['pro','trial'].includes(access.tier))throw customerError('upgrade_required',402);
    if(method==='POST'||method==='PATCH'){const a=alertBody(body,old,rows,access,now),alertId=old?.id??'alert_'+crypto.randomUUID();const count=await stmt(db,'SELECT COUNT(*) AS n FROM customer_alerts WHERE customer_id=?',customer.id).first();if(!old&&count.n>=20)throw customerError('validation');
      if(old)await stmt(db,'UPDATE customer_alerts SET name=?,query_json=?,frequency=?,paused=? WHERE id=? AND customer_id=?',a.name,JSON.stringify(a.query),a.frequency,a.paused?1:0,alertId,customer.id).run();else await stmt(db,'INSERT INTO customer_alerts VALUES (?,?,?,?,?,?,?)',alertId,customer.id,a.name,JSON.stringify(a.query),a.frequency,a.paused?1:0,now).run();return response({alert:(await alerts(db,customer,rows,access,now)).find(r=>r.id===alertId)},old?200:201);}
  }
  throw customerError('not_found',404);
}

async function html(request,env,now) {
  const url=new URL(request.url),lr=i18n.route(url.pathname),lang=lr.language,path=lr.path;
  if(!lr.valid||(lr.explicit&&env.V3_LOCALISATION_ENABLED==='false'))return text('Page not found',404);
  if(lr.explicit&&/^\/(?:api|ops|preview|assets|health|robots\.txt|sitemap)/.test(path))return text('Page not found',404);
  if(lr.explicit&&(url.pathname==='/lang/'+lang||lang==='en'))return text('',301,{Location:i18n.pathFor(path,lang)+url.search});
  if(path==='/favicon.ico')return text(null,204);
  if(path==='/robots.txt')return text(production(env)&&env.V3_PUBLIC_ENABLED==='true'?'User-agent: *\nDisallow: /api/\nDisallow: /ops/\nDisallow: /preview/\nDisallow: /account.html\nDisallow: /billing.html\nDisallow: /saved.html\nDisallow: /alerts.html\nSitemap: https://findpitches.com/sitemap.xml\n':'User-agent: *\nDisallow: /\n',200,{'Content-Type':'text/plain'});
  if(path.startsWith('/assets/')){const asset=await env.ASSETS.fetch(request);return new Response(asset.body,{status:asset.status,headers:{...Object.fromEntries(asset.headers),...headers}});}
  const sitemap=path==='/sitemap.xml'||/^\/sitemap-[a-z]+\.xml$/.test(path);
  if(sitemap&&!production(env))return text(path==='/sitemap.xml'?'<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></sitemapindex>':seo.sitemapXml([],budgetDay(now)),200,{'Content-Type':'application/xml'});
  const recovery=['/account.html','/billing.html','/pricing.html','/pricing/','/saved.html','/alerts.html'].includes(path);
  // These documents contain no inventory facts. Their browser API requests
  // still read fresh proof; SEO/detail pages and sitemaps remain proof-bound.
  const shellDocument=['/','/index.html','/finder.html','/organisers.html','/organisers/'].includes(path)||/^\/(?:uk|us|ca|au|ie|nz|sg|hk|fr)\/find-pitches\/$/.test(path);
  // Detail HTML metadata needs only this entity. The browser's detail API
  // still reads its country for related listings. The URL country is no proof.
  // Country/category SEO and sitemaps still require complete global counts.
  const listingId=path==='/opportunity.html'?url.searchParams.get('id'):path.match(/^\/[^/]+\/opportunity\/(ent_[a-f0-9]{32})\/$/)?.[1];
  const snapshot=recovery||shellDocument?null:await readCatalogue(env,now,entityId(listingId)?{ids:[listingId]}:{}),rows=snapshot?.rows??[],ms=markets(rows),rs=Object.fromEntries(ms.map(m=>[m.code,regions(m.code,rows)]));
  if(sitemap){const entries=ms.flatMap(m=>seo.pages(m,inventory(rows,m.code,seoConfig.intentsFor(m.code),now),rs[m.code]).filter(p=>p.indexable));entries.push(...rows.map(row=>({path:row.canonical_path})));if(env.V3_LOCALISATION_ENABLED!=='false'&&env.V3_LOCALISATION_INDEXABLE==='true')entries.push(...entries.flatMap(entry=>['de','fr'].map(lang=>({...entry,path:i18n.pathFor(entry.path,lang)}))));return text(seo.sitemapXml(entries,budgetDay(now)),200,{'Content-Type':'application/xml'});}
  let d,template,routeQuery='';
  const staticPages={'/':'index.html','/index.html':'index.html','/finder.html':'finder.html','/opportunity.html':'opportunity.html','/seo.html':'seo.html','/pricing.html':'pricing.html','/pricing/':'pricing.html','/account.html':'account.html','/billing.html':'billing.html','/saved.html':'saved.html','/alerts.html':'alerts.html','/organisers.html':'organisers.html','/organisers/':'organisers.html'};
  if(staticPages[path])template=staticPages[path];else {d=seo.resolve(path,{markets:ms,regions:rs});if(d.kind==='redirect')return text('',301,{Location:i18n.pathFor(d.to,lang)});if(d.kind==='not_found')return text('Page not found',404);if(d.kind==='app'){const u=new URL(d.to,url);template=u.pathname.split('/').at(-1);routeQuery=u.searchParams.toString();}else{template='seo.html';routeQuery=new URLSearchParams({path:d.path}).toString();}}
  const asset=await env.ASSETS.fetch(new URL('/'+template,url).href);if(!asset.ok)return text('Page unavailable',503);let markup=localisedDocument(await asset.text(),lang),meta='',title=null,robots=production(env)&&['index.html','organisers.html'].includes(template)?'index,follow':'noindex,follow';
  if(d&&d.kind==='page') {
    const inv=inventory(rows,d.market,seoConfig.intentsFor(d.market),now),s=search(rows,{...seo.filters(d),page_size:12},null,now),m=ms.find(m=>m.code===d.market),originalMeta=seo.meta(d,{market:m,markets:ms,regions:rs[d.market],inventory:inv,inventories:{[d.market]:inv},search:s,visible:s.results,regionPath:ancestors(d.market,d.region?.id),today:budgetDay(now)}),M=i18n.meta(originalMeta,d,m,lang,env.V3_LOCALISATION_INDEXABLE==='true');
    title=M.title;robots=M.robots;meta=`<meta name="description" content="${esc(M.description)}"><link rel="canonical" href="${esc(M.canonical)}">`+M.hreflang.map(h=>`<link rel="alternate" hreflang="${esc(h.lang)}" href="${esc(h.href)}">`).join('')+M.jsonld.map(j=>`<script type="application/ld+json">${jsonld(j)}</script>`).join('');
    // The page already consumed one current proof snapshot. Give anonymous
    // browsers its exact Free response once, bounded by every source expiry.
    // Any session cookie (even invalid) excludes this optimisation entirely.
    if(production(env)&&!Object.hasOwn(cookies(request),sessionCookie)){
      const page=seoPage(rows,d,ms,rs,null,now,snapshot.as_of),initial=seoResponseData({path:d.path,page,rows,now});
      if(initial)meta+=`<script id="fp-seo-response" type="application/json">${jsonld(initial)}</script>`;
    }
  }
  if(template==='opportunity.html') {
    const query=new URLSearchParams(routeQuery||url.search),id=query.get('id'),row=rows.find(r=>r.id===id);if(!row) return text('Opportunity unavailable',404);
    title=row.title+' | FindPitches';robots=path===row.canonical_path?'index,follow':'noindex,follow';const ld=[{'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:[{name:'FindPitches',url:routes.abs('/')},{name:marketOf(row.market).name,url:routes.abs(routes.marketPath(row.market))},{name:row.title,url:routes.abs(row.canonical_path)}].map((r,i)=>({'@type':'ListItem',position:i+1,name:r.name,item:r.url}))}];
    if(row.dates.start)ld.push({'@context':'https://schema.org','@type':'Event',name:row.title,startDate:row.dates.start,...(row.dates.end?{endDate:row.dates.end}:{}),url:routes.abs(row.canonical_path),location:{'@type':'Place',name:row.location.label,address:row.location.label},organizer:{'@type':'Organization',name:row.organiser.name}});
    meta=`<link rel="canonical" href="${esc(routes.abs(i18n.pathFor(row.canonical_path,lang)))}">`+ld.map(j=>`<script type="application/ld+json">${jsonld(j)}</script>`).join('');
  }
  const canonicalPath=path==='/index.html'?'/':path;
  if(!meta.includes('rel=\"canonical\"'))meta+=`<link rel="canonical" href="${esc(routes.abs(i18n.pathFor(canonicalPath,lang)))}">`;
  if(lang!=='en'){markup=markup.replace(/<meta\s+name="description"[^>]*>/gi,'');if(!meta.includes('name=\"description\"'))meta+=`<meta name="description" content="${esc(i18n.tr('Browse checked markets, festivals and trader opportunities. Apply directly with the organiser.',[],lang))}">`;}
  if(title)markup=markup.replace(/<title>[^<]*<\/title>/,`<title>${esc(title)}</title>`);
  // The copied shell reads route defaults from data, without inline executable
  // scripts. Relative Build 4 assets and links resolve from this owned origin.
  if(lang!=='en'&&env.V3_LOCALISATION_INDEXABLE!=='true')robots='noindex,follow';
  if(!production(env))robots='noindex,nofollow';
  markup=markup.replace(/<meta\s+name="robots"[^>]*>/gi,'').replace('<head>',`<head><base href="${lr.prefix}/"><meta name="fp-language" content="${lang}"><meta name="fp-localisation-enabled" content="${env.V3_LOCALISATION_ENABLED!=='false'}"><meta name="fp-localisation-indexable" content="${env.V3_LOCALISATION_INDEXABLE==='true'}"><meta name="fp-environment" content="${env.V3_CUSTOMER_MODE}"><meta name="fp-route-query" content="${esc(routeQuery)}">`+meta+`<meta name="robots" content="${robots}">`);
  return text(markup,200,{'Content-Type':'text/html; charset=utf-8','X-Robots-Tag':robots,'Content-Language':lang});
}

export default {
  async fetch(request,env) {
    const now=new Date().toISOString(),p=new URL(request.url).pathname,db=env.V3_CUSTOMER_DB;
    if(!['restricted_shadow_preview','production_public'].includes(env.V3_CUSTOMER_MODE)||!db)return error(customerError('service_unavailable',503));
    try {
      if(production(env)){let runtime;try{runtime=await stmt(db,'SELECT mode,schema_version FROM customer_runtime WHERE id=1').first();}catch{throw customerError('service_unavailable',503);}if(runtime?.mode!=='production_public'||runtime.schema_version!==1||env.V3_STRIPE_MODE!=='live')throw customerError('service_unavailable',503);}
      if(p==='/health'&&request.method==='GET'){await stmt(db,'SELECT COUNT(*) AS n FROM customers').first();return response({service:production(env)?'findpitches-v3-customer-production':'findpitches-v3-customer-preview',mode:env.V3_CUSTOMER_MODE,publication_enabled:production(env)&&env.V3_PUBLIC_ENABLED==='true',production_cutover_enabled:production(env)&&env.V3_PUBLIC_ENABLED==='true',frontend:'Claude Build 4',frontend_source_sha256:FRONTEND_SOURCE});}
      if(p==='/api/v3/stripe/webhook'&&request.method==='POST')return response(await webhook(request,env,{now}));
      if(production(env)&&p.startsWith('/ops/')){
        if(!env.V3_PRODUCTION_OPERATOR_TOKEN||env.V3_PRODUCTION_OPERATOR_TOKEN.length<32||!same(await hash(request.headers.get('authorization')??''),await hash('Bearer '+env.V3_PRODUCTION_OPERATOR_TOKEN)))throw customerError('forbidden',403);
        if(p==='/ops/preflight'&&request.method==='GET'){const snapshot=await readCatalogue(env,now),counts=await stmt(db,`SELECT (SELECT COUNT(*) FROM customers) AS customers,(SELECT COUNT(*) FROM stripe_webhook_receipts WHERE processed_at IS NULL) AS pending_webhooks`).first();return response({mode:env.V3_CUSTOMER_MODE,public_enabled:env.V3_PUBLIC_ENABLED==='true',billing_mode:env.V3_STRIPE_MODE,checkout_enabled:env.V3_CHECKOUT_ENABLED==='live',ready:snapshot.rows.length,ready_by_country:Object.fromEntries(markets(snapshot.rows).map(m=>[m.code,m.opportunity_count])),email_configured:!!env.V3_EMAIL_API_KEY&&!mailCredentialIsProxyReference(env.V3_EMAIL_API_KEY),counts});}
        if(p==='/ops/email/verify'&&request.method==='POST')return response(await verifyNativeMailSettings(env));
        if(p==='/ops/billing/verify'&&request.method==='POST')return response(await verifyLiveBillingSettings(env));
        if(p==='/ops/billing/capabilities'&&request.method==='POST'){const result=await verifyLiveBillingCapabilities(env);return response({ok:result.permissions_observed,...result},result.permissions_observed?200:503);}
        throw customerError('not_found',404);
      }
      if(production(env)){
        if(p.startsWith('/preview/'))throw customerError('not_found',404);
        const u=new URL(request.url);
        // A typed bare domain can arrive over HTTP. Redirect only safe owned
        // document/asset navigation; API, operator and mutation guards remain.
        if(['http://findpitches.com','http://www.findpitches.com'].includes(u.origin)&&['GET','HEAD'].includes(request.method)&&!['/api','/ops','/preview'].some(prefix=>p===prefix||p.startsWith(prefix+'/')))
          return text('',301,{Location:'https://findpitches.com'+u.pathname+u.search});
        if(u.origin==='https://www.findpitches.com'&&['GET','HEAD'].includes(request.method))return text('',301,{Location:'https://findpitches.com'+u.pathname+u.search});
        if(u.origin!==env.V3_PUBLIC_ORIGIN||u.origin!=='https://findpitches.com')throw customerError('forbidden',403);
        if(env.V3_PUBLIC_ENABLED!=='true'&&!(env.V3_ACCOUNT_RECOVERY_ENABLED==='true'&&recoveryPath(i18n.route(p).path)))throw customerError('service_unavailable',503);
        if(!p.startsWith('/assets/'))await rateLimit(db,'public/ip/'+(request.headers.get('CF-Connecting-IP')??'local'),{limit:120,seconds:60,now});
        if(p==='/api/v3/billing/checkout')await rateLimit(db,'checkout/ip/'+(request.headers.get('CF-Connecting-IP')??'local'),{limit:10,now});
      }
      if(p==='/api/v3/session/verify'&&request.method==='GET'){
        await rateLimit(db,'verify/ip/'+(request.headers.get('CF-Connecting-IP')??'local'),{limit:30,seconds:60,now});
        return await api(request,env,now);
      }
      if(p.startsWith('/preview/')) {
        if(!await operator(request,env))throw customerError('forbidden',403);
        if(p==='/preview/access'&&request.method==='POST')return response({restricted_preview:true},200,[await grantPreview(db,now)]);
        if(p==='/preview/subscribers/recognize'&&request.method==='POST'){
          const association=await reviewSubscriberAssociation(db,env,await readBody(request),{now,stripe:stripeClient(env)});
          const customer=await stmt(db,'SELECT * FROM customers WHERE id=?',association.customer_id).first();
          await syncSubscriptions(db,env,customer,{now});
          return response({...association,recognized:true,access:await customerAccess(db,env,customer,{now}),livemode:false});
        }
        if(p==='/preview/email/verify'&&request.method==='POST'){
          try{return response(await verifyNativeMailSettings(env));}
          catch(e){return response({ok:false,error:'service_unavailable',diagnostic:e.mailDiagnostic??'provider_unavailable'},503);}
        }
        if(p==='/preview/test-login'&&request.method==='POST'){const b=await readBody(request);if(!/^[a-z0-9.+_-]+@example\.(com|org|net)$/.test(b.email??''))throw customerError('validation');const token=await issueChallenge(db,{email:b.email,next:b.next,now});return response({dev_link:'/api/v3/session/verify?token='+token});}
        if(p==='/preview/stripe/validate'&&request.method==='POST'){const price=await stripeClient(env)('/prices/'+encodeURIComponent(env.STRIPE_PRICE_ID));return response({test_mode:price.livemode===false,price_valid:price.active&&price.currency==='gbp'&&price.unit_amount===499&&price.recurring?.interval==='month',currency:price.currency,unit_amount:price.unit_amount,interval:price.recurring?.interval});}
        if(p==='/preview/sync'&&request.method==='POST'){const catalogue=await readCatalogue(env,now);return response(await recordInventoryChanges(db,catalogue.rows,now));}
        if(p==='/preview/status'&&request.method==='GET'){const snapshot=await readCatalogue(env,now),counts=await stmt(db,`SELECT (SELECT COUNT(*) FROM customers) AS customers,(SELECT COUNT(*) FROM customer_sessions WHERE revoked_at IS NULL AND expires_at>?) AS active_sessions,(SELECT COUNT(*) FROM stripe_webhook_receipts WHERE processed_at IS NULL) AS pending_webhooks,(SELECT COUNT(*) FROM customer_alerts) AS stored_alerts,(SELECT COUNT(*) FROM preview_inventory_state WHERE visible=1) AS tracked_visible,(SELECT COUNT(*) FROM preview_inventory_changes) AS inventory_changes`,now).first();
          return response({service:'findpitches-v3-customer-preview',frontend:{design:'Claude Build 4',source_sha256:FRONTEND_SOURCE,owned_by_v3:true},api_target:'V3_READY_API service binding',inventory:{shadow_ready:snapshot.shadow_ready,preview_eligible:snapshot.rows.length,producer_policy_withheld:snapshot.producer_policy_withheld,customer_visible_ready:0},auth:{native_sessions:true,email_configured:Boolean(env.V3_EMAIL_API_KEY&&env.V3_EMAIL_FROM&&!mailCredentialIsProxyReference(env.V3_EMAIL_API_KEY))},billing:{mode:env.V3_STRIPE_MODE??'unconfigured',checkout_enabled:env.V3_CHECKOUT_ENABLED==='test',webhook_configured:Boolean(env.STRIPE_WEBHOOK_SECRET),portal_configured:Boolean(env.STRIPE_PORTAL_CONFIGURATION_ID)},alerts:{storage:true,email_delivery:false},publication_enabled:false,production_cutover_enabled:false,legacy_dependencies:[],counts});}
        throw customerError('not_found',404);
      }
      if(!production(env)&&!await previewAllowed(request,db,now))throw customerError('preview_access_required',401);
      if(p.startsWith('/api/v3/'))return await api(request,env,now);
      if(request.method!=='GET'&&request.method!=='HEAD')throw customerError('not_found',404);
      return await html(request,env,now);
    }catch(e){try{await recordLiveStripeFailure(db,e,now);await noteCustomerEvent(db,'request',e.code??'internal_error',now);}catch{}return error(e);}
  },
  async scheduled(_event,env,ctx) {if(env.V3_CUSTOMER_MODE==='restricted_shadow_preview'||production(env)&&env.V3_PUBLIC_ENABLED==='true')ctx.waitUntil(readCatalogue(env,new Date().toISOString()).then(s=>recordInventoryChanges(env.V3_CUSTOMER_DB,s.rows,new Date().toISOString())).catch(()=>noteCustomerEvent(env.V3_CUSTOMER_DB,'inventory_sync','failed')));}
};
