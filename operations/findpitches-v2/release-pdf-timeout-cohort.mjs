#!/usr/bin/env node
const API='https://api.cloudflare.com/client/v4';
const DB='6732bcc9-a172-4d38-ad4d-7660ed13392f';
const account=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
const token=String(process.env.CLOUDFLARE_API_TOKEN||'').trim();
if(!account||!token)throw new Error('pdf_timeout_release_credentials_missing');

async function query(sql,params=[]){
 const response=await fetch(API+'/accounts/'+encodeURIComponent(account)+'/d1/database/'+DB+'/query',{
  method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},
  body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(20000)
 });
 const payload=await response.json();
 if(!response.ok||payload?.success!==true||payload?.result?.[0]?.success!==true)throw new Error('pdf_timeout_release_d1_http_'+response.status);
 return payload.result[0];
}

const health=await fetch('https://api.findpitches.com/health',{signal:AbortSignal.timeout(15000)}).then(r=>r.json());
if(health.ok!==true||health.database!=='isolated'||health.mode!=='shadow'||health.publication_enabled!==false||Number(health.pdf_fetch_timeout_ms)!==25000){
 throw new Error('pdf_timeout_release_runtime_not_proven');
}
const batch=(await query(`SELECT batch_id,lane,MIN(released_at) AS released_at FROM pdf_recovery_ledger
 GROUP BY batch_id,lane ORDER BY released_at DESC LIMIT 1`)).results?.[0];
if(!batch||batch.lane!=='classification')throw new Error('pdf_timeout_release_latest_batch_unexpected');
const rows=(await query(`SELECT l.candidate_id,q.last_error,q.status
 FROM pdf_recovery_ledger l JOIN classification_queue q ON q.candidate_id=l.candidate_id
 WHERE l.batch_id=? AND l.lane='classification' AND q.status='dead' AND q.last_error='timeout'
 ORDER BY l.candidate_id`,[batch.batch_id])).results||[];
if(rows.length===0){
 console.log(JSON.stringify({ok:true,status:'already_released_or_processed',batch_id:batch.batch_id}));
 process.exit(0);
}
if(rows.length>4)throw new Error('pdf_timeout_release_scope_exceeded:'+rows.length);
const ids=rows.map(r=>r.candidate_id);
const marks=ids.map(()=>'?').join(',');
const now=new Date().toISOString();
const result=await query(`UPDATE classification_queue SET status='ready',attempts=0,available_at=?,
 lease_until=NULL,last_error='pdf_timeout_extended_retry',updated_at=?
 WHERE status='dead' AND last_error='timeout' AND candidate_id IN (${marks})`,[now,now,...ids]);
const changes=Number(result.meta?.changes||0);
if(changes!==ids.length)throw new Error('pdf_timeout_release_change_mismatch:'+changes+'/'+ids.length);
console.log(JSON.stringify({ok:true,status:'released',batch_id:batch.batch_id,released:changes,publication_enabled:false}));
