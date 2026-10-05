#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { classify, canonicalUrl, tokens } from './dry-run-import.mjs';

function args(argv){
  const out={};
  for(let i=2;i<argv.length;i++){
    if(!argv[i].startsWith('--')) continue;
    const k=argv[i].slice(2);
    out[k]=(argv[i+1]&&!argv[i+1].startsWith('--'))?argv[++i]:true;
  }
  return out;
}

function readJson(file){
  const value=JSON.parse(fs.readFileSync(file,'utf8'));
  if(!Array.isArray(value)) throw new Error(`${file} must contain a JSON array`);
  return value;
}

function sql(v){
  if(v===null||v===undefined||v==='') return 'NULL';
  return `'${String(v).replaceAll("'","''")}'`;
}

function marketOf(r){
  return String(r?.country_code??r?.market??'').trim().toUpperCase().slice(0,2);
}

function nameOf(r){ return r?.event_name??r?.title??''; }
function urlsOf(r){
  return [r?.application_url,r?.canonical_url,r?.source_url].map(canonicalUrl).filter(Boolean);
}

function buildExisting(candidates, customers){
  const byId=new Map();
  for(const c of candidates){
    if(!c?.id) continue;
    byId.set(c.id,{...c,__has_candidate:true,__has_customer:false});
  }
  for(const o of customers){
    if(!o?.id) continue;
    const prior=byId.get(o.id)||{};
    byId.set(o.id,{
      ...prior,
      id:o.id,
      market:o.market??prior.market,
      region_code:o.region_code??prior.region_code,
      event_name:o.title??prior.event_name,
      title:o.title??prior.title,
      organiser:o.organiser??prior.organiser,
      location:o.location??prior.location,
      event_start:o.event_start??prior.event_start,
      event_end:o.event_end??prior.event_end,
      canonical_url:o.canonical_url??prior.canonical_url,
      application_url:o.application_url??prior.application_url,
      last_checked:o.last_checked??prior.last_checked,
      __has_candidate:Boolean(prior.__has_candidate),
      __has_customer:true
    });
  }
  return [...byId.values()];
}

function buildIndexes(existing){
  const byMarket=new Map();
  for(const record of existing){
    const market=marketOf(record);
    if(!byMarket.has(market)) byMarket.set(market,{records:[],byUrl:new Map(),byNameToken:new Map()});
    const idx=byMarket.get(market);
    idx.records.push(record);
    for(const url of urlsOf(record)){
      if(!idx.byUrl.has(url)) idx.byUrl.set(url,new Set());
      idx.byUrl.get(url).add(record);
    }
    for(const token of tokens(nameOf(record))){
      if(!idx.byNameToken.has(token)) idx.byNameToken.set(token,new Set());
      idx.byNameToken.get(token).add(record);
    }
  }
  return byMarket;
}

function plausiblePool(incoming,idx){
  if(!idx) return [];
  const selected=new Set();
  for(const url of urlsOf(incoming)){
    for(const record of idx.byUrl.get(url)||[]) selected.add(record);
  }

  const overlap=new Map();
  for(const token of tokens(nameOf(incoming))){
    for(const record of idx.byNameToken.get(token)||[]){
      overlap.set(record,(overlap.get(record)||0)+1);
    }
  }
  for(const [record,count] of overlap){
    if(count>=2) selected.add(record);
  }
  return [...selected];
}

function plan(staged,candidates,customers){
  const existing=buildExisting(candidates,customers);
  const indexes=buildIndexes(existing);
  const rows=[];
  const counts={};
  let comparedPairs=0;

  for(const incoming of staged){
    const pool=plausiblePool(incoming,indexes.get(marketOf(incoming)));
    comparedPairs+=pool.length;
    const result=classify(incoming,pool);
    const best=result.match?.record||null;
    const action=result.action;
    const reason=(result.reason ?? (result.reasons||[]).join(';')) || null;
    const keepMatch=action==='existing_match'||action==='probable_match'||action==='conflict';
    counts[action]=(counts[action]||0)+1;
    rows.push({
      producer_id:incoming.producer_id??incoming.opportunity_id,
      action,
      reason,
      matched_id:keepMatch?(best?.id||null):null,
      matched_candidate_id:keepMatch&&best?.__has_candidate?best.id:null,
      matched_customer_id:keepMatch&&best?.__has_customer?best.id:null,
      score:result.match?.match?.score??null,
      event_name:incoming.event_name??'',
      matched_name:keepMatch?(best?.event_name??best?.title??''):'',
      audit_best_id:best?.id||null,
      audit_best_name:best?.event_name??best?.title??'',
      audit_best_score:result.match?.match?.score??null,
      audit_best_candidate:Boolean(best?.__has_candidate),
      audit_best_customer:Boolean(best?.__has_customer)
    });
  }
  return {rows,counts,existing_records:existing.length,compared_pairs:comparedPairs};
}

function renderSql(rows){
  const lines=['-- Staging-only live-D1 reconciliation plan.','-- Writes only structured_feed_records reconciliation metadata.'];
  for(const r of rows){
    lines.push(`UPDATE structured_feed_records SET reconciliation_status=${sql(r.action)}, matched_candidate_id=${sql(r.matched_candidate_id)}, matched_customer_id=${sql(r.matched_customer_id)}, reconciliation_reason=${sql(r.reason)} WHERE producer_id=${sql(r.producer_id)};`);
  }
  return lines.join('\n')+'\n';
}

async function main(){
  const a=args(process.argv);
  if(!a.staged||!a.candidates||!a.customers||!a.out) throw new Error('Usage: node reconcile-current-d1.mjs --staged staged.json --candidates candidates.json --customers customers.json --out DIR');
  const staged=readJson(a.staged);
  const candidates=readJson(a.candidates);
  const customers=readJson(a.customers);
  const result=plan(staged,candidates,customers);
  fs.mkdirSync(a.out,{recursive:true});
  const summary={
    generated_at:new Date().toISOString(),
    mode:'live_d1_reconciliation_plan',
    staged_records:staged.length,
    candidate_records:candidates.length,
    customer_records:customers.length,
    existing_records:result.existing_records,
    compared_pairs:result.compared_pairs,
    counts:result.counts,
    writes_target:'structured_feed_records_reconciliation_metadata_only',
    downstream_writes:0,
    matcher_version:5
  };
  fs.writeFileSync(path.join(a.out,'live-d1-reconciliation-summary.json'),JSON.stringify(summary,null,2)+'\n');
  fs.writeFileSync(path.join(a.out,'live-d1-reconciliation-plan.sql'),renderSql(result.rows));
  fs.writeFileSync(path.join(a.out,'live-d1-reconciliation-actions.jsonl'),result.rows.map(x=>JSON.stringify(x)).join('\n')+'\n');
  console.log(JSON.stringify(summary,null,2));
}

if(import.meta.url===pathToFileURL(process.argv[1]).href) main().catch(e=>{console.error(e.stack||e);process.exit(1)});
export {buildExisting,buildIndexes,plausiblePool,plan,renderSql};
