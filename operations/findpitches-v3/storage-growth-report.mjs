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
export async function storageGrowthReport(c,{since,baseline=null}={}){
 if(!Number.isFinite(Date.parse(since)))throw Error('explicit_valid_since_required');
 const native=await c.api.accountRequest('/d1/database/'+c.state.database_id),samples=(await c.db.prepare('SELECT observed_at,file_size_bytes FROM storage_capacity_samples WHERE observed_at>=? ORDER BY observed_at').bind(new Date(since).toISOString()).all()).results;
 const out={schema:'findpitches-v3-storage-growth-v1',started_at:new Date().toISOString(),scope:'V3 source/evidence D1 only; customer/auth/billing database excluded',capacity:capacityState(native.file_size),window:growthWindow(samples,native.file_size),tables:[],read_only:true,source_or_customer_mutations:0,physical_table_index_attribution_available:false};
 for(const table of ['source_facts','producer_records','source_verifications','jobs','source_documents']){
  const columns=(await c.db.prepare('PRAGMA table_info('+table+')').all()).results.filter(r=>/TEXT|BLOB|VARCHAR|JSON/i.test(r.type));if(columns.some(r=>!/^[a-z_]+$/.test(r.name)))throw Error('unsafe_column_name');
  const fields=columns.map((col,i)=>`COALESCE(SUM(length(CAST("${col.name}" AS BLOB))),0) c${i}`),r=await c.db.prepare(`SELECT COUNT(*) records,${fields.join(',')} FROM ${table}`).first();
  const columnBytes=Object.fromEntries(columns.map((col,i)=>[col.name,r['c'+i]])),payload=Object.values(columnBytes).reduce((n,b)=>n+b,0),prior=baseline?.tables?.find(t=>t.table===table);
  out.tables.push({table,measured_at:new Date().toISOString(),records:r.records,logical_payload_bytes:payload,column_bytes:columnBytes,...prior?{baseline_as_of:prior.measured_at,records_delta:r.records-prior.records,logical_payload_delta:payload-prior.logical_payload_bytes}:{}});
 }
 out.completed_at=new Date().toISOString();out.logical_payload_definition='UTF-8 TEXT/BLOB payload, excluding physical integer cells, B-tree pages and indices; deltas are not physical per-table growth attribution.';return out;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const {values}=parseArgs({options:{'credentials-file':{type:'string'},'state-dir':{type:'string'},since:{type:'string'},output:{type:'string'},baseline:{type:'string'}}});
 if(!values.output)throw Error('output_path_required');
 const c=await shadowContext({credentialsFile:values['credentials-file'],stateDirectory:values['state-dir']}),baseline=values.baseline?JSON.parse(fs.readFileSync(values.baseline)):null,report=await storageGrowthReport(c,{since:values.since,baseline});
 fs.writeFileSync(values.output,JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(JSON.stringify({as_of:report.completed_at,capacity:report.capacity,window:report.window,tables:report.tables.map(t=>({table:t.table,records:t.records,logical_payload_bytes:t.logical_payload_bytes}))}));
}
