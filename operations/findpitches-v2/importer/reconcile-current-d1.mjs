#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { classify } from './dry-run-import.mjs';

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

function plan(staged,candidates,customers){
  const existing=buildExisting(candidates,customers);
  const rows=[];
  const counts={};

  for(const incoming of staged){
    const result=classify(incoming,existing);
    const match=result.match?.record||null;
    const action=result.action;
    const reason=(result.reason ?? (result.reasons||[]).join(';')) || null;
    counts[action]=(counts[action]||0)+1;
    rows.push({
      producer_id:incoming.producer_id??incoming.opportunity_id,
      action,
      reason,
      matched_id:match?.id||null,
      matched_candidate_id:match?.__has_candidate?match.id:null,
      matched_customer_id:match?.__has_customer?match.id:null,
      score:result.match?.match?.score??null,
      event_name:incoming.event_name??'',
      matched_name:match?.event_name??match?.title??''
    });
  }
  return {rows,counts,existing_records:existing.length};
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
export {buildExisting,plan,renderSql};
