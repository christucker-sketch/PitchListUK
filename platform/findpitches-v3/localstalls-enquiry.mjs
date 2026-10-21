// A platform listing is discovery until the event and its prospective-trader
// contact route are proved separately. No form, account or CAPTCHA submission.
import {parseHtml,nodes,first,text,hasClass} from './source-dom.mjs';
import {rawSHA256} from './raw-sha256.mjs';
import {hash,stableJson} from './contract.mjs';
import {USABLE_ROUTE_POLICY} from './usable-route.mjs';
export const LOCALSTALLS_ENQUIRY_VERSION='localstalls-event-manager-enquiry-v1';
export const LOCALSTALLS_HANDLER=Object.freeze({url:'https://localstalls.com/explore/explore-event.js?v=1791445188',bytes:8529,sha256:'53229fecb25dfcc31441f1e810d25223a067c68412eb2c960d19051f58efbd75'});
const removable=new Set(['event_application_route_missing_or_ambiguous','open_vendor_application_not_proved']);
const clean=s=>String(s??'').replace(/\s+/g,' ').trim();
const blocked=/\b(?:closed|sold out|fully booked|waitlist|waiting list|not accepting|no longer accepting|cancelled|postponed|members? only|invitation only|returning vendors? only)\b/i;
const sameText=(a,b)=>clean(a).toLowerCase()===clean(b).toLowerCase();
export function localstallsEventURL(value){try{const u=new URL(value);return u.origin==='https://localstalls.com'&&!u.search&&!u.hash&&/^\/uk\/event\/[^/]+\/[^/]+\/?$/.test(u.pathname);}catch{return false;}}
function enabled(n){return n.attrs.hidden===undefined&&n.attrs.disabled===undefined&&n.attrs['aria-disabled']!=='true'&&n.attrs['aria-hidden']!=='true'&&!/(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(n.attrs.style??'');}
function subtreeVisible(root,target){function visit(n,visible){const active=visible&&(n.attrs?enabled(n):true);if(n===target)return active;for(const c of n.children??[]){const found=visit(c,active);if(found!==null)return found;}return null;}return visit(root,true)===true;}
function config(root){
 const assignments=nodes(root,n=>n.tag==='script'&&!n.attrs.src).map(n=>(n.children??[]).map(c=>c.value??'').join('')).filter(s=>s.includes('window.LS_EVENT'));
 if(assignments.length!==1||assignments[0].length>8192)return null;
 // Accept only the reviewed inert scalar object; never evaluate publisher JS.
 const m=assignments[0].match(/^\s*window\.LS_EVENT\s*=\s*\{([\s\S]*)\};?\s*$/);if(!m)return null;
 const fields={};let rest=m[1];
 const scalar=/^\s*([A-Za-z][A-Za-z0-9_]*)\s*:\s*("(?:[^"\\]|\\.)*"|true|false|null|-?\d+(?:\.\d+)?)\s*(,|$)/;
 while(rest.trim()){const f=rest.match(scalar);if(!f||Object.hasOwn(fields,f[1]))return null;try{fields[f[1]]=JSON.parse(f[2]);}catch{return null;}rest=rest.slice(f[0].length);}
 return Number.isSafeInteger(fields.id)&&fields.id>0&&typeof fields.name==='string'&&fields.externalApply===false&&typeof fields.recaptchaKey==='string'&&fields.recaptchaKey.length>10&&fields.contactUrl==='https://localstalls.com/organisation/'+fields.id+'/contact'?fields:null;
}
export function localstallsEnquiryCandidate(source,report){
 try{
  if(source.reason||source.http_status!==200||source.requested_url!==source.url||!localstallsEventURL(source.url)||!source.html||report.profile!=='localstalls'||report.page_kind!=='event'||report.status==='quarantine'||report.reasons.some(r=>!removable.has(r))||!report.reasons.includes('open_vendor_application_not_proved')||['CLOSED','WATCH','OPEN_NOW'].includes(report.facts.application_state))return null;
  const f=report.facts;if(f.country!=='GB'||!f.event_start||f.event_end!==f.event_start)return null;
  const root=parseHtml(source.html),main=first(root,n=>n.tag==='main'),cfg=config(root);if(!main||!cfg||!sameText(cfg.name,f.event_name))return null;
  const dates=nodes(main,n=>n.attrs?.id==='ls-ev-dates',{scoped:true}),next=dates.length===1?nodes(dates[0],n=>hasClass(n,'ls-dchip')&&hasClass(n,'is-next'),{scoped:true}):[];
  const expected=new Intl.DateTimeFormat('en-GB',{timeZone:'UTC',weekday:'short',day:'numeric',month:'short'}).format(new Date(f.event_start+'T12:00:00Z')).replace(/,/g,'');
  if(next.length!==1||!sameText(text(first(next[0],n=>n.tag==='b')),expected))return null;
  const about=nodes(main,n=>hasClass(n,'ls-ev-sec')&&/^About this market$/i.test(text(first(n,x=>x.tag==='h2',{scoped:true}))),{scoped:true});
  if(about.length!==1||!subtreeVisible(main,about[0])||!/\b(?:stallholders?|traders?|vendors?|exhibitors?|trading|stall fee|stalls? available)\b/i.test(text(about[0]))||blocked.test(text(main)))return null;
  const sections=nodes(main,n=>n.attrs?.id==='ls-ev-contact',{scoped:true});if(sections.length!==1)return null;const section=sections[0];
  if(!subtreeVisible(main,section)||!/^Contact event manager$/i.test(text(first(section,n=>n.tag==='h2',{scoped:true}))))return null;
  const forms=nodes(root,n=>n.tag==='form'&&n.attrs.id==='ls-ev-form');if(forms.length!==1||!subtreeVisible(section,forms[0]))return null;const form=forms[0];
  const fields=[['input','contact-form-fullname','full_name','text'],['input','contact-form-email','email','email'],['textarea','contact-form-message','comment',null]];
  for(const [tag,id,name,type]of fields){const matches=nodes(root,n=>n.attrs?.id===id);if(matches.length!==1||matches[0].tag!==tag||matches[0].attrs.name!==name||type&&matches[0].attrs.type!==type||!subtreeVisible(form,matches[0]))return null;}
  const message=first(form,n=>n.attrs?.id==='contact-form-message');if(!/\bstall enquiries\b/i.test(message.attrs.placeholder??''))return null;
  const buttons=nodes(root,n=>n.attrs?.id==='contact-form-submit-btn');if(buttons.length!==1||buttons[0].tag!=='button'||buttons[0].attrs.type!=='submit'||!/^Send message$/i.test(text(buttons[0]))||!subtreeVisible(form,buttons[0]))return null;
  const thanks=nodes(form,n=>n.attrs?.id==='ls-ev-form-ok',{scoped:true});if(thanks.length!==1||!clean(text(thanks[0])).endsWith('to '+f.organiser+'.'))return null;
  const scripts=nodes(root,n=>n.tag==='script'&&n.attrs.src).map(n=>new URL(n.attrs.src,source.url).href);
  if(scripts.filter(u=>u===LOCALSTALLS_HANDLER.url).length!==1||!scripts.some(u=>{try{const x=new URL(u);return x.origin==='https://www.google.com'&&x.pathname==='/recaptcha/api.js'&&x.searchParams.get('render')===cfg.recaptchaKey;}catch{return false;}}))return null;
  const csrf=nodes(root,n=>n.tag==='meta'&&n.attrs.name==='csrf-token');if(csrf.length!==1||!csrf[0].attrs.content)return null;
  return {event_id:cfg.id,contact_url:cfg.contactUrl,landing_url:source.url,description:text(about[0]),organiser:f.organiser};
 }catch{return null;}
}
export function verifyLocalStallsEnquiry(document,report,{now}){
 const fail=reason=>({...report,status:report.status==='quarantine'?'quarantine':'partial',reasons:[...new Set([...report.reasons,reason])]});
 if(!Array.isArray(document.documents)||document.documents.length!==3)return fail('localstalls_enquiry_bundle_invalid');
 const [primary,handler,endpoint]=document.documents,source=primary.document_kind==='uk_event_geography_bundle'?primary.documents[0]:primary,route=localstallsEnquiryCandidate(source,report),clocks=document.documents.map(d=>Date.parse(d.fetched_at));
 if(!route)return fail('localstalls_event_trader_enquiry_not_proved');
 if(clocks.some(t=>!Number.isFinite(t)||t>Date.parse(now))||document.url!==primary.url||document.requested_url!==primary.requested_url||document.fetched_at!==new Date(Math.min(...clocks)).toISOString())return fail('localstalls_enquiry_custody_mismatch');
 if(handler.reason||handler.url!==LOCALSTALLS_HANDLER.url||handler.requested_url!==handler.url||handler.http_status!==200||!/(?:application|text)\/javascript/.test(handler.content_type??'')||typeof handler.javascript!=='string')return fail('localstalls_handler_required');
 const bytes=new TextEncoder().encode(handler.javascript);if(bytes.length!==LOCALSTALLS_HANDLER.bytes||rawSHA256(bytes)!==LOCALSTALLS_HANDLER.sha256)return fail('localstalls_handler_changed_requires_review');
 if(endpoint.reason||endpoint.url!==route.contact_url||endpoint.requested_url!==endpoint.url||endpoint.http_status!==405||endpoint.allow?.trim().toUpperCase()!=='POST')return fail('localstalls_contact_endpoint_not_proved');
 const usable_route={policy:USABLE_ROUTE_POLICY,type:'trader_enquiry',landing_url:source.url,destination:route.contact_url,event_source_url:source.url,organiser_url:source.url,organiser_controlled:true,prospective_trader:true,current:true,requires_browser_javascript:true,requires_recaptcha:true,submission_tested:false};
 return {...report,adapter_version:LOCALSTALLS_ENQUIRY_VERSION,status:'verified',reasons:[],checked_at:document.fetched_at,facts:{...report.facts,application_url:source.url,application_state:'ENQUIRY_AVAILABLE'},usable_route,application_scope_proof:{trader_application:true},evidence:[...report.evidence,{kind:'localstalls_event_manager_enquiry',source_url:source.url,excerpt:stableJson({event_id:route.event_id,organiser:route.organiser,description:route.description,contact_endpoint:route.contact_url,handler_sha256:LOCALSTALLS_HANDLER.sha256,endpoint_get_status:405,endpoint_allow:'POST',submission_tested:false})}]};
}
async function auxiliary(url,{fetcher,now,script}){
 const meta={requested_url:url,url,fetched_at:now,document_kind:script?'localstalls_enquiry_handler':'localstalls_contact_method_receipt'};
 try{const r=await fetcher(url,{redirect:'manual',headers:{Accept:script?'application/javascript':'application/json','User-Agent':'FindPitches-V3-Shadow-Verification/1.0'},signal:AbortSignal.timeout(12000)}),content_type=r.headers.get('content-type')??'';
  if(!script){await r.body?.cancel();return {...meta,http_status:r.status,allow:r.headers.get('allow'),content_type};}
  if(r.status!==200||!/(?:application|text)\/javascript/.test(content_type)){await r.body?.cancel();return {...meta,http_status:r.status,reason:'localstalls_handler_changed_requires_review'};}
  const reader=r.body.getReader(),parts=[];let size=0;try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>65536){await reader.cancel();return {...meta,reason:'localstalls_handler_size_limit'};}parts.push(value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let at=0;for(const p of parts){bytes.set(p,at);at+=p.length;}const javascript=new TextDecoder().decode(bytes);return {...meta,http_status:200,content_type,javascript,content_hash:rawSHA256(bytes)};
 }catch{return {...meta,reason:'localstalls_enquiry_auxiliary_fetch_failed'};}
}
export async function fetchLocalStallsEnquiry(primary,report,{fetcher,now}){
 const source=primary.document_kind==='uk_event_geography_bundle'?primary.documents[0]:primary,route=localstallsEnquiryCandidate(source,report);if(!route)return primary;
 const handler=await auxiliary(LOCALSTALLS_HANDLER.url,{fetcher,now,script:true}),endpoint=await auxiliary(route.contact_url,{fetcher,now,script:false}),documents=[primary,handler,endpoint];
 return {document_kind:'localstalls_enquiry_bundle',requested_url:primary.requested_url,url:primary.url,fetched_at:new Date(Math.min(...documents.map(d=>Date.parse(d.fetched_at)))).toISOString(),content_hash:await hash(documents),documents};
}
