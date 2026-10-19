#!/usr/bin/env node
const API='https://api.cloudflare.com/client/v4';
const DB='6732bcc9-a172-4d38-ad4d-7660ed13392f';
const account=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
const token=String(process.env.CLOUDFLARE_API_TOKEN||'').trim();
const batch=String(process.env.DOCX_DEAD_REQUEUE_BATCH_ID||'2026-09-30-docx-dead-v1').trim();
const limit=Math.max(1,Math.min(Number(process.env.DOCX_DEAD_REQUEUE_LIMIT||20),25));
if(!account||!token)throw new Error('docx_dead_requeue_credentials_missing');
if(!batch)throw new Error('docx_dead_requeue_batch_missing');

async function query(sql,params=[]){
 const response=await fetch(API+'/accounts/'+encodeURIComponent(account)+'/d1/database/'+DB+'/query',{
  method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},
  body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(20000)
 });
 const payload=await response.json();
 if(!response.ok||payload?.success!==true||payload?.result?.[0]?.success!==true){
  throw new Error('docx_dead_requeue_d1_http_'+response.status+':'+JSON.stringify(payload?.errors||[]));
 }
 return payload.result[0];
}

const markerKey='docx_dead_requeue:'+batch;
const prior=await query('SELECT value,updated_at FROM runtime_meta WHERE key=?',[markerKey]);
if(prior.results?.length){
 console.log(JSON.stringify({ok:true,already_complete:true,batch_id:batch,marker:prior.results[0]},null,2));
 process.exit(0);
}

const exact='findpitches_v2_fetch_content_type_unsupported:application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const rows=await query(`
 SELECT q.candidate_id,c.market,c.event_name,c.canonical_url,c.application_url,q.attempts,q.last_error
 FROM enrichment_queue q
 JOIN candidates c ON c.id=q.candidate_id
 WHERE q.status='dead' AND q.last_error=? AND c.status='validated'
 ORDER BY q.updated_at ASC,q.candidate_id ASC
 LIMIT ?
`,[exact,limit]);
const selected=Array.isArray(rows.results)?rows.results:[];
const now=new Date().toISOString();
let requeued=0;
const outcomes=[];
for(const row of selected){
 const updated=await query(`
  UPDATE enrichment_queue
     SET status='ready',attempts=0,available_at=?,lease_until=NULL,last_error=NULL,updated_at=?
   WHERE candidate_id=? AND status='dead' AND last_error=?
 `,[now,now,row.candidate_id,exact]);
 const changed=Number(updated.meta?.changes||0)===1;
 if(changed)requeued++;
 outcomes.push({
  candidate_id:row.candidate_id,market:row.market,event_name:row.event_name,
  canonical_url:row.canonical_url,application_url:row.application_url,
  previous_attempts:Number(row.attempts||0),requeued:changed
 });
}
await query(`
 INSERT INTO runtime_meta (key,value,updated_at) VALUES (?,?,?)
 ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at
`,[markerKey,JSON.stringify({selected:selected.length,requeued,available_at:now,candidate_ids:selected.map(row=>row.candidate_id)}),now]);

console.log(JSON.stringify({
 ok:true,already_complete:false,batch_id:batch,selected:selected.length,requeued,available_at:now,outcomes
},null,2));
