import {hash} from './contract.mjs';
import {stmt,cookie,cookies,operator,csrfValue,requireCsrf,customerError,readBody,rateLimit,noteCustomerEvent} from './customer-security.mjs';
import {previewAllowed,grantPreview,signedCustomer,needCustomer,issueChallenge,consumeChallenge,requestLogin,logout,updateProfile} from './customer-auth.mjs';
import {customerAccess,plans,checkout,confirmCheckout,portal,webhook,stripeClient} from './customer-billing.mjs';
import {readCatalogue,present,search,marketOf,markets,regions,resolveLocation,inventory,ancestors,recordInventoryChanges} from './customer-catalogue.mjs';
import {seo,seoConfig,routes} from '../../web/findpitches-v3-web/server/seo-edge.mjs';
import {budgetDay} from './serper-usage.mjs';

const CSP="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
const headers={'Content-Security-Policy':CSP,'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Strict-Transport-Security':'max-age=31536000','X-Robots-Tag':'noindex, nofollow','Cache-Control':'private, no-store'};
const response=(data,status=200,setCookies=[])=>{const h=new Headers({...headers,'Content-Type':'application/json'});for(const c of setCookies)h.append('Set-Cookie',c);return new Response(JSON.stringify({ok:true,...data}),{status,headers:h});};
const error=e=>response({ok:false,error:e.code??'internal_error',message:({auth_required:'Sign in to continue.',upgrade_required:'Pro is required for this feature.',service_unavailable:'This service is temporarily unavailable.',csrf_failed:'Refresh the page and try again.',rate_limited:'Please wait before trying again.',not_found:'This opportunity is unavailable.',subscription_exists:'Manage your existing subscription in billing.'})[e.code]??'Please check your request and try again.'},e.status??500);
const text=(value,status=200,extra={})=>new Response(value,{status,headers:{...headers,...extra}});
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const jsonld=value=>JSON.stringify(value).replace(/</g,'\\u003c');
export const FRONTEND_SOURCE='24ad4b61cfc64b7338d5ab44efa816479ad1a57e7e0740893fb338b39c8b3e05';

