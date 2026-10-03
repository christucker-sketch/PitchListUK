#!/usr/bin/env node
'use strict';

const fs=require('fs');
const { serperSearch }=require('../acquisition/search');
const { preflightFromEnv }=require('../lib/credit-budget');

const EVENT_WORD=/\b(festival|fair|fayre|fete|show|market|carnival|rally|pride|mela|diwali|eid|beer|food|christmas|bonfire|fireworks|expo|exhibition|gala|feast)\b/i;
const UK_HOST=/(?:\.gov\.uk|\.org\.uk|\.co\.uk|\.ac\.uk|\.uk)$/i;
const FOREIGN_HOST=/(?:\.gov|\.us|\.ca|\.com\.au|\.co\.nz)$/i;
const FOREIGN_TEXT=/\b(?:Massachusetts|New York|Connecticut|Rhode Island|Virginia|Texas|California|Florida|Ohio|Pennsylvania|New Hampshire|New Jersey|Ontario|Canada|United States|USA|New England)\b/i;
const LOW_VALUE_HOST=/(?:facebook\.com|instagram\.com|youtube\.com|tiktok\.com|pinterest\.|ricksteves\.com|concoursio\.com|festable\.live|meetmeatthefair\.com|marketplaceevents\.com)$/i;
const DIRECTORY_HOST=/(?:eventbrite\.|allevents\.in|skiddle\.com|whatson\.|ents24\.com|findfestival\.com|festivalflyer\.com|festfinder\.co\.uk)$/i;
const GENERIC_TITLE=/^(?:calendar|special events?|upcoming holidays and festivals|all upcoming events|events and activities|our consumer shows|september \d+|join in for a day|just \d+ days? to go)/i;

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

function hostname(value){
  try{return new URL(value).hostname.toLowerCase().replace(/^www\./,'');}catch{return '';}
}

function areaEvidence(area,row){
  const escaped=String(area).replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/[-\s]+/g,'[-\\s]+');
  const rx=new RegExp(`\\b${escaped}\\b`,'i');
  return rx.test(`${row.name} ${row.snippet} ${row.source_url}`);
}

function seedScore(area,row){
  const host=hostname(row.source_url);
  const hay=`${row.name} ${row.snippet}`;
  let score=0;
  if(areaEvidence(area,row)) score+=5;
  if(UK_HOST.test(host)) score+=4;
  if(/\.gov\.uk$/i.test(host)) score+=2;
  if(EVENT_WORD.test(row.name)) score+=2;
  if(/\b2027\b/.test(hay)) score+=1;
  if(LOW_VALUE_HOST.test(host)) score-=5;
  if(DIRECTORY_HOST.test(host)) score-=4;
  if(/\b202[0-6]\b/.test(hay) && !/\b2027\b/.test(hay)) score-=2;
  if(GENERIC_TITLE.test(row.name)) score-=3;
  if(FOREIGN_TEXT.test(hay)) score-=8;
  if(FOREIGN_HOST.test(host) && !UK_HOST.test(host)) score-=10;
  return score;
}

function seedsFromResults(area, query, results){
  return results.map(result=>{
    const row={
      name:cleanTitle(result.title),
      town:area,
      source_url:result.url,
      source_query:query,
      snippet:result.snippet||''
    };
    row.seed_score=seedScore(area,row);
    return row;
  }).filter(row=>row.name && EVENT_WORD.test(`${row.name} ${row.snippet}`) && areaEvidence(area,row) && row.seed_score>=4);
}

function dedupeSeeds(rows){
  const best=new Map();
  for(const row of rows){
    const key=`${row.name.toLowerCase().replace(/\b20\d{2}\b/g,'').replace(/[^a-z0-9]+/g,' ').trim()}|${row.town.toLowerCase()}`;
    if(!key.split('|')[0]) continue;
    const previous=best.get(key);
    if(!previous || Number(row.seed_score||0)>Number(previous.seed_score||0)) best.set(key,row);
  }
  return [...best.values()].sort((a,b)=>Number(b.seed_score||0)-Number(a.seed_score||0));
}

function csv(rows){
  const fields=['name','town','source_url','source_query','snippet','seed_score'];
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
module.exports={cleanTitle,hop1Queries,seedsFromResults,dedupeSeeds,seedScore,areaEvidence};
