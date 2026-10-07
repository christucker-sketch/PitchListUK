// Owned shadow inventory and direct-source verification. No paid search or V2 access.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {shadowContext} from './shadow-context.mjs';
import {immutableDigests,sourceMutationCount} from './controlled-pilot.mjs';
import {commercialRows,commercialEntity,inventoryFromRows} from '../../platform/findpitches-v3/commercial.mjs';
import {verificationUrl} from '../../platform/findpitches-v3/verification-store.mjs';

const pct=(n,d)=>d?Number((100*n/d).toFixed(2)):null;
const tally=values=>values.reduce((o,k)=>(o[k]=(o[k]??0)+1,o),{});
const save=(dir,name,value)=>fs.writeFileSync(path.join(dir,name),JSON.stringify(value,null,2)+'\n',{mode:0o600});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function guard(status,queries) {
  if(status.mode!=='shadow'||status.publication_enabled||status.customer_rows||status.publication_rows||status.serper.bulk_enabled||status.controlled_pilot.active?.length)throw Error('commercial_shadow_only_required');
  if(queries!==undefined&&status.commercial.kpis.paid_acquisition_queries!==queries)throw Error('unexpected_paid_queries');
}
export function structuredPriority(row,now) {
  const r=commercialEntity(row,now),f=r.fields;let host='';try{host=new URL(verificationUrl({...row,...f})).hostname;}catch{}
  return (/(?:^|\.)eventeny\.com$/.test(host)?100:/(?:^|\.)localstalls\.com$/.test(host)?70:/(?:^|\.)ukcraftfairs\.com$/.test(host)?50:20)
    +(f.application_url?20:0)+(f.event_start>=now.slice(0,10)?25:0)+(f.application_state==='OPEN_NOW'?20:f.application_state==='ROLLING'?10:0)+(f.organiser?5:0)+(f.location?5:0)-(row.quality_holds||row.conflicts?200:0);
}
export function growthMetrics(beforeRows,afterRows,{now=new Date().toISOString(),beforeAt=now}={}) {
  const before=inventoryFromRows(beforeRows,{now:beforeAt}),after=inventoryFromRows(afterRows,{now});
  const prior=new Map(beforeRows.map(r=>[r.id,commercialEntity(r,beforeAt)])),current=afterRows.map(r=>commercialEntity(r,now));
  const structured=current.filter(r=>r.commercial&&r.origin==='independent-structured');
  const gained=structured.filter(r=>r.ready&&!prior.get(r.id)?.ready),lost=structured.filter(r=>!r.ready&&prior.get(r.id)?.ready);
  const identitiesChanged=current.filter(r=>{const old=prior.get(r.id);return old&&(r.market!==old.market||r.edition!==old.edition||r.environment!==old.environment);});
  const byFamily={};for(const r of structured){const out=byFamily[r.domain]??={entities:0,checked:0,verified:0,ready:0,new_ready:0,watch:0,quarantined:0,blocked:0,blockers:{}};out.entities++;for(const k of ['verified','ready','watch','quarantined','blocked'])if(r[k])out[k]++;if(r.verification_checked)out.checked++;if(r.ready&&!prior.get(r.id)?.ready)out.new_ready++;for(const reason of r.reasons)out.blockers[reason]=(out.blockers[reason]??0)+1;}
  return {before,after,structured:{distinct_entities:structured.length,records_checked:structured.filter(r=>r.verification_checked).length,verified:structured.filter(r=>r.verified).length,newly_promoted_ready:gained.length,ready_lost:lost.length,net_ready_gain:gained.length-lost.length,
    verification_success_percent:pct(structured.filter(r=>r.verified).length,structured.length),ready_conversion_percent:pct(structured.filter(r=>r.ready).length,structured.length),new_ready_conversion_percent:pct(gained.length,structured.length),watch:after.by_origin['independent-structured'].watch,quarantined:after.by_origin['independent-structured'].quarantined,blocked:after.by_origin['independent-structured'].blocked,dominant_blockers:tally(structured.filter(r=>!r.ready).flatMap(r=>r.reasons)),by_source_family:byFamily},
    identity_mutations:identitiesChanged.length,existing_entities_added_or_removed:current.length-beforeRows.length};
}
export async function commercialSnapshot({credentialsFile,stateDirectory,outDirectory}) {
  fs.mkdirSync(outDirectory,{recursive:true,mode:0o700});const {db,call}=await shadowContext({credentialsFile,stateDirectory});
  const status=await call('api','/status');guard(status);const rows=await commercialRows(db);
  save(outDirectory,'commercial-status-private.json',status);save(outDirectory,'inventory-private.json',{as_of:status.now,rows});
  save(outDirectory,'immutable-baseline-private.json',await immutableDigests(db));
  save(outDirectory,'commercial-inventory.json',inventoryFromRows(rows,{now:status.now}));return status.commercial;
}
export async function verifyStructuredCommercial({credentialsFile,stateDirectory,outDirectory,limit=1000}) {
  if(!Number.isInteger(limit)||limit<1||limit>1000)throw Error('bounded_direct_verification_limit_required');
  const {db,call}=await shadowContext({credentialsFile,stateDirectory}),before=JSON.parse(fs.readFileSync(path.join(outDirectory,'inventory-private.json'))),baseline=JSON.parse(fs.readFileSync(path.join(outDirectory,'immutable-baseline-private.json')));
  const status=await call('api','/status');guard(status);const paidQueries=status.commercial.kpis.paid_acquisition_queries,now=new Date().toISOString();
  const rows=before.rows.filter(r=>r.environment==='shadow'&&r.origin==='independent-structured').sort((a,b)=>structuredPriority(b,now)-structuredPriority(a,now)||a.id.localeCompare(b.id)).slice(0,limit);
  const filename=path.join(outDirectory,'direct-results-private.json'),completed=fs.existsSync(filename)?JSON.parse(fs.readFileSync(filename)):[],seen=new Set(completed.map(r=>r.entity_id));let cursor=0,stopped=false;const hostNext=new Map();
  async function lane(){try{for(;;){if(stopped)return;const row=rows[cursor++];if(!row)return;if(seen.has(row.id))continue;
    const f=JSON.parse(row.fields_json),host=new URL(verificationUrl({...row,...f})).hostname,at=Math.max(Date.now(),hostNext.get(host)??0);hostNext.set(host,at+1200);if(at>Date.now())await sleep(at-Date.now());
    const result=await call('enrichment','/verification/verify',{entity_id:row.id});completed.push(result);save(outDirectory,'direct-results-private.json',completed);
    if(completed.length%25===0){const health=await call('api','/status');guard(health,paidQueries);const due=await db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE stage IN ('reconcile','eligibility','enrichment','readiness') AND status IN ('ready','leased') AND available_at<=?").bind(new Date().toISOString()).first();if(due.n>100)throw Error('commercial_verification_backlog');console.log(JSON.stringify({direct_sources_checked:completed.length,maximum:rows.length}));}
  }}catch(error){stopped=true;throw error;}}
  await Promise.all(Array.from({length:3},lane));
  let settled=false;for(let i=0;i<30;i++){const due=await db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE stage='readiness' AND status IN ('ready','leased') AND available_at<=?").bind(new Date().toISOString()).first();if(!due.n){settled=true;break;}await call('readiness','/tick',{limit:25});await sleep(1000);}if(!settled)throw Error('commercial_readiness_not_settled');
  const final=await call('api','/status');guard(final,paidQueries);const after=await commercialRows(db),report=growthMetrics(before.rows,after,{now:final.now,beforeAt:before.as_of});
  const mutations=sourceMutationCount(baseline,await immutableDigests(db));if(mutations||report.identity_mutations||report.existing_entities_added_or_removed)throw Error('commercial_preservation_failed');
  const result={schema:'findpitches-v3-commercial-growth-v1',...report,as_of:final.now,direct_fetch_attempts:completed.length,additional_serper_queries:0,source_mutations:mutations,customer_leakage:final.customer_rows,publication_leakage:final.publication_rows,kpis:final.commercial.kpis};save(outDirectory,'commercial-growth-report.json',result);return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),get=n=>args[args.indexOf(n)+1],options={credentialsFile:get('--credentials'),stateDirectory:get('--state-dir'),outDirectory:get('--out-dir')};
  try{const mode=get('--mode');if(!['snapshot','verify'].includes(mode))throw Error('commercial_snapshot_or_verify_required');const result=mode==='snapshot'?await commercialSnapshot(options):await verifyStructuredCommercial({...options,limit:args.includes('--limit')?Number(get('--limit')):1000});console.log(JSON.stringify(mode==='snapshot'?{ready:result.totals.ready}:result.structured));}catch(e){console.error(/^[a-z0-9_]+$/.test(e.message)?e.message:'commercial_shadow_operation_failed');process.exitCode=1;}
}
