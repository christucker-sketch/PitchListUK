// Discovery cards do not prove an opportunity. One dated exhibitor source,
// its own published trader form and any mandatory application dependency must
// agree. Original HTML, including stale headings, remains in every proof bundle.
import {hash,stableJson} from './contract.mjs';
import {parseHtml,nodes,first,text} from './source-dom.mjs';
import {fetchSourceDocument} from './source-document.mjs';
import {ukDate} from './uk-sources.mjs';
import {fetchUKPostcode,postcodeProof,ukPostcode} from './uk-event-geography.mjs';

export const VEGAN_ORIGIN='https://www.veganeventsuk.co.uk',VEGAN_HOME=VEGAN_ORIGIN+'/',VEGAN_TRADE=VEGAN_ORIGIN+'/trade';
export const VEGAN_ADAPTER_VERSION='vegan-events-dated-trader-form-v1';
const MAX_GROUPS=50,MAX_VISITS=120,OFFICIAL_BYTES=2097152;
const clean=v=>String(v??'').replace(/[\u200b-\u200d\ufeff]/g,'').replace(/\s+/g,' ').trim();
const words=v=>clean(v).toLowerCase().replace(/\b20\d{2}\b/g,'').replace(/[^a-z0-9]+/g,' ').trim().split(' ').filter(Boolean);
const normalized=v=>words(v).join(' ');
const sameURL=(a,b)=>{try{return new URL(a).href===new URL(b).href;}catch{return false;}};
export function veganEventURL(value){try{const u=new URL(value);return u.origin===VEGAN_ORIGIN&&!u.search&&!u.hash&&!u.username&&!u.password&&/^\/exhibitor\/[a-z0-9-]+$/.test(u.pathname);}catch{return false;}}
const official=u=>{try{return new URL(u).origin===VEGAN_ORIGIN;}catch{return false;}};
function formID(url){try{const u=new URL(url);if(u.origin!=='https://docs.google.com'||u.username||u.password||u.hash||[...u.searchParams.keys()].some(k=>k!=='usp'))return null;return u.pathname.match(/^\/forms\/d\/e\/([a-zA-Z0-9_-]{20,100})\/viewform$/)?.[1]??null;}catch{return null;}}
const applicationURL=u=>Boolean(formID(u))||/^https:\/\/forms\.gle\/[A-Za-z0-9]{10,80}$/.test(u??'');
const identifier=(url,date)=>'vegan-events:'+new URL(url).pathname.split('/').at(-1)+':'+date;
function dates(value){return [...new Set([...clean(value).matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d{2})\b/gi)].map(m=>ukDate(m[1]+' '+m[2],m[3])).filter(Boolean))];}
function corroborates(a,b){const identity=v=>words(v).filter(w=>!/^\d+(?:st|nd|rd|th)?$/.test(w)&&!['january','february','march','april','may','june','july','august','september','october','november','december','monday','tuesday','wednesday','thursday','friday','saturday','sunday'].includes(w)),x=identity(a),y=new Set(identity(b)),distinct=x.filter(w=>!['vegan','festival','events','event','trade','application','stallholder'].includes(w));return distinct.length>0&&distinct.every(w=>y.has(w))&&x.filter(w=>y.has(w)).length>=Math.min(3,x.length);}
function rootFor(doc,url){if(doc?.reason||doc?.http_status!==200||!sameURL(doc.requested_url,url)||!sameURL(doc.url,url)||typeof doc.html!=='string')throw Error('vegan_source_document_binding_required');return parseHtml(doc.html,{maxBytes:official(url)?OFFICIAL_BYTES:1048576});}
function parentMap(root){const map=new WeakMap();function walk(n){for(const c of n.children??[]){map.set(c,n);walk(c);}}walk(root);return map;}
function scopedCard(anchor,parents,acceptable){let node=parents.get(anchor);for(let i=0;node&&i<30;i++,node=parents.get(node))if(acceptable(node))return node;return null;}
function headings(root){return nodes(root,n=>/^h[1-3]$/.test(n.tag),{scoped:true}).map(n=>clean(text(n)));}
export function parseVeganTrade(document){
 const root=rootFor(document,VEGAN_TRADE),parents=parentMap(root),rows=[];
 if(!headings(root).includes('Trade')||!headings(root).includes('Exhibitor Applications')||!headings(root).includes('Vegan Events UK'))throw Error('vegan_official_trade_programme_required');
 for(const a of nodes(root,n=>n.tag==='a'&&/^Book A Stall$/i.test(clean(text(n)))&&applicationURL(n.attrs.href),{scoped:true})){
  const card=scopedCard(a,parents,n=>nodes(n,x=>/^h[1-3]$/.test(x.tag),{scoped:true}).length===1&&nodes(n,x=>x.tag==='a'&&/^Book A Stall$/i.test(clean(text(x))),{scoped:true}).length===1);
  if(!card||text(card).length>2500)continue;const title=clean(text(first(card,n=>/^h[1-3]$/.test(n.tag),{scoped:true}))),ds=dates(title),years=[...new Set(title.match(/\b20\d{2}\b/g)??[])];
  rows.push({title,date:ds.length===1?ds[0]:null,year:years.length===1?years[0]:null,application_url:a.attrs.href,reason:ds.length>1?'vegan_ambiguous_trade_card_dates':null});
 }
 if(!rows.length||rows.length>MAX_GROUPS)throw Error('vegan_bounded_trade_cards_required');return {rows,generic_headings:headings(root).filter(s=>/^20\d{2} Events$/i.test(s))};
}
export function parseVeganProgramme(home,trade){
 const root=rootFor(home,VEGAN_HOME),parents=parentMap(root),programme=parseVeganTrade(trade),rows=[];
 for(const a of nodes(root,n=>n.tag==='a'&&clean(text(n))==='Exhibitor'&&veganEventURL(n.attrs.href),{scoped:true})){
  const card=scopedCard(a,parents,n=>nodes(n,x=>/^h[1-3]$/.test(x.tag),{scoped:true}).length===1&&nodes(n,x=>x.tag==='a'&&clean(text(x))==='Exhibitor',{scoped:true}).length===1&&nodes(n,x=>x.tag==='a'&&clean(text(x))==='Visitor',{scoped:true}).length===1);
  if(!card)continue;const title=clean(text(first(card,n=>/^h[1-3]$/.test(n.tag),{scoped:true}))),ds=dates(text(card));if(ds.length!==1)continue;
  const named=programme.rows.filter(r=>!r.reason&&(corroborates(title,r.title)||corroborates(r.title,title))),dated=named.filter(r=>r.date===ds[0]),matches=dated.length?dated:named.filter(r=>!r.date&&r.year===ds[0].slice(0,4));
  rows.push({title,date:ds[0],url:a.attrs.href,source_identifier:identifier(a.attrs.href,ds[0]),application_url:matches.length===1?matches[0].application_url:null,reason:matches.length===1?null:'vegan_exact_trade_card_binding_missing'});
 }
 if(!rows.length||rows.length>MAX_GROUPS)throw Error('vegan_bounded_dated_event_cards_required');
 const seen=new Set();for(const row of rows){if(seen.has(row.source_identifier))row.reason='vegan_duplicate_programme_identity';seen.add(row.source_identifier);}return {rows,generic_headings:programme.generic_headings};
}
export function parseVeganEvent(document){
 if(!veganEventURL(document?.url))throw Error('vegan_specific_exhibitor_route_required');const root=rootFor(document,document.url),h=nodes(root,n=>n.tag==='h1',{scoped:true}),body=text(root);
 if(h.length!==1||!headings(root).includes('Exhibitor'))throw Error('vegan_exact_exhibitor_identity_required');const title=clean(text(h[0])),dateRows=nodes(root,n=>n.tag==='p'&&/^\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+\s+20\d{2}$/.test(clean(text(n))),{scoped:true}),ds=[...new Set(dateRows.flatMap(n=>dates(text(n))))];
 if(ds.length!==1)throw Error('vegan_explicit_single_event_date_required');const titleYears=[...new Set(title.match(/\b20\d{2}\b/g)??[])];if(titleYears.length>1||titleYears.length===1&&titleYears[0]!==ds[0].slice(0,4))throw Error('contradictory_vegan_event_edition');
 const addresses=nodes(root,n=>n.tag==='p',{scoped:true}).map(n=>clean(text(n))).filter(s=>s.length<300&&/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}(?:,\s*(?:UK|United Kingdom))?$/.test(s)&&!/^\d+\+/.test(s));
 const codes=[...new Set(addresses.flatMap(s=>[...s.matchAll(/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/g)].map(m=>ukPostcode(m[0]))))];if(addresses.length!==1||codes.length!==1)throw Error('vegan_event_scoped_postal_address_required');
 const country=/,\s*(?:UK|United Kingdom)$/.test(addresses[0])?'GB':null;
 if(/\b(?:event|festival|venue) country\s*:\s*(?:United States|USA|Canada|Australia|New Zealand|France|Germany)\b|\b(?:event|festival) (?:is|will be held) in (?:United States|USA|Canada|Australia|New Zealand|France|Germany)\b/i.test(body))throw Error('contradictory_vegan_event_country');
 if(/\b(?:event|festival) (?:is |has been )?(?:cancelled|canceled|postponed)\b|\b(?:all |trader |exhibitor )?(?:applications?|bookings?|stalls?) (?:are |is )?(?:closed|sold out|fully booked)\b/i.test(body))throw Error('vegan_event_or_applications_closed');
 return {title,date:ds[0],url:document.url,source_identifier:identifier(document.url,ds[0]),address:addresses[0],postcode:codes[0],country};
}
function modelFor(root){const scripts=nodes(root,n=>n.tag==='script'&&/^var FB_PUBLIC_LOAD_DATA_\s*=/.test(text(n,{scoped:false})));if(scripts.length!==1)throw Error('vegan_published_form_schema_required');
 const raw=text(scripts[0],{scoped:false}).replace(/^var FB_PUBLIC_LOAD_DATA_\s*=\s*/,'').replace(/;\s*$/,'');try{const m=JSON.parse(raw);if(!Array.isArray(m)||!Array.isArray(m[1])||!Array.isArray(m[1][1])||m[1][1].length>100)throw Error();return m;}catch{throw Error('vegan_published_form_schema_required');}}
