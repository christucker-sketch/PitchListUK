import {parseHtml,nodes,first,text} from './source-dom.mjs';
import {safeSourceUrl} from './source-document.mjs';
import {stableJson} from './contract.mjs';
export const USABLE_ROUTE_POLICY='global-prospective-trader-route-v1';
export const USABLE_ROUTE_TYPES=['event_application','organiser_intake','standing_registration','trader_enquiry','trader_email','vendor_portal_registration'];
const trader=/\b(?:vendors?|traders?|stallholders?|exhibitors?|artisans?|crafters?)\b/i;
const purpose=/\b(?:applications?|apply|register|registration|enquir(?:y|ies)|intake|become|book a stall|trade with us|contact)\b/i;
const restriction=/\b(?:closed|sold out|fully booked|waitlist|waiting list|invitation only|invite only|members? only|(?:existing|returning|approved) vendors? only|newsletter|volunteers?|performers?|sponsors? only|charit(?:y|ies) only|non[ -]?profits? only)\b/i;
const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
const email=v=>/^mailto:[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(v??'')?v:null;
const url=(v,base)=>{try{const u=new URL(v,base);u.hash='';return safeSourceUrl(u.href)?u.href:null;}catch{return null;}};
const origin=v=>{try{return new URL(v).origin.replace('://www.','://');}catch{return null;}};
function main(root){return first(root,n=>n.tag==='main'||n.tag==='article');}
function sourceEvent(report){try{return JSON.parse(report.evidence?.find(e=>e.kind==='event_json_ld')?.excerpt??'null');}catch{return null;}}
function owner(report,document){
 const event=sourceEvent(report),ownerURL=url(event?.organizer?.url??event?.organiser?.url,document.url);
 return ownerURL&&origin(ownerURL)===origin(document.url)?ownerURL:null;
}
function blocks(root){
 return nodes(root,n=>['section','article','div','p'].includes(n.tag),{scoped:true}).filter(n=>{const s=text(n);return s.length<14000&&trader.test(s)&&purpose.test(s)&&!restriction.test(s);});
}
function formProof(block,document){
 const forms=nodes(block,n=>n.tag==='form',{scoped:true}).filter(f=>{
  if(f.attrs.method?.toLowerCase()!=='post'||nodes(f,n=>n.tag==='fieldset'&&n.attrs.disabled!==undefined).length)return false;
  const action=url(f.attrs.action,document.url);if(!action||origin(action)!==origin(document.url)||/\/(?:login|sign-in|subscribe|newsletter|ticket)(?:\/|$)/i.test(new URL(action).pathname))return false;
  const fields=nodes(f,n=>['input','select','textarea'].includes(n.tag)&&n.attrs.disabled===undefined&&n.attrs.type!=='hidden'&&n.attrs.name,{scoped:true});
  const submit=nodes(f,n=>n.attrs?.disabled===undefined&&(n.tag==='button'&&(!n.attrs.type||n.attrs.type==='submit')||n.tag==='input'&&n.attrs.type==='submit'),{scoped:true});
  return fields.length>=2&&fields.some(n=>/(?:business|product|stall|vendor|trader|exhibitor)/i.test(n.attrs.name))&&submit.some(n=>/submit|send|register|apply|create (?:an? )?account/i.test(n.attrs.value??text(n)));
 });
 return forms.length===1;
}
const removable=new Set(['vendor_application_not_proved','open_vendor_application_not_proved','event_application_route_missing_or_ambiguous']);
export function usableRouteEligible(report){
 const r=report?.usable_route,f=report?.facts??{};
 return Boolean(r?.policy===USABLE_ROUTE_POLICY&&USABLE_ROUTE_TYPES.includes(r.type)&&r.current===true&&r.organiser_controlled===true&&r.prospective_trader===true&&safeSourceUrl(r.landing_url)&&safeSourceUrl(r.event_source_url)&&r.landing_url===f.application_url&&['OPEN_NOW','ROLLING','ENQUIRY_AVAILABLE'].includes(f.application_state)&&(!r.destination||safeSourceUrl(r.destination)||r.type==='trader_email'&&email(r.destination)));
}
export function applyEventenyRegistration(document,report,{now}){
 if(report.profile!=='eventeny'||report.page_kind!=='event'||report.reasons.some(r=>r!=='open_vendor_application_not_proved')||!document.html)return report;
 try{
  const source=new URL(document.url),id=source.searchParams.get('id');
  if(source.hostname!=='www.eventeny.com'||source.pathname!=='/events/vendor/'||!/^\d+$/.test(id??''))return report;
  const offers=JSON.parse(report.evidence.find(e=>e.kind==='vendor_id_scoped_offers')?.excerpt??'[]');
  if(!offers.length||!offers.every(o=>new URL(o.url).searchParams.get('id')===id&&String(o.availability).split('/').at(-1)==='InStock'&&Date.parse(o.availabilityStarts)<=Date.parse(now)&&Date.parse(o.availabilityEnds)>Date.parse(now)))return report;
  const root=parseHtml(document.html),scope=first(root,n=>n.tag==='main'||n.tag==='body'),controls=nodes(scope,n=>n.tag==='a'&&/^Start Registration$/i.test(text(n))&&n.attrs.disabled===undefined&&n.attrs['aria-disabled']!=='true',{scoped:true});
  const routes=[...new Set(controls.map(a=>url(a.attrs.href,document.url)).filter(u=>{try{const target=new URL(u);return target.origin===source.origin&&target.pathname===source.pathname&&target.searchParams.get('id')===id&&target.searchParams.get('state')==='biz_pro'&&[...target.searchParams.keys()].every(k=>['id','state'].includes(k));}catch{return false;}}))];
  if(routes.length!==1)return report;
  return {...report,status:'verified',reasons:[],facts:{...report.facts,application_state:'OPEN_NOW'},usable_route:{policy:USABLE_ROUTE_POLICY,type:'vendor_portal_registration',landing_url:document.url,destination:routes[0],event_source_url:report.event_source_url,organiser_url:document.url,organiser_controlled:true,prospective_trader:true,current:true},evidence:[...report.evidence,{kind:'eventeny_prospective_registration',source_url:document.url,excerpt:stableJson({vendor_id:id,control:'Start Registration',route:routes[0],active_offer_window:true})}]};
 }catch{return report;}
}
export function eventenyContactRoute(document,report,{now}){
 if(report.profile!=='eventeny'||report.page_kind!=='event'||report.reasons.some(r=>r!=='open_vendor_application_not_proved')||!document.html)return null;
 try{
  const source=new URL(document.url),id=source.searchParams.get('id'),parent=new URL(report.event_source_url).pathname.match(/-(\d+)\/?$/)?.[1];
  if(source.origin!=='https://www.eventeny.com'||source.pathname!=='/events/vendor/'||!/^\d+$/.test(id??'')||!parent)return null;
  const offers=JSON.parse(report.evidence.find(e=>e.kind==='vendor_id_scoped_offers')?.excerpt??'[]');
  if(!offers.length||!offers.every(o=>new URL(o.url).searchParams.get('id')===id&&String(o.availability).split('/').at(-1)==='InStock'&&Date.parse(o.availabilityStarts)<=Date.parse(now)&&Date.parse(o.availabilityEnds)>Date.parse(now)))return null;
  const root=parseHtml(document.html),body=first(root,n=>n.tag==='main'||n.tag==='body');
  const links=nodes(body,n=>n.tag==='a'&&/^(?:Contact Organizer|Have questions\? Contact event organizer)$/i.test(text(n))&&n.attrs.disabled===undefined,{scoped:true}).map(n=>url(n.attrs.href,document.url)).filter(v=>{try{const u=new URL(v);return u.origin===source.origin&&u.pathname==='/inbox/conversation/'&&u.searchParams.get('event')===parent&&/^\d+$/.test(u.searchParams.get('to')??'')&&u.searchParams.get('type')==='2'&&[...u.searchParams.keys()].every(k=>['in','to','event','type'].includes(k));}catch{return false;}});
  const unique=[...new Set(links)];return unique.length===1?unique[0]:null;
 }catch{return null;}
}
export function eventenySignupRoute(login,contact){
 try{
  if(login.reason||login.http_status!==200||login.requested_url!==contact||new URL(login.url).origin!=='https://www.eventeny.com'||new URL(login.url).pathname!=='/users/')return null;
  const link=nodes(parseHtml(login.html),n=>n.tag==='a'&&/^Sign up for free$/i.test(text(n)),{scoped:true}).map(n=>url(n.attrs.href,login.url));
  const target=new URL(contact),matches=[...new Set(link)].filter(v=>{try{const u=new URL(v),ref=new URL(u.searchParams.get('ref'),'https://www.eventeny.com');return u.origin===target.origin&&u.pathname==='/users/signup/'&&ref.pathname==='/inbox/'&&ref.searchParams.get('to')===target.searchParams.get('to')&&u.searchParams.get('event')===target.searchParams.get('event')&&u.searchParams.get('type')==='2';}catch{return false;}});return matches.length===1?matches[0]:null;
 }catch{return null;}
}
export function applyEventenyContact(document,report,documents,{now}){
 const contact=eventenyContactRoute(document,report,{now});if(!contact)return report;
 const login=documents.find(d=>d.requested_url===contact),signupURL=login?eventenySignupRoute(login,contact):null,signup=documents.find(d=>d.requested_url===signupURL);
 if(!signupURL||!signup||signup.reason||signup.http_status!==200||signup.url!==signupURL||!signup.html)return report;
 const root=parseHtml(signup.html),forms=nodes(root,n=>n.tag==='form'&&n.attrs.id==='signup-email-form'&&n.attrs.method?.toLowerCase()==='post',{scoped:true});
 if(forms.length!==1)return report;const form=forms[0],fields=nodes(form,n=>n.tag==='input'&&n.attrs.disabled===undefined,{scoped:true});
 if(!['user[first_name]','user[last_name]','user[email]','user[password]'].every(name=>fields.some(n=>n.attrs.name===name))||!nodes(form,n=>['button','button-element'].includes(n.tag)&&n.attrs.type==='submit'&&n.attrs.disabled===undefined&&/^Create account$/i.test(text(n)),{scoped:true}).length||restriction.test(text(form)))return report;
 return {...report,status:'verified',reasons:[],facts:{...report.facts,application_state:'ENQUIRY_AVAILABLE'},usable_route:{policy:USABLE_ROUTE_POLICY,type:'trader_enquiry',landing_url:document.url,destination:contact,event_source_url:report.event_source_url,organiser_url:document.url,organiser_controlled:true,prospective_trader:true,current:true,requires_account:true,account_provider:'Eventeny'},evidence:[...report.evidence,{kind:'eventeny_vendor_organiser_enquiry',source_url:document.url,excerpt:stableJson({vendor_contact:contact,parent_event_bound:true,prospective_signup:signupURL,signup_form:'signup-email-form',create_account_control:true})}]};
}
export function discoverUsableRoutes(document,report){
 if(document.reason||!document.html||report.page_kind!=='event'||!owner(report,document)||!['generic','official_vendor'].includes(report.profile)||report.reasons.some(r=>!removable.has(r)))return [];
 const root=main(parseHtml(document.html));if(!root)return [];
 const found=new Map();for(const block of blocks(root))for(const a of nodes(block,n=>n.tag==='a'&&n.attrs.href,{scoped:true})){
  const route=url(a.attrs.href,document.url);if(!route||route===document.url||origin(route)!==origin(document.url)||!purpose.test(text(a))||!trader.test(text(a))&&!trader.test(text(first(block,n=>/^h[1-4]$/.test(n.tag),{scoped:true}))))continue;
  if(/\/(?:login|sign-in|newsletter|subscribe|tickets?|directory)(?:\/|$)/i.test(new URL(route).pathname))continue;
  found.set(route,{url:route,invitation:text(block).slice(0,14000)});
 }return [...found.values()].slice(0,2);
}
export function applyUsableRoute(document,report,{routeDocuments=[],now}){
 if(report.page_kind!=='event'||!document.html||!owner(report,document)||!['generic','official_vendor'].includes(report.profile)||report.reasons.some(r=>!removable.has(r)))return report;
 const eventYear=report.facts.event_start?.slice(0,4),currentYear=now.slice(0,4),routeLinks=discoverUsableRoutes(document,report),options=[];
 for(const d of [document,...routeDocuments]){
  if(d.reason||!d.html||d.requested_url!==d.url||origin(d.url)!==origin(document.url)||d!==document&&!routeLinks.some(l=>l.url===d.url)||!Number.isFinite(Date.parse(d.fetched_at))||Date.parse(d.fetched_at)>Date.parse(now))continue;
  const content=main(parseHtml(d.html));if(!content||restriction.test(text(content)))continue;
  if(nodes(content,n=>/^h[1-6]$/.test(n.tag),{scoped:true}).some(n=>trader.test(text(n))&&purpose.test(text(n))&&[...text(n).matchAll(/\b(20\d{2})\b/g)].some(m=>m[1]!==eventYear&&m[1]!==currentYear)))continue;
  const title=text(first(content,n=>n.tag==='h1',{scoped:true}));
  if([...title.matchAll(/\b(20\d{2})\b/g)].some(m=>m[1]!==eventYear&&m[1]!==currentYear))continue;
  for(const b of blocks(content)){
   const s=text(b),heading=text(first(b,n=>/^h[1-4]$/.test(n.tag)&&trader.test(text(n))&&purpose.test(text(n)),{scoped:true}));
   if([...s.matchAll(/\b(20\d{2})\b/g)].some(m=>m[1]!==eventYear&&m[1]!==currentYear))continue;
   const enquiry=/\b(?:enquir(?:y|ies)|contact)\b/i.test(heading||s),registration=/\b(?:register|registration|intake|join)\b/i.test(heading||s);
   if(formProof(b,d))options.push({type:enquiry?'trader_enquiry':registration?/\baccount\b/i.test(s)?'vendor_portal_registration':'standing_registration':'organiser_intake',landing_url:d.url,excerpt:s});
   for(const a of nodes(b,n=>n.tag==='a', {scoped:true})){
    const address=email(a.attrs.href);if(address&&/\b(?:vendor|trader|stallholder|exhibitor)\b[^.!?]{0,120}\b(?:email|contact|enquir|apply)|\b(?:email|contact)\b[^.!?]{0,120}\b(?:vendor|trader|stallholder|exhibitor)\b/i.test(s))options.push({type:'trader_email',landing_url:d.url,destination:address,excerpt:s});
   }
  }
 }
 const distinct=new Map(options.map(r=>[stableJson([r.type,r.landing_url,r.destination??null]),r]));
 if(distinct.size!==1)return report;const route=[...distinct.values()][0];
 // Existing exact OPEN proof is retained; a standing intake/enquiry is truthful
 // actionable enquiry, never a manufactured exact-event OPEN application.
 const originalState=report.facts.application_state;
 if(['CLOSED','WATCH'].includes(originalState))return report;
 const facts={...report.facts,application_url:route.landing_url,application_state:report.status==='verified'&&originalState==='OPEN_NOW'?'OPEN_NOW':'ENQUIRY_AVAILABLE'};
 const usable_route={policy:USABLE_ROUTE_POLICY,type:report.status==='verified'&&originalState==='OPEN_NOW'?'event_application':route.type,landing_url:route.landing_url,...route.destination?{destination:route.destination}:{},event_source_url:document.url,organiser_url:owner(report,document),organiser_controlled:true,prospective_trader:true,current:true};
 return {...report,facts,usable_route,status:'verified',reasons:[],application_scope_proof:{...report.application_scope_proof,trader_application:true},evidence:[...report.evidence,{kind:'organiser_prospective_trader_route',source_url:route.landing_url,excerpt:route.excerpt.slice(0,14000)},{kind:'global_usable_route_policy',source_url:document.url,excerpt:stableJson(usable_route)}]};
}
