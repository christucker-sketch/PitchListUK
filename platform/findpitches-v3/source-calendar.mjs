// Calendar precision is distinct from a publisher's exact closing instant.
// Europe/London is the existing customer/reporting calendar, not inferred
// event geography or a claimed source timezone. Its boundary is a recheck
// horizon; application_close_at is populated only from source-zoned evidence.
const calendar=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'});
export function sourceDay(now){return calendar.format(new Date(now));}
export function isCalendarDate(value){return typeof value==='string'&&/^\d{4}-\d\d-\d\d$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;}
export function isSourceInstant(value){return typeof value==='string'&&/^\d{4}-\d\d-\d\dT.+(?:Z|[+-]\d\d:?\d\d)$/.test(value)&&Number.isFinite(Date.parse(value));}
export function calendarHorizon(value){
 if(!isCalendarDate(value))return null;
 const next=Date.parse(value+'T00:00:00Z')+86400000;
 const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',hour:'2-digit',hourCycle:'h23'}).format(new Date(next)));
 return next-hour*3600000;
}
export function sourceDatePast(value,now){
 if(isSourceInstant(value))return Date.parse(value)<=Date.parse(now);
 const day=typeof value==='string'?value.slice(0,10):null;
 return isCalendarDate(day)&&day<sourceDay(now);
}
export function sourceWindowOpen(start,end,now){
 const localDay=value=>{const m=typeof value==='string'?value.match(/^(\d{4}-\d\d-\d\d)T(\d\d):(\d\d)(?::(\d\d)(?:\.\d+)?)?$/):null;return m&&isCalendarDate(m[1])&&Number(m[2])<24&&Number(m[3])<60&&(!m[4]||Number(m[4])<60)?m[1]:null;};
 const day=sourceDay(now),localStart=localDay(start),localEnd=localDay(end);
 // An unzoned clock cannot prove a same-day boundary. Strictly earlier/later
 // calendar dates are enough; same-day clocks require source-zoned evidence.
 const started=isSourceInstant(start)?Date.parse(start)<=Date.parse(now):isCalendarDate(start)?start<=day:isCalendarDate(localStart)&&localStart<day;
 const remains=isSourceInstant(end)?Date.parse(end)>Date.parse(now):isCalendarDate(end)?end>=day:isCalendarDate(localEnd)&&localEnd>day;
 return started&&remains;
}
export function eventenyVisibleClosing(body,ends){
 const matches=[...body.matchAll(/\bDeadline:\s*([A-Z][a-z]{2,8}\s+\d{1,2},\s*20\d{2})\s+(\d{1,2}):(\d{2})\s*(am|pm)\s*\(GMT([+-]\d{2}:\d{2})\)/gi)];
 const values=[];let contradiction=false;
 for(const m of matches){
  const date=new Date(m[1]+' 12:00:00 UTC'),h=Number(m[2]),minute=Number(m[3]);
  if(!Number.isFinite(date.getTime())||h<1||h>12||minute>59||Number(m[5].slice(1,3))>14||Number(m[5].slice(4))>59||Number(m[5].slice(1,3))===14&&Number(m[5].slice(4))!==0){contradiction=true;continue;}
  const day=date.toISOString().slice(0,10),clock=String(h%12+(m[4].toLowerCase()==='pm'?12:0)).padStart(2,'0')+':'+m[3],instant=day+'T'+clock+':00'+m[5];
  if(!isSourceInstant(instant))continue;
  const parsed=new Date(instant).toISOString();
  for(const end of ends){
   if(isSourceInstant(end)){if(Date.parse(end)!==Date.parse(parsed))contradiction=true;}
   else if(typeof end!=='string'||end.slice(0,10)!==day||end.includes('T')&&end.slice(11,16)!==clock)contradiction=true;
  }
  values.push(parsed);
 }
 const distinct=[...new Set(values)];return {instant:ends.length&&!contradiction&&distinct.length===1?distinct[0]:null,contradiction:contradiction||distinct.length>1};
}
export function proofExpiry(report,checked){
 let expiry=Date.parse(checked)+86400000;
 if(isSourceInstant(report.source_recheck_before))expiry=Math.min(expiry,Date.parse(report.source_recheck_before));
 if(isSourceInstant(report.application_close_at))expiry=Math.min(expiry,Date.parse(report.application_close_at));
 else if(isCalendarDate(report.facts?.application_deadline))expiry=Math.min(expiry,calendarHorizon(report.facts.application_deadline));
 if(isCalendarDate(report.facts?.event_end))expiry=Math.min(expiry,calendarHorizon(report.facts.event_end));
 return new Date(expiry).toISOString();
}
