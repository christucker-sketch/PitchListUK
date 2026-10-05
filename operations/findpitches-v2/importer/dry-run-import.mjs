#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const USABLE_STATES = new Set(['OPEN_NOW','ROLLING','ENQUIRY_AVAILABLE']);
const SUPPORTED = new Set(['GB','US','CA','AU','NZ','IE']);

function argMap(argv) {
  const out = {};
  for (let i=2;i<argv.length;i++) {
    const a=argv[i];
    if (!a.startsWith('--')) continue;
    const k=a.slice(2);
    const v=(argv[i+1] && !argv[i+1].startsWith('--')) ? argv[++i] : true;
    out[k]=v;
  }
  return out;
}
function norm(s='') {
  return String(s??'').normalize('NFKD').toLowerCase()
    .replace(/https?:\/\/(www\.)?/g,'')
    .replace(/&/g,' and ')
    .replace(/[^a-z0-9]+/g,' ')
    .trim().replace(/\s+/g,' ');
}
function tokens(s='') {
  const stop=new Set(['the','and','of','at','a','an','to','for','in','on','application','apply','vendor','vendors','trader','traders','stallholder','stallholders','exhibitor','exhibitors']);
  return new Set(norm(s).split(' ').filter(x=>x.length>2&&!stop.has(x)));
}
function jaccard(a,b) {
  if (!a.size && !b.size) return 0;
  let inter=0; for (const x of a) if (b.has(x)) inter++;
  const union=new Set([...a,...b]).size;
  return union ? inter/union : 0;
}
function canonicalUrl(value='') {
  try {
    const u=new URL(value);
    const keep=[];
    for (const [k,v] of u.searchParams.entries()) {
      if (!/^utm_|^(fbclid|gclid|mc_cid|mc_eid)$/i.test(k)) keep.push([k,v]);
    }
    u.search='';
    keep.sort(([a],[b])=>a.localeCompare(b)).forEach(([k,v])=>u.searchParams.append(k,v));
    u.hash='';
    let p=u.pathname.replace(/\/+$/,'') || '/';
    return `${u.protocol}//${u.hostname.replace(/^www\./,'').toLowerCase()}${p}${u.search}`;
  } catch { return ''; }
}
function host(value='') {
  try { return new URL(value).hostname.replace(/^www\./,'').toLowerCase(); } catch { return ''; }
}
function sameDate(a,b) { return !!a && !!b && String(a).slice(0,10)===String(b).slice(0,10); }
function year(v) { const m=String(v||'').match(/\b(20\d{2})\b/); return m?Number(m[1]):null; }
function yearOf(r) { return year(r.event_start)||year(r.event_name)||year(r.title); }
function getName(r){return r.event_name??r.title??''}
function getCountry(r){
  const direct=(r.country_code??r.market??'').toUpperCase();
  if (direct) return direct.slice(0,2);
  const j=String(r.jurisdiction??'').toUpperCase();
  return j.startsWith('GB')?'GB':j.startsWith('US')?'US':j.startsWith('CA')?'CA':'';
}
function getState(r){return String(r.application_state??r.state??r.status??'').toUpperCase()}
function getSource(r){return r.source_url??r.canonical_url??''}
function getApp(r){return r.application_url??''}
function getRegion(r){return r.region_code??r.region??r.state_region??''}
function getLoc(r){return [r.venue,r.location,r.locality,r.region].filter(Boolean).join(' ')}

function validateIncoming(r) {
  const errors=[];
  const c=getCountry(r);
  if (!r.opportunity_id) errors.push('missing_opportunity_id');
  if (!c || !SUPPORTED.has(c)) errors.push('unsupported_country');
  if (!getName(r)) errors.push('missing_event_name');
  if (!getSource(r) && !getApp(r)) errors.push('missing_source_route');
  if (!getState(r)) errors.push('missing_application_state');
  return errors;
}

