import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {cloudflareClient,readCredentials,proxyFetch} from './cloudflare-api.mjs';
import {openRemoteD1} from './remote-d1.mjs';

// Only already-durable, non-paid reconciliation work. Other stages retain their
// normal consumers/cron; this helper cannot tick acquisition or publication.
export async function drainLegacyRecovery({credentialsFile,stateDirectory,recoveryDirectory,concurrency=2,maxMinutes=180,progress=()=>{}}) {
  if(!Number.isInteger(concurrency)||concurrency<1||concurrency>2||!Number.isInteger(maxMinutes)||maxMinutes<1||maxMinutes>180)throw Error('bounded_nonpaid_recovery_drain_required');
  const state=JSON.parse(fs.readFileSync(path.join(stateDirectory,'resources.json')));
  const token=JSON.parse(fs.readFileSync(path.join(stateDirectory,'worker-secrets.json'))).V3_OPERATOR_TOKEN;
  const runId=JSON.parse(fs.readFileSync(path.join(recoveryDirectory,'v3-entity-baseline.json'))).run_id;
  const db=await openRemoteD1(cloudflareClient(readCredentials(credentialsFile)),state),fetcher=proxyFetch();
  const deadline=Date.now()+maxMinutes*60000;let completed=0,failed=0,done=false;
  async function summary() {
    const row=await db.prepare(`SELECT r.status,COUNT(l.legacy_id) AS imported,
      SUM(l.record_id IS NOT NULL AND d.record_id IS NULL) AS reconciliation_pending
      FROM legacy_recovery_runs r LEFT JOIN legacy_recovery_records l ON l.run_id=r.id
      LEFT JOIN reconciliation_decisions d ON d.record_id=l.record_id WHERE r.id=? GROUP BY r.id`).bind(runId).first();
    if(!row)throw Error('legacy_manifest_required_before_drain');
    done=row.status==='complete'&&Number(row.reconciliation_pending)===0;
    return {at:new Date().toISOString(),run_id:runId,operator_completed:completed,operator_failed:failed,...row,complete:done,serper_queries:0};
  }
  await summary();
  await Promise.all(Array.from({length:concurrency},async()=>{
    for(let i=0;i<10000&&Date.now()<deadline&&!done;i++) {
      let idle=false;
      try {
        const response=await fetcher(state.urls.reconcile+'/tick',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({limit:1}),signal:AbortSignal.timeout(60000)});
        const data=await response.json();if(!response.ok)throw Error('nonpaid_reconcile_http_failed');
        completed+=(data.results??[]).filter(row=>row.phase==='complete').length;
        failed+=(data.results??[]).filter(row=>row.phase==='failed').length;
        if(failed>20)throw Error('nonpaid_reconcile_failure_ceiling');
        idle=data.results?.some(row=>row.phase==='idle');
        if(i%25===0||idle)progress(await summary());
      } catch(error) {
        if(error.message==='nonpaid_reconcile_failure_ceiling')throw error;
        progress({at:new Date().toISOString(),event:'nonpaid_reconciliation_backoff',serper_queries:0});
        await new Promise(resolve=>setTimeout(resolve,10000));
      }
      if(idle&&!done)await new Promise(resolve=>setTimeout(resolve,3000));
    }
  }));
  const result=await summary();if(!result.complete)throw Error('bounded_recovery_drain_incomplete');return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2),get=name=>args[args.indexOf(name)+1];
  try {console.log(JSON.stringify(await drainLegacyRecovery({credentialsFile:get('--credentials'),stateDirectory:get('--state-dir'),recoveryDirectory:get('--recovery-dir'),progress:row=>console.log(JSON.stringify(row))})));}
  catch {console.error('nonpaid_recovery_drain_failed');process.exitCode=1;}
}
