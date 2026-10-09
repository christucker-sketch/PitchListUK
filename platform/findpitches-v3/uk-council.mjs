import {parseHtml,nodes,first,text} from './source-dom.mjs';

const NORTHAMPTON='https://www.northamptontowncouncil.gov.uk/food-vendor-application';
export function verifyUKCouncilForm(document,{now,version,applicationPolicy}) {
  if(document.requested_url?.split('#')[0]!==NORTHAMPTON||document.url?.split('#')[0]!==NORTHAMPTON)return null;
  const report={version,application_policy:applicationPolicy,source_url:document.url,checked_at:document.fetched_at,profile:'uk_council_dated_form',adapter_version:'northampton-vendor-form-v1',page_kind:'event',status:'unverified',facts:{},reasons:[],evidence:[]};
  if(document.reason||!document.html){report.reasons=[document.reason??'source_document_missing'];return report;}
  try {
    const root=parseHtml(document.html),main=first(root,n=>n.tag==='main')??first(root,n=>n.tag==='body')??root,body=text(main);
    const date=body.match(/Sunday\s+1(?:st)?\s+November\s+(20\d{2})\s*\|\s*The Racecourse,\s*Northampton/i);
    if(!date||!body.includes("Northampton's Annual Fireworks Spectacular")||!body.includes("Northampton Town Council's fireworks display"))throw Error('official_event_identity_not_proved');
    const day=date[1]+'-11-01';
    if(new Date(day+'T12:00:00Z').getUTCDay()!==0)throw Error('contradictory_event_weekday');
    const forms=nodes(main,n=>n.tag==='form',{scoped:true}).filter(f=>/FOOD VENDOR & REFRESHMENT STALL APPLICATION FORM/i.test(text(f)));
    if(forms.length!==1)throw Error('specific_trader_form_not_proved');
    const f=forms[0],labels=nodes(f,n=>n.tag==='label').map(n=>text(n)),active=nodes(f,n=>['input','textarea','select','button'].includes(n.tag)&&n.attrs.disabled===undefined),purpose=/Business Name/i.test(text(f))&&/What type of food or drink do you sell/i.test(text(f))&&active.some(n=>n.tag==='textarea')&&active.filter(n=>n.attrs.type==='text').length>=2;
    const action=new URL(f.attrs.action??'',document.url);action.hash='';
    if(!purpose||f.attrs.method?.toLowerCase()!=='post'||action.href!==NORTHAMPTON||!active.some(n=>n.attrs.type==='submit'))throw Error('active_specific_trader_form_not_proved');
    report.facts={event_name:"Northampton's Annual Fireworks Spectacular",country:'GB',organiser:'Northampton Town Council',location:'The Racecourse, Northampton',event_start:day,event_end:day,application_url:NORTHAMPTON,application_state:'UNKNOWN'};
    report.application_heading='FOOD VENDOR & REFRESHMENT STALL APPLICATION FORM';report.application_scope_proof={trader_application:true,restricted_audience:false};
    // The named local event, venue and council are jointly bound on its official
    // UK government application route. A search market or arbitrary .uk URL proves nothing.
    report.evidence=[{kind:'official_council_local_event',source_url:document.url,excerpt:date[0]+"; Northampton's Annual Fireworks Spectacular; Northampton Town Council's fireworks display"},
      {kind:'official_council_jurisdiction',source_url:document.url,excerpt:'Northampton Town Council; named local venue The Racecourse, Northampton; official northamptontowncouncil.gov.uk application'},
      {kind:'specific_active_vendor_form',source_url:document.url,excerpt:JSON.stringify({heading:report.application_heading,labels,method:f.attrs.method,action:action.href,business_and_food_fields:purpose,submit:true})}];
    if(day<now.slice(0,10))report.reasons.push('stale_edition');
    if(/applications? (?:are )?closed|fully booked|not accepting applications/i.test(body))report.reasons.push('application_closed');
    if(/waitlist|waiting list|enquiries? only|interest only/i.test(body))report.reasons.push('open_vendor_application_not_proved');
    if(!/APPLY NOW!/i.test(body))report.reasons.push('open_vendor_application_not_proved');
    if(!report.reasons.length)report.facts.application_state='OPEN_NOW';
    report.status=report.reasons.length?'partial':'verified';return report;
  }catch(e){report.reasons=[/^[a-z_]+$/.test(e.message)?e.message:'official_source_structure_changed'];return report;}
}
