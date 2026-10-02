#!/usr/bin/env node
import fs from 'node:fs';
import { projectPracticalOpportunity } from '../../platform/findpitches-v2/customer/practical-readiness.mjs';

const API='https://api.cloudflare.com/client/v4';
const DB='6732bcc9-a172-4d38-ad4d-7660ed13392f';
const account=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
const token=String(process.env.CLOUDFLARE_API_TOKEN||'').trim();
if(!account||!token)throw new Error('practical_false_accept_audit_credentials_missing');

async function query(sql,params=[]){
 if(!/^\s*(?:SELECT|WITH)\b/i.test(sql)||/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|REPLACE)\b/i.test(sql))throw new Error('practical_false_accept_non_read_only_sql');
 const response=await fetch(API+'/accounts/'+encodeURIComponent(account)+'/d1/database/'+DB+'/query',{
  method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},
  body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(20000)
 });
 const payload=await response.json();
 if(!response.ok||payload?.success!==true||payload?.result?.[0]?.success!==true)throw new Error('practical_false_accept_d1_http_'+response.status);
 return payload.result[0].results||[];
}

const now=new Date();
const candidates=[];
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
  const enrichment=parse(row.enrichment_json);
  const projected=projectPracticalOpportunity({...row,geography:parse(row.geography_json),candidate_id:row.id},enrichment,{now});
  if(!projected.readiness.ready)continue;
  const precision=projected.opportunity.location_precision;
  if(!['venue','place','area'].includes(precision))continue;
  const evidence=projected.provenance?.location?.evidence?.[0]||{};
  const excerpt=String(evidence.excerpt||'').replace(/\s+/g,' ').trim();
  const source=String(evidence.source||'').trim();
  candidates.push({
   id:row.id,market:row.market,region_code:row.region_code,
   title:projected.opportunity.title,
   location:projected.opportunity.location,
   location_precision:precision,
   location_confidence:projected.opportunity.location_confidence,
   venue_verified:Boolean(projected.opportunity.venue_verified),
   canonical_url:row.canonical_url,application_url:row.application_url,
   evidence_source:source,evidence_excerpt:excerpt,
   event_start:projected.opportunity.event_start,
   application_deadline:projected.opportunity.application_deadline,
   flags:riskFlags({location:projected.opportunity.location,excerpt,source})
  });
 }
 if(rows.length<100)break;
}

const quotas=[
 ['US','venue',6],['US','place',8],['US','area',8],
 ['GB','venue',4],['GB','place',4],['GB','area',6],
 ['*','venue',4],['*','place',4],['*','area',4]
];
const selected=[],used=new Set();
for(const [market,precision,count] of quotas){
 const pool=candidates.filter(x=>!used.has(x.id)&&x.location_precision===precision&&(market==='*'?!['US','GB'].includes(x.market):x.market===market));
 for(const row of spread(pool,count)){selected.push(row);used.add(row.id);}
}
// Fill to 48 from remaining usable rows if any quota is undersupplied.
for(const row of spread(candidates.filter(x=>!used.has(x.id)),48-selected.length)){selected.push(row);used.add(row.id);}

const summary={
 at:now.toISOString(),
 population_usable:candidates.length,
 sample_size:selected.length,
 by_market:countBy(selected,'market'),
 by_precision:countBy(selected,'location_precision'),
 flagged:selected.filter(x=>x.flags.length).length,
 flag_counts:countFlags(selected)
};
fs.writeFileSync('practical-false-accept-sample.json',JSON.stringify({summary,rows:selected},null,2));
console.log(JSON.stringify(summary,null,2));

function spread(rows,n){
 if(n<=0||!rows.length)return [];
 const sorted=[...rows].sort((a,b)=>a.id.localeCompare(b.id));
 if(sorted.length<=n)return sorted;
 const out=[];
 for(let i=0;i<n;i++)out.push(sorted[Math.floor(i*(sorted.length-1)/Math.max(1,n-1))]);
 return [...new Map(out.map(x=>[x.id,x])).values()];
}
function riskFlags({location,excerpt,source}){
 const flags=[];
 if(/\b(?:registered|head|corporate|business|contact|mailing|postal|billing)\s+(?:office|address|location|headquarters|contact)|\b(?:our\s+office|our\s+address|mail\s+to|contact\s+us|registered\s+at)\b/i.test(excerpt))flags.push('contact_context');
 if(!/\b(?:festival|fair|market|event|show|concert|vendor|trader|stallholder|exhibitor|apply|application|held|takes?\s+place|taking\s+place)\b/i.test(excerpt))flags.push('weak_event_context');
 if(!normalizedContains(excerpt,location))flags.push('location_not_literal_after_normalization');
 try{new URL(source)}catch{flags.push('invalid_evidence_url')}
 return flags;
}
function normalizedContains(haystack,needle){
 const normalize=v=>String(v||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
 const h=normalize(haystack),n=normalize(needle);return n.length>=3&&(' '+h+' ').includes(' '+n+' ');
}
function countBy(rows,key){return rows.reduce((o,r)=>(o[r[key]]=(o[r[key]]||0)+1,o),{});}
function countFlags(rows){const o={};for(const r of rows)for(const f of r.flags)o[f]=(o[f]||0)+1;return o;}
function parse(v){try{return JSON.parse(v||'{}');}catch{return {};}}
