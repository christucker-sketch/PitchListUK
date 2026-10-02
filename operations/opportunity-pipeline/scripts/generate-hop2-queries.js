#!/usr/bin/env node
'use strict';

const fs = require('fs');

const GENERIC_WORDS = new Set([
  'the','and','of','at','in','on','a','christmas','xmas','festive','winter','summer','spring','autumn',
  'market','markets','food','drink','festival','fest','fair','fayre','fete','show','craft','crafts',
  'artisan','farmers','street','night','twilight','annual','vintage','country','county','family','fun',
  'day','days','weekend','event','events','gala','carnival','beer','cider','wine','music','community',
  'village','town','city','bonfire','fireworks','makers','producers','local','monthly'
]);

const TIERS = {
  1: [
    ['t1_traders', q => `${q} traders OR stallholders OR "trade stands"`],
    ['t1_catering', q => `${q} catering OR "food vendors" OR "street food" OR "food traders"`],
    ['t1_exhibit', q => `${q} exhibitors OR "trade stand" OR "stall booking"`],
  ],
  2: [
    ['t2_apply', q => `${q} "apply to trade" OR "book a pitch" OR "trader application" OR "stallholder application"`],
    ['t2_pdf', q => `${q} filetype:pdf trader OR stallholder OR "trade stand" OR exhibitor`],
    ['t2_year', (q, year) => `${q} ${year} traders OR stallholders OR catering`],
  ],
  3: [
    ['t3_fees', (q, _year, place) => `${q} ${place} "pitch fee" OR "stall fee" OR "trade enquiries" OR "trader information"`.trim()],
    ['t3_eoi', (q, _year, place) => `${q} ${place} "expression of interest" OR concession OR "traders wanted"`.trim()],
    ['t3_forms', q => `${q} site:docs.google.com/forms OR site:forms.office.com OR site:jotform.com`],
  ]
};

function cleanName(value) {
  return String(value || '')
    .replace(/\b(?:19|20)\d{2}\b/g, '')
    .replace(/\b(?:the\s+)?\d{1,3}(?:st|nd|rd|th)\s+(?:annual\s+)?/gi, '')
    .replace(/["“”|:–—-]+/g, ' ')
    .replace(/\s+/g, ' ').trim().replace(/^[ ,.'"]+|[ ,.'"]+$/g, '');
}

function tokens(value) {
  return String(value || '').toLowerCase().match(/[a-z0-9']+/g) || [];
}

function isGeneric(name, town) {
  const townTokens = new Set(tokens(town));
  return tokens(name).filter(token => !GENERIC_WORDS.has(token) && !townTokens.has(token)).length === 0;
}

function buildHop2Queries(event, { year = 2027, excludeDomains = [] } = {}) {
  const raw = String(event.name || event.event_name || '').trim();
  const town = String(event.town || event.location || '').trim();
  const county = String(event.county || '').trim();
  const name = cleanName(raw);
  if (!name) return [];
  const generic = isGeneric(name, town);
  const place = town || county;
  if (generic && !place) return [];

  const quoted = `"${name}"${generic && place ? ` ${place}` : ''}`;
  const exclude = excludeDomains.slice(0, 5).map(domain => `-site:${domain}`).join(' ');
  const rows = [];
  for (const tier of [1,2,3]) {
    for (const [templateId, build] of TIERS[tier]) {
      let query = build(quoted, year, place);
      if (exclude && templateId !== 't3_forms') query += ` ${exclude}`;
      rows.push({
        event_id: event.event_id || event.id || '',
        event_name: raw,
        clean_name: name,
        town,
        county,
        generic_name: generic,
        tier,
        template_id: templateId,
        query
      });
    }
  }
  return rows;
}

function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i=0; i<text.length; i++) {
    const ch=text[i], next=text[i+1];
    if (quoted) {
      if (ch === '"' && next === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted=false;
      else cell += ch;
    } else if (ch === '"') quoted=true;
    else if (ch === ',') { row.push(cell); cell=''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row=[]; cell=''; }
    else if (ch !== '\r') cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const header=rows.shift() || [];
  return rows.filter(r=>r.some(Boolean)).map(r=>Object.fromEntries(header.map((h,i)=>[h,r[i]||''])));
}

function toCsv(rows) {
  if (!rows.length) return '';
  const fields = Object.keys(rows[0]);
  const esc = v => {
    const s=String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
  };
  return [fields.join(','), ...rows.map(r=>fields.map(f=>esc(r[f])).join(','))].join('\n')+'\n';
}

function main() {
  const [input, output='hop2-queries.csv'] = process.argv.slice(2);
  if (!input) throw new Error('Usage: node scripts/generate-hop2-queries.js events.csv [output.csv]');
  const events=parseCsv(fs.readFileSync(input,'utf8'));
  const seen=new Set(), out=[];
  for (const event of events) {
    const key=`${cleanName(event.name || event.event_name).toLowerCase()}|${String(event.town || event.location || '').toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(...buildHop2Queries(event));
  }
  fs.writeFileSync(output,toCsv(out));
  console.log(JSON.stringify({unique_events:seen.size,queries:out.length,tier1:out.filter(x=>x.tier===1).length,tier2:out.filter(x=>x.tier===2).length,tier3:out.filter(x=>x.tier===3).length,output},null,2));
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exit(1); }
}

module.exports={cleanName,isGeneric,buildHop2Queries,parseCsv,toCsv};
