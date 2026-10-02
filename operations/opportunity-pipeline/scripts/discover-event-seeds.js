#!/usr/bin/env node
'use strict';

const fs=require('fs');
const { serperSearch }=require('../acquisition/search');
const { preflightFromEnv }=require('../lib/credit-budget');

const EVENT_WORD=/\b(festival|fair|fayre|fete|show|market|carnival|rally|pride|mela|diwali|eid|beer|food|christmas|bonfire|fireworks|expo|exhibition|gala|feast)\b/i;

function cleanTitle(value){
  return String(value||'')
    .replace(/\s+[|–—-]\s+(?:Visit|What's On|Events?|Official Site|Home|Facebook|Instagram).*$/i,'')
    .replace(/\s+/g,' ').trim();
}

function hop1Queries(area, year=2027){
  return [
    `${area} what's on ${year} festival fair show market`,
    `${area} events calendar ${year} festival market show`,
    `${area} agricultural show ${year}`,
    `${area} food festival ${year}`,
    `${area} Christmas market ${year}`,
    `${area} community festival ${year}`
  ];
}

function seedsFromResults(area, query, results){
  return results.map(result=>({
    name:cleanTitle(result.title),
    town:area,
    source_url:result.url,
    source_query:query,
    snippet:result.snippet||''
  })).filter(row=>row.name && EVENT_WORD.test(`${row.name} ${row.snippet}`));
}

function dedupeSeeds(rows){
  const out=[],seen=new Set();
  for(const row of rows){
    const key=`${row.name.toLowerCase().replace(/\b20\d{2}\b/g,'').replace(/[^a-z0-9]+/g,' ').trim()}|${row.town.toLowerCase()}`;
    if(!key.split('|')[0] || seen.has(key)) continue;
    seen.add(key); out.push(row);
  }
  return out;
}

function csv(rows){
  const fields=['name','town','source_url','source_query','snippet'];
  const esc=v=>{const s=String(v??'');return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;};
  return [fields.join(','),...rows.map(r=>fields.map(f=>esc(r[f])).join(','))].join('\n')+'\n';
}

async function main(){
  const args=process.argv.slice(2);
  const areasFile=args[0], out=args[1]||'hop1-events.csv';
  if(!areasFile) throw new Error('Usage: node scripts/discover-event-seeds.js areas.txt [output.csv]');
  const year=Number(process.env.PITCHLIST_HOP1_YEAR||2027);
  const maxAreas=Math.max(1,Number(process.env.PITCHLIST_HOP1_MAX_AREAS||999));
  const searchNum=Math.max(1,Number(process.env.PITCHLIST_HOP1_SEARCH_NUM||10));
  const areas=fs.readFileSync(areasFile,'utf8').split(/\r?\n/).map(x=>x.trim()).filter(Boolean).slice(0,maxAreas);
  const planned=areas.reduce((n,a)=>n+hop1Queries(a,year).length,0);
  const preflight=preflightFromEnv(planned);
  if(!preflight.allowed) throw new Error(`Serper preflight blocked hop-1 discovery: ${preflight.reason}`);
  const seeds=[];
  for(const area of areas){
    for(const query of hop1Queries(area,year)){
      const results=await serperSearch(query,{num:searchNum});
      seeds.push(...seedsFromResults(area,query,results));
      await new Promise(r=>setTimeout(r,350));
    }
  }
  const deduped=dedupeSeeds(seeds);
  fs.writeFileSync(out,csv(deduped));
  console.log(JSON.stringify({areas:areas.length,queries:planned,raw_seeds:seeds.length,unique_events:deduped.length,output:out},null,2));
}

if(require.main===module) main().catch(error=>{console.error(error.message);process.exit(1);});
module.exports={cleanTitle,hop1Queries,seedsFromResults,dedupeSeeds};
