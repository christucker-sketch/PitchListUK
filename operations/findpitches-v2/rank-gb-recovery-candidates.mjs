#!/usr/bin/env node
import fs from 'node:fs';

const API='https://api.cloudflare.com/client/v4';
const DB='6732bcc9-a172-4d38-ad4d-7660ed13392f';
const account=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
const token=String(process.env.CLOUDFLARE_API_TOKEN||'').trim();
if(!account||!token)throw new Error('gb_recovery_rank_credentials_missing');

async function query(sql,params=[]){
 if(!/^\s*(?:SELECT|WITH)\b/i.test(sql)||/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|REPLACE)\b/i.test(sql))throw new Error('gb_recovery_rank_non_read_only_sql');
 const response=await fetch(API+'/accounts/'+encodeURIComponent(account)+'/d1/database/'+DB+'/query',{
  method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},
  body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(20000)
 });
 const payload=await response.json();
 if(!response.ok||payload?.success!==true||payload?.result?.[0]?.success!==true)throw new Error('gb_recovery_rank_d1_http_'+response.status);
 return payload.result[0].results||[];
}

const rows=await query(`
SELECT c.id,c.region_code,c.canonical_url,c.application_url,c.event_name,c.organiser,
       c.geography_json,c.evidence_json,c.last_checked,e.enrichment_json
FROM candidates c
LEFT JOIN candidate_enrichment e ON e.candidate_id=c.id AND e.source_last_checked>=c.last_checked
WHERE c.status='validated' AND c.market='GB'
  AND (
    e.candidate_id IS NULL OR
    (json_extract(e.enrichment_json,'$.location.value') IS NULL
     AND json_extract(e.enrichment_json,'$.location_area.value') IS NULL)
  )
ORDER BY c.last_checked ASC,c.id ASC
LIMIT 500
`);

const ranked=rows.map(row=>{
 const geo=parse(row.geography_json),evidence=parseArray(row.evidence_json);
 const haystack=[
  row.event_name,row.organiser,row.canonical_url,row.application_url,
  geo?.region,geo?.locality,geo?.subregion,
  ...evidence.flatMap(item=>[item?.title,item?.snippet,item?.excerpt,item?.value])
 ].filter(Boolean).join(' ');
 let score=0;const reasons=[];
 const add=(points,reason)=>{score+=points;reasons.push(reason);};
 if(geo?.locality){add(30,'stored_locality');}
 if(/\b(?:venue|where|location|showground|showgrounds|park|hall|centre|center|square|racecourse|palace|castle|arena|stadium)\b/i.test(haystack))add(20,'venue_or_location_terms');
 if(/\b(?:festival|fair|market|show|expo|exhibition|fete|carnival|parade)\b/i.test(haystack))add(10,'event_term');
 if(/\b(?:apply|application|vendor|trader|stallholder|exhibitor|pitch)\b/i.test(haystack))add(10,'application_term');
 if(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2},\s*[A-Z][a-z]+(?:shire)?\b/.test(haystack))add(20,'place_comma_region_shape');
 if(/\b(?:instagram|facebook|twitter|x\.com|tiktok)\b/i.test([row.canonical_url,row.application_url].filter(Boolean).join(' '))){score-=40;reasons.push('social_source');}
 if(/\b(?:terms|privacy|cookie|legal|procurement|supplier|tender|rfp)\b/i.test([row.canonical_url,row.application_url].filter(Boolean).join(' '))){score-=35;reasons.push('policy_or_procurement');}
 if(/\b(?:fair trader scheme|purchasing vendor|homechoice|business directory|trade account|wholesale account)\b/i.test(haystack)){score-=30;reasons.push('known_non_event_pattern');}
 if(/\b(?:united\s+states|usa|new\s+jersey|massachusetts|michigan|florida|california|texas|pennsylvania|ohio|oregon|ocala)\b/i.test(haystack)||/\bNJ\b/.test(haystack)){score-=60;reasons.push('strong_us_hint');}
 if(/\/(?:news|press|news-press|press-release|press-releases)(?:\/|$)/i.test(String(row.canonical_url||''))){score-=30;reasons.push('news_or_press_path');}
 return {
  id:row.id,region_code:row.region_code,title:row.event_name,canonical_url:row.canonical_url,
  score,reasons:[...new Set(reasons)],locality:geo?.locality||null
 };
}).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));

const output={
 at:new Date().toISOString(),
 total_ranked:ranked.length,
 score_bands:{
  gte40:ranked.filter(x=>x.score>=40).length,
  gte30:ranked.filter(x=>x.score>=30).length,
  gte20:ranked.filter(x=>x.score>=20).length,
  lt0:ranked.filter(x=>x.score<0).length
 },
 top:ranked.slice(0,60)
};
fs.writeFileSync('gb-recovery-ranking.json',JSON.stringify(output,null,2));
console.log(JSON.stringify({...output,top:output.top.slice(0,20)},null,2));

function parse(v){try{return JSON.parse(v||'{}');}catch{return {};}}
function parseArray(v){try{const x=JSON.parse(v||'[]');return Array.isArray(x)?x:[];}catch{return [];}}
