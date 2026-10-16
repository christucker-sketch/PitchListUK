// Bounded, authenticated read-only Worker profile. No raw snapshot is saved.
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {shadowContext} from './shadow-context.mjs';
const args=process.argv.slice(2),get=n=>args[args.indexOf(n)+1];
if(!args.includes('--credentials')||!args.includes('--state-dir')||!args.includes('--output'))throw Error('explicit_owned_context_required');
const stateDir=get('--state-dir'),ctx=await shadowContext({credentialsFile:get('--credentials'),stateDirectory:stateDir}),secrets=JSON.parse(fs.readFileSync(path.join(stateDir,'worker-secrets.json')));
const report={schema:'findpitches-v3-private-catalogue-profile-v1',started_at:new Date().toISOString(),scope:'authenticated_get_only_worker_url_transport_not_customer_binding',samples:[],writes:0,serper_queries:0};
for(let i=0;i<3;i++){
 const start=performance.now(),r=await ctx.fetcher(ctx.state.urls.api+'/staging/catalogue',{headers:{Authorization:'Bearer '+secrets.V3_STAGING_TOKEN},signal:AbortSignal.timeout(60000)}),headers=performance.now(),raw=await r.text(),complete=performance.now(),snapshot=JSON.parse(raw);
 if(!r.ok||snapshot.schema!=='findpitches-v3-customer-proof-snapshot-v1'||snapshot.publication_enabled!==false||snapshot.production_cutover_enabled!==false)throw Error('owned_private_snapshot_required');
 report.samples.push({sequence:i+1,source_as_of:snapshot.as_of,ttfb_ms:Number((headers-start).toFixed(2)),total_ms:Number((complete-start).toFixed(2)),server_timing:r.headers.get('server-timing'),cache_control:r.headers.get('cache-control'),ready:snapshot.items.length,body_bytes:Buffer.byteLength(raw),visible_identity_revision_hash:createHash('sha256').update(JSON.stringify(snapshot.items.map(i=>[i.id,i.entity_revision,i.verification_id]))).digest('hex')});
 fs.writeFileSync(get('--output'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
}
report.completed_at=new Date().toISOString();report.passed=true;fs.writeFileSync(get('--output'),JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(report));
