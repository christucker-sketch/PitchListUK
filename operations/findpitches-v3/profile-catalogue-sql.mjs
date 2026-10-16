import {catalogueScope} from '../../platform/findpitches-v3/catalogue-scope.mjs';
// Read-only D1 diagnostic. Stores timing/counts/hashes, never evidence payloads.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {shadowContext} from './shadow-context.mjs';
import {INVENTORY_SQL,LEGACY_INVENTORY_SQL} from '../../platform/findpitches-v3/commercial.mjs';
import {stagingCatalogue,LATEST_STRUCTURED_POLICY_SQL} from '../../platform/findpitches-v3/staging.mjs';
const args=process.argv.slice(2),get=n=>args[args.indexOf(n)+1],output=get('--output');
if(!output||!args.includes('--credentials')||!args.includes('--state-dir'))throw Error('explicit_owned_diagnostic_context_required');
const ctx=await shadowContext({credentialsFile:get('--credentials'),stateDirectory:get('--state-dir')});
const scope=catalogueScope({market:args.includes('--market')?get('--market'):null,detailId:args.includes('--detail-id')?get('--detail-id'):null});
const report={requested_scope:scope,schema:'findpitches-v3-catalogue-sql-profile-v1',started_at:new Date().toISOString(),scope:'read_only_remote_d1_api_not_service_binding',read_model:args.includes('--legacy')?'legacy':'compact_heads',samples:[],writes:0,serper_queries:0};
for(let i=0;i<3;i++){
 const sample={sequence:i+1,queries:[]};report.samples.push(sample);
 const wrap=(input,params=[])=>{const query=args.includes('--legacy')?input.replace(INVENTORY_SQL.split(' WHERE e.id>?')[0],LEGACY_INVENTORY_SQL.split(' WHERE e.id>?')[0]):input;return ({bind:(...values)=>wrap(query,values),all:async()=>{
  if(!/^SELECT\b/.test(query)&&!query.startsWith('WITH current_policy AS MATERIALIZED ('+LATEST_STRUCTURED_POLICY_SQL+') SELECT * FROM current_policy WHERE entity_id IN (SELECT e.id FROM entities e WHERE '))throw Error('select_only');const start=performance.now(),r=await ctx.db.prepare(query).bind(...params).all();
  sample.queries.push({kind:query.includes('structured_customer_policy_lookup')&&!query.includes('SELECT e.*')?'structured_policy':'commercial_inventory_page',total_api_ms:Number((performance.now()-start).toFixed(2)),d1_duration_ms:r.meta?.duration??null,rows_read:r.meta?.rows_read??null,rows_written:r.meta?.rows_written??null,rows_returned:r.results?.length??0});if(r.meta?.rows_written)throw Error('unexpected_database_write');return r;
 }});};
 const start=performance.now(),snapshot=await stagingCatalogue({prepare:q=>wrap(q)},{scope});sample.elapsed_ms=Number((performance.now()-start).toFixed(2));sample.query_count=sample.queries.length;sample.d1_duration_ms=sample.queries.reduce((s,q)=>s+(q.d1_duration_ms??0),0);sample.rows_read=sample.queries.reduce((s,q)=>s+(q.rows_read??0),0);sample.ready=snapshot.items.length;sample.proof_payload_bytes=Buffer.byteLength(JSON.stringify(snapshot));sample.visible_identity_revision_hash=createHash('sha256').update(JSON.stringify(snapshot.items.map(i=>[i.id,i.entity_revision,i.verification_id]))).digest('hex');fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{mode:0o600});
}
report.completed_at=new Date().toISOString();report.passed=true;fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(JSON.stringify({passed:true,samples:report.samples.map(({elapsed_ms,query_count,d1_duration_ms,rows_read,ready,proof_payload_bytes})=>({elapsed_ms,query_count,d1_duration_ms,rows_read,ready,proof_payload_bytes}))}));
