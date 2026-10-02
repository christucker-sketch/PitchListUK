#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');

const PATTERNS={
  opening_later:/\b(?:applications?|bookings?|registrations?)\s+(?:will\s+)?(?:re-?)?open\b|\bopening soon\b|\bcoming soon\b|\bregister (?:your )?interest\b|\bcheck (?:this page )?again for future opportunities\b|\bnot currently accepting applications?\b/i,
  recurring:/\bannual\b|\bevery year\b|\byearly\b|\breturns?\b|\bback (?:again|for)\b|\bweekly\b|\bmonthly\b/i,
  trader_terms:/traders? wanted|call for traders|stallholders? wanted|book a (?:pitch|stall)|apply to trade|pitch fees?|stall fees?|trade stands?|trader (?:pack|information|terms)|exhibitor (?:pack|booking)|catering concession|refreshment concession|expressions? of interest|trade enquiries|traders? (?:info|bookings?)/i,
  form_host:/docs\.google\.com\/forms|forms\.gle|forms\.office\.com|jotform|typeform/i
};

function analyse(row) {
  const text=[row.source_evidence,row.event_name,row.notes,row.application_url,row.source_url].join(' ');
  const flags=Object.entries(PATTERNS).filter(([,rx])=>rx.test(text)).map(([name])=>name);
  if (/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/.test(text) && /trad|stall|pitch|exhibit|cater/i.test(text)) flags.push('contact_route');
  if (/\.pdf(?:$|[?#])/i.test(String(row.application_url || row.source_url || ''))) flags.push('pdf');
  const reasons=Array.isArray(row.quality_reasons) ? row.quality_reasons : String(row.quality_reasons || '').split(/[;,|]/).filter(Boolean);
  return {...row,audit_flags:[...new Set(flags)],audit_score:[...new Set(flags)].reduce((n,f)=>n+({trader_terms:2,opening_later:2,form_host:2,recurring:1,contact_route:1,pdf:1}[f]||1),0),quality_reasons:reasons};
}

function auditManifests(files) {
  const rows=[];
  for (const file of files) {
    const data=JSON.parse(fs.readFileSync(file,'utf8'));
    for (const row of data.records || []) if (row.quality_status !== 'customer_ready') rows.push(analyse(row));
  }
  const reasons={};
  for (const row of rows) for (const reason of row.quality_reasons) reasons[reason]=(reasons[reason]||0)+1;
  const flagged=rows.filter(r=>r.audit_score>0).sort((a,b)=>b.audit_score-a.audit_score);
  return {rejects:rows.length,reasons,flagged_count:flagged.length,top_flagged:flagged.slice(0,100)};
}

function main(){
  const dir=process.argv[2];
  const out=process.argv[3] || 'reject-audit.json';
  if(!dir) throw new Error('Usage: node scripts/audit-rejects.js <staging-dir> [output.json]');
  const files=fs.readdirSync(dir).filter(n=>/^reviewed-events-.*\.json$/.test(n)).map(n=>path.join(dir,n));
  const result=auditManifests(files);
  fs.writeFileSync(out,JSON.stringify(result,null,2));
  console.log(JSON.stringify({rejects:result.rejects,flagged:result.flagged_count,reasons:result.reasons,output:out},null,2));
}

if(require.main===module){try{main();}catch(error){console.error(error.message);process.exit(1);}}
module.exports={analyse,auditManifests,PATTERNS};
