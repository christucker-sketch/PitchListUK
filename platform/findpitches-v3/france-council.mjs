// Narrow official-source adapter. No discovery market, footer contact or PDF
// filename supplies an event fact. Other councils retain the generic gate.
import {parseHtml,first,nodes,text} from './source-dom.mjs';
import {fetchSourceDocument} from './source-document.mjs';
import {hash,stableJson} from './contract.mjs';
import {sourceDay,isCalendarDate} from './source-calendar.mjs';
export const SEYSSINS_CALL='https://www.seyssins.fr/actualite/601/17-marche-de-noel-appel-a-candidatures.htm';
export const SEYSSINS_COMMUNE='https://geo.api.gouv.fr/communes?nom=Seyssins&codePostal=38180&fields=nom,code,codesPostaux,codeDepartement,codeRegion';
const fold=s=>String(s??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
const months='janvier fevrier mars avril mai juin juillet aout septembre octobre novembre decembre'.split(' ');
const weekdays='dimanche lundi mardi mercredi jeudi vendredi samedi'.split(' ');
function date(day,month,year){const value=`${year}-${String(months.indexOf(fold(month))+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;return isCalendarDate(value)?value:null;}
function scope(document){return first(parseHtml(document.html),n=>n.attrs?.id==='contenu');}
function regulations(document){
 if(document.reason||!document.html)return null;
 const links=nodes(scope(document),n=>n.tag==='a'&&/telechargez le reglement du marche de noel/.test(fold(text(n))),{scoped:true}).map(n=>{try{const u=new URL(n.attrs.href,document.url);return u.origin==='https://www.seyssins.fr'&&u.pathname==='/cms_viewFile.php'&&/^Reglement-marche-de-Noel-20\d{2}\.pdf$/.test(u.searchParams.get('path')??'')&&/^\d+$/.test(u.searchParams.get('idtf')??'')?u.href:null;}catch{return null;}}).filter(Boolean);
 return [...new Set(links)].length===1?links[0]:null;
}
async function readBounded(response,limit){const reader=response.body.getReader(),parts=[];let length=0;try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>limit){await reader.cancel();throw Error('source_attachment_size_limit');}parts.push(value);}}finally{reader.releaseLock();}const out=new Uint8Array(length);let offset=0;for(const p of parts){out.set(p,offset);offset+=p.length;}return out;}
export async function fetchCouncilPDF(url,{fetcher=fetch,now=new Date().toISOString()}={}){
 const meta={document_kind:'official_pdf_original',requested_url:url,url,fetched_at:now};
 try{
  const u=new URL(url);if(u.origin!=='https://www.seyssins.fr'||u.pathname!=='/cms_viewFile.php'||!/^Reglement-marche-de-Noel-20\d{2}\.pdf$/.test(u.searchParams.get('path')??''))throw Error('source_attachment_route_unapproved');
  const r=await fetcher(url,{redirect:'manual',headers:{Accept:'application/pdf','User-Agent':'FindPitches-V3-Shadow-Verification/1.0'},signal:AbortSignal.timeout(12000)});
  if(!r.ok)return {...meta,http_status:r.status,reason:'source_attachment_http_'+r.status};
  if(!/application\/pdf/i.test(r.headers.get('content-type')??''))throw Error('source_attachment_format_requires_review');
  const bytes=await readBounded(r,2621440);if(new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-')throw Error('source_attachment_pdf_signature_missing');
  let raw='';for(let i=0;i<bytes.length;i+=16384)raw+=String.fromCharCode(...bytes.subarray(i,i+16384));
  const digest=await crypto.subtle.digest('SHA-256',bytes),content_hash=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
  return {...meta,http_status:r.status,content_type:'application/pdf',bytes:bytes.length,content_hash,pdf_base64:btoa(raw),interpretation:'Opaque original custody only; no textual facts or application availability inferred from a scanned PDF.'};
 }catch(e){return {...meta,reason:/^source_attachment_[a-z_]+$/.test(e.message)?e.message:'source_attachment_fetch_failed'};}
}
export async function fetchFrenchCouncilBundle(url,{fetcher=fetch,now=new Date().toISOString()}={}){
 const source=await fetchSourceDocument(url,{fetcher,now}),documents=[source];if(source.reason||source.url!==SEYSSINS_CALL)return source;
 let geo={document_kind:'french_commune_registry',requested_url:SEYSSINS_COMMUNE,url:SEYSSINS_COMMUNE,fetched_at:now};
 try{const r=await fetcher(SEYSSINS_COMMUNE,{redirect:'manual',headers:{Accept:'application/json'},signal:AbortSignal.timeout(12000)});geo={...geo,http_status:r.status};if(!r.ok){geo.reason='source_http_'+r.status;if(r.status===429){const header=r.headers.get('retry-after'),delay=/^\d+$/.test(header??'')?Number(header):Math.ceil((Date.parse(header)-Date.parse(now))/1000);geo.retry_after_seconds=Math.min(3600,Math.max(60,Number.isFinite(delay)?delay:900));}}else{const raw=new TextDecoder('utf-8',{fatal:true}).decode(await readBounded(r,32768));geo={...geo,raw_json:raw,content_hash:await hash(raw)};}}catch(e){geo={...geo,reason:'source_fetch_failed',fetch_error_kind:e.message==='verification_source_request_budget'?'request_budget':['TimeoutError','AbortError'].includes(e.name)?'timeout':'transport'};}
 documents.push(geo);const pdf=regulations(source);if(!geo.reason&&pdf)documents.push(await fetchCouncilPDF(pdf,{fetcher,now}));
 // Required corroboration retrieval failures obey the same renewal/backoff
 // rules as a failed event retrieval, retaining prior proof and original TTL.
 if(geo.reason)return {document_kind:'fr_council_source_bundle',requested_url:source.requested_url,url:source.url,fetched_at:now,documents,reason:geo.reason,fetch_error_kind:geo.fetch_error_kind,retry_after_seconds:geo.retry_after_seconds};
 return {document_kind:'fr_council_source_bundle',requested_url:source.requested_url,url:source.url,fetched_at:now,content_hash:await hash(documents),documents};
}
export function verifyFrenchCouncilBundle(bundle,{now,version,applicationPolicy}){
 const report={version,application_policy:applicationPolicy,source_url:bundle.url,checked_at:bundle.fetched_at,profile:'fr_council_call',adapter_version:'seyssins-call-v1',page_kind:'event',status:'unverified',facts:{},reasons:[],evidence:[]};
 if(bundle.reason)return {...report,reasons:[bundle.reason]};
 try{
  const docs=bundle.documents;if(!Array.isArray(docs)||docs.length<2||docs.length>3||bundle.requested_url!==SEYSSINS_CALL||bundle.url!==SEYSSINS_CALL)throw Error('fr_council_bundle_invalid');
  const [source,geo,pdf]=docs,clocks=docs.map(d=>Date.parse(d.fetched_at));
  if(clocks.some(t=>!Number.isFinite(t)||t>Date.parse(now))||Date.parse(bundle.fetched_at)!==Math.min(...clocks)||source.reason||source.http_status!==200||source.url!==SEYSSINS_CALL||source.requested_url!==SEYSSINS_CALL)throw Error('fr_council_source_custody_mismatch');
  const main=scope(source);if(!main)throw Error('event_content_scope_missing');
  const heading=text(first(main,n=>n.tag==='h1',{scoped:true})),body=text(main),s=fold(body);
  if(!/^marche de noel\s*:\s*appel a candidatures$/.test(fold(heading)))throw Error('official_event_identity_not_proved');
  if(/\b(?:liste d['’]attente|(?:marche|stands?|places?|inscriptions?) (?:est |sont )?complet(?:e|es|s)?|annule|(?:candidatures?|inscriptions?) (?:(?:sont |actuellement )?(?:fermees?|closes?|suspendues?)|(?:ne sont )?pas (?:encore )?ouvertes)|reserve aux particuliers|particuliers uniquement)\b/.test(s))throw Error('fr_call_closed_restricted_or_waitlisted');
  const intro=nodes(main,n=>n.tag==='p'&&/la ville de seyssins organisera/.test(fold(text(n))),{scoped:true});
  if(intro.length!==1)throw Error('single_event_source_data_missing');
  const original=text(intro[0]),summary=fold(original),edition=[...summary.matchAll(/\bedition (20\d{2})\b/g)],days=[...summary.matchAll(/\ble (dimanche|lundi|mardi|mercredi|jeudi|vendredi|samedi) (\d{1,2})(?:er)? (\w+)\b/g)],day=days[0];
  if(edition.length!==1||!day)throw Error('verified_event_date_missing');
  if(days.length!==1||[...summary.matchAll(/\b(20\d{2})\b/g)].some(m=>m[1]!==edition[0][1]))throw Error('contradictory_event_dates');
  const eventDate=date(day[2],day[3],edition[0][1]);if(!eventDate||new Date(eventDate+'T12:00Z').getUTCDay()!==weekdays.indexOf(day[1]))throw Error('contradictory_event_weekday');
  const eventName=original.match(/marché de Noël de Seyssins/i)?.[0],venue=original.match(/parvis de l[’']Hôtel de ville/i)?.[0];
  if(!eventName||!venue||!summary.includes('la ville de seyssins organisera un marche de noel'))throw Error('verified_event_venue_or_owner_missing');
  if(geo.reason||geo.url!==SEYSSINS_COMMUNE||geo.requested_url!==SEYSSINS_COMMUNE||geo.http_status!==200)throw Error('verified_country_missing');
  const communes=JSON.parse(geo.raw_json);if(!Array.isArray(communes)||communes.length!==1||communes[0].nom!=='Seyssins'||communes[0].code!=='38486'||communes[0].codeDepartement!=='38'||communes[0].codeRegion!=='84'||!communes[0].codesPostaux?.includes('38180'))throw Error('official_commune_identity_mismatch');
  const instructions=nodes(main,n=>n.tag==='p'&&/transmettre votre dossier de candidature/.test(fold(text(n))),{scoped:true});
  if(instructions.length!==1)throw Error('specific_trader_application_instruction_missing');
  const instruction=text(instructions[0]),instructionFold=fold(instruction),deadlines=[...instructionFold.matchAll(/avant le (\d{1,2})(?:er)? (\w+) (20\d{2})\b/g)],deadline=deadlines[0],emails=[...instruction.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)].map(m=>m[0].toLowerCase());
  if(deadlines.length>1||/date limite|jusqu['’]au/.test(instructionFold))throw Error('contradictory_application_deadlines');
  const until=deadline&&date(deadline[1],deadline[2],deadline[3]);
  if(!until||new Set(emails).size!==1||emails[0]!=='marchedenoel@mairie-seyssins.fr'||!summary.includes('artisan, createur ou producteur local')||!s.includes('si vous etes professionnel'))throw Error('current_trader_application_not_proved');
  if(until>eventDate)throw Error('contradictory_application_deadline_after_event');
  if(eventDate<sourceDay(now))throw Error('stale_edition');
  if(until<=sourceDay(now))throw Error('application_deadline_passed');
  const recheckBefore=new Date(Date.parse(until)-14*3600000).toISOString();
  if(Date.parse(now)>=Date.parse(recheckBefore))throw Error('deadline_boundary_requires_source_clock');
  report.facts={event_name:eventName,organiser:'Ville de Seyssins',location:venue+', Seyssins',country:'FR',region_code:'FR-ARA',event_start:eventDate,event_end:eventDate,application_url:source.url,application_state:'ENQUIRY_AVAILABLE',application_deadline:until};
  // "avant le" has no source-zoned closing instant. Recheck conservatively
  // before even the earliest possible start of that day; never invent a clock.
  report.source_recheck_before=recheckBefore;
  report.event_source_url=source.url;report.application_heading=heading;report.application_audience='traders';report.application_scope_proof={trader_application:true,restricted_audience:false};
  report.usable_route={policy:'global-prospective-trader-route-v1',type:'trader_email',landing_url:source.url,destination:'mailto:'+emails[0],event_source_url:source.url,organiser_url:'https://www.seyssins.fr/',organiser_controlled:true,prospective_trader:true,current:true};
  report.evidence=[{kind:'official_council_event',source_url:source.url,excerpt:original},{kind:'main_heading',source_url:source.url,excerpt:heading},{kind:'official_named_commune',source_url:geo.url,excerpt:geo.raw_json},{kind:'specific_trader_application_instruction',source_url:source.url,excerpt:instruction},{kind:'fr_exclusive_deadline_recheck_policy',source_url:source.url,excerpt:'Source says avant le; conservative recheck bound, no source closing instant inferred.'}];
  if(pdf){if(pdf.requested_url!==regulations(source)||pdf.url!==pdf.requested_url)throw Error('fr_attachment_not_bound_to_call');report.evidence.push({kind:pdf.reason?'linked_regulations_unavailable':'linked_regulations_original_only',source_url:pdf.url,excerpt:stableJson({reason:pdf.reason,content_hash:pdf.content_hash,bytes:pdf.bytes,textual_facts_used:false})});}
  report.status='verified';return report;
 }catch(e){report.reasons=[/^[a-z_]+$/.test(e.message)?e.message:'fr_council_source_structure_requires_review'];if(/contradictory|mismatch/.test(report.reasons[0]))report.status='quarantine';return report;}
}
