#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const SUPPORTED = new Set(['GB','US','CA','AU','NZ','IE']);
const SCHEMA = 'findpitches-discovery-export-v1';

function args(argv){const o={};for(let i=2;i<argv.length;i++){const k=argv[i];if(!k.startsWith('--'))continue;o[k.slice(2)]=(argv[i+1]&&!argv[i+1].startsWith('--'))?argv[++i]:true;}return o;}
function readJsonl(file){return fs.readFileSync(file,'utf8').split(/\r?\n/).filter(Boolean).map((x,i)=>{try{return JSON.parse(x)}catch(e){throw new Error(`${file}:${i+1}: ${e.message}`)}});}
function sha256(s){return crypto.createHash('sha256').update(s).digest('hex');}
function boolInt(v){return v===true||v===1||String(v).toLowerCase()==='true'?1:0;}
function country(r){return String(r.country_code??r.market??'').toUpperCase().slice(0,2);}
function eventName(r){return String(r.event_name??r.title??'').trim();}
function canonicalUrl(r){return r.source_url??r.canonical_url??null;}
function asNumber(v){const n=Number(v);return Number.isFinite(n)?n:null;}

export function validateRecord(r){
  const e=[];
  if((r.schema_version??SCHEMA)!==SCHEMA)e.push('unsupported_schema_version');
  if(!r.opportunity_id)e.push('missing_opportunity_id');
  if(!SUPPORTED.has(country(r)))e.push('unsupported_country');
  if(!eventName(r))e.push('missing_event_name');
  if(!r.application_state)e.push('missing_application_state');
  if(!canonicalUrl(r)&&!r.application_url)e.push('missing_source_route');
  return e;
}

export function normalizeRecord(r, importId, now){
  const evidence = r.evidence ?? null;
  const provenance = r.provenance ?? null;
  const body={
    producer_id:String(r.opportunity_id),schema_version:r.schema_version??SCHEMA,source_name:'structured_source_acquisition',
    market:country(r),region_code:r.region_code??null,event_name:eventName(r),organiser:r.organiser??null,
    location:r.location??r.locality??r.venue??null,event_start:r.event_start??null,event_end:r.event_end??null,
    application_deadline:r.application_deadline??null,canonical_url:canonicalUrl(r),application_url:r.application_url??null,
    application_state:String(r.application_state),lifecycle_event:r.lifecycle_event??null,recurring:boolInt(r.recurring),
    discovery_source:r.discovery_source??null,discovery_strategy:r.discovery_strategy??null,confidence:asNumber(r.confidence),
    evidence_json:evidence===null?null:JSON.stringify(evidence),provenance_json:provenance===null?null:JSON.stringify(provenance),
    source_fingerprint:r.source_fingerprint??r.content_fingerprint??null,first_seen:r.first_seen??null,last_seen:r.last_seen??null,
    last_checked:r.last_checked??null,import_id:importId,imported_at:now,updated_at:now
  };
  const hashInput={...body,import_id:undefined,imported_at:undefined,updated_at:undefined};
  body.content_hash=sha256(JSON.stringify(hashInput));
  return body;
}

function q(v){if(v===null||v===undefined)return 'NULL';return `'${String(v).replaceAll("'","''")}'`;}
function sqlRecord(r){
  const cols=['producer_id','schema_version','source_name','market','region_code','event_name','organiser','location','event_start','event_end','application_deadline','canonical_url','application_url','application_state','lifecycle_event','recurring','discovery_source','discovery_strategy','confidence','evidence_json','provenance_json','source_fingerprint','content_hash','first_seen','last_seen','last_checked','import_id','imported_at','updated_at'];
  const vals=cols.map(c=>q(r[c]));
  return `INSERT INTO structured_feed_records (${cols.join(',')}) VALUES (${vals.join(',')})\nON CONFLICT(producer_id) DO UPDATE SET\n${cols.filter(c=>!['producer_id','imported_at'].includes(c)).map(c=>`  ${c}=excluded.${c}`).join(',\n')},\n  reconciliation_status=CASE WHEN structured_feed_records.content_hash=excluded.content_hash THEN structured_feed_records.reconciliation_status ELSE 'unreconciled' END,\n  matched_candidate_id=CASE WHEN structured_feed_records.content_hash=excluded.content_hash THEN structured_feed_records.matched_candidate_id ELSE NULL END,\n  matched_customer_id=CASE WHEN structured_feed_records.content_hash=excluded.content_hash THEN structured_feed_records.matched_customer_id ELSE NULL END,\n  reconciliation_reason=CASE WHEN structured_feed_records.content_hash=excluded.content_hash THEN structured_feed_records.reconciliation_reason ELSE NULL END;`;
}

async function main(){
  const a=args(process.argv); if(!a.feed||!a.out) throw new Error('Usage: node stage-structured-feed.mjs --feed current.jsonl --out stage.sql [--manifest manifest.json]');
  const rows=readJsonl(a.feed), now=new Date().toISOString();
  const manifest=a.manifest&&fs.existsSync(a.manifest)?JSON.parse(fs.readFileSync(a.manifest,'utf8')):{};
  const importId=`sfi_${now.replace(/[-:.TZ]/g,'').slice(0,14)}_${sha256(fs.readFileSync(a.feed)).slice(0,10)}`;
  const valid=[], rejected=[];
  for(const r of rows){const errors=validateRecord(r);if(errors.length)rejected.push({opportunity_id:r.opportunity_id??null,errors});else valid.push(normalizeRecord(r,importId,now));}
  const header=`BEGIN TRANSACTION;\nINSERT INTO structured_feed_imports (import_id,schema_version,source_name,source_export_id,source_generated_at,source_checksum,mode,status,total_records,rejected_records,started_at) VALUES (${q(importId)},${q(SCHEMA)},'structured_source_acquisition',${q(manifest.export_id??null)},${q(manifest.generated_at??manifest.created_at??null)},${q(manifest.checksum??manifest.sha256??null)},'shadow','started',${rows.length},${rejected.length},${q(now)});\n`;
  const footer=`\nUPDATE structured_feed_imports SET status='complete', inserted_records=(SELECT COUNT(*) FROM structured_feed_records WHERE import_id=${q(importId)}), completed_at=${q(now)} WHERE import_id=${q(importId)};\nCOMMIT;\n`;
  fs.mkdirSync(path.dirname(path.resolve(a.out)),{recursive:true});
  fs.writeFileSync(a.out,header+valid.map(sqlRecord).join('\n')+footer,'utf8');
  const summary={mode:'shadow_stage_only',import_id:importId,input_records:rows.length,valid_records:valid.length,rejected_records:rejected.length,writes_target:'structured_feed_records_only',customer_visible_writes:0,publication_queue_writes:0,sql_path:path.resolve(a.out),rejected};
  fs.writeFileSync(a.out.replace(/\.sql$/i,'')+'.summary.json',JSON.stringify(summary,null,2)+'\n');
  console.log(JSON.stringify(summary,null,2));
}
if(import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error(e.stack||e);process.exit(1)});
