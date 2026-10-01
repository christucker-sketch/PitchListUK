const API = 'https://api.findpitches.com';
const MARKETS = ['GB','US','CA','AU','IE','NZ','SG','HK'];
const PAGE_SIZE = 250;
const SAMPLE_LIMIT = 50;

function present(v) { return v !== null && v !== undefined && String(v).trim() !== ''; }
function validUrl(v) { try { const u = new URL(v); return /^https?:$/.test(u.protocol); } catch { return false; } }
function geography(c) {
  const g = c.geography_json;
  if (g && typeof g === 'object') return g;
  if (typeof g === 'string') { try { return JSON.parse(g); } catch {} }
  return {};
}
function evidence(c) {
  const e = c.evidence_json;
  if (e && typeof e === 'object') return e;
  if (typeof e === 'string') { try { return JSON.parse(e); } catch {} }
  return {};
}
function fieldFlags(c) {
  const g=geography(c), e=evidence(c);
  const lat = g.lat ?? g.latitude ?? c.lat ?? c.latitude;
  const lng = g.lng ?? g.lon ?? g.longitude ?? c.lng ?? c.longitude;
  const dates = e.event_dates ?? e.dates ?? c.event_dates ?? c.dates;
  const deadline = e.application_deadline ?? c.application_deadline;
  const description = c.customer_description ?? e.customer_description;
  const sells = c.sells ?? e.sells ?? e.vendor_categories;
  const recurring = c.recurring ?? e.recurring;
  return {
    title: present(c.event_name),
    organiser: present(c.organiser),
    geography: present(c.region_code) || Object.keys(g).length > 0,
    coordinates: Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)),
    dates: Array.isArray(dates) ? dates.length > 0 : present(dates),
    application_deadline: present(deadline),
    canonical_url: validUrl(c.canonical_url),
    application_url: validUrl(c.application_url),
    sells: Array.isArray(sells) ? sells.length > 0 : present(sells),
    recurring: recurring === true || recurring === false,
    customer_description: present(description),
    last_checked: present(c.last_checked)
  };
}
async function fetchMarket(market) {
  const rows=[];
  for(let offset=0;;offset+=PAGE_SIZE) {
    const u=`${API}/sample?status=validated&market=${market}&limit=${PAGE_SIZE}&offset=${offset}`;
    const r=await fetch(u);
    if(!r.ok) throw new Error(`${market}_fetch_failed_${r.status}`);
    const j=await r.json();
    rows.push(...(j.candidates||[]));
    if((j.returned ?? 0) < PAGE_SIZE) break;
  }
  return rows;
}
function pct(n,d){ return d ? Number((100*n/d).toFixed(1)) : null; }
function summarize(rows) {
  const keys=Object.keys(fieldFlags(rows[0]||{}));
  const counts=Object.fromEntries(keys.map(k=>[k,0]));
  for(const row of rows) for(const [k,v] of Object.entries(fieldFlags(row))) if(v) counts[k]++;
  return {
    validated: rows.length,
    field_completeness: Object.fromEntries(keys.map(k=>[k,{present:counts[k],pct:pct(counts[k],rows.length)}])),
    sample: rows.slice(0,SAMPLE_LIMIT).map(c=>({
      id:c.id,event_name:c.event_name,organiser:c.organiser,region_code:c.region_code,
      canonical_url:c.canonical_url,application_url:c.application_url,last_checked:c.last_checked,
      flags:fieldFlags(c)
    }))
  };
}
const by_market={};
for(const market of MARKETS) by_market[market]=summarize(await fetchMarket(market));
console.log(JSON.stringify({
  generated_at:new Date().toISOString(),
  purpose:'Read-only customer-readiness audit of live v2 validated records',
  publication_changed:false,
  acquisition_changed:false,
  classifier_changed:false,
  markets:by_market
},null,2));
