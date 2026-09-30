#!/usr/bin/env node
const API='https://api.cloudflare.com/client/v4';
const DB='6732bcc9-a172-4d38-ad4d-7660ed13392f';
const account=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
const token=String(process.env.CLOUDFLARE_API_TOKEN||'').trim();
if(!account||!token)throw new Error('enrichment_requeue_credentials_missing');
const now=new Date().toISOString();

async function query(sql,params=[]){
 const response=await fetch(API+'/accounts/'+encodeURIComponent(account)+'/d1/database/'+DB+'/query',{
  method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},
  body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(20000)
 });
 const payload=await response.json();
 if(!response.ok||payload?.success!==true||payload?.result?.[0]?.success!==true)throw new Error('enrichment_requeue_d1_http_'+response.status);
 return payload.result[0];
}

const error='withEvidence is not defined';
const before=await query("SELECT status,COUNT(*) AS count FROM enrichment_queue WHERE last_error=? GROUP BY status ORDER BY status",[error]);
const updated=await query(`UPDATE enrichment_queue
 SET status='ready',attempts=0,available_at=?,lease_until=NULL,last_error=NULL,updated_at=?
 WHERE last_error=? AND status IN ('ready','dead')`,[now,now,error]);
const after=await query("SELECT status,COUNT(*) AS count FROM enrichment_queue WHERE last_error=? GROUP BY status ORDER BY status",[error]);
console.log(JSON.stringify({
 ok:true,error_code:error,
 before:before.results||[],
 requeued:Number(updated.meta?.changes||0),
 after:after.results||[],
 available_at:now
},null,2));
