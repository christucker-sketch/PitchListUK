#!/usr/bin/env node
import historical from '../../platform/findpitches-v2/quality/us-venue-review-2026-09-29.json' with { type: 'json' };
import followup from '../../platform/findpitches-v2/quality/us-venue-review-2026-09-29-followup.json' with { type: 'json' };
import { projectPracticalOpportunity } from '../../platform/findpitches-v2/customer/practical-readiness.mjs';

const API='https://api.cloudflare.com/client/v4';
const DB='6732bcc9-a172-4d38-ad4d-7660ed13392f';
const account=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
const token=String(process.env.CLOUDFLARE_API_TOKEN||'').trim();
if(!account||!token)throw new Error('review_benchmark_cloudflare_credentials_missing');

async function query(sql,params=[]){
 if(!/^\s*(?:SELECT|WITH)\b/i.test(sql)||/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|REPLACE)\b/i.test(sql))throw new Error('review_benchmark_non_read_only_sql');
 const response=await fetch(API+'/accounts/'+encodeURIComponent(account)+'/d1/database/'+DB+'/query',{
  method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},
  body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(20000)
 });
 const payload=await response.json();
 if(!response.ok||payload?.success!==true||payload?.result?.[0]?.success!==true)throw new Error('review_benchmark_d1_http_'+response.status);
 return payload.result[0].results||[];
}

const ids=[...historical.map(x=>x.opportunity_id),...(followup.records||[]).map(x=>x.opportunity_id)];
if(ids.length!==32||new Set(ids).size!==32)throw new Error('review_benchmark_manifest_shape_changed');
const placeholders=ids.map(()=>'?').join(',');
const rows=await query(`
 SELECT c.id,c.market,c.region_code,c.canonical_url,c.application_url,c.event_name,c.organiser,
        c.geography_json,c.status,c.last_checked,e.enrichment_json,e.source_last_checked
 FROM candidates c
 LEFT JOIN candidate_enrichment e ON e.candidate_id=c.id
 WHERE c.id IN (${placeholders})`,ids);
const byId=new Map(rows.map(r=>[r.id,r]));
const out={
 reviewed_manifest:32,present:0,missing:0,validated:0,current_enrichment:0,
 stale_or_missing_enrichment:0,practical_ready:0,
 location_precision:{venue:0,place:0,area:0,none:0},
 venue_review_still_projects_as_venue:0,
 review_set_not_currently_venue:0
};
for(const id of ids){
 const row=byId.get(id);
 if(!row){out.missing++;continue;}
 out.present++;
 if(row.status==='validated')out.validated++;
 if(!row.enrichment_json||String(row.source_last_checked||'')<String(row.last_checked||'')){
  out.stale_or_missing_enrichment++;continue;
 }
 out.current_enrichment++;
 const candidate={...row,candidate_id:row.id,geography:parse(row.geography_json)};
 const projected=projectPracticalOpportunity(candidate,parse(row.enrichment_json));
 const precision=projected.opportunity.location_precision||'none';
 out.location_precision[precision]=(out.location_precision[precision]||0)+1;
 if(projected.readiness.ready)out.practical_ready++;
 if(precision==='venue')out.venue_review_still_projects_as_venue++;
 else out.review_set_not_currently_venue++;
}
console.log(JSON.stringify(out,null,2));
function parse(v){try{return JSON.parse(v||'{}');}catch{return {};}}
