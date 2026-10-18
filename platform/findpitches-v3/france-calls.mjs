// Curated official calls, each with a scoped source identity. A French URL,
// query, publisher address, generic directory or filename supplies no event.
import {parseHtml,first,nodes,text,hasClass} from './source-dom.mjs';
import {fetchSourceDocument} from './source-document.mjs';
import {hash} from './contract.mjs';
import {isCalendarDate,sourceDay} from './source-calendar.mjs';
export const FRENCH_CALLS=Object.freeze([
 {id:'kilstett',url:'https://www.kilstett.fr/Actus/Marche-Noel-Kilstett-Appel-exposants-00670.html',commune:'Kilstett',code:'67237',region:'44',region_code:'FR-GES',region_name:'Grand Est',application:'https://forms.gle/KZbisD85qPCyVin86',pdf:'https://www.kilstett.fr/dynamic/pdf/actualites_2026/inscription_mn2026_1.pdf'},
 {id:'podensac',url:'https://www.podensac.fr/actualites/divers/foire-sainte-catherine-2026-les-inscriptions-exposants-sont-ouvertes/',commune:'Podensac',code:'33327',region:'75',region_code:'FR-NAQ',region_name:'Nouvelle-Aquitaine',application:'https://www.podensac.fr/actualites/divers/foire-sainte-catherine-2026-les-inscriptions-exposants-sont-ouvertes'},
 {id:'hochstatt',url:'https://hochstatt-asso.fr/comite-des-fetes-de-hochstatt/',commune:'Hochstatt',code:'68141',region:'44',region_code:'FR-GES',region_name:'Grand Est',application:'https://hochstatt-asso.fr/comite-des-fetes-de-hochstatt/preinscription-marche-de-noel-2026'}
]);
export const frenchCall=url=>FRENCH_CALLS.find(c=>c.url===url)??null;
export const communeURL=c=>'https://geo.api.gouv.fr/communes/'+c.code+'?fields=nom,code,codesPostaux,codeDepartement,codeRegion';
const fold=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
const months='janvier fevrier mars avril mai juin juillet aout septembre octobre novembre decembre'.split(' '),weekdays='dimanche lundi mardi mercredi jeudi vendredi samedi'.split(' ');
const datePattern='(?:(dimanche|lundi|mardi|mercredi|jeudi|vendredi|samedi) )?(\\d{1,2})(?:er)? (janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre) (20\\d{2})';
function dates(s){return [...fold(s).matchAll(new RegExp(datePattern,'g'))].map(m=>{const d=m[4]+'-'+String(months.indexOf(m[3])+1).padStart(2,'0')+'-'+m[2].padStart(2,'0');if(!isCalendarDate(d)||m[1]&&new Date(d+'T12:00Z').getUTCDay()!==weekdays.indexOf(m[1]))throw Error('contradictory_event_calendar');return d;});}
const oneDate=s=>{const ds=[...new Set(dates(s))];if(ds.length!==1)throw Error('single_explicit_event_date_required');return ds[0];};
const blocked=/\b(?:liste d['’]attente|inscriptions? (?:sont )?(?:closes?|fermees?)|candidatures? (?:sont )?(?:closes?|fermees?)|(?:marche|evenement) (?:est )?(?:annule|complet)|(?:inscriptions?|candidatures?) (?:ne sont )?pas (?:encore )?ouvertes|reserve aux particuliers|particuliers uniquement|plus de places)\b/;
function scope(document,c){const root=parseHtml(document.html);return c.id==='kilstett'?first(root,n=>hasClass(n,'wysiwyg')):first(root,n=>n.tag===(c.id==='podensac'?'article':'main'));}
function linkPresent(main,url,base){return nodes(main,n=>n.tag==='a'&&n.attrs.href,{scoped:true}).some(n=>{try{return new URL(n.attrs.href,base).href.replace(/\/$/,'')===url.replace(/\/$/,'');}catch{return false;}});}
async function readSourceBytes(response,limit){const reader=response.body.getReader(),parts=[];let length=0;try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>limit){await reader.cancel();throw Error('source_registry_size_limit');}parts.push(value);}}finally{reader.releaseLock();}const out=new Uint8Array(length);let offset=0;for(const p of parts){out.set(p,offset);offset+=p.length;}return out;}
async function registry(c,{fetcher,now}){
 const url=communeURL(c),out={document_kind:'french_commune_registry',requested_url:url,url,fetched_at:now};
 try{const r=await fetcher(url,{redirect:'manual',headers:{Accept:'application/json'},signal:AbortSignal.timeout(12000)});if(!r.ok)return {...out,http_status:r.status,reason:'source_http_'+r.status};const raw_json=new TextDecoder('utf-8',{fatal:true}).decode(await readSourceBytes(r,32768));return {...out,http_status:r.status,raw_json,content_hash:await hash(raw_json)};}catch(e){return {...out,reason:'source_fetch_failed',fetch_error_kind:e.message==='verification_source_request_budget'?'request_budget':['TimeoutError','AbortError'].includes(e.name)?'timeout':'transport'};}
}
export async function fetchFrenchCallBundle(url,{fetcher=fetch,now=new Date().toISOString()}={}){
 const c=frenchCall(url);if(!c)throw Error('approved_french_call_required');
 const source=await fetchSourceDocument(url,{fetcher,now});if(source.reason)return source;
 const documents=[source],main=scope(source,c),body=fold(text(main));
 // A removed/closed call must not cause follow-on requests or prove availability.
 if(main&&!blocked.test(body)&&(linkPresent(main,c.application,source.url)||c.id==='podensac')){
  const geo=await registry(c,{fetcher,now});documents.push(geo);
  if(geo.reason)return {document_kind:'fr_official_call_bundle',requested_url:url,url:source.url,fetched_at:now,documents,reason:geo.reason,fetch_error_kind:geo.fetch_error_kind};
  const app=await fetchSourceDocument(c.application,{fetcher,now});documents.push(app);
  if(app.reason)return {document_kind:'fr_official_call_bundle',requested_url:url,url:source.url,fetched_at:now,documents,reason:app.reason,fetch_error_kind:app.fetch_error_kind,retry_after_seconds:app.retry_after_seconds};
 }
 return {document_kind:'fr_official_call_bundle',requested_url:url,url:source.url,fetched_at:now,content_hash:await hash(documents),documents};
}
function custody(d,url,now){if(!d||d.reason||d.http_status!==200||d.requested_url!==url||!Number.isFinite(Date.parse(d.fetched_at))||Date.parse(d.fetched_at)>Date.parse(now))throw Error('fr_call_source_custody_mismatch');}
export function verifyFrenchCallBundle(bundle,{now,version,applicationPolicy}){
 const report={version,application_policy:applicationPolicy,source_url:bundle.url,checked_at:bundle.fetched_at,profile:'fr_official_call',adapter_version:'fr-calls-v1',page_kind:'event',status:'unverified',facts:{},reasons:[],evidence:[]};
 try{
  if(bundle.reason)throw Error(bundle.reason);const c=frenchCall(bundle.requested_url);if(!c||bundle.url!==c.url||!Array.isArray(bundle.documents)||bundle.documents.length!==3)throw Error('fr_call_bundle_invalid');
  const [source,geo]=bundle.documents;custody(source,c.url,now);if(source.url!==c.url||bundle.documents.some(d=>d.fetched_at!==bundle.fetched_at))throw Error('fr_call_source_custody_mismatch');
  const main=scope(source,c);if(!main)throw Error('event_content_scope_missing');const original=text(main),body=fold(original);
  if(blocked.test(body))throw Error('fr_call_closed_restricted_or_waitlisted');
  custody(geo,communeURL(c),now);if(geo.url!==communeURL(c))throw Error('verified_country_missing');const g=JSON.parse(geo.raw_json);
  if(g.nom!==c.commune||g.code!==c.code||g.codeRegion!==c.region||!body.includes(fold(c.commune)))throw Error('official_commune_identity_mismatch');
  const application=bundle.documents.find(d=>d.requested_url===c.application);custody(application,c.application,now);
  let event_name,organiser,eventDate,deadline=null,route=null;
  if(c.id==='kilstett'){
   const event=original.match(/Le Marché de Noël de Kilstett se tiendra[^.]+\./i);if(!event||!body.includes('la commune recherche des createurs, artisans et producteurs alimentaires'))throw Error('specific_trader_event_not_proved');
   eventDate=oneDate(event[0]);event_name=event[0].match(/Marché de Noël de Kilstett/i)[0];organiser='Commune de Kilstett';
   const a=parseHtml(application.html),appText=text(first(a,n=>n.tag==='body')),s=fold(appText),form=first(a,n=>n.tag==='form'&&/https:\/\/docs.google.com\/forms\/.*\/formResponse/.test(n.attrs.action??''));
   const deadlineLine=appText.match(/Date limite d['’]inscription\s*:\s*[^!]+!/i);if(!deadlineLine)throw Error('explicit_application_deadline_missing');deadline=oneDate(deadlineLine[0]);
   const visibleDeadline=body.match(/date limite d['’]inscription\s*:\s*(?:vendredi |lundi |mardi |mercredi |jeudi |samedi |dimanche )?(\d{1,2}) (\w+)/);
   if(!visibleDeadline||deadline.slice(5)!==String(months.indexOf(visibleDeadline[2])+1).padStart(2,'0')+'-'+visibleDeadline[1].padStart(2,'0'))throw Error('contradictory_visible_application_deadline');
   if(!/^https:\/\/docs.google.com\/forms\//.test(application.url)||!form||!s.includes('kilstett')||blocked.test(s)||!dates(s).includes(eventDate)||!/(?:produits|articles|activite)/.test(s)||form.attrs['aria-disabled']==='true')throw Error('current_event_application_form_not_proved');
   report.evidence.push({kind:'exact_linked_application_deadline',source_url:application.url,excerpt:deadlineLine[0]});
  }else if(c.id==='podensac'){
   const event=original.match(/Foire Sainte-Catherine de Podensac[^?]+\?/i),invitation=original.match(/Les commerçants, artisans, producteurs[^.]+\./i),instruction=original.match(/dossier complet est à envoyer à\s*([^\s]+@[^\s]+)/i);
   if(!event||!invitation||!instruction||!/inscriptions exposants sont ouvertes/i.test(text(first(parseHtml(source.html),n=>n.tag==='title'),{scoped:false})))throw Error('specific_trader_application_instruction_missing');
   eventDate=oneDate(event[0]);deadline=oneDate(invitation[0]);event_name='Foire Sainte-Catherine '+eventDate.slice(0,4);organiser='Commune de Podensac';
   if(application.url!==c.url||!application.redirect_chain?.includes(c.url))throw Error('fr_application_alias_not_corroborated');
   const email=instruction[1].replace(/[.,;]+$/,'');if(!/^[\w.%+-]+@podensac\.fr$/i.test(email))throw Error('specific_trader_application_instruction_missing');
   route={policy:'global-prospective-trader-route-v1',type:'trader_email',landing_url:c.application,destination:'mailto:'+email,event_source_url:c.url,organiser_url:'https://www.podensac.fr/',organiser_controlled:true,prospective_trader:true,current:true};
   report.evidence.push({kind:'specific_trader_application_instruction',source_url:c.url,excerpt:invitation[0]+' '+instruction[0]});
  }else{
   const title=text(first(main,n=>n.tag==='h1',{scoped:true}));if(title!=='Marché de Noël de Hochstatt'||!body.includes('vous etes artisans et vous souhaitez participer'))throw Error('specific_trader_event_not_proved');
   eventDate=oneDate(original);event_name=title;
   const docTitle=text(first(parseHtml(source.html),n=>n.tag==='title'),{scoped:false});if(!docTitle.endsWith('Comité des Fêtes de Hochstatt'))throw Error('verified_organiser_missing');organiser='Comité des Fêtes de Hochstatt';
   const root=parseHtml(application.html),appMain=first(root,n=>n.tag==='main'),s=fold(text(appMain)),form=first(appMain,n=>n.tag==='form'&&n.attrs.method==='post',{scoped:true});
   if(application.url!==c.application+'/'||!linkPresent(main,c.application,c.url)||!s.includes('preinscription marche de noel '+eventDate.slice(0,4))||!s.includes('exposant doit obligatoirement etre professionnel')||blocked.test(s)||!form||new URL(form.attrs.action,application.url).href!==application.url)throw Error('current_event_application_form_not_proved');
   // Gravity Forms puts its own submit inside .gform-footer. Inspect controls
   // only within the already-bound form, not a site footer or navigation link.
   if(!nodes(form,n=>n.tag==='textarea'&&n.attrs.name&&n.attrs.disabled===undefined).length||!first(form,n=>n.attrs?.disabled===undefined&&(n.tag==='input'&&n.attrs.type==='submit'||n.tag==='button'&&n.attrs.type==='submit')))throw Error('current_event_application_form_not_proved');
  }
  if(eventDate<sourceDay(now))throw Error('stale_edition');if(deadline&&deadline<=sourceDay(now))throw Error('application_deadline_passed');if(deadline&&deadline>eventDate)throw Error('contradictory_application_deadline_after_event');
  report.facts={event_name,organiser,country:'FR',region_code:c.region_code,location:c.commune+', '+c.region_name,event_start:eventDate,event_end:eventDate,application_url:c.application,application_state:route?'ENQUIRY_AVAILABLE':'OPEN_NOW',...deadline?{application_deadline:deadline}:{}};
  // The named event town is proved. No postal correspondence/mairie address is
  // promoted to an event venue or a map pin; exact venue remains unspecified.
  report.location_precision='locality';report.event_source_url=c.url;report.application_heading=event_name;report.application_audience='traders';report.application_scope_proof={trader_application:true,restricted_audience:false};if(route)report.usable_route=route;
  if(deadline){report.source_recheck_before=new Date(Date.parse(deadline)-14*3600000).toISOString();if(Date.parse(now)>=Date.parse(report.source_recheck_before))throw Error('deadline_boundary_requires_source_clock');}
  report.evidence.push({kind:'official_event_and_trader_call',source_url:c.url,excerpt:original.slice(0,14000)},{kind:'official_named_commune',source_url:geo.url,excerpt:geo.raw_json},{kind:'current_application_landing',source_url:application.url,excerpt:JSON.stringify({requested_url:application.requested_url,redirect_chain:application.redirect_chain,http_status:application.http_status})});
  report.status='verified';return report;
 }catch(e){report.reasons=[/^[a-z_0-9]+$/.test(e.message)?e.message:'fr_call_source_structure_requires_review'];if(/contradictory|mismatch/.test(report.reasons[0]))report.status='quarantine';return report;}
}
