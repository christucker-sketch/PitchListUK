#!/usr/bin/env node
const API='https://api.cloudflare.com/client/v4';
const DB='6732bcc9-a172-4d38-ad4d-7660ed13392f';
const account=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
const token=String(process.env.CLOUDFLARE_API_TOKEN||'').trim();
if(!account||!token)throw new Error('city_candidate_audit_credentials_missing');

async function query(sql,params=[]){
 if(!/^\s*(?:SELECT|WITH)\b/i.test(sql)||/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|REPLACE)\b/i.test(sql))throw new Error('city_candidate_audit_non_read_only_sql');
 const response=await fetch(API+'/accounts/'+encodeURIComponent(account)+'/d1/database/'+DB+'/query',{
  method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},
  body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(20000)
 });
 const payload=await response.json();
 if(!response.ok||payload?.success!==true||payload?.result?.[0]?.success!==true)throw new Error('city_candidate_audit_d1_http_'+response.status);
 return payload.result[0].results||[];
}
const rows=await query(`
WITH base AS (
 SELECT c.id,c.status,c.last_checked,
        json_extract(c.geography_json,'$.region') AS region,
        e.source_last_checked AS enrichment_checked,
        json_extract(e.enrichment_json,'$.location_area.precision') AS location_precision,
        json_extract(e.enrichment_json,'$.location_area.value') AS location_value
 FROM candidates c
 LEFT JOIN candidate_enrichment e ON e.candidate_id=c.id
 WHERE c.market='US'
), labelled AS (
 SELECT *,
 CASE WHEN region GLOB '* [A-Z][A-Z]' THEN 1 ELSE 0 END AS looks_city_job
 FROM base
)
SELECT
 SUM(looks_city_job) AS city_candidates,
 SUM(CASE WHEN looks_city_job=1 AND status='validated' THEN 1 ELSE 0 END) AS city_validated,
 SUM(CASE WHEN looks_city_job=1 AND status='validated' AND enrichment_checked>=last_checked THEN 1 ELSE 0 END) AS city_current_enrichment,
 SUM(CASE WHEN looks_city_job=1 AND status='validated' AND enrichment_checked>=last_checked AND location_precision='place' THEN 1 ELSE 0 END) AS city_place_evidence,
 SUM(CASE WHEN looks_city_job=1 AND status='validated' AND enrichment_checked>=last_checked AND location_precision='area' THEN 1 ELSE 0 END) AS city_area_evidence,
 SUM(CASE WHEN looks_city_job=1 AND status='validated' AND (enrichment_checked IS NULL OR enrichment_checked<last_checked) THEN 1 ELSE 0 END) AS city_needs_current_enrichment,
 SUM(CASE WHEN looks_city_job=0 THEN 1 ELSE 0 END) AS non_city_candidates
FROM labelled`);
console.log(JSON.stringify(rows[0]||{},null,2));