function scorePair(a,b) {
  const au=canonicalUrl(getApp(a)), bu=canonicalUrl(getApp(b));
  const as=canonicalUrl(getSource(a)), bs=canonicalUrl(getSource(b));
  const ah=host(getApp(a)||getSource(a)), bh=host(getApp(b)||getSource(b));
  const name=jaccard(tokens(getName(a)),tokens(getName(b)));
  const org=jaccard(tokens(a.organiser),tokens(b.organiser));
  const loc=jaccard(tokens(getLoc(a)),tokens(getLoc(b)));
  const region=(norm(getRegion(a))&&norm(getRegion(a))===norm(getRegion(b))) ? 1:0;
  const exactUrl=(au&&bu&&au===bu)||(as&&bs&&as===bs)||(au&&bs&&au===bs)||(as&&bu&&as===bu);
  const sameHost=ah&&bh&&ah===bh;
  const date=sameDate(a.event_start,b.event_start)?1:0;
  const ya=yearOf(a), yb=yearOf(b);
  const yearCompat=!ya||!yb||ya===yb;
  const countrySame=getCountry(a)===getCountry(b);
  let score=0;
  if (exactUrl) score+=0.66;
  if (sameHost) score+=0.08;
  score+=0.16*name+0.05*org+0.03*loc+0.01*region+0.06*date;
  if (!countrySame) score-=0.75;
  if (!yearCompat && !date) score-=0.18;
  return {score:Math.max(0,Math.min(1,score)), exactUrl, sameHost, name, org, loc, date, yearCompat, countrySame};
}

function classify(incoming, existing) {
  const invalid=validateIncoming(incoming);
  if (invalid.length) return {action:'reject',reasons:invalid};
  if (!USABLE_STATES.has(getState(incoming))) return {action:'reject',reasons:['not_currently_usable_state']};

  let best=null;
  for (const ex of existing) {
    if (getCountry(ex)!==getCountry(incoming)) continue;
    const m=scorePair(incoming,ex);
    if (!best || m.score>best.match.score) best={record:ex,match:m};
  }
  if (!best || best.match.score<0.52) return {action:'new_candidate',match:null};

  const yi=yearOf(incoming), ye=yearOf(best.record);
  const sameIdentitySignals = best.match.exactUrl || (best.match.name>=0.72 && (best.match.loc>=0.25 || best.match.org>=0.35 || best.match.date));
  if (best.match.score>=0.82 && sameIdentitySignals) {
    if (yi && ye && yi!==ye && !best.match.date) return {action:'probable_match',match:best,reason:'same_event_family_different_edition'};
    return {action:'existing_match',match:best};
  }
  if (best.match.score>=0.65 || sameIdentitySignals) return {action:'probable_match',match:best};
  if (best.match.exactUrl && best.match.name<0.2 && best.match.loc<0.15) return {action:'conflict',match:best,reason:'shared_route_conflicting_identity'};
  return {action:'new_candidate',match:best};
}

