#!/usr/bin/env node
import fs from 'node:fs';

const API='https://api.cloudflare.com/client/v4';
const DB='6732bcc9-a172-4d38-ad4d-7660ed13392f';
const account=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
const token=String(process.env.CLOUDFLARE_API_TOKEN||'').trim();
if(!account||!token)throw new Error('unsupported_fetch_audit_credentials_missing');

async function query(sql,params=[]){
 if(!/^\s*(?:SELECT|WITH)\b/i.test(sql)||/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|REPLACE)\b/i.test(sql))throw new Error('unsupported_fetch_audit_non_read_only_sql');
 const response=await fetch(API+'/accounts/'+encodeURIComponent(account)+'/d1/database/'+DB+'/query',{
  method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},
  body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(20000)
 });
 const payload=await response.json();
 if(!response.ok||payload?.success!==true||payload?.result?.[0]?.success!==true)throw new Error('unsupported_fetch_audit_d1_http_'+response.status);
 return payload.result[0].results||[];
}

const classification=await query(`
 SELECT q.last_error,q.status,c.market,COUNT(*) AS count
 FROM classification_queue q
 JOIN candidates c ON c.id=q.candidate_id
 WHERE q.last_error LIKE 'findpitches_v2_fetch_content_type_unsupported:%'
 GROUP BY q.last_error,q.status,c.market
 ORDER BY count DESC,q.last_error
`);

const enrichment=await query(`
 SELECT q.last_error,q.status,c.market,COUNT(*) AS count
 FROM enrichment_queue q
 JOIN candidates c ON c.id=q.candidate_id
 WHERE q.last_error LIKE 'findpitches_v2_fetch_content_type_unsupported:%'
 GROUP BY q.last_error,q.status,c.market
 ORDER BY count DESC,q.last_error
`);

const recent=await query(`
 SELECT 'classification' AS lane,q.candidate_id,c.market,c.event_name,c.canonical_url,c.application_url,q.status,q.attempts,q.last_error,q.updated_at
 FROM classification_queue q JOIN candidates c ON c.id=q.candidate_id
 WHERE q.last_error LIKE 'findpitches_v2_fetch_content_type_unsupported:%'
 UNION ALL
 SELECT 'enrichment' AS lane,q.candidate_id,c.market,c.event_name,c.canonical_url,c.application_url,q.status,q.attempts,q.last_error,q.updated_at
 FROM enrichment_queue q JOIN candidates c ON c.id=q.candidate_id
 WHERE q.last_error LIKE 'findpitches_v2_fetch_content_type_unsupported:%'
 ORDER BY updated_at DESC
 LIMIT 50
`);

const result={
 at:new Date().toISOString(),
 classification,
 enrichment,
 totals:{
  classification:classification.reduce((n,r)=>n+Number(r.count||0),0),
  enrichment:enrichment.reduce((n,r)=>n+Number(r.count||0),0)
 },
 recent
};
fs.writeFileSync('unsupported-fetch-content-types.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({...result,recent:result.recent.slice(0,20)},null,2));
