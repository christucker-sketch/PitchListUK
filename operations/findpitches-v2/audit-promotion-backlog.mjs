#!/usr/bin/env node
// Aggregate, read-only breakdown of validated projection/enrichment backlog.
const API='https://api.cloudflare.com/client/v4';
const DB='6732bcc9-a172-4d38-ad4d-7660ed13392f';
const account=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
const token=String(process.env.CLOUDFLARE_API_TOKEN||'').trim();
if(!account||!token)throw new Error('promotion_audit_cloudflare_credentials_missing');
async function query(sql,params=[]){
 if(!/^\s*(?:SELECT|WITH)\b/i.test(sql)||/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|REPLACE)\b/i.test(sql))throw new Error('promotion_audit_non_read_only_sql');
 const response=await fetch(API+'/accounts/'+encodeURIComponent(account)+'/d1/database/'+DB+'/query',{
  method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},
  body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(20000)
 });
 const payload=await response.json();
 if(!response.ok||payload?.success!==true||payload?.result?.[0]?.success!==true)throw new Error('promotion_audit_d1_http_'+response.status);
 return payload.result[0].results||[];
}
const rows=await query(`
WITH validated AS (
 SELECT c.id,c.market,c.last_checked,
        e.source_last_checked AS enrichment_checked,
        o.last_checked AS projection_checked,
        o.location,o.location_evidence_url,
        d.disposition,d.reason,
        d.source_last_checked AS disposition_source_checked,
        d.enrichment_last_checked AS disposition_enrichment_checked
 FROM candidates c
 LEFT JOIN candidate_enrichment e ON e.candidate_id=c.id
 LEFT JOIN customer_opportunities o ON o.id=c.id
 LEFT JOIN customer_promotion_disposition d ON d.candidate_id=c.id
 WHERE c.status='validated'
), labelled AS (
 SELECT market,
 CASE
  WHEN projection_checked>=last_checked
   AND NULLIF(TRIM(location),'') IS NOT NULL
   AND NULLIF(TRIM(location_evidence_url),'') IS NOT NULL
   THEN 'current_source_backed_projection'
  WHEN enrichment_checked IS NULL THEN 'no_enrichment'
  WHEN enrichment_checked<last_checked THEN 'stale_enrichment'
  WHEN projection_checked>=last_checked THEN 'current_projection_missing_source_location'
  WHEN disposition_source_checked=last_checked
   AND disposition_enrichment_checked=enrichment_checked
   AND disposition='not_ready' THEN 'current_enrichment_not_ready'
  WHEN disposition_source_checked=last_checked
   AND disposition_enrichment_checked=enrichment_checked
   AND disposition='promoted' THEN 'promoted_disposition_projection_stale'
  ELSE 'current_enrichment_awaiting_promotion'
 END AS bucket
 FROM validated
)
SELECT market,bucket,COUNT(*) AS count
FROM labelled GROUP BY market,bucket ORDER BY market,bucket`);
const totals={};
for(const row of rows){
 totals[row.bucket]=(totals[row.bucket]||0)+Number(row.count||0);
}
const queue=(await query(`
SELECT
 (SELECT COUNT(*) FROM enrichment_queue WHERE status='ready') AS enrichment_ready,
 (SELECT COUNT(*) FROM enrichment_queue WHERE status='dead') AS enrichment_dead,
 (SELECT COUNT(*) FROM classification_queue WHERE status='ready') AS classifier_ready,
 (SELECT COUNT(*) FROM classification_queue WHERE status='dead') AS classifier_dead,
 (SELECT COUNT(*) FROM customer_promotion_disposition WHERE disposition='not_ready') AS promotion_not_ready,
 (SELECT COUNT(*) FROM customer_promotion_disposition WHERE disposition='promoted') AS promotion_promoted`))[0]||{};
console.log(JSON.stringify({totals,by_market:rows,queues:queue},null,2));
