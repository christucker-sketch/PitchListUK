#!/usr/bin/env node
import fs from 'node:fs';
import { createHttpFetchProvider } from '../../platform/findpitches-v2/providers/fetch/http.mjs';
import { TERMINAL_PDF_ERROR_CODES } from '../../platform/findpitches-v2/providers/fetch/pdf-error-policy.mjs';

const API='https://api.cloudflare.com/client/v4';
const DB='6732bcc9-a172-4d38-ad4d-7660ed13392f';
const account=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
const token=String(process.env.CLOUDFLARE_API_TOKEN||'').trim();
if(!account||!token)throw new Error('pdf_timeout_probe_credentials_missing');

async function query(sql,params=[]){
 if(!/^\s*(?:SELECT|WITH)\b/i.test(sql)||/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|REPLACE)\b/i.test(sql))throw new Error('pdf_timeout_probe_non_read_only_sql');
 const response=await fetch(API+'/accounts/'+encodeURIComponent(account)+'/d1/database/'+DB+'/query',{
  method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},
  body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(20000)
 });
 const payload=await response.json();
 if(!response.ok||payload?.success!==true||payload?.result?.[0]?.success!==true)throw new Error('pdf_timeout_probe_d1_http_'+response.status);
 return payload.result[0].results||[];
}

const batches=await query(`
 SELECT batch_id,lane,MIN(released_at) AS released_at
 FROM pdf_recovery_ledger GROUP BY batch_id,lane
 ORDER BY released_at DESC LIMIT 1`);
if(!batches.length){console.log(JSON.stringify({status:'no_batch'}));process.exit(0);}
const batch=batches[0],table=batch.lane==='enrichment'?'enrichment_queue':'classification_queue';
const placeholders=TERMINAL_PDF_ERROR_CODES.map(()=>'?').join(',');
const rows=await query(`
 SELECT l.candidate_id,q.last_error,c.market,c.canonical_url,c.application_url
 FROM pdf_recovery_ledger l
 JOIN ${table} q ON q.candidate_id=l.candidate_id
 JOIN candidates c ON c.id=l.candidate_id
 WHERE l.batch_id=? AND l.lane=? AND q.status='dead'
   AND q.last_error NOT IN (${placeholders})
 ORDER BY l.candidate_id LIMIT 12`,[batch.batch_id,batch.lane,...TERMINAL_PDF_ERROR_CODES]);

const provider=createHttpFetchProvider({timeoutMs:25000});
const results=[];
for(const row of rows){
 const attempts=[];
 for(const [kind,url] of [['canonical',row.canonical_url],['application',row.application_url]]){
  if(!url||attempts.some(x=>x.url===url))continue;
  try{
   const page=await provider.fetch(url);
   attempts.push({kind,url,status:'success',content_type:page.content_type||null,body_chars:String(page.body||'').length});
  }catch(error){
   attempts.push({kind,url,status:'failed',error:String(error?.message||error)});
  }
 }
 results.push({candidate_id:row.candidate_id,market:row.market,previous_error:row.last_error,attempts});
}
const summary={
 batch_id:batch.batch_id,lane:batch.lane,selected:rows.length,
 records_any_success:results.filter(r=>r.attempts.some(a=>a.status==='success')).length,
 records_all_failed:results.filter(r=>r.attempts.length&&r.attempts.every(a=>a.status==='failed')).length,
 attempt_successes:results.flatMap(r=>r.attempts).filter(a=>a.status==='success').length,
 attempt_failures:results.flatMap(r=>r.attempts).filter(a=>a.status==='failed').length,
 failure_codes:Object.fromEntries([...new Set(results.flatMap(r=>r.attempts).filter(a=>a.status==='failed').map(a=>a.error))].map(code=>[code,results.flatMap(r=>r.attempts).filter(a=>a.error===code).length]))
};
fs.writeFileSync('pdf-timeout-probe.json',JSON.stringify({summary,results},null,2));
console.log(JSON.stringify(summary,null,2));