async function session(db,env,customer,now) {
  const profile=customer?JSON.parse(customer.profile_json):null;
  return {signed_in:Boolean(customer),user:customer?{email:customer.email,business_name:null,contact_name:null,phone:null,market:null,base_postcode:null,specialty:null,regions:[],public_listing_opt_in:false,...profile}:null,
    access:await customerAccess(db,env,customer,{now,refresh:true})};
}
async function alerts(db,customer,rows,access,now) {
  return Promise.all((await stmt(db,'SELECT * FROM customer_alerts WHERE customer_id=? ORDER BY created_at',customer.id).all()).results.map(async a=>{const query=JSON.parse(a.query_json),s=search(rows,query,access,now);return {id:a.id,name:a.name,query,frequency:a.frequency,paused:Boolean(a.paused),created_at:a.created_at,current_matches:s.total,sample:s.results.slice(0,3)};}));
}
function alertBody(body,old,rows,access,now) {
  if(Object.keys(body).some(k=>!['name','query','frequency','paused'].includes(k)))throw customerError('validation');
  const a={name:old?.name,query:old?JSON.parse(old.query_json):undefined,frequency:old?.frequency??'daily',paused:Boolean(old?.paused),...body};
  if(typeof a.name!=='string'||!a.name.trim()||a.name.length>150||!['instant','daily','weekly'].includes(a.frequency)||typeof a.paused!=='boolean'||!a.query||typeof a.query!=='object'||Array.isArray(a.query))throw customerError('validation');
  if(Object.keys(a.query).some(k=>!['market','q','q_text','place_label','radius_km','types','sells','organiser_types','when','month','region'].includes(k)))throw customerError('validation');
  if(a.query.market!==access.market)throw customerError('upgrade_required',402);
  search(rows,a.query,access,now);return a;
}
async function api(request,env,now) {
  const db=env.V3_CUSTOMER_DB,url=new URL(request.url),p=url.pathname.slice('/api/v3'.length),q=Object.fromEntries(url.searchParams),method=request.method;
  if(method!=='GET')await requireCsrf(request,env);
  const body=method==='GET'?{}:await readBody(request),customer=await signedCustomer(request,db,now);
  if(method==='GET'&&p==='/session')return response(await session(db,env,customer,now),200,[cookie('fp_csrf',await csrfValue(env),604800,false)]);
  if(method==='POST'&&p==='/session/link')return response(await requestLogin(request,env,body,{now}));
  if((method==='GET'||method==='POST')&&p==='/session/verify') {
    try{const result=await consumeChallenge(db,method==='GET'?q.token:body.token,now);return method==='GET'?text('',303,{Location:result.next,'Set-Cookie':result.cookie}):response(await session(db,env,result.customer,now),200,[result.cookie]);}
    catch(e){if(method==='GET'&&e.code==='invalid_link')return text('',303,{Location:'/account.html?signin=expired'});throw e;}
  }
  if(method==='POST'&&p==='/session/logout')return response({},200,[await logout(request,db,now)]);
  if(method==='PATCH'&&p==='/session/profile')return response(await session(db,env,await updateProfile(db,needCustomer(customer),body),now));
  if(method==='GET'&&p==='/billing/plans'){marketOf(q.market??'GB');return response({plans:plans(q.market??'GB',env)});}
  if(method==='POST'&&p==='/billing/checkout')return response(await checkout(db,env,needCustomer(customer),body,{now,origin:url.origin}));
  if(method==='POST'&&p==='/billing/confirm'){await confirmCheckout(db,env,needCustomer(customer),body,{now});return response(await session(db,env,customer,now));}
  if(method==='POST'&&p==='/billing/portal')return response(await portal(db,env,needCustomer(customer),{origin:url.origin}));
  // Saved IDs are customer-owned state, not a catalogue read. Expanded saved
  // records below still require a fresh source-proof snapshot and redaction.
  if(method==='GET'&&p==='/saved'&&!q.expand){needCustomer(customer);const saved=(await stmt(db,'SELECT entity_id FROM saved_opportunities WHERE customer_id=? ORDER BY saved_at DESC',customer.id).all()).results;return response({ids:saved.map(r=>r.entity_id)});}
  if(method==='POST'&&/^\/inbox\/(organiser_submission|partnership_enquiry|listing_report|waitlist)$/.test(p)) {
    await rateLimit(db,'inbox/'+(request.headers.get('CF-Connecting-IP')??'local'),{limit:10,now});const id='FP-'+crypto.randomUUID();
    await stmt(db,'INSERT INTO customer_inbox VALUES (?,?,?,?)',id,p.split('/').at(-1),JSON.stringify(body),now).run();return response({reference:id},201);
  }
  const snapshot=await readCatalogue(env,now),rows=snapshot.rows,access=await customerAccess(db,env,customer,{now,refresh:true});
  if(method==='GET'&&p==='/markets')return response({markets:markets(rows)});
  if(method==='GET'&&p==='/stats')return response({as_of:snapshot.as_of,total:rows.length,sports:rows.filter(r=>r.type==='sport').length,markets:Object.fromEntries(markets(rows).map(m=>[m.code,{count:m.opportunity_count,regions:regions(m.code,rows).filter(r=>r.opportunity_count).length}]))});
  if(method==='GET'&&p==='/regions')return response({regions:regions(q.market,rows)});
  if(method==='GET'&&p==='/geo/resolve')return response({location:resolveLocation(q.market,q.q)});
  if(method==='GET'&&p==='/opportunities')return response(search(rows,q,access,now));
  if(method==='GET'&&p==='/opportunities/count')return response({total:search(rows,q,access,now).total});
  if(method==='GET'&&p==='/opportunities/changes'){needCustomer(customer);const after=Number(q.after??0);if(!Number.isSafeInteger(after)||after<0)throw customerError('validation');const changes=(await stmt(db,'SELECT sequence,entity_id,kind,occurred_at FROM preview_inventory_changes WHERE sequence>? ORDER BY sequence LIMIT 100',after).all()).results;return response({changes,next_cursor:changes.at(-1)?.sequence??after,as_of:now});}
  if(method==='GET'&&p==='/opportunities/upcoming') {
    if(q.market)marketOf(q.market);const limit=Number(q.limit??10);if(!Number.isInteger(limit)||limit<1||limit>100)throw customerError('validation');
    const upcoming=rows.filter(r=>(!q.market||r.market===q.market)&&r.dates.start>=budgetDay(now)&&(!q.type||r.type===q.type)).sort((a,b)=>a.dates.start.localeCompare(b.dates.start)||a.id.localeCompare(b.id)).slice(0,limit);return response({items:upcoming.map(r=>present(r,access))});
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
  const url=new URL(request.url),path=url.pathname;
  if(path==='/favicon.ico')return text('',204);
  if(path==='/robots.txt')return text('User-agent: *\nDisallow: /\n',200,{'Content-Type':'text/plain'});
  if(path.startsWith('/assets/')){const asset=await env.ASSETS.fetch(request);return new Response(asset.body,{status:asset.status,headers:{...Object.fromEntries(asset.headers),...headers}});}
  if(path==='/sitemap.xml'||/^\/sitemap-[a-z]+\.xml$/.test(path))return text(path==='/sitemap.xml'?'<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></sitemapindex>':seo.sitemapXml([],budgetDay(now)),200,{'Content-Type':'application/xml'});
  const snapshot=await readCatalogue(env,now),rows=snapshot.rows,ms=markets(rows),rs=Object.fromEntries(ms.map(m=>[m.code,regions(m.code,rows)]));
  let d,template,routeQuery='';
  const staticPages={'/index.html':'index.html','/finder.html':'finder.html','/opportunity.html':'opportunity.html','/seo.html':'seo.html','/pricing.html':'pricing.html','/pricing/':'pricing.html','/account.html':'account.html','/saved.html':'saved.html','/alerts.html':'alerts.html','/organisers.html':'organisers.html','/organisers/':'organisers.html'};
  if(staticPages[path])template=staticPages[path];else {d=seo.resolve(path,{markets:ms,regions:rs});if(d.kind==='redirect')return text('',301,{Location:d.to});if(d.kind==='not_found')return text('Page not found',404);if(d.kind==='app'){const u=new URL(d.to,url);template=u.pathname.split('/').at(-1);routeQuery=u.searchParams.toString();}else{template='seo.html';routeQuery=new URLSearchParams({path:d.path}).toString();}}
  const asset=await env.ASSETS.fetch(new URL('/'+template,url).href);if(!asset.ok)return text('Page unavailable',503);let markup=await asset.text(),meta='',title=null;
  if(d&&d.kind==='page') {
    const inv=inventory(rows,d.market,seoConfig.intentsFor(d.market),now),s=search(rows,{...seo.filters(d),page_size:12},null,now),m=ms.find(m=>m.code===d.market),M=seo.meta(d,{market:m,markets:ms,regions:rs[d.market],inventory:inv,inventories:{[d.market]:inv},search:s,visible:s.results,regionPath:ancestors(d.market,d.region?.id),today:budgetDay(now)});
    title=M.title;meta=`<meta name="description" content="${esc(M.description)}"><link rel="canonical" href="${esc(M.canonical)}">`+M.hreflang.map(h=>`<link rel="alternate" hreflang="${esc(h.lang)}" href="${esc(h.href)}">`).join('')+M.jsonld.map(j=>`<script type="application/ld+json">${jsonld(j)}</script>`).join('');
  }
  if(template==='opportunity.html') {
    const query=new URLSearchParams(routeQuery||url.search),id=query.get('id'),row=rows.find(r=>r.id===id);if(!row) return text('Opportunity unavailable',404);
    title=row.title+' | FindPitches';const ld=[{'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:[{name:'FindPitches',url:routes.abs('/')},{name:marketOf(row.market).name,url:routes.abs(routes.marketPath(row.market))},{name:row.title,url:routes.abs(row.canonical_path)}].map((r,i)=>({'@type':'ListItem',position:i+1,name:r.name,item:r.url}))}];
    if(row.dates.start)ld.push({'@context':'https://schema.org','@type':'Event',name:row.title,startDate:row.dates.start,...(row.dates.end?{endDate:row.dates.end}:{}),url:routes.abs(row.canonical_path),location:{'@type':'Place',name:row.location.label,address:row.location.label},organizer:{'@type':'Organization',name:row.organiser.name}});
    meta=`<link rel="canonical" href="${esc(routes.abs(row.canonical_path))}">`+ld.map(j=>`<script type="application/ld+json">${jsonld(j)}</script>`).join('');
  }
  if(title)markup=markup.replace(/<title>[^<]*<\/title>/,`<title>${esc(title)}</title>`);
  // The copied shell reads route defaults from data, without inline executable
  // scripts. Relative Build 4 assets and links resolve from this owned origin.
  markup=markup.replace('<head>',`<head><base href="/"><meta name="fp-environment" content="restricted_shadow_preview"><meta name="fp-route-query" content="${esc(routeQuery)}">`+meta+'<meta name="robots" content="noindex,nofollow">');
  return text(markup,200,{'Content-Type':'text/html; charset=utf-8'});
}

export default {
  async fetch(request,env) {
    const now=new Date().toISOString(),p=new URL(request.url).pathname,db=env.V3_CUSTOMER_DB;
    if(env.V3_CUSTOMER_MODE!=='restricted_shadow_preview'||!db)return error(customerError('service_unavailable',503));
    try {
      if(p==='/health'&&request.method==='GET'){await stmt(db,'SELECT COUNT(*) AS n FROM customers').first();return response({service:'findpitches-v3-customer-preview',mode:'restricted_shadow_preview',publication_enabled:false,production_cutover_enabled:false,frontend:'Claude Build 4',frontend_source_sha256:FRONTEND_SOURCE});}
      if(p==='/api/v3/stripe/webhook'&&request.method==='POST')return response(await webhook(request,env,{now}));
      if(p.startsWith('/preview/')) {
        if(!await operator(request,env))throw customerError('forbidden',403);
        if(p==='/preview/access'&&request.method==='POST')return response({restricted_preview:true},200,[await grantPreview(db,now)]);
        if(p==='/preview/test-login'&&request.method==='POST'){const b=await readBody(request);if(!/^[a-z0-9.+_-]+@example\.(com|org|net)$/.test(b.email??''))throw customerError('validation');const token=await issueChallenge(db,{email:b.email,next:b.next,now});return response({dev_link:'/api/v3/session/verify?token='+token});}
        if(p==='/preview/stripe/validate'&&request.method==='POST'){const price=await stripeClient(env)('/prices/'+encodeURIComponent(env.STRIPE_PRICE_ID));return response({test_mode:price.livemode===false,price_valid:price.active&&price.currency==='gbp'&&price.unit_amount===499&&price.recurring?.interval==='month',currency:price.currency,unit_amount:price.unit_amount,interval:price.recurring?.interval});}
        if(p==='/preview/sync'&&request.method==='POST'){const catalogue=await readCatalogue(env,now);return response(await recordInventoryChanges(db,catalogue.rows,now));}
        if(p==='/preview/status'&&request.method==='GET'){const snapshot=await readCatalogue(env,now),counts=await stmt(db,`SELECT (SELECT COUNT(*) FROM customers) AS customers,(SELECT COUNT(*) FROM customer_sessions WHERE revoked_at IS NULL AND expires_at>?) AS active_sessions,(SELECT COUNT(*) FROM stripe_webhook_receipts WHERE processed_at IS NULL) AS pending_webhooks,(SELECT COUNT(*) FROM customer_alerts) AS stored_alerts,(SELECT COUNT(*) FROM preview_inventory_state WHERE visible=1) AS tracked_visible,(SELECT COUNT(*) FROM preview_inventory_changes) AS inventory_changes`,now).first();
          return response({service:'findpitches-v3-customer-preview',frontend:{design:'Claude Build 4',source_sha256:FRONTEND_SOURCE,owned_by_v3:true},api_target:'V3_READY_API service binding',inventory:{shadow_ready:snapshot.shadow_ready,preview_eligible:snapshot.rows.length,producer_policy_withheld:snapshot.producer_policy_withheld,customer_visible_ready:0},auth:{native_sessions:true,email_configured:Boolean(env.V3_EMAIL_API_KEY&&env.V3_EMAIL_FROM)},billing:{mode:env.V3_STRIPE_MODE??'unconfigured',checkout_enabled:env.V3_CHECKOUT_ENABLED==='test',webhook_configured:Boolean(env.STRIPE_WEBHOOK_SECRET),portal_configured:Boolean(env.STRIPE_PORTAL_CONFIGURATION_ID)},alerts:{storage:true,email_delivery:false},publication_enabled:false,production_cutover_enabled:false,legacy_dependencies:[],counts});}
        throw customerError('not_found',404);
      }
      if(!await previewAllowed(request,db,now))throw customerError('preview_access_required',401);
      if(p.startsWith('/api/v3/'))return await api(request,env,now);
      if(request.method!=='GET'&&request.method!=='HEAD')throw customerError('not_found',404);
      return await html(request,env,now);
    }catch(e){try{await noteCustomerEvent(db,'request',e.code??'internal_error',now);}catch{}return error(e);}
  },
  async scheduled(_event,env,ctx) {if(env.V3_CUSTOMER_MODE==='restricted_shadow_preview')ctx.waitUntil(readCatalogue(env,new Date().toISOString()).then(s=>recordInventoryChanges(env.V3_CUSTOMER_DB,s.rows,new Date().toISOString())).catch(()=>noteCustomerEvent(env.V3_CUSTOMER_DB,'inventory_sync','failed')));}
};
