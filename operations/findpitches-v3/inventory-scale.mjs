// Grow qualified shadow inventory using retained source routes. No paid search or V2 access.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {shadowContext} from './shadow-context.mjs';
import {immutableDigests,sourceMutationCount} from './controlled-pilot.mjs';
import {commercialRows,commercialEntity,inventoryFromRows} from '../../platform/findpitches-v3/commercial.mjs';
import {verificationUrl} from '../../platform/findpitches-v3/verification-store.mjs';

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const save=(directory,name,value)=>fs.writeFileSync(path.join(directory,name),JSON.stringify(value,null,2)+'\n',{mode:0o600});
export function directGrowthPriority(row,now) {
  const r=commercialEntity(row,now);if(!r.commercial||r.ready||r.quality_holds||r.conflicts)return null;
  let url;try{url=new URL(verificationUrl({...row,...r.fields}));}catch{return null;}
  const host=url.hostname.replace(/^www\./,'');
  if(host==='eventeny.com'&&!(url.pathname==='/events/vendor/'&&/^\d+$/.test(url.searchParams.get('id')??'')))return null;
  if(host==='localstalls.com'&&!/^\/[a-z]{2}\/event\/[^/]+\/[^/]+\/?$/.test(url.pathname))return null;
  if(!['eventeny.com','localstalls.com'].includes(host))return null;
  // Avoid rechecking already-proved holds while unverified application routes wait.
  if(r.verification_checked)return null;
  return (host==='eventeny.com'?100:70)+(r.fields.application_url?20:0)
    +(r.fields.event_end>=now.slice(0,10)?40:0)+(['OPEN_NOW','ROLLING'].includes(r.fields.application_state)?20:0);
}
export function assertFreeGrowth(status,paidQueries) {
  if(status.mode!=='shadow'||status.publication_enabled||status.customer_rows||status.publication_rows||status.serper.bulk_enabled
    ||status.source_led_programme.policy.manual_paused!==1||status.controlled_pilot.active?.length)throw Error('free_growth_shadow_paused_paid_required');
  if(paidQueries!==undefined&&status.commercial.kpis.paid_acquisition_queries!==paidQueries)throw Error('free_growth_unexpected_paid_spend');
}
export function growthOutcome(beforeRows,afterRows,{beforeAt,now}) {
  const before=new Map(beforeRows.map(row=>[row.id,commercialEntity(row,beforeAt)])),after=afterRows.map(row=>commercialEntity(row,now));
  const gained=after.filter(r=>r.commercial&&r.ready&&!before.get(r.id)?.ready),lost=after.filter(r=>r.commercial&&!r.ready&&before.get(r.id)?.ready);
  const changed=after.filter(r=>{const b=before.get(r.id);return b&&['market','edition','environment','shadow_only','promotion_eligible','publication_eligible'].some(k=>r[k]!==b[k]);});
  const tally=key=>gained.reduce((out,r)=>(out[key(r)]=(out[key(r)]??0)+1,out),{});
  return {ready_before:[...before.values()].filter(r=>r.commercial&&r.ready).length,ready_after:after.filter(r=>r.commercial&&r.ready).length,
    ready_gained:gained.length,ready_lost:lost.length,net_ready_gain:gained.length-lost.length,ready_gained_by_country:tally(r=>r.market),ready_gained_by_origin:tally(r=>r.origin),ready_gained_by_source:tally(r=>r.domain),identity_mutations:changed.length,
    missing_original_entities:[...before.keys()].filter(id=>!after.some(r=>r.id===id)).length};
}
export async function runDirectInventoryGrowth({credentialsFile,stateDirectory,outDirectory,limit=600}) {
  if(!Number.isInteger(limit)||limit<1||limit>1000)throw Error('free_growth_limit_1_to_1000_required');
  fs.mkdirSync(outDirectory,{recursive:true,mode:0o700});const {db,call}=await shadowContext({credentialsFile,stateDirectory});
  const initial=await call('api','/status');assertFreeGrowth(initial);const paid=initial.commercial.kpis.paid_acquisition_queries;
  const baselineFile=path.join(outDirectory,'verification-baseline-private.json');
  let baseline;if(fs.existsSync(baselineFile))baseline=JSON.parse(fs.readFileSync(baselineFile));else {
    baseline={as_of:initial.now,paid_queries:paid,rows:await commercialRows(db),immutable:await immutableDigests(db)};save(outDirectory,'verification-baseline-private.json',baseline);
  }
  if(paid!==baseline.paid_queries)throw Error('free_growth_unexpected_paid_spend');
  const targets=baseline.rows.map(r=>({row:r,priority:directGrowthPriority(r,baseline.as_of)})).filter(x=>x.priority!==null).sort((a,b)=>b.priority-a.priority||a.row.id.localeCompare(b.row.id)).slice(0,limit);
  const progressFile=path.join(outDirectory,'verification-progress-private.json'),results=fs.existsSync(progressFile)?JSON.parse(fs.readFileSync(progressFile)):[],seen=new Set(results.map(r=>r.entity_id));
  const nextHost=new Map();let cursor=0,stopped=false;
  async function lane(){try{for(;;){if(stopped)return;const target=targets[cursor++];if(!target)return;if(seen.has(target.row.id))continue;
    const fields=JSON.parse(target.row.fields_json),host=new URL(verificationUrl({...target.row,...fields})).hostname,at=Math.max(Date.now(),nextHost.get(host)??0);nextHost.set(host,at+1500);if(at>Date.now())await sleep(at-Date.now());
    const result=await call('enrichment','/verification/verify',{entity_id:target.row.id});
    results.push({entity_id:result.entity_id,verification_id:result.verification_id,status:result.report.status,reasons:result.report.reasons,profile:result.report.profile,checked_at:result.report.checked_at});save(outDirectory,'verification-progress-private.json',results);
    if(result.report.reasons.some(r=>r==='source_http_429'))throw Error('free_growth_source_rate_limited');
    if(results.length%25===0){const s=await call('api','/status');assertFreeGrowth(s,paid);const due=await db.prepare("SELECT COUNT(*) AS n,MIN(available_at) AS oldest FROM jobs WHERE stage IN ('reconcile','eligibility','enrichment','readiness') AND status IN ('ready','leased') AND available_at<=?").bind(s.now).first();if(due.n>40||due.oldest&&Date.parse(s.now)-Date.parse(due.oldest)>120000)throw Error('free_growth_verification_backlog');console.log(JSON.stringify({direct_sources_checked:results.length,maximum:targets.length,ready:s.commercial.totals.ready,paid_queries_added:0}));}
  }}catch(error){stopped=true;throw error;}}
  const lanes=await Promise.allSettled(Array.from({length:3},lane)),failure=lanes.find(r=>r.status==='rejected');if(failure)throw failure.reason;
  for(let i=0;i<30;i++){const due=await db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE stage='readiness' AND status IN ('ready','leased') AND available_at<=?").bind(new Date().toISOString()).first();if(!due.n)break;await call('readiness','/tick',{limit:25});await sleep(1000);if(i===29)throw Error('free_growth_readiness_not_settled');}
  const final=await call('api','/status');assertFreeGrowth(final,paid);const after=await commercialRows(db),outcome=growthOutcome(baseline.rows,after,{beforeAt:baseline.as_of,now:final.now}),mutations=sourceMutationCount(baseline.immutable,await immutableDigests(db));
  if(mutations||outcome.identity_mutations||outcome.missing_original_entities)throw Error('free_growth_preservation_failed');
  const reasons={};for(const r of results)if(r.status!=='verified')for(const reason of r.reasons)reasons[reason]=(reasons[reason]??0)+1;
  const report={schema:'findpitches-v3-free-inventory-growth-v1',as_of:final.now,...outcome,records_checked:results.length,verified:results.filter(r=>r.status==='verified').length,dominant_blockers:reasons,additional_serper_queries:0,source_mutations:mutations,customer_leakage:final.customer_rows,publication_leakage:final.publication_rows,paid_paused:true,structured_delivery:final.structured_delivery,inventory:inventoryFromRows(after,{now:final.now})};
  save(outDirectory,'verification-growth-report.json',report);save(outDirectory,'verification-final-private.json',{as_of:final.now,status:final,rows:after});return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2),get=name=>args[args.indexOf(name)+1];
  try{const report=await runDirectInventoryGrowth({credentialsFile:get('--credentials'),stateDirectory:get('--state-dir'),outDirectory:get('--out-dir'),limit:args.includes('--limit')?Number(get('--limit')):600});console.log(JSON.stringify({checked:report.records_checked,ready_gained:report.ready_gained,ready:report.ready_after,source_mutations:report.source_mutations}));}
  catch(e){console.error(/^[a-z0-9_]+$/.test(e.message)?e.message:'free_inventory_growth_failed');process.exitCode=1;}
}
