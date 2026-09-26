import { opportunitySnapshot } from '../../../functions/_data/opportunities.mjs';
import { usOpportunitySnapshot } from '../../../functions/_data/us-opportunities.mjs';
import { caOpportunitySnapshot } from '../../../functions/_data/ca-opportunities.mjs';

const API = 'https://api.findpitches.com';
const pageSize = 250;

function cleanText(value='') {
  return String(value).toLowerCase().replace(/&[^;]+;/g,' ').replace(/[^a-z0-9]+/g,' ').trim();
}
function tokens(value='') {
  return new Set(cleanText(value).split(/\s+/).filter(x => x.length > 2 && !['the','and','for','vendor','vendors','application','apply','become','event'].includes(x)));
}
function similarity(a,b) {
  const A=tokens(a), B=tokens(b); if(!A.size||!B.size) return 0;
  let n=0; for(const x of A) if(B.has(x)) n++;
  return n / Math.max(A.size,B.size);
}
function normUrl(value='') {
  try {
    const u=new URL(value); u.hash='';
    for(const k of [...u.searchParams.keys()]) if(/^utm_|^(gclid|fbclid)$/i.test(k)) u.searchParams.delete(k);
    return (u.hostname.replace(/^www\./,'')+u.pathname).replace(/\/$/,'').toLowerCase();
  } catch { return ''; }
}
function host(value='') { try { return new URL(value).hostname.replace(/^www\./,'').toLowerCase(); } catch { return ''; } }
function legacyRows() {
  return [
    ...opportunitySnapshot.rows.map(x=>({...x,market:'GB'})),
    ...usOpportunitySnapshot.rows.map(x=>({...x,market:'US'})),
    ...caOpportunitySnapshot.rows.map(x=>({...x,market:'CA'}))
  ];
}
async function fetchV2() {
  const rows=[];
  for(let offset=0;;offset+=pageSize){
    const u=`${API}/sample?status=validated&limit=${pageSize}&offset=${offset}`;
    const r=await fetch(u); if(!r.ok) throw new Error(`v2_fetch_failed_${r.status}`);
    const j=await r.json(); rows.push(...j.candidates);
    if(j.returned < pageSize) break;
  }
  return rows;
}
function legacyUrls(x){ return [x.source_url,x.canonical_url,x.application_url,x.url].filter(Boolean); }
function v2Urls(x){ return [x.canonical_url,x.application_url].filter(Boolean); }
function matchScore(oldRow,newRow){
  if(oldRow.market!==newRow.market) return {score:0,reason:'market'};
  const oldNorm=new Set(legacyUrls(oldRow).map(normUrl).filter(Boolean));
  const newNorm=new Set(v2Urls(newRow).map(normUrl).filter(Boolean));
  for(const u of newNorm) if(oldNorm.has(u)) return {score:1,reason:'exact_url'};
  const oldHosts=new Set(legacyUrls(oldRow).map(host).filter(Boolean));
  const newHosts=new Set(v2Urls(newRow).map(host).filter(Boolean));
  const sameHost=[...newHosts].some(h=>oldHosts.has(h));
  const name=Math.max(similarity(oldRow.event_name,newRow.event_name),similarity(oldRow.organiser,newRow.event_name),similarity(oldRow.event_name,newRow.organiser));
  const oldRegion=cleanText(oldRow.region_code||oldRow.region||oldRow.county);
  const newRegion=cleanText(newRow.region_code);
  const geo=oldRegion && newRegion && (oldRegion===newRegion || oldRegion.includes(newRegion) || newRegion.includes(oldRegion));
  if(sameHost && name>=0.25) return {score:0.92,reason:'same_host_name'};
  if(name>=0.72 && geo) return {score:0.88,reason:'name_geo'};
  if(name>=0.82) return {score:0.84,reason:'strong_name'};
  return {score:0,reason:'none'};
}
const legacy=legacyRows();
const v2=await fetchV2();
const matches=[]; const used=new Set();
for(const oldRow of legacy){
  let best=null;
  for(const n of v2){
    if(used.has(n.id)) continue;
    const m=matchScore(oldRow,n);
    if(!best||m.score>best.score) best={...m,newRow:n};
  }
  if(best?.score>=0.84){ used.add(best.newRow.id); matches.push({legacy:oldRow,v2:best.newRow,score:best.score,reason:best.reason}); }
}
const byMarket={};
for(const market of ['GB','US','CA']){
  const l=legacy.filter(x=>x.market===market), n=v2.filter(x=>x.market===market), m=matches.filter(x=>x.legacy.market===market);
  byMarket[market]={legacy:l.length,v2_validated:n.length,matched:m.length,legacy_only:l.length-m.length,v2_only:n.length-m.length,rediscovery_pct:l.length?Number((100*m.length/l.length).toFixed(1)):null};
}
const result={
  generated_at:new Date().toISOString(),
  method:'exact URL; same host + name; fuzzy name + geography; strong name',
  thresholds:{accepted:0.84},
  totals:{legacy:legacy.length,v2_validated:v2.length,matched:matches.length,legacy_only:legacy.length-matches.length,v2_only:v2.length-matches.length},
  by_market:byMarket,
  sample_matches:matches.slice(0,25).map(x=>({market:x.legacy.market,legacy:x.legacy.event_name,v2:x.v2.event_name,reason:x.reason,score:x.score})),
  sample_legacy_only:legacy.filter(x=>!matches.some(m=>m.legacy===x)).slice(0,40).map(x=>({market:x.market,event_name:x.event_name,url:legacyUrls(x)[0]||''})),
  sample_v2_only:v2.filter(x=>!used.has(x.id)).slice(0,40).map(x=>({market:x.market,id:x.id,event_name:x.event_name,url:x.canonical_url||x.application_url||''}))
};
console.log(JSON.stringify(result,null,2));
