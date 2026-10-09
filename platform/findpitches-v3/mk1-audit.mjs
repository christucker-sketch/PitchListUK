import {parseHtml,nodes,first,text} from './source-dom.mjs';
import {verifyDocument} from './verification.mjs';
import {safeSourceUrl} from './source-document.mjs';

const norm=s=>String(s??'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const clean=s=>String(s??'').replace(/\s+/g,' ').trim();
const same=(a,b)=>{try{const x=new URL(a),y=new URL(b);x.hash=y.hash='';return x.href===y.href;}catch{return false;}};
const reference=/\b(?:licen[cs](?:e|es|ing)|trading consent|food business registration|register (?:your |a )?food business|risk assessment|terms and conditions|licence conditions|guidance|policy|food hygiene|registering)\b/i;
const trade=/\b(?:traders?|vendors?|stallholders?|exhibitors?|stall spaces?|market pitches?|trading pitches?)\b/i;
const specific=/\b(?:market|festival|fair|fayre|show|fireworks|street food corner|food festival)\b/i;
const appLabel=/\b(?:trader|vendor|stallholder|exhibitor|stall|trade)\b.*\b(?:apply|application|form|book)|\b(?:apply|application|form|book)\b.*\b(?:trader|vendor|stallholder|exhibitor|stall|trade)\b|^(?:application form|apply now|booking form)$/i;
export const mk1ApplicationRoutes=summary=>[...new Map(summary.links.filter(r=>(appLabel.test(r.label)||/market trading.*application form/i.test(r.label))&&!reference.test(r.label)&&!/(?:facebook|instagram|eventbrite|ticketmaster|linkedin|youtube)\./i.test(r.url)).map(r=>[r.url,r])).values()];
const months=['january','february','march','april','may','june','july','august','september','october','november','december'];
function literalDates(value) {
  const out=[];for(const m of value.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d{2})\b/gi)) {
    const d=m[3]+'-'+String(months.indexOf(m[2].toLowerCase())+1).padStart(2,'0')+'-'+m[1].padStart(2,'0');
    const parsed=new Date(d+'T12:00:00Z');if(Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===d)out.push(d);
  }return [...new Set(out)];
}
export function summarizeMk1Document(document) {
  if(!document?.html||document.reason)return {reason:document?.reason??'source_not_checked',http_status:document?.http_status??null,title:'',heading:'',body:'',paragraphs:[],links:[],forms:[]};
  try {
    const root=parseHtml(document.html),primary=nodes(root,n=>n.tag==='main'||n.tag==='article');
    const main=primary.sort((a,b)=>text(b).length-text(a).length)[0]??first(root,n=>/entry-content|page-content|main-content/.test(n.attrs?.class??''))??first(root,n=>n.tag==='body')??root;
    const forms=nodes(main,n=>n.tag==='form',{scoped:true}),outsideForm=n=>!forms.some(f=>n.start>=f.start&&n.end<=f.end);
    const paragraphs=nodes(main,n=>['p','li','address','h1','h2','h3'].includes(n.tag)&&outsideForm(n),{scoped:true}).map(n=>text(n)).filter(Boolean);
    const heading=nodes(root,n=>n.tag==='h1',{scoped:true}).map(n=>text(n)).find(s=>s.length>3)??'';
    const title=text(first(root,n=>n.tag==='title'),{scoped:false});
    const links=nodes(main,n=>n.tag==='a'&&n.attrs.href&&outsideForm(n),{scoped:true}).map(n=>{try{return {label:text(n),url:new URL(n.attrs.href,document.url).href};}catch{return null;}}).filter(r=>r&&safeSourceUrl(r.url));
    return {http_status:document.http_status,title,heading,body:text(main),paragraphs,links,forms:forms.map(f=>({text:text(f),method:f.attrs.method,action:f.attrs.action,enabled_submit:nodes(f,n=>(n.attrs?.type==='submit'||n.tag==='button')&&n.attrs.disabled===undefined).length>0,
      business_and_products:/business name|trading name|company name/i.test(text(f))&&/products?|what.*(?:sell|food)|description.*(?:stall|business)/i.test(text(f))}))};
  }catch{return {reason:'source_html_structure_requires_review',http_status:document.http_status,title:'',heading:'',body:'',paragraphs:[],links:[],forms:[]};}
}