function readJsonl(file) {
  return fs.readFileSync(file,'utf8').split(/\r?\n/).filter(x=>x.trim()).map((line,i)=>{
    try{return JSON.parse(line)}catch(e){throw new Error(`${file}:${i+1}: ${e.message}`)}
  });
}
function readCsv(text) {
  const rows=[]; let row=[],field='',q=false;
  for(let i=0;i<text.length;i++){
    const c=text[i],n=text[i+1];
    if(q){ if(c==='"'&&n==='"'){field+='"';i++} else if(c==='"')q=false; else field+=c; }
    else { if(c==='"')q=true; else if(c===','){row.push(field);field=''} else if(c==='\n'){row.push(field.replace(/\r$/,''));rows.push(row);row=[];field=''} else field+=c; }
  }
  if(field||row.length){row.push(field);rows.push(row)}
  const [h,...data]=rows;
  return data.filter(r=>r.some(Boolean)).map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]??''])));
}
async function loadExisting(args) {
  if (args['existing-csv']) return readCsv(fs.readFileSync(args['existing-csv'],'utf8'));
  if (args['existing-dir']) {
    const dir=path.resolve(args['existing-dir']);
    const defs=[['opportunities.mjs','opportunitySnapshot','GB'],['us-opportunities.mjs','usOpportunitySnapshot','US'],['ca-opportunities.mjs','caOpportunitySnapshot','CA']];
    const out=[];
    for (const [f,e,market] of defs) {
      const p=path.join(dir,f); if(!fs.existsSync(p)) continue;
      const mod=await import(pathToFileURL(p).href+`?t=${Date.now()}`);
      for(const r of mod[e]?.rows??[]) out.push({...r,country_code:getCountry(r)||market});
    }
    return out;
  }
  throw new Error('Provide --existing-csv or --existing-dir');
}
function csvEscape(v){const s=String(v??'');return /[",\r\n]/.test(s)?`"${s.replaceAll('"','""')}"`:s}

async function main() {
  const args=argMap(process.argv);
  if (!args.feed || !args.out) {
    console.error('Usage: node dry-run-import.mjs --feed current.jsonl --existing-csv snapshot.csv --out output-dir');
    process.exit(2);
  }
  const incoming=readJsonl(args.feed);
  const existing=await loadExisting(args);
  const results=incoming.map(r=>({incoming:r,...classify(r,existing)}));
  const counts={}; for(const r of results) counts[r.action]=(counts[r.action]||0)+1;
  fs.mkdirSync(args.out,{recursive:true});
  const report={generated_at:new Date().toISOString(),mode:'dry_run',feed:path.resolve(args.feed),incoming_records:incoming.length,existing_records:existing.length,counts,writes_performed:0,thresholds:{existing_match:0.82,probable_match:0.65,new_candidate_below:0.52},note:'No database, API, Cloudflare or publication writes are performed.'};
  fs.writeFileSync(path.join(args.out,'dry-run-summary.json'),JSON.stringify(report,null,2)+'\n');
  const detail=results.map(r=>({opportunity_id:r.incoming.opportunity_id??'',country:getCountry(r.incoming),event_name:getName(r.incoming),application_state:getState(r.incoming),action:r.action,reason:r.reason??(r.reasons??[]).join(';'),matched_id:r.match?.record?.id??r.match?.record?.stable_id??'',matched_name:r.match?getName(r.match.record):'',score:r.match?Number(r.match.match.score.toFixed(4)):'',exact_url:r.match?String(r.match.match.exactUrl):'',name_similarity:r.match?Number(r.match.match.name.toFixed(4)):'',organiser_similarity:r.match?Number(r.match.match.org.toFixed(4)):'',location_similarity:r.match?Number(r.match.match.loc.toFixed(4)):'',incoming_url:getApp(r.incoming)||getSource(r.incoming),matched_url:r.match?(getApp(r.match.record)||getSource(r.match.record)):''}));
  const cols=Object.keys(detail[0]??{});
  fs.writeFileSync(path.join(args.out,'dry-run-actions.csv'),[cols.join(','),...detail.map(x=>cols.map(k=>csvEscape(x[k])).join(','))].join('\r\n')+'\r\n');
  fs.writeFileSync(path.join(args.out,'dry-run-actions.jsonl'),results.map(r=>JSON.stringify({opportunity_id:r.incoming.opportunity_id,action:r.action,reason:r.reason??r.reasons??null,match:r.match?{existing_id:r.match.record.id??r.match.record.stable_id??null,score:r.match.match.score,exact_url:r.match.match.exactUrl,name_similarity:r.match.match.name,organiser_similarity:r.match.match.org,location_similarity:r.match.match.loc}:null})).join('\n')+'\n');
  console.log(JSON.stringify(report,null,2));
}

if (import.meta.url===pathToFileURL(process.argv[1]).href) main().catch(e=>{console.error(e.stack||e);process.exit(1)});
export { canonicalUrl, scorePair, classify, validateIncoming, norm, tokens, jaccard };
