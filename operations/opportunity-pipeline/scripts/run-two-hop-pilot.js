#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const { spawnSync }=require('node:child_process');
const { parseCsv, buildHop2Queries }=require('./generate-hop2-queries');
const { runtimeRoot }=require('../lib/staging-store');

const ROOT=path.resolve(__dirname,'..');

function run(script,args=[],env={}){
  const r=spawnSync(process.execPath,[path.join(ROOT,'scripts',script),...args],{
    cwd:ROOT,env:{...process.env,...env},encoding:'utf8',maxBuffer:1024*1024*30
  });
  if(r.status!==0 && r.status!==2) throw new Error(`${script} failed: ${r.stderr||r.stdout}`);
  return r;
}
function jsonOut(stdout){
  const text=String(stdout||'').trim();
  for(let i=text.indexOf('{');i>=0;i=text.indexOf('{',i+1)){
    try{return JSON.parse(text.slice(i));}catch{}
  }
  throw new Error('No JSON result found');
}

function selectTierOne(events,maxEvents=20){
  const seen=new Set(), queries=[], selected=[];
  for(const event of events){
    const key=`${String(event.name||'').toLowerCase()}|${String(event.town||'').toLowerCase()}`;
    if(seen.has(key)) continue;
    seen.add(key);
    const tier1=buildHop2Queries(event).filter(row=>row.tier===1);
    if(!tier1.length) continue;
    selected.push(event);
    queries.push(...tier1.map(row=>row.query));
    if(selected.length>=maxEvents) break;
  }
  return {selected,queries};
}

function main(){
  const areasFile=process.argv[2];
  if(!areasFile) throw new Error('Usage: node scripts/run-two-hop-pilot.js areas.txt');
  if(!process.env.PITCHLIST_PIPELINE_RUNTIME_DIR) throw new Error('PITCHLIST_PIPELINE_RUNTIME_DIR is required');

  const root=runtimeRoot();
  fs.mkdirSync(path.join(root,'data','two-hop'),{recursive:true});
  const eventsCsv=path.join(root,'data','two-hop','hop1-events.csv');

  const hop1=run('discover-event-seeds.js',[areasFile,eventsCsv]);
  const hop1Summary=jsonOut(hop1.stdout);
  const events=parseCsv(fs.readFileSync(eventsCsv,'utf8'));
  const maxEvents=Math.max(1,Number(process.env.PITCHLIST_HOP2_MAX_EVENTS||20));
  const {selected,queries}=selectTierOne(events,maxEvents);
  if(!queries.length) throw new Error('Hop 1 produced no usable event seeds');

  const acquire=run('acquire-events.js',queries,{
    PITCHLIST_ACQUIRE_QUERY_LIMIT:String(queries.length),
    PITCHLIST_ACQUIRE_SEARCH_NUM:String(process.env.PITCHLIST_HOP2_SEARCH_NUM||8),
    PITCHLIST_ACQUIRE_MAX_FETCH:String(process.env.PITCHLIST_HOP2_MAX_FETCH||200),
    PITCHLIST_QUERY_LANE:'two-hop-event-name',
    PITCHLIST_ALLOW_UNAPPROVED_DISCOVERY:'true'
  });
  const acquireSummary=jsonOut(acquire.stdout);
  const clean=run('clean-staged-events.js',[acquireSummary.csvPath],{PITCHLIST_ALLOW_UNAPPROVED_DISCOVERY:'true'});
  const cleanSummary=jsonOut(clean.stdout);
  const reviewed=JSON.parse(fs.readFileSync(cleanSummary.output_json,'utf8')).records||[];
  const statuses=reviewed.reduce((m,row)=>(m[row.quality_status]=(m[row.quality_status]||0)+1,m),{});
  const refresh=run('refresh-active-events.js',[cleanSummary.output_csv]);
  const refreshSummary=jsonOut(refresh.stdout);

  const report={
    generated_at:new Date().toISOString(),
    hop1:hop1Summary,
    hop2:{events_considered:selected.length,queries:queries.length,candidate_rows:acquireSummary.rows,statuses,customer_ready:statuses.customer_ready||0,watch:statuses.watch||0,needs_work:statuses.needs_work||0,review:statuses.review||0,rejected:statuses.rejected||0,added:refreshSummary.added||0,updated:refreshSummary.updated||0},
    selected_events:selected,
    reviewed_manifest:cleanSummary.output_json,
    production_write_enabled:false
  };
  const out=path.join(root,'data','two-hop','two-hop-pilot.json');
  fs.writeFileSync(out,JSON.stringify(report,null,2));
  console.log(JSON.stringify({...report,report_file:out},null,2));
}

if(require.main===module){try{main();}catch(error){console.error(error.stack||error.message);process.exit(1);}}
module.exports={selectTierOne};
