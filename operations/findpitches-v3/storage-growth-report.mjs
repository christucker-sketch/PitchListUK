// Read-only operator report. No source receipts, identity, provider or customer
// data are exported; all native statements are SELECT/PRAGMA against V3 shadow.
import fs from 'node:fs';import path from 'node:path';import {parseArgs} from 'node:util';
import {fileURLToPath} from 'node:url';import {shadowContext} from './shadow-context.mjs';
import {capacityState} from '../../platform/findpitches-v3/storage-capacity.mjs';
export function growthWindow(samples,currentBytes){
 const valid=samples.filter(s=>Number.isFinite(Date.parse(s.observed_at))&&Number.isFinite(s.file_size_bytes)).sort((a,b)=>a.observed_at.localeCompare(b.observed_at));
 if(valid.length<2)return {available:false,reason:'insufficient_samples'};
 const first=valid[0],last=valid.at(-1),hours=(Date.parse(last.observed_at)-Date.parse(first.observed_at))/3600000,delta=last.file_size_bytes-first.file_size_bytes;
 if(hours<=0)return {available:false,reason:'insufficient_elapsed_time'};
 const includesReclaim=valid.some((r,i)=>i&&valid[i-1].file_size_bytes-r.file_size_bytes>=50*1048576),perDay=delta/hours*24,canProject=perDay>0&&!includesReclaim;
 return {available:true,first,last,samples:valid.length,elapsed_hours:hours,physical_delta_bytes:delta,net_bytes_per_day:perDay,includes_large_reclaim:includesReclaim,coverage_24h:hours>=24,coverage_48h:hours>=48,coverage_72h:hours>=72,
  linear_scenario_days_to_70_percent:canProject?Math.max(0,(7000000000-currentBytes)/perDay):null,linear_scenario_days_to_97_percent:canProject?Math.max(0,(9700000000-currentBytes)/perDay):null,
  interpretation:'Observed net physical change in the stated sample interval. Linear headroom scenarios are not steady-state forecasts; missing future coverage is not measured. Reclaim windows have no growth projection.'};
}
export function changeExcludedGrowth(samples,events=[]) {
 if(!Array.isArray(events)||events.length>30)throw Error('bounded_change_events_required');
 const ids=new Set(),changes=events.map(e=>{
  if(!e||typeof e.id!=='string'||!/^[a-z0-9_.-]{1,100}$/.test(e.id)||ids.has(e.id)||!Number.isFinite(Date.parse(e.observed_at))||!Number.isFinite(e.measured_window_delta_bytes)||e.measured_window_delta_bytes<0||!Number.isInteger(e.uncertainty_minutes)||e.uncertainty_minutes<0||e.uncertainty_minutes>60)throw Error('valid_unique_change_events_required');
  ids.add(e.id);return {...e,at:Date.parse(e.observed_at)};
 });
 const valid=samples.filter(s=>Number.isFinite(Date.parse(s.observed_at))&&Number.isFinite(s.file_size_bytes)).sort((a,b)=>a.observed_at.localeCompare(b.observed_at));
 const intervals=[],excluded=[];let hours=0,delta=0,reclaim=false;
 for(let i=1;i<valid.length;i++){
  const a=valid[i-1],b=valid[i],start=Date.parse(a.observed_at),end=Date.parse(b.observed_at);if(end<=start)continue;
  const item={from:a.observed_at,to:b.observed_at,hours:(end-start)/3600000,net_bytes:b.file_size_bytes-a.file_size_bytes};
  const hits=changes.filter(e=>e.at-e.uncertainty_minutes*60000<=end&&e.at+e.uncertainty_minutes*60000>=start);
  if(hits.length)excluded.push({...item,change_ids:hits.map(e=>e.id)});
  else {intervals.push(item);hours+=item.hours;delta+=item.net_bytes;reclaim||=item.net_bytes<=-50*1048576;}
 }
 const inWindow=changes.filter(e=>valid.length&&e.at+e.uncertainty_minutes*60000>=Date.parse(valid[0].observed_at)&&e.at-e.uncertainty_minutes*60000<=Date.parse(valid.at(-1).observed_at));
 return {available:hours>0,retained_intervals:intervals.length,retained_hours:hours,retained_net_bytes:delta,
  retained_net_bytes_per_day:hours>0?delta/hours*24:null,retained_large_reclaim:reclaim,
  declared_change_events:inWindow.map(({at,...e})=>e),measured_change_window_bytes:inWindow.reduce((n,e)=>n+e.measured_window_delta_bytes,0),excluded_intervals:excluded,
  interpretation:'Entire sampled intervals overlapping declared changes and timestamp uncertainty are excluded once. The remaining net rate is not pure organic attribution or a steady-state forecast. Measured change-window bytes also include concurrent activity and are never simply subtracted from raw growth.'};
}
export async function storageGrowthReport(c,{since,baseline=null,changeEvents=[],includeTablePayload=true}={}){
 if(!Number.isFinite(Date.parse(since)))throw Error('explicit_valid_since_required');
 const native=await c.api.accountRequest('/d1/database/'+c.state.database_id),samples=(await c.db.prepare('SELECT observed_at,file_size_bytes FROM storage_capacity_samples WHERE observed_at>=? ORDER BY observed_at').bind(new Date(since).toISOString()).all()).results;
 const out={schema:'findpitches-v3-storage-growth-v1',started_at:new Date().toISOString(),scope:'V3 source/evidence D1 only; customer/auth/billing database excluded',capacity:capacityState(native.file_size),window:growthWindow(samples,native.file_size),change_excluded_window:changeExcludedGrowth(samples,changeEvents),table_payload_measured:includeTablePayload,tables:[],read_only:true,source_or_customer_mutations:0,physical_table_index_attribution_available:false};
 if(out.window.available)out.coverage_due_at=Object.fromEntries([24,48,72].map(h=>[h+'h',new Date(Date.parse(out.window.first.observed_at)+h*3600000).toISOString()]));
 for(const table of includeTablePayload?['source_facts','producer_records','source_verifications','jobs','source_documents']:[]){
  const columns=(await c.db.prepare('PRAGMA table_info('+table+')').all()).results.filter(r=>/TEXT|BLOB|VARCHAR|JSON/i.test(r.type));if(columns.some(r=>!/^[a-z_]+$/.test(r.name)))throw Error('unsafe_column_name');
  const fields=columns.map((col,i)=>`COALESCE(SUM(length(CAST("${col.name}" AS BLOB))),0) c${i}`),r=await c.db.prepare(`SELECT COUNT(*) records,${fields.join(',')} FROM ${table}`).first();
  const columnBytes=Object.fromEntries(columns.map((col,i)=>[col.name,r['c'+i]])),payload=Object.values(columnBytes).reduce((n,b)=>n+b,0),prior=baseline?.tables?.find(t=>t.table===table);
  out.tables.push({table,measured_at:new Date().toISOString(),records:r.records,logical_payload_bytes:payload,column_bytes:columnBytes,...prior?{baseline_as_of:prior.measured_at,records_delta:r.records-prior.records,logical_payload_delta:payload-prior.logical_payload_bytes}:{}});
 }
 out.completed_at=new Date().toISOString();out.logical_payload_definition='UTF-8 TEXT/BLOB payload, excluding physical integer cells, B-tree pages and indices; deltas are not physical per-table growth attribution.';return out;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const {values}=parseArgs({options:{'credentials-file':{type:'string'},'state-dir':{type:'string'},since:{type:'string'},output:{type:'string'},baseline:{type:'string'},'change-events':{type:'string'},'samples-only':{type:'boolean'}}});
 if(!values.output)throw Error('output_path_required');
 const ledger=values['change-events']?JSON.parse(fs.readFileSync(values['change-events'])):null;
 if(ledger&&(ledger.schema!=='findpitches-v3-storage-change-events-v1'||!Array.isArray(ledger.events)))throw Error('valid_change_event_ledger_required');
 const c=await shadowContext({credentialsFile:values['credentials-file'],stateDirectory:values['state-dir']}),baseline=values.baseline?JSON.parse(fs.readFileSync(values.baseline)):null,changeEvents=ledger?.events??[],report=await storageGrowthReport(c,{since:values.since,baseline,changeEvents,includeTablePayload:!values['samples-only']});
 fs.writeFileSync(values.output,JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(JSON.stringify({as_of:report.completed_at,capacity:report.capacity,window:report.window,tables:report.tables.map(t=>({table:t.table,records:t.records,logical_payload_bytes:t.logical_payload_bytes}))}));
}
