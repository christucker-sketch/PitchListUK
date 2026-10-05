#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const USABLE_STATES=new Set(['OPEN_NOW','ROLLING','ENQUIRY_AVAILABLE']);
const SUPPORTED=new Set(['GB','US','CA','AU','NZ','IE']);
function argMap(argv){const o={};for(let i=2;i<argv.length;i++){const a=argv[i];if(!a.startsWith('--'))continue;const k=a.slice(2);const v=(argv[i+1]&&!argv[i+1].startsWith('--'))?argv[++i]:true;o[k]=v;}return o;}
function norm(s=''){return String(s??'').normalize('NFKD').toLowerCase().replace(/https?:\/\/(www\.)?/g,'').replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');}
const STOP=new Set(['the','and','of','at','a','an','to','for','in','on','application','apply','vendor','vendors','trader','traders','stallholder','stallholders','exhibitor','exhibitors','registration','register','form','become']);
function tokens(s=''){return new Set(norm(s).split(' ').filter(x=>x.length>2&&!STOP.has(x)));}
function intersection(a,b){let n=0;for(const x of a)if(b.has(x))n++;return n;}
function jaccard(a,b){if(!a.size&&!b.size)return 0;const i=intersection(a,b),u=new Set([...a,...b]).size;return u?i/u:0;}
function containment(a,b){if(!a.size||!b.size)return 0;return intersection(a,b)/Math.min(a.size,b.size);}
function canonicalUrl(value=''){try{const u=new URL(value);const keep=[];for(const [k,v] of u.searchParams.entries())if(!/^utm_|^(fbclid|gclid|mc_cid|mc_eid)$/i.test(k))keep.push([k,v]);u.search='';keep.sort(([a],[b])=>a.localeCompare(b)).forEach(([k,v])=>u.searchParams.append(k,v));u.hash='';const p=u.pathname.replace(/\/+$/,'')||'/';return `${u.protocol}//${u.hostname.replace(/^www\./,'').toLowerCase()}${p}${u.search}`;}catch{return '';}}
function host(value=''){try{return new URL(value).hostname.replace(/^www\./,'').toLowerCase();}catch{return '';}}
function urlPathTokens(value=''){try{return tokens(new URL(value).pathname);}catch{return new Set();}}
function sameDate(a,b){return !!a&&!!b&&String(a).slice(0,10)===String(b).slice(0,10);}
function year(v){const m=String(v||'').match(/\b(20\d{2})\b/);return m?Number(m[1]):null;}
function yearOf(r){return year(r.event_start)||year(r.event_name)||year(r.title);}
function getName(r){return r.event_name??r.title??'';}
function getCountry(r){const d=(r.country_code??r.market??'').toUpperCase();if(d)return d.slice(0,2);const j=String(r.jurisdiction??'').toUpperCase();return j.startsWith('GB')?'GB':j.startsWith('US')?'US':j.startsWith('CA')?'CA':'';}
function getState(r){return String(r.application_state??r.state??r.status??'').toUpperCase();}
function getSource(r){return r.source_url??r.canonical_url??'';}
function getApp(r){return r.application_url??'';}
function getRegion(r){return r.region_code??r.region??r.state_region??'';}
function getLoc(r){return [r.venue,r.location,r.locality,r.region].filter(Boolean).join(' ');}
function validateIncoming(r){const e=[],c=getCountry(r);if(!r.opportunity_id)e.push('missing_opportunity_id');if(!c||!SUPPORTED.has(c))e.push('unsupported_country');if(!getName(r))e.push('missing_event_name');if(!getSource(r)&&!getApp(r))e.push('missing_source_route');if(!getState(r))e.push('missing_application_state');return e;}

function scorePair(a,b){
  const au=canonicalUrl(getApp(a)),bu=canonicalUrl(getApp(b)),as=canonicalUrl(getSource(a)),bs=canonicalUrl(getSource(b));
  const ah=host(getApp(a)||getSource(a)),bh=host(getApp(b)||getSource(b));
  const at=tokens(getName(a)),bt=tokens(getName(b));
  const name=jaccard(at,bt),nameContain=containment(at,bt);
  const org=jaccard(tokens(a.organiser),tokens(b.organiser));
  const orgContain=containment(tokens(a.organiser),tokens(b.organiser));
  const loc=jaccard(tokens(getLoc(a)),tokens(getLoc(b)));
  const locContain=containment(tokens(getLoc(a)),tokens(getLoc(b)));
  const region=(norm(getRegion(a))&&norm(getRegion(a))===norm(getRegion(b)))?1:0;
  const exactUrl=(au&&bu&&au===bu)||(as&&bs&&as===bs)||(au&&bs&&au===bs)||(as&&bu&&as===bu);
  const sameHost=ah&&bh&&ah===bh;
  const pathSim=Math.max(
    jaccard(urlPathTokens(getApp(a)||getSource(a)),urlPathTokens(getApp(b)||getSource(b))),
    containment(urlPathTokens(getApp(a)||getSource(a)),urlPathTokens(getApp(b)||getSource(b)))
  );
  const date=sameDate(a.event_start,b.event_start)?1:0;
  const ya=yearOf(a),yb=yearOf(b),yearCompat=!ya||!yb||ya===yb,countrySame=getCountry(a)===getCountry(b);
  let score=0;
  if(exactUrl)score+=0.64;
  score+=0.10*Math.max(name,nameContain);
  score+=0.05*Math.max(org,orgContain);
  score+=0.04*Math.max(loc,locContain);
  score+=0.02*region+0.08*date;
  if(sameHost)score+=Math.min(0.05,0.05*pathSim);
  score+=0.07*pathSim;
  if(!countrySame)score-=0.75;
  if(!yearCompat&&!date)score-=0.20;
  return {score:Math.max(0,Math.min(1,score)),exactUrl,sameHost,name,nameContain,org,orgContain,loc,locContain,pathSim,date,yearCompat,countrySame};
}

function classify(incoming,existing){
  const invalid=validateIncoming(incoming);if(invalid.length)return {action:'reject',reasons:invalid};
  if(!USABLE_STATES.has(getState(incoming)))return {action:'reject',reasons:['not_currently_usable_state']};
  let best=null;
  for(const ex of existing){if(getCountry(ex)!==getCountry(incoming))continue;const m=scorePair(incoming,ex);if(!best||m.score>best.match.score)best={record:ex,match:m};}
  if(!best)return {action:'new_candidate',match:null};
  const m=best.match,yi=yearOf(incoming),ye=yearOf(best.record);
  const strongName=m.nameContain>=0.72||m.name>=0.62;
  const corroborated=!!(m.date||m.locContain>=0.45||m.orgContain>=0.55||(m.region&&m.pathSim>=0.35));
  const sameIdentitySignals=m.exactUrl||(strongName&&corroborated)||(m.pathSim>=0.72&&strongName);
  if(m.exactUrl&&yi&&ye&&yi!==ye&&!m.date)return {action:'probable_match',match:best,reason:'same_route_different_edition'};
  if(sameIdentitySignals&&m.yearCompat&&(m.exactUrl||m.score>=0.58||(strongName&&corroborated)))return {action:'existing_match',match:best};
  if((strongName&&corroborated)||m.score>=0.52||(m.pathSim>=0.65&&m.nameContain>=0.5))return {action:'probable_match',match:best,reason:(!m.yearCompat?'same_event_family_different_edition':undefined)};
  if(m.exactUrl&&m.nameContain<0.2&&m.locContain<0.15)return {action:'conflict',match:best,reason:'shared_route_conflicting_identity'};
  return {action:'new_candidate',match:best};
}

function readJsonl(file){return fs.readFileSync(file,'utf8').split(/\r?\n/).filter(x=>x.trim()).map((l,i)=>{try{return JSON.parse(l)}catch(e){throw new Error(`${file}:${i+1}: ${e.message}`)}});}
function readCsv(text){const rows=[];let row=[],field='',q=false;for(let i=0;i<text.length;i++){const c=text[i],n=text[i+1];if(q){if(c==='"'&&n==='"'){field+='"';i++;}else if(c==='"')q=false;else field+=c;}else{if(c==='"')q=true;else if(c===','){row.push(field);field='';}else if(c==='\n'){row.push(field.replace(/\r$/,''));rows.push(row);row=[];field='';}else field+=c;}}if(field||row.length){row.push(field);rows.push(row);}const[h,...data]=rows;return data.filter(r=>r.some(Boolean)).map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]??''])));}
async function loadExisting(args){if(args['existing-csv'])return readCsv(fs.readFileSync(args['existing-csv'],'utf8'));throw new Error('Provide --existing-csv');}
function csvEscape(v){const s=String(v??'');return /[",\r\n]/.test(s)?`"${s.replaceAll('"','""')}"`:s;}

async function main(){
 const args=argMap(process.argv);if(!args.feed||!args.out){console.error('Usage: node dry-run-import.mjs --feed current.jsonl --existing-csv snapshot.csv --out output-dir');process.exit(2);}
 const incoming=readJsonl(args.feed),existing=await loadExisting(args),results=incoming.map(r=>({incoming:r,...classify(r,existing)}));
 const counts={};for(const r of results)counts[r.action]=(counts[r.action]||0)+1;
 fs.mkdirSync(args.out,{recursive:true});
 const report={generated_at:new Date().toISOString(),mode:'dry_run',feed:path.resolve(args.feed),incoming_records:incoming.length,existing_records:existing.length,counts,writes_performed:0,matcher_version:2,note:'No database, API, Cloudflare or publication writes are performed.'};
 fs.writeFileSync(path.join(args.out,'dry-run-summary.json'),JSON.stringify(report,null,2)+'\n');
 const detail=results.map(r=>({opportunity_id:r.incoming.opportunity_id??'',country:getCountry(r.incoming),event_name:getName(r.incoming),application_state:getState(r.incoming),action:r.action,reason:r.reason??(r.reasons??[]).join(';'),matched_id:r.match?.record?.id??r.match?.record?.stable_id??'',matched_name:r.match?getName(r.match.record):'',score:r.match?Number(r.match.match.score.toFixed(4)):'',exact_url:r.match?String(r.match.match.exactUrl):'',name_similarity:r.match?Number(r.match.match.name.toFixed(4)):'',name_containment:r.match?Number(r.match.match.nameContain.toFixed(4)):'',organiser_containment:r.match?Number(r.match.match.orgContain.toFixed(4)):'',location_containment:r.match?Number(r.match.match.locContain.toFixed(4)):'',path_similarity:r.match?Number(r.match.match.pathSim.toFixed(4)):'',incoming_url:getApp(r.incoming)||getSource(r.incoming),matched_url:r.match?(getApp(r.match.record)||getSource(r.match.record)):''}));
 const cols=Object.keys(detail[0]??{});fs.writeFileSync(path.join(args.out,'dry-run-actions.csv'),[cols.join(','),...detail.map(x=>cols.map(k=>csvEscape(x[k])).join(','))].join('\r\n')+'\r\n');
 fs.writeFileSync(path.join(args.out,'dry-run-actions.jsonl'),results.map(r=>JSON.stringify({opportunity_id:r.incoming.opportunity_id,action:r.action,reason:r.reason??r.reasons??null,match:r.match?{existing_id:r.match.record.id??r.match.record.stable_id??null,score:r.match.match.score,exact_url:r.match.match.exactUrl,name_similarity:r.match.match.name,name_containment:r.match.match.nameContain}:null})).join('\n')+'\n');
 console.log(JSON.stringify(report,null,2));
}
if(import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error(e.stack||e);process.exit(1);});
export {canonicalUrl,scorePair,classify,validateIncoming,norm,tokens,jaccard,containment};