function questionDescriptor(value){
 if(typeof value!=='string'||!value.startsWith('%.@.[')||value.length>65536)throw Error('vegan_bound_business_product_controls_required');const raw=value.slice(4);let depth=0,quoted=false,escaped=false;
 for(let i=0;i<raw.length;i++){const c=raw[i];if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue;}if(c==='"')quoted=true;else if(c==='[')depth++;else if(c===']'&&--depth===0){try{return JSON.parse(raw.slice(0,i+1));}catch{break;}}}throw Error('vegan_bound_business_product_controls_required');
}
function blocked(root,node,{ignoreSSR=false}={}){return nodes(root,n=>n.start<=node.start&&n.end>=node.end&&(n.attrs?.hidden!==undefined||n.attrs?.['aria-hidden']==='true'||n.tag==='fieldset'&&n.attrs.disabled!==undefined||/display\s*:\s*none|visibility\s*:\s*hidden/i.test(n.attrs?.style??'')||!ignoreSSR&&(n.attrs?.disabled!==undefined||n.attrs?.['aria-disabled']==='true'))).length>0;}
export function parseVeganForm(document,expected){
 const id=formID(document?.url);if(!id||!applicationURL(document.requested_url)||formID(document.requested_url)&&formID(document.requested_url)!==id||document.reason||document.http_status!==200)throw Error('vegan_public_specific_trader_form_required');const root=parseHtml(document.html),model=modelFor(root),forms=nodes(root,n=>n.tag==='form',{scoped:true}),form=forms[0],description=model[1][0],title=clean(model[1][8]),questions=model[1][1];
 if(forms.length!==1||form.attrs.id!=='mG61Hd'||form.attrs.method?.toLowerCase()!=='post'||form.attrs.action!=='https://docs.google.com/forms/d/e/'+id+'/formResponse'||!form.attrs.jsmodel?.split(' ').includes('TOfxwf')||formID(form.attrs['data-clean-viewform-url'])!==id||model[14]!=='e/'+id||blocked(root,form))throw Error('vegan_bound_public_form_required');
 if(typeof description!=='string'||!/(?:Trade|Stallholder) Application$/i.test(title)||!(corroborates(expected.title,title)||corroborates(title,expected.title)))throw Error('contradictory_vegan_form_event_identity');
 const timing=description.match(/^Event Timing:\s*([^\n]+)/),ds=timing?dates(timing[1]):[];if(ds.length!==1||ds[0]!==expected.date)throw Error('contradictory_vegan_application_edition');
 const weekdays=timing[1].match(/\b(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\b/i);if(weekdays&&weekdays[0].toLowerCase()!==['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][new Date(ds[0]+'T12:00:00Z').getUTCDay()])throw Error('contradictory_vegan_application_weekday');
 const address=description.match(/(?:^|\n)Event Address:\s*([^\n]+)/)?.[1],codes=[...String(address??'').matchAll(/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/g)].map(m=>ukPostcode(m[0]));
 if(/,\s*(?:United States|USA|Canada|Australia|New Zealand|France|Germany)\s*$/.test(address??''))throw Error('contradictory_vegan_application_country');
 const streetWords=words(expected.address).filter(w=>!['uk','united','kingdom'].includes(w)&&!/^\d[a-z0-9]*$/.test(w));if(codes.length!==1||codes[0]!==expected.postcode||!streetWords.every(w=>words(address).includes(w)))throw Error('contradictory_vegan_application_venue');
 const body=text(form);if(/\b(?:no longer accepting|not accepting|closed for (?:applications|bookings)|not accepting responses|fully booked|sold out|wait(?:ing)?\s*list only|(?:caterer|business|charity|trader|exhibitor) (?:stalls?|spaces?|applications?) (?:are |is )?(?:closed|full|sold out))\b/i.test(body+' '+description))throw Error('vegan_application_capacity_or_category_hold');
 const submits=nodes(form,n=>n.attrs?.role==='button'&&n.attrs['aria-label']==='Submit'&&clean(text(n))==='Submit'&&n.attrs.tabindex==='0'&&n.attrs.jscontroller==='VXdfxd'&&n.attrs.jsaction?.includes('click:cOuCgd'),{scoped:true});if(submits.length!==1||blocked(root,submits[0]))throw Error('vegan_enabled_form_submit_required');
 const required=[/^Which festival are you applying for\?$/i,/^Your Email$/i,/^Tell us more about your business \/ charity\?$/i,/^I would like to book the following stall type$/i,/^Is your business \/ charity 100% vegan\?$/i];
 const bound=[];for(const label of required){const qs=questions.filter(q=>Array.isArray(q)&&label.test(clean(q[1])));if(qs.length!==1||!Array.isArray(qs[0][4])||qs[0][4].length!==1||qs[0][4][0][2]!==1)throw Error('vegan_bound_business_product_controls_required');const q=qs[0],matches=nodes(form,n=>n.attrs?.jsmodel==='CP1oW'&&n.attrs['data-params']?.startsWith('%.@.['+q[0]+','),{scoped:true});
  if(matches.length!==1||blocked(root,matches[0],{ignoreSSR:true})||!text(matches[0]).startsWith(clean(q[1])))throw Error('vegan_bound_business_product_controls_required');const render=matches[0],descriptor=questionDescriptor(render.attrs['data-params']);
  if(descriptor[0]!==q[0]||descriptor[1]!==q[1]||descriptor[3]!==q[3]||descriptor[4]?.[0]?.[0]!==q[4][0][0]||![true,1].includes(descriptor[4]?.[0]?.[2]))throw Error('vegan_bound_business_product_controls_required');
  const headings=nodes(render,n=>n.attrs?.role==='heading'),fields=nodes(render,n=>q[3]===0?n.tag==='input'&&n.attrs.type==='text':q[3]===1?n.tag==='textarea':n.attrs?.role==='radio');
  if(headings.length!==1||!headings[0].attrs.id||!fields.length||fields.some(n=>n.attrs.readonly!==undefined||blocked(root,n,{ignoreSSR:true})))throw Error('vegan_bound_business_product_controls_required');
  if(q[3]!==2&&(fields.length!==1||!fields[0].attrs['aria-labelledby']?.split(' ').includes(headings[0].attrs.id)))throw Error('vegan_bound_business_product_controls_required');
  if(q[3]===2){const options=q[4][0][1]?.map(o=>o[0])??[];if(!options.length||!options.every(v=>fields.filter(n=>n.attrs['data-value']===v&&n.attrs['aria-label']===v).length===1))throw Error('vegan_bound_business_product_controls_required');if(/stall type/.test(q[1])&&!['Caterer','Business','Charity'].every(v=>options.includes(v)))throw Error('vegan_trader_stall_choices_required');}
  bound.push({question_id:q[0],entry_id:q[4][0][0],label:q[1],question_type:q[3]});
 }
 // Google deliberately disables native SSR inputs until its published client
 // hydrates them. Retain that observation; bound question schemas and enabled
 // Submit are the client proof. Mixed selectively disabled controls still hold.
 const controls=nodes(form,n=>['input','textarea'].includes(n.tag)&&n.attrs.type!=='hidden',{scoped:true}),disabled=controls.filter(n=>n.attrs.disabled!==undefined||n.attrs['aria-disabled']==='true').length;
 if(disabled&&disabled!==controls.length)throw Error('vegan_selectively_disabled_trader_control');
 const uploadQuestions=questions.filter(q=>typeof q?.[1]==='string'&&/booking is not complete until you upload your documents/i.test(q[1])),uploadLinks=[...new Set(uploadQuestions.flatMap(q=>[...q[1].matchAll(/https:\/\/docs\.google\.com\/forms\/d\/e\/[A-Za-z0-9_-]+\/viewform(?:\?usp=[A-Za-z-]+)?/g)].map(m=>m[0])))];
 if(uploadQuestions.length&&uploadLinks.length!==1)throw Error('vegan_mandatory_document_route_binding_required');
 return {title,date:ds[0],address,form_id:id,application_url:document.url,questions:bound,initial_native_controls_disabled:disabled>0,submit_enabled:true,mandatory_upload_url:uploadLinks[0]??null,application_audience:'100_percent_vegan_traders',booking_confirmation:'Subject to organiser review, required documents and cleared payment; no guaranteed pitch.'};
}
function tradeMatch(programme,event){const named=programme.rows.filter(r=>!r.reason&&(corroborates(event.title,r.title)||corroborates(r.title,event.title))),dated=named.filter(r=>r.date===event.date),matches=dated.length?dated:named.filter(r=>!r.date&&r.year===event.date.slice(0,4));if(matches.length!==1)throw Error('vegan_exact_trade_application_card_required');return matches[0];}
export function verifyVeganBundle(document,{now=new Date().toISOString(),version='source-proof-v1',applicationPolicy='current-application-v1.1'}={}){
 const report={version,application_policy:applicationPolicy,adapter_version:VEGAN_ADAPTER_VERSION,profile:'veganeventsuk',source_url:document?.url,checked_at:document?.fetched_at,page_kind:'unproved',status:'unverified',facts:{},reasons:[],evidence:[]};
 try{
  if(document?.reason)throw Error(document.reason);if(document.adapter_version!==VEGAN_ADAPTER_VERSION||!veganEventURL(document.url)||document.requested_url!==document.url||!Array.isArray(document.documents)||document.documents.length<3||document.documents.length>5)throw Error('vegan_dated_event_bundle_required');
  const docs=document.documents,clocks=docs.map(d=>Date.parse(d.fetched_at));if(!Number.isFinite(Date.parse(now))||clocks.some(t=>!Number.isFinite(t)||t>Date.parse(now))||document.fetched_at!==new Date(Math.min(...clocks)).toISOString())throw Error('vegan_source_bundle_freshness_invalid');
  const one=url=>{const matches=docs.filter(d=>d.url===url);if(matches.length!==1)throw Error('vegan_source_document_binding_required');return matches[0];};
  const event=parseVeganEvent(one(document.url));if(event.source_identifier!==document.source_identifier)throw Error('contradictory_vegan_event_identifier');const trade=parseVeganTrade(one(VEGAN_TRADE)),card=tradeMatch(trade,event),formDoc=docs.find(d=>d.requested_url===card.application_url);if(!formDoc)throw Error('vegan_exact_linked_form_required');const application=parseVeganForm(formDoc,event);
  let country=event.country,nation=null,region=null;const geo=docs.find(d=>d.json_text);if(geo){const proof=postcodeProof(geo,event.postcode,{now});if(!proof||country&&proof.country!==country)throw Error('contradictory_vegan_event_country');country=proof.country;nation=proof.nation;region=proof.region;}
  report.page_kind='event';report.facts={event_name:event.title,organiser:'Vegan Events UK',location:application.address,event_start:event.date,event_end:event.date,canonical_url:event.url,source_platform:'veganeventsuk',source_identifier:event.source_identifier,application_url:application.application_url,application_state:'UNKNOWN',...country?{country}:{},...region?{region_code:region}:{}};
  report.application_heading=application.title;report.application_scope_proof={trader_application:true,restricted_audience:false,guaranteed_vendor_space:false};report.application_audience=application.application_audience;report.application_dependencies={required_document_upload:application.mandatory_upload_url,booking_confirmation:application.booking_confirmation};
  report.evidence=[{kind:'official_exact_dated_exhibitor_source',source_url:event.url,excerpt:stableJson(event)},{kind:'official_organiser_identity',source_url:VEGAN_TRADE,excerpt:'Vegan Events UK'},{kind:'exact_event_application_card',source_url:VEGAN_TRADE,excerpt:stableJson(card)},{kind:'published_specific_google_trader_form',source_url:formDoc.url,excerpt:stableJson(application)},...trade.generic_headings.length?[{kind:'retained_generic_heading_edition',source_url:VEGAN_TRADE,excerpt:stableJson({original_headings:trade.generic_headings,resolution:'The exact event card, exhibitor date and independently fetched application timing agree; a generic page heading does not replace these scoped dated facts.'})}]:[],...geo?[{kind:'exact_event_postcode_country',source_url:geo.url,excerpt:stableJson({postcode:event.postcode,country,nation,region})}]:[]];
  if(!country)report.reasons.push('verified_country_missing');if(event.date<now.slice(0,10))report.reasons.push('stale_edition');
  if(application.mandatory_upload_url){const upload=docs.find(d=>d.requested_url===application.mandatory_upload_url);report.evidence.push({kind:'mandatory_application_document_dependency',source_url:application.mandatory_upload_url,excerpt:stableJson({http_status:upload?.http_status??null,reason:upload?.reason??'not_fetched',required:true})});
   // The main form explicitly requires a second operational route. HTTP 401,
   // a login shell or an unproved uploader cannot be called a complete proof.
   report.reasons.push(upload?.http_status===401||upload?.http_status===403?'vegan_required_document_upload_account_gate':'vegan_required_document_upload_operational_proof_missing');
  }
  const expectedDocuments=new Set([event.url,VEGAN_TRADE,formDoc.requested_url,...geo?[geo.requested_url]:[],...application.mandatory_upload_url?[application.mandatory_upload_url]:[]]);
  if(docs.some(d=>!expectedDocuments.has(d.requested_url))||new Set(docs.map(d=>d.requested_url)).size!==docs.length)throw Error('vegan_source_document_binding_required');
  report.status=report.reasons.length?'partial':'verified';if(!report.reasons.length)report.facts.application_state='OPEN_NOW';
 }catch(e){report.reasons=[/^[a-z_]+$/.test(e.message)?e.message:'vegan_source_structure_changed'];report.status=/contradictory|capacity_or_category/.test(report.reasons[0])?'quarantine':'unverified';}
 return report;
}
export async function fetchVeganProgramme({fetcher=fetch,now=new Date().toISOString(),visit=null,url=null,sourceIdentifier=null,maxGroups=MAX_GROUPS,maxVisits=MAX_VISITS}={}){
 if(!Number.isInteger(maxGroups)||maxGroups<1||maxGroups>MAX_GROUPS||!Number.isInteger(maxVisits)||maxVisits<1||maxVisits>MAX_VISITS||url&&!veganEventURL(url))throw Error('vegan_bounded_official_programme_required');let actualVisits=0;
 const bounded=async(u,o)=>{if(actualVisits>=maxVisits)throw Error('vegan_source_visit_budget_reached');actualVisits++;return fetcher(u,o);};
 const read=async u=>{const doc=await fetchSourceDocument(u,{fetcher:bounded,now,...official(u)?{maxBytes:OFFICIAL_BYTES}:{}});if(visit)await visit(doc);return doc;},trade=await read(VEGAN_TRADE),held=[],bundles=[],home=url?null:await read(VEGAN_HOME);
 let rows;try{rows=url?[{url,source_identifier:sourceIdentifier}]:parseVeganProgramme(home,trade).rows;}catch(e){return {bundles,held:[{reason:e.message}],actual_visits:actualVisits};}
 const cache=new Map();for(const row of rows.slice(0,maxGroups)){
  if(sourceIdentifier&&row.source_identifier&&row.source_identifier!==sourceIdentifier)continue;if(row.reason){held.push({source_identifier:row.source_identifier,reason:row.reason});continue;}if(row.date&&row.date<now.slice(0,10)){held.push({source_identifier:row.source_identifier,reason:'stale_edition'});continue;}
  try{
   const eventDoc=await read(row.url),event=parseVeganEvent(eventDoc);if(row.date&&event.date!==row.date||sourceIdentifier&&event.source_identifier!==sourceIdentifier||row.title&&!(corroborates(row.title,event.title)||corroborates(event.title,row.title)))throw Error('contradictory_vegan_programme_event_identity');
   const card=tradeMatch(parseVeganTrade(trade),event);if(!cache.has(card.application_url))cache.set(card.application_url,await read(card.application_url));const form=cache.get(card.application_url),application=parseVeganForm(form,event),documents=[eventDoc,trade,form];
   if(!event.country){const geo=await fetchUKPostcode(event.postcode,{fetcher:bounded,now});if(visit)await visit(geo);documents.push(geo);}
   if(application.mandatory_upload_url){if(!cache.has(application.mandatory_upload_url))cache.set(application.mandatory_upload_url,await read(application.mandatory_upload_url));documents.push(cache.get(application.mandatory_upload_url));}
   bundles.push({document_kind:'vegan_events_official_bundle',adapter_version:VEGAN_ADAPTER_VERSION,requested_url:event.url,url:event.url,source_identifier:event.source_identifier,fetched_at:new Date(Math.min(...documents.map(d=>Date.parse(d.fetched_at)))).toISOString(),documents,content_hash:await hash(documents)});
  }catch(e){held.push({source_identifier:row.source_identifier??null,url:row.url,reason:/^[a-z_]+$/.test(e.message)?e.message:'vegan_event_proof_missing'});}if(actualVisits>=maxVisits)break;
 }return {bundles,held,actual_visits:actualVisits};
}
export async function fetchVeganBundle(url,sourceIdentifier=null,options={}){
 const result=await fetchVeganProgramme({...options,url,sourceIdentifier,maxGroups:1});return result.bundles[0]??{document_kind:'vegan_events_official_bundle',adapter_version:VEGAN_ADAPTER_VERSION,requested_url:url,url,source_identifier:sourceIdentifier,fetched_at:options.now??new Date().toISOString(),documents:[],reason:result.held[0]?.reason??'vegan_current_dated_event_not_proved'};
}