export function assessMk1Listing({original,source,documents=new Map(),reviewedPdfHashes=[],now=new Date().toISOString()}) {
  const summary=summarizeMk1Document(source),proof=verifyDocument(source??{}, {now}),sourceUrl=source?.requested_url??original.source_url;
  const result={id:original.id,grade:'questionable',kind:'unresolved',reasons:[],facts:{},field_evidence:{},proof,source_url:sourceUrl,source_hash:source?.content_hash??null,
    original_application_supported:false,application_route_repaired:false};
  const hold=(grade,kind,...reasons)=>Object.assign(result,{grade,kind,reasons});
  if(summary.reason)return hold(summary.http_status===404?'wrong_unsafe':'questionable',summary.http_status===404?'broken_source':'source_unavailable',summary.reason);
  if(/^(?:page not found|404|access denied|just a moment|error|sign in|login)\b/i.test(summary.heading||summary.title))return hold('questionable','source_unavailable','source_is_error_or_login_shell');
  if(proof.facts.country&&proof.facts.country!=='GB')return hold('wrong_unsafe','country_conflict','source_country_market_mismatch');
  const title=clean(summary.heading||summary.title.split(/\s+[|–—]\s+/)[0]);
  const narrative=summary.paragraphs.join(' '),body=summary.body;
  if(/not accepting (?:further |any |new )?(?:vendor |trader )?applications(?: at this time)?/i.test(summary.title))return hold('not_current','closed_or_stale','explicit_source_form_closure');
  if(/(?:^|\.)(?:visitwales\.com|visitscotland\.com|visitengland\.com|fairsandfestivals\.net|allevents\.in)$/.test(new URL(source.url).hostname))return hold('reference_only','directory_or_editorial','listing_or_editorial_source_requires_original_organiser_proof');
  if(!body||!title)return hold('questionable','source_content_incomplete','rendered_source_content_requires_review');
  if(reference.test(title)&&!specific.test(title))return hold('reference_only','licensing_or_guidance','general_permission_or_guidance_not_specific_opportunity');
  if(/risk assessment|terms and conditions|licence conditions|food business registration|register.*food business/i.test(title))return hold('reference_only','supporting_document','supporting_document_not_trading_opportunity');
  if(proof.reasons.some(r=>['application_closed','application_deadline_passed','stale_edition','event_cancelled_or_postponed'].includes(r)))return hold('not_current','closed_or_stale',...proof.reasons);
  const closed=narrative.match(/\b(?:applications?(?: to trade)? (?:are |have |have now |now )?closed|applications? (?:are )?not open|not accepting (?:any |new )?applications|fully booked|no stalls available)\b/i);
  if(closed)return hold('not_current','closed_or_stale','explicit_source_closure');
  const yearsTitle=[...(summary.title+' '+title).matchAll(/\b(20\d{2})\b/g)].map(m=>m[1]);
  const applicationYear=body.match(/(?:taking|accepting|inviting|open for)[^.!?]{0,90}\b(?:trader |vendor |stallholder )?applications?[^.!?]{0,50}\b(20\d{2})\b/i)?.[1];
  if(applicationYear&&yearsTitle.some(y=>y!==applicationYear))return hold('questionable','contradictory_edition','source_application_edition_disagrees_with_page_title');
  if(proof.status==='quarantine'&&proof.reasons.some(r=>/contradictory|identity_mismatch/.test(r)))return hold('questionable','contradictory_evidence',...proof.reasons);
  const field=(name,value,excerpt,kind='retained_excerpt',url=source?.url??sourceUrl)=>{if(value!=null&&value!==''){result.facts[name]=value;result.field_evidence[name]={kind,source:url,excerpt:clean(excerpt).slice(0,4000)};}};
  if(proof.status==='verified'&&proof.facts.country==='GB') {
    for(const [key,value] of Object.entries(proof.facts))if(key!=='country')field(key,value,JSON.stringify(proof.evidence),'direct_event');
    result.country='GB';result.grade='clearly_usable';result.kind='source_verified_current';result.original_application_supported=same(original.application_url,result.facts.application_url);result.application_route_repaired=!result.original_application_supported;return result;
  }
  if(!trade.test(body)||!specific.test(title)&&!specific.test(narrative)) {
    if(/\bstreet trad(?:er|ing)|licen[cs]|trading consent\b/i.test(title))return hold('reference_only','general_permission','general_permission_not_a_pitch');
    return hold('questionable','no_specific_trading_offer','specific_trading_offer_not_proved');
  }
  if(reference.test(title)&&!/\b(?:market|street food corner)\b/i.test(title))return hold('reference_only','general_permission','general_permission_not_a_pitch');
  if(/^(?:home|welcome|traders|applications?|events|vendors|markets|news|contact us)$/i.test(title)||!title)return hold('questionable','identity_missing','specific_source_title_requires_review');
  field('event_name',title,title,'direct_heading');field('canonical_url',sourceUrl,'Original source fetched and retained: '+sourceUrl,'source_route');
  const location=clean(original.location),locationParagraph=location&&summary.paragraphs.find(p=>norm(p).includes(norm(location)));
  let host='';try{host=new URL(source.url).hostname;}catch{}
  const localCouncil=host.endsWith('.gov.uk')&&/\bCouncil\b/.test(summary.title)&&/\bmarket\b/i.test(title)&&!reference.test(title);
  const geography=summary.paragraphs.find(p=>/\b(?:venue|market|held|located|takes place|address|sat nav)\b/i.test(p)&&!/registered (?:office|address)|billing|business address|your address/i.test(p)&&(/\b(?:United Kingdom|England|Scotland|Wales|Northern Ireland)\b/.test(p)||/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/.test(p)));
  if(locationParagraph&&geography||localCouncil&&locationParagraph){result.country='GB';result.country_evidence={source:source.url,excerpt:clean(geography??locationParagraph).slice(0,1500),kind:localCouncil?'official_uk_council_named_local_market':'venue_country_or_postcode'};field('location',location,locationParagraph);}
  else if(localCouncil&&/\bmarket\b/i.test(title)&&!/^(?:markets?|market (?:licences|fees|trading))$/i.test(title)) {
    const place=title.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}\s+[Mm]arket)\b/)?.[1];
    if(!place||/^(?:Farmers|Christmas|Weekly|Monthly|Regular|Street|Food)\s+Market$/i.test(place))return hold('questionable','geography_unproved','source_bound_country_and_location_required');
    result.country='GB';result.country_evidence={source:source.url,excerpt:title+'; official local council: '+summary.title,kind:'official_uk_council_named_local_market'};field('location',place,title,'direct_heading');
  }
  else if(geography) {
    const postcode=geography.match(/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/)?.[0];
    if(!postcode||/^(?:GY|JE|IM)/.test(postcode))return hold('questionable','geography_unproved','source_bound_country_and_location_required');
    result.country='GB';result.country_evidence={source:source.url,excerpt:geography,kind:'scoped_venue_uk_postcode'};field('location',postcode,geography);
  }
  else if(proof.facts.country==='GB'&&proof.facts.location){result.country='GB';field('location',proof.facts.location,JSON.stringify(proof.evidence),'direct_event');}
  else return hold('questionable','geography_unproved','source_bound_country_and_location_required');
  const locationCaveat=summary.paragraphs.find(p=>/exact location will be confirmed/i.test(p));
  if(locationCaveat){const place=locationCaveat.match(/\bin ([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3} Town Centre)\b/)?.[1];if(place)field('location',place,locationCaveat);result.location_caveat=locationCaveat;}
  const org=clean(original.organiser),orgParagraph=org&&summary.paragraphs.find(p=>norm(p).includes(norm(org))&&/\b(?:organis|run by|managed by|operat|we|our|council)\b/i.test(p));
  if(orgParagraph)field('organiser',org,orgParagraph);
  else if(localCouncil){const owner=summary.title.split(/\s+[|–—-]\s+/).find(s=>/Council$/.test(s));if(owner)field('organiser',owner,'Named local-market application on '+host+'; page publisher '+owner);}
  else if(proof.facts.organiser)field('organiser',proof.facts.organiser,JSON.stringify(proof.evidence),'direct_event');
  const dates=literalDates(narrative),dateParagraph=summary.paragraphs.find(p=>/\b(?:event|festival|market|fair|takes place|held|next|join us)\b/i.test(p)&&literalDates(p).length);
  if(dateParagraph&&dates.length===1){field('event_start',dates[0],dateParagraph);field('event_end',dates[0],dateParagraph);if(dates[0]<now.slice(0,10))return hold('not_current','past_dated_source','explicit_source_event_date_passed');}
  const recurring=summary.paragraphs.find(p=>/\b(?:market|trading)\b/i.test(p)&&/\b(?:every|weekly|monthly|daily|regular|year.round|permanent|Wednesdays|Saturdays|Sundays|Mondays|Tuesdays|Thursdays|Fridays)\b/i.test(p)&&!reference.test(p));
  if(recurring)field('recurring',true,recurring);
  if(!recurring&&!result.facts.event_start)return hold('questionable','current_edition_unproved','current_event_date_or_recurring_market_required');
  const form=summary.forms.find(f=>{try{return f.method?.toLowerCase()==='post'&&f.business_and_products&&f.enabled_submit&&/\b(?:traders?|vendors?|stallholders?|stalls?|pitches?|trading)\b/i.test(f.text)&&/\b(?:apply|application|pitch|pitches)\b/i.test(f.text)&&same(new URL(f.action??'',source.url).href,source.url);}catch{return false;}});
  const unique=mk1ApplicationRoutes(summary),retained=unique.find(r=>same(r.url,original.application_url));
  const route=form?{url:source.url,label:'Specific live business/product application form'}:retained??(unique.length===1?unique[0]:null);
  if(!route)return hold('questionable','application_unproved','one_relevant_source_bound_application_route_required');
  const application=form?source:documents.get(route.url.split('#')[0]),app=summarizeMk1Document(application);
  const pdf=application?.content_type==='application/pdf'&&/^[a-f0-9]{64}$/.test(application.content_sha256??'');
  if(application?.http_status!==200||application.reason||!pdf&&/^(?:sign in|login|log in|access denied|page not found|just a moment)\b/i.test(app.heading||app.title))return hold('questionable','application_unavailable','application_route_needs_direct_verification');
  // A reachable PDF may be guidance or an expired form. An operator must review
  // this exact binary; native admission independently fetches and hashes it.
  if(pdf&&!reviewedPdfHashes.includes(application.content_sha256))return hold('questionable','application_document_unreviewed','current_relevant_application_pdf_review_required');
  result.application_receipt={url:application.url,content_hash:pdf?application.content_sha256:application.content_hash,fetched_at:application.fetched_at,content_type:pdf?'application/pdf':'text/html',operator_pdf_review:pdf};
  if(form)result.source_form_proof={source_url:source.url,content_hash:source.content_hash,excerpt:JSON.stringify({title,method:'post',action:new URL(form.action??'',source.url).href,business_and_products:true,enabled_submit:true,form_text:form.text.slice(0,2500)})};
  field('application_url',route.url,'In the scoped opportunity content: '+route.label+' → '+route.url,'source_route');
  field('application_state',/enquir|interest form|register.*interest|contact.*availability/i.test(route.label)?'ENQUIRY_AVAILABLE':'UNKNOWN','Working source-bound application route; no unsupported OPEN_NOW or ROLLING claim','historical_state');
  result.original_application_supported=same(original.application_url,route.url);result.application_route_repaired=!result.original_application_supported;
  result.grade='usable_minor_gaps';result.kind=recurring?'recurring_market':'dated_opportunity';result.reasons=['automatic_source_proof_incomplete'];
  if(!result.facts.organiser)result.reasons.push('organiser_relationship_unproved');return result;
}
