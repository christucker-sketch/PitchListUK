#!/usr/bin/env node
import { projectPracticalOpportunity } from '../../platform/findpitches-v2/customer/practical-readiness.mjs';

const API='https://api.cloudflare.com/client/v4';
const DB='6732bcc9-a172-4d38-ad4d-7660ed13392f';
const account=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
const token=String(process.env.CLOUDFLARE_API_TOKEN||'').trim();
if(!account||!token)throw new Error('practical_audit_cloudflare_credentials_missing');

async function query(sql,params=[]){
 if(!/^\s*(?:SELECT|WITH)\b/i.test(sql)||/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|REPLACE)\b/i.test(sql))throw new Error('practical_audit_non_read_only_sql');
 const response=await fetch(API+'/accounts/'+encodeURIComponent(account)+'/d1/database/'+DB+'/query',{
  method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},
  body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(20000)
 });
 const payload=await response.json();
 if(!response.ok||payload?.success!==true||payload?.result?.[0]?.success!==true)throw new Error('practical_audit_d1_http_'+response.status);
 return payload.result[0].results||[];
}

const now=new Date();
const totals={current_enrichment:0,usable:0,usable_partial:0,enhanced:0,hard_blocked:0,location:{venue:0,place:0,area:0,none:0},missing:{},blocked:{}};
const markets={};
let after='';
for(;;){
 const rows=await query(`
 SELECT c.id,c.market,c.region_code,c.canonical_url,c.application_url,c.event_name,c.organiser,
        c.geography_json,c.last_checked,e.enrichment_json
 FROM candidates c
 JOIN candidate_enrichment e ON e.candidate_id=c.id AND e.source_last_checked>=c.last_checked
 WHERE c.status='validated' AND c.id>?
 ORDER BY c.id ASC LIMIT 100`,[after]);
 if(!rows.length)break;
 for(const row of rows){
  after=row.id;
  const candidate={...row,geography:parse(row.geography_json),candidate_id:row.id};
  const result=projectPracticalOpportunity(candidate,parse(row.enrichment_json),{now});
  const ready=result.readiness.ready;
  const precision=result.opportunity.location_precision||'none';
  const market=String(row.market||'unknown');
  if(!markets[market])markets[market]={current_enrichment:0,usable:0,usable_partial:0,enhanced:0,hard_blocked:0,location:{venue:0,place:0,area:0,none:0},missing:{},blocked:{}};
  for(const target of [totals,markets[market]]){
   target.current_enrichment++;
   target.location[precision]=(target.location[precision]||0)+1;
   if(ready){
    target.usable++;
    const complete=result.readiness.completeness||{};
    if(complete.venue&&complete.event_date&&complete.application_deadline)target.enhanced++;
    else target.usable_partial++;
   }else target.hard_blocked++;
   for(const field of result.readiness.missing)target.missing[field]=(target.missing[field]||0)+1;
   for(const item of result.readiness.blocked){
    const key=String(item.code||'unknown')+':'+String(item.field||'unknown');
    target.blocked[key]=(target.blocked[key]||0)+1;
   }
  }
 }
 if(rows.length<100)break;
}
const metaRows=await query(`SELECT key,value,updated_at FROM runtime_meta
 WHERE key IN ('enrichment_ruleset_version','enrichment_ruleset_sweep_version','enrichment_ruleset_sweep_started_at')
 ORDER BY key`);
const ruleset_meta=Object.fromEntries(metaRows.map(row=>[row.key,{value:row.value,updated_at:row.updated_at}]));
const sweepStarted=ruleset_meta.enrichment_ruleset_sweep_started_at?.value||null;
const refreshEligibility=sweepStarted?(await query(`
 SELECT
  SUM(CASE WHEN c.status='validated' THEN 1 ELSE 0 END) AS validated,
  SUM(CASE WHEN c.status='validated' AND c.last_checked<=? THEN 1 ELSE 0 END) AS candidate_before_sweep,
  SUM(CASE WHEN c.status='validated' AND e.candidate_id IS NOT NULL AND e.enriched_at<? THEN 1 ELSE 0 END) AS enrichment_before_sweep,
  SUM(CASE WHEN c.status='validated' AND c.last_checked<=? AND e.candidate_id IS NOT NULL AND e.enriched_at<? THEN 1 ELSE 0 END) AS both_before_sweep,
  SUM(CASE WHEN c.status='validated' AND c.last_checked<=? AND (e.candidate_id IS NULL OR e.enriched_at<?)
            AND (q.candidate_id IS NULL OR q.status!='leased' OR q.lease_until<=?) THEN 1 ELSE 0 END) AS selector_eligible
 FROM candidates c
 LEFT JOIN candidate_enrichment e ON e.candidate_id=c.id
 LEFT JOIN enrichment_queue q ON q.candidate_id=c.id`,[
 sweepStarted,sweepStarted,sweepStarted,sweepStarted,sweepStarted,sweepStarted,now.toISOString()
]))[0]:null;
const queueSinceSweep=sweepStarted?(await query(`
 SELECT status,COALESCE(NULLIF(TRIM(last_error),''),'(none)') AS last_error,COUNT(*) AS count
 FROM enrichment_queue
 WHERE updated_at>=?
 GROUP BY status,COALESCE(NULLIF(TRIM(last_error),''),'(none)')
 ORDER BY count DESC,status,last_error`,[sweepStarted])):[];
const refreshQueue=sweepStarted?(await query(`
 SELECT status,COUNT(*) AS count
 FROM enrichment_queue
 WHERE last_error=?
 GROUP BY status ORDER BY status`,['ruleset_refresh:2026-09-30-practical-location-v1'])):[];
const enrichedSinceSweep=sweepStarted?(await query(`
 SELECT COUNT(*) AS count
 FROM candidate_enrichment
 WHERE enriched_at>=?`,[sweepStarted])):[];
const locationAreaStored=(await query(`SELECT
 COUNT(*) AS total,
 SUM(CASE WHEN json_extract(enrichment_json,'$.location_area.precision')='place' THEN 1 ELSE 0 END) AS place,
 SUM(CASE WHEN json_extract(enrichment_json,'$.location_area.precision')='area' THEN 1 ELSE 0 END) AS area
 FROM candidate_enrichment
 WHERE json_extract(enrichment_json,'$.location_area.value') IS NOT NULL`))[0]||{};
console.log(JSON.stringify({at:now.toISOString(),ruleset_meta,refresh_eligibility:refreshEligibility,queue_since_sweep:queueSinceSweep,refresh_queue:refreshQueue,enriched_since_sweep:Number(enrichedSinceSweep?.[0]?.count||0),location_area_stored:{
 total:Number(locationAreaStored.total||0),place:Number(locationAreaStored.place||0),area:Number(locationAreaStored.area||0)
},totals,markets},null,2));
function parse(v){try{return JSON.parse(v||'{}');}catch{return {};}}
