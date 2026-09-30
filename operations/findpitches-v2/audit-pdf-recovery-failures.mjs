#!/usr/bin/env node
// Read-only audit of the most recent PDF recovery ledger batch.
// Emits only aggregate error categories/counts: no candidate IDs, URLs or customer data.
const API='https://api.cloudflare.com/client/v4';
const DB='6732bcc9-a172-4d38-ad4d-7660ed13392f';
const account=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
const token=String(process.env.CLOUDFLARE_API_TOKEN||'').trim();
if(!account||!token)throw new Error('pdf_audit_cloudflare_credentials_missing');

async function query(sql,params=[]){
 if(!/^\s*(?:SELECT|WITH)\b/i.test(sql)||/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|REPLACE)\b/i.test(sql)){
  throw new Error('pdf_audit_non_read_only_sql');
 }
 const response=await fetch(API+'/accounts/'+encodeURIComponent(account)+'/d1/database/'+DB+'/query',{
  method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},
  body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(20000)
 });
 const payload=await response.json();
 if(!response.ok||payload?.success!==true||payload?.result?.[0]?.success!==true){
  throw new Error('pdf_audit_d1_query_failed_http_'+response.status);
 }
 return payload.result[0].results||[];
}

const batch=(await query(`
 SELECT batch_id,lane,MIN(released_at) AS released_at,COUNT(*) AS total
 FROM pdf_recovery_ledger
 GROUP BY batch_id,lane
 ORDER BY released_at DESC
 LIMIT 1`))[0];
if(!batch)throw new Error('pdf_audit_no_recovery_batch');

const table=batch.lane==='classification'?'classification_queue':
 batch.lane==='enrichment'?'enrichment_queue':null;
if(!table)throw new Error('pdf_audit_unknown_lane');

const rows=await query(`
 SELECT q.status,
        COALESCE(NULLIF(TRIM(q.last_error),''),'(none)') AS last_error,
        COUNT(*) AS count
 FROM pdf_recovery_ledger l
 JOIN ${table} q ON q.candidate_id=l.candidate_id
 WHERE l.batch_id=? AND l.lane=?
 GROUP BY q.status,COALESCE(NULLIF(TRIM(q.last_error),''),'(none)')
 ORDER BY q.status,last_error`,[batch.batch_id,batch.lane]);

const terminal=new Set([
 'findpitches_v2_pdf_empty_text',
 'findpitches_v2_pdf_scanned_or_image_only',
 'findpitches_v2_pdf_encrypted',
 'findpitches_v2_pdf_malformed'
]);
const summary={batch_id:batch.batch_id,lane:batch.lane,released_at:batch.released_at,total:Number(batch.total||0),
 statuses:{},dead:{terminal:0,unexpected:0,categories:[]}};
for(const row of rows){
 const status=String(row.status||'unknown');
 const count=Number(row.count||0);
 summary.statuses[status]=(summary.statuses[status]||0)+count;
 if(status==='dead'){
  const error=String(row.last_error||'(none)');
  const isTerminal=terminal.has(error);
  if(isTerminal)summary.dead.terminal+=count; else summary.dead.unexpected+=count;
  summary.dead.categories.push({error,count,terminal:isTerminal});
 }
}
console.log(JSON.stringify(summary,null,2));
