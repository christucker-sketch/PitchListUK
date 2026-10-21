// Official dated CJS markets + the operator's public prospective trader intake.
// Standing registration is ENQUIRY_AVAILABLE, never guaranteed event capacity.
import {hash,stableJson} from './contract.mjs';
import {parseHtml,nodes,first,text} from './source-dom.mjs';
import {sourceRSCObjects} from './source-rsc.mjs';
import {fetchSourceDocument} from './source-document.mjs';
import {fetchUKPostcode,postcodeProof,ukPostcode} from './uk-event-geography.mjs';
import {rawSHA256} from './raw-sha256.mjs';
import {USABLE_ROUTE_POLICY} from './usable-route.mjs';
export const CJS_ORIGIN='https://www.cjseventswarwickshire.co.uk',CJS_HOME=CJS_ORIGIN+'/',CJS_EVENTS=CJS_ORIGIN+'/events',CJS_TRADE=CJS_ORIGIN+'/traders/become-a-trader';
export const CJS_ADAPTER_VERSION='cjs-official-dated-market-standing-intake-v2';
// Read-only review, 21 October 2026: published form handler, public multipart
// file uploader and trader-application POST binding. No code is executed.
export const CJS_INTAKE_SCRIPTS=Object.freeze([
 ['2rbcojgg7begu.js',177502,'2ec6319018fa461e9aa0a3bb2bc38d2fb1be7bc2342aa77d7153498193d0611d'],
 ['0q0rg4jlx1e01.js',79059,'cf767e238ec64c985902eb6eeed3e5d7c2678c412ab43cae1738e0845e1a1176'],
 ['07pu-jeye_bs0.js',105938,'e42a21bf0c632eb21fa2eb18ab1bccd71c1360c447182f2f3e86182f72d026c7'],
].map(([name,bytes,sha256])=>Object.freeze({url:CJS_ORIGIN+'/_next/static/chunks/'+name,bytes,sha256})));
const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
const norm=v=>clean(v).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const same=(a,b)=>{try{const x=new URL(a),y=new URL(b);return x.origin===y.origin&&x.pathname.replace(/\/$/,'')===y.pathname.replace(/\/$/,'')&&!x.search&&!y.search&&!x.hash&&!y.hash&&!x.username&&!x.password&&!y.username&&!y.password;}catch{return false;}};
const series=value=>{try{return new URL(value,CJS_ORIGIN).pathname.match(/^\/events\/([a-z0-9-]+)-\d{1,2}(?:st|nd|rd|th)-(?:january|february|march|april|may|june|july|august|september|october|november|december)-20\d{2}\/?$/)?.[1]??null;}catch{return null;}};
export function cjsEventURL(value){try{const u=new URL(value);return u.origin===CJS_ORIGIN&&!u.username&&!u.password&&!u.search&&!u.hash&&/^\/events\/[a-z0-9]+(?:-[a-z0-9]+)*\/?$/.test(u.pathname);}catch{return false;}}
const active=(root,n)=>!nodes(root,x=>x.start<=n.start&&x.end>=n.end&&(x.attrs?.disabled!==undefined||x.attrs?.readonly!==undefined||x.attrs?.hidden!==undefined||x.attrs?.['aria-hidden']==='true'||x.attrs?.['aria-disabled']==='true'||/display\s*:\s*none|visibility\s*:\s*hidden/i.test(x.attrs?.style??''))).length;
function rootFor(d,url){if(d?.reason||d?.http_status!==200||!same(d?.url,url)||!same(d?.requested_url,url)||typeof d.html!=='string')throw Error('cjs_bound_source_document_required');return parseHtml(d.html);}
function main(root){const ms=nodes(root,n=>n.tag==='main');if(ms.length!==1||!active(root,ms[0]))throw Error('cjs_single_visible_main_required');return ms[0];}
function date(value){
 const m=String(value?.formatted??'').match(/^(\d{2})\/(\d{2})\/(20\d{2})$/);if(!m||!Number.isSafeInteger(value.timestamp))throw Error('cjs_explicit_consistent_date_required');
 const iso=`${m[3]}-${m[2]}-${m[1]}`,at=new Date(value.timestamp*1000);if(!Number.isFinite(at.getTime())||at.toISOString().slice(0,10)!==iso||new Date(iso+'T12:00:00Z').toISOString().slice(0,10)!==iso)throw Error('cjs_explicit_consistent_date_required');return iso;
}
export function parseCJSEvent(document){
 if(!cjsEventURL(document?.url))throw Error('cjs_specific_event_required');const root=rootFor(document,document.url),scope=main(root),events=sourceRSCObjects(document.html,'event');
 if(events.length!==1)throw Error('cjs_single_published_event_required');const event=events[0];
 if(!/^[a-f\d]{16}$/.test(event.id??'')||!same(new URL(event.links?.slug??'',CJS_ORIGIN).href,document.url)||!same(event.links?.view,CJS_ORIGIN+'/events/'+event.id)||!same(CJS_ORIGIN+'/events/'+event.slug,document.url)||event.cancelled!==false||event.clientType?.name!=='Public'||!['Retail market','Arts & Craft market'].includes(event.eventType?.name))throw Error('cjs_event_identity_or_trader_purpose_unproved');
 const canonical=nodes(root,n=>n.tag==='link'&&n.attrs.rel==='canonical'),declared=new URL(event.links?.canonical??'',CJS_ORIGIN).href;
 // The publisher points repeated occurrences at a series' first dated page.
 // This is retained as a series reference, NEVER used as this entity's key.
 // The own slug, stable ID, visible date and venue still have to agree.
 const parent=!same(declared,document.url);
 if(canonical.length!==1||!cjsEventURL(declared)||!same(canonical[0].attrs.href,declared)||parent&&(event.isRecurring!==true||!series(document.url)||series(document.url)!==series(declared)))throw Error('cjs_canonical_identity_mismatch');
 const headings=nodes(scope,n=>n.tag==='h1',{scoped:true});if(headings.length!==1||!active(root,headings[0])||clean(text(headings[0]))!==clean(event.name)||!clean(event.name))throw Error('cjs_visible_event_identity_mismatch');
 const title=text(first(root,n=>n.tag==='title'),{scoped:false});if(!title.includes('CJ’s Events Warwickshire')||!title.startsWith(clean(event.name)+' - '))throw Error('cjs_official_operator_identity_required');
 const start=date(event.startDate),end=date(event.endDate);if(end<start)throw Error('cjs_contradictory_event_dates');
 const boundary=nodes(scope,n=>/^h[2-6]$/.test(n.tag)&&clean(text(n))==='Upcoming Events',{scoped:true})[0]?.start??scope.end;
 const own=nodes(scope,n=>n.start>=headings[0].start&&n.end<boundary&&['p','div'].includes(n.tag)&&active(root,n),{scoped:true});
 if(!own.some(n=>clean(text(n))===clean(event.formattedDate)))throw Error('cjs_visible_event_date_mismatch');
 const loc=event.location,code=ukPostcode(loc?.postcode);if(!code||!clean(loc?.name)||!clean(loc?.town?.name)||!clean(loc.formattedAddress)||!loc.formattedAddress.includes(loc.postcode)||!own.some(n=>norm(text(n))===norm(loc.formattedAddress)))throw Error('cjs_visible_physical_event_address_required');
 const primary=clean(text(scope).split('Upcoming Events')[0]);if(/\b(?:cancelled|canceled|postponed|fully booked|sold out|waitlist only|waiting list only|applications? (?:are )?closed)\b/i.test(primary))throw Error('cjs_current_event_restricted_or_closed');
 return {id:event.id,source_identifier:'cjs:'+event.id,title:clean(event.name),start,end,url:document.url,declared_canonical_url:declared,canonical_scope:parent?'series_reference_not_entity_identity':'own_event',location:clean(loc.formattedAddress),postcode:code,type:event.eventType.name,formatted_date:clean(event.formattedDate)};
}
export function parseCJSIntake(home,trade,scripts,upload){
 const homeRoot=rootFor(home,CJS_HOME),homeMain=main(homeRoot),tradeRoot=rootFor(trade,CJS_TRADE),scope=main(tradeRoot),body=text(scope);
 const invitations=nodes(homeMain,n=>n.tag==='a'&&/^Apply to trade$/i.test(clean(text(n)))&&same(new URL(n.attrs.href??'',CJS_HOME).href,CJS_TRADE)&&active(homeRoot,n),{scoped:true});
 if(!invitations.length||![homeRoot,tradeRoot].every(r=>norm(text(first(r,n=>n.tag==='title'),{scoped:false})).includes(norm('CJ’s Events Warwickshire')))||!/^Become a Trader$/i.test(text(first(scope,n=>n.tag==='h1',{scoped:true})))||!/Sign up to become a Trader, and join the brilliant local businesses promoting and selling their products and services at our events\./.test(body))throw Error('cjs_explicit_operator_wide_trader_invitation_required');
 if(/\b(?:applications? (?:are )?closed|not accepting|waitlist only|existing traders? only|invitation only)\b/i.test(body))throw Error('cjs_intake_restricted_or_closed');
 const forms=nodes(scope,n=>n.tag==='form',{scoped:true});if(forms.length!==1||!active(tradeRoot,forms[0]))throw Error('cjs_active_prospective_intake_required');const form=forms[0];
 for(const [tag,name]of [['input','full_name'],['input','company_name'],['input','email'],['select','category'],['textarea','bio']]){const fields=nodes(form,n=>n.tag===tag&&n.attrs.name===name,{scoped:true});if(fields.length!==1||!active(tradeRoot,fields[0]))throw Error('cjs_bound_trader_controls_required');}
 const submits=nodes(form,n=>n.tag==='button'&&n.attrs.type==='submit'&&clean(text(n))==='Submit application'&&active(tradeRoot,n),{scoped:true});
 const uploads=nodes(form,n=>n.tag==='input'&&n.attrs.type==='file'&&active(tradeRoot,n),{scoped:true});if(submits.length!==1||uploads.length<2||!/Public Liability Insurance/.test(body))throw Error('cjs_required_document_controls_unproved');
 if(!Array.isArray(scripts)||scripts.length!==CJS_INTAKE_SCRIPTS.length)throw Error('cjs_reviewed_intake_scripts_required');
 const boundScripts=nodes(tradeRoot,n=>n.tag==='script'&&n.attrs.src).map(n=>new URL(n.attrs.src,CJS_ORIGIN).href);
 for(const spec of CJS_INTAKE_SCRIPTS){const docs=scripts.filter(d=>d.requested_url===spec.url&&d.url===spec.url),d=docs[0];if(!boundScripts.includes(spec.url)||docs.length!==1||d.reason||d.http_status!==200||!/(?:application|text)\/javascript/.test(d.content_type??'')||typeof d.javascript!=='string')throw Error('cjs_reviewed_intake_scripts_required');const bytes=new TextEncoder().encode(d.javascript);if(bytes.length!==spec.bytes||rawSHA256(bytes)!==spec.sha256)throw Error('cjs_intake_changed_requires_review');}
 let response;try{response=JSON.parse(upload?.json_text);}catch{}
 if(upload?.reason||upload?.http_status!==400||upload?.requested_url!==CJS_ORIGIN+'/api/files'||upload?.url!==upload.requested_url||response?.code!==400||response?.type!=='Method Not Allowed'||response?.success!==false)throw Error('cjs_public_upload_route_not_observed');
 return {landing_url:CJS_TRADE,type:'standing_registration',state:'ENQUIRY_AVAILABLE',requires_account_application:true,requires_public_liability_documents:true,guaranteed_vendor_space:false,reviewed_script_hashes:CJS_INTAKE_SCRIPTS.map(s=>s.sha256),submission_tested:false};
}
export function verifyCJSBundle(document,{now=new Date().toISOString(),version='source-proof-v1',applicationPolicy='current-application-v1.11'}={}){
 const report={version,application_policy:applicationPolicy,adapter_version:CJS_ADAPTER_VERSION,profile:'cjseventswarwickshire',page_kind:'unproved',source_url:document?.url,checked_at:document?.fetched_at,status:'unverified',facts:{},reasons:[],evidence:[]};
 try{
  if(document?.reason||document?.document_kind!=='cjs_official_bundle'||document.adapter_version!==CJS_ADAPTER_VERSION||!cjsEventURL(document.url)||!same(document.requested_url,document.url)||!Array.isArray(document.documents)||document.documents.length!==8)throw Error('cjs_exact_source_bundle_required');
  const docs=document.documents,clocks=docs.map(d=>Date.parse(d.fetched_at));if(clocks.some(t=>!Number.isFinite(t)||t>Date.parse(now))||document.fetched_at!==new Date(Math.min(...clocks)).toISOString())throw Error('cjs_source_bundle_freshness_invalid');
  const one=url=>{const ds=docs.filter(d=>same(d.url,url));if(ds.length!==1)throw Error('cjs_unique_source_document_required');return ds[0];};
  const event=parseCJSEvent(one(document.url));if(event.source_identifier!==document.source_identifier)throw Error('cjs_source_event_identity_mismatch');
  const intake=parseCJSIntake(one(CJS_HOME),one(CJS_TRADE),docs.filter(d=>d.document_kind==='cjs_intake_script'),one(CJS_ORIGIN+'/api/files')),geo=docs.find(d=>d.document_kind==='uk_postcode_receipt'),country=postcodeProof(geo,event.postcode,{now});if(!country)throw Error('cjs_exact_event_postcode_country_required');
  report.page_kind='event';report.facts={event_name:event.title,organiser:'CJ’s Events Warwickshire',location:event.location,event_start:event.start,event_end:event.end,country:'GB',...country.region?{region_code:country.region}:{},canonical_url:document.url,source_platform:report.profile,source_identifier:event.source_identifier,application_url:CJS_TRADE,application_state:'ENQUIRY_AVAILABLE'};
  report.application_heading='Become a Trader — CJ’s Events Warwickshire';report.application_scope_proof={trader_application:true,restricted_audience:false,guaranteed_vendor_space:false};report.application_dependencies=intake;
  report.usable_route={policy:USABLE_ROUTE_POLICY,type:'standing_registration',landing_url:CJS_TRADE,event_source_url:document.url,organiser_url:CJS_HOME,organiser_controlled:true,prospective_trader:true,current:true,requires_account:true,account_provider:'CJ’s Events Warwickshire'};
  report.evidence=[{kind:'cjs_exact_published_event_and_visible_body',source_url:document.url,excerpt:stableJson(event)},{kind:'cjs_operator_wide_prospective_intake',source_url:CJS_TRADE,excerpt:stableJson(intake)},{kind:'official_main_content_trader_invitation',source_url:CJS_HOME,excerpt:'Apply to Trade — prospective businesses selling at our events.'},{kind:'exact_event_postcode_country',source_url:geo.url,excerpt:stableJson(country)}];
  if(event.end<now.slice(0,10)){report.status='quarantine';report.reasons=['stale_edition'];report.usable_route.current=false;}else report.status='verified';
 }catch(e){report.reasons=[/^[a-z_]+$/.test(e.message)?e.message:'cjs_source_structure_changed'];report.status=/mismatch|contradictory/.test(report.reasons[0])?'quarantine':'unverified';}
 return report;
}
async function readAux(url,kind,{fetcher,now}){
 const meta={requested_url:url,url,fetched_at:now,document_kind:kind};try{
  const r=await fetcher(url,{redirect:'manual',headers:{Accept:kind==='cjs_intake_script'?'application/javascript':'application/json','User-Agent':'FindPitches-V3-Shadow-Verification/1.0'},signal:AbortSignal.timeout(12000)}),content_type=r.headers.get('content-type')??'';
  const typeOK=kind==='cjs_intake_script'?/(?:application|text)\/javascript/.test(content_type):/application\/json/.test(content_type);if(!typeOK||r.status!==(kind==='cjs_intake_script'?200:400))return {...meta,http_status:r.status,reason:'cjs_auxiliary_route_changed'};
  const reader=r.body.getReader(),parts=[];let size=0;try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>262144){await reader.cancel();throw Error();}parts.push(value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let at=0;for(const p of parts){bytes.set(p,at);at+=p.length;}const raw=new TextDecoder().decode(bytes);return {...meta,http_status:r.status,content_type,[kind==='cjs_intake_script'?'javascript':'json_text']:raw,content_hash:await hash(raw)};
 }catch{return {...meta,reason:'cjs_auxiliary_fetch_failed'};}
}
export async function fetchCJSProgramme({eventURLs,fetcher=fetch,now=new Date().toISOString(),visit=null}={}){
 if(!Array.isArray(eventURLs)||eventURLs.length<1||eventURLs.length>10||new Set(eventURLs).size!==eventURLs.length||eventURLs.some(u=>!cjsEventURL(u)))throw Error('cjs_bounded_specific_event_list_required');
 const read=async u=>{const d=await fetchSourceDocument(u,{fetcher,now});if(visit)await visit(d);return d;},home=await read(CJS_HOME),trade=await read(CJS_TRADE),scripts=[];
 for(const s of CJS_INTAKE_SCRIPTS){const d=await readAux(s.url,'cjs_intake_script',{fetcher,now});if(visit)await visit(d);scripts.push(d);}
 const upload=await readAux(CJS_ORIGIN+'/api/files','cjs_upload_route_receipt',{fetcher,now});if(visit)await visit(upload);parseCJSIntake(home,trade,scripts,upload);
 const bundles=[],held=[],geos=new Map();for(const url of eventURLs){try{const source=await read(url),event=parseCJSEvent(source);if(event.end<now.slice(0,10)){held.push({url,reason:'stale_edition'});continue;}if(!geos.has(event.postcode)){const d=await fetchUKPostcode(event.postcode,{fetcher,now});if(visit)await visit(d);geos.set(event.postcode,d);}const documents=[source,home,trade,...scripts,upload,geos.get(event.postcode)];bundles.push({document_kind:'cjs_official_bundle',adapter_version:CJS_ADAPTER_VERSION,requested_url:url,url:source.url,source_identifier:event.source_identifier,fetched_at:new Date(Math.min(...documents.map(d=>Date.parse(d.fetched_at)))).toISOString(),content_hash:await hash(documents),documents});}catch(e){held.push({url,reason:/^[a-z_]+$/.test(e.message)?e.message:'cjs_source_structure_changed'});}}
 return {bundles,held};
}
export async function fetchCJSBundle(url,sourceIdentifier,{fetcher=fetch,now=new Date().toISOString()}={}){
 const p=await fetchCJSProgramme({eventURLs:[url],fetcher,now});return p.bundles.find(b=>b.source_identifier===sourceIdentifier)??{requested_url:url,url,fetched_at:now,reason:p.held[0]?.reason??'cjs_source_event_identity_mismatch'};
}
