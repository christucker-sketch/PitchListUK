// V2 attribution is a fixed SELECT-only reference. No V2 configuration changes.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {cloudflareClient,readCredentials,proxyFetch} from './cloudflare-api.mjs';
import {openRemoteD1} from './remote-d1.mjs';
import {serperStatus} from '../../platform/findpitches-v3/serper-usage.mjs';

export async function auditSerperUsage({credentialsFile,stateDirectory,serperFile,previousReportFile,now=new Date().toISOString()}) {
  const api=cloudflareClient(readCredentials(credentialsFile)),databases=await api.accountRequest('/d1/database?per_page=100');
  const v2=databases.find(d=>d.name==='findpitches-v2-shadow-findpitches-db');
  if(!v2||(await api.accountRequest('/d1/database/'+v2.uuid)).name!==v2.name)throw Error('v2_reference_identity_required');
  const day=now.slice(0,10),start=day+'T00:00:00.000Z',end=new Date(Date.parse(start)+86400000).toISOString();
  async function read(query) {
    if(!/^SELECT\b/.test(query)||/;/.test(query))throw Error('select_only_reference_required');
    const result=await api.accountRequest('/d1/database/'+v2.uuid+'/query',{method:'POST',body:{sql:query,params:[start,end]}});
    if(!result[0]?.success)throw Error('v2_attribution_read_failed');return result[0].results;
  }
  const [totals,lanes,statuses]=await Promise.all([
    read(`SELECT COUNT(*) AS runs,SUM(query_count) AS query_attempts,SUM(search_results) AS search_results,
      SUM(unique_candidates) AS sum_per_run_unique_candidates,MIN(started_at) AS first_run,MAX(started_at) AS latest_run
      FROM acquisition_runs WHERE query_count>0 AND started_at>=? AND started_at<?`),
    read(`SELECT market,region_code,status,COUNT(*) AS runs,SUM(query_count) AS query_attempts,SUM(search_results) AS search_results,
      SUM(unique_candidates) AS sum_per_run_unique_candidates FROM acquisition_runs WHERE query_count>0 AND started_at>=? AND started_at<? GROUP BY market,region_code,status ORDER BY query_attempts DESC`),
    read(`SELECT c.status,COUNT(*) AS candidate_rows_first_attributed_to_today FROM candidates c JOIN acquisition_runs r ON r.run_id=c.run_id
      WHERE r.query_count>0 AND r.started_at>=? AND r.started_at<? GROUP BY c.status`),
  ]);
  const state=JSON.parse(fs.readFileSync(path.join(stateDirectory,'resources.json'))),db=await openRemoteD1(api,state);
  const v3=await serperStatus(db,now);
  v3.audit_usage=await db.prepare(`SELECT COALESCE(SUM(queries_attempted),0) AS query_attempts,
    COALESCE(SUM(queries_completed),0) AS queries_completed,SUM(credits_observed) AS observed_credit_subtotal,
    SUM(CASE WHEN credits_observed IS NULL THEN queries_reserved ELSE 0 END) AS queries_without_credit_observation
    FROM serper_usage WHERE reserved_at>=? AND reserved_at<?`).bind(start,end).first();
  let account=null;
  if(serperFile) {
    const value=fs.readFileSync(serperFile,'utf8').split(/\r?\n/).find(l=>/^SERPER_API_KEY=/.test(l))?.slice('SERPER_API_KEY='.length);
    if(!value||/\s/.test(value))throw Error('secure_serper_secret_file_required');
    const response=await proxyFetch()('https://google.serper.dev/account',{headers:{'X-API-KEY':value},signal:AbortSignal.timeout(15000)});
    if(response.ok){const body=await response.json();account={checked_at:new Date().toISOString(),balance:typeof body.balance==='number'?body.balance:null,rate_limit:typeof body.rateLimit==='number'?body.rateLimit:null,search_queries_issued:0};}
  }
  let balanceInterval=null;
  if(previousReportFile&&account&&typeof account.balance==='number') {
    const previous=JSON.parse(fs.readFileSync(previousReportFile));
    if(previous.schema!=='findpitches-serper-attribution-v1'||previous.from_utc!==start||previous.to_utc!==end||typeof previous.account?.balance!=='number')throw Error('same_audit_window_balance_reference_required');
    balanceInterval={from:previous.account.checked_at,to:account.checked_at,previous_balance:previous.account.balance,current_balance:account.balance,
      net_balance_decrease:previous.account.balance-account.balance,
      retained_v2_query_attempts_change:(totals[0].query_attempts??0)-(previous.v2.query_attempts??0),
      v3_query_attempts_change:v3.audit_usage.query_attempts-previous.v3.audit_usage.query_attempts,
      billed_credits_attributable_to_v2:null,billed_credits_attributable_to_v3:null,
      interpretation:'Net balance change is an account observation, not a billed-credit split. Retained counters, delayed billing and other clients cannot be distinguished.'};
  }
  return {schema:'findpitches-serper-attribution-v1',as_of:now,day,timezone:'Etc/UTC',from_utc:start,to_utc:end,
    v2:{read_only:true,...totals[0],lanes,candidate_statuses:statuses,credits_consumed:null,
      measurement:'Retained V2 query counts match query-loop attempts, including unsuccessful requests; not observed billed credits.'},
    v3,account,balance_interval:balanceInterval,
    limitations:['No start-of-day account balance or V2 per-request credit ledger survives; exact billed attribution is unavailable.',
      'V2 and V3 secret bindings cannot establish account-key equality without exposing credentials; other account clients may contribute usage.',
      'Per-run V2 candidate counts can include duplicates across runs; candidate statuses reflect current downstream state.',
      'V3 limits govern V3 only. The independent V2 scheduler is unchanged.'],paid_search_queries_issued_by_audit:0};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2),get=name=>args[args.indexOf(name)+1];
  try {const report=await auditSerperUsage({credentialsFile:get('--credentials'),stateDirectory:get('--state-dir'),serperFile:args.includes('--serper-file')?get('--serper-file'):null,previousReportFile:args.includes('--previous-report')?get('--previous-report'):null});fs.writeFileSync(get('--out'),JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(JSON.stringify({v2_query_attempts:report.v2.query_attempts,v3_query_attempts:report.v3.audit_usage.query_attempts,balance:report.account?.balance,paid_search_queries_issued:0}));}
  catch {console.error('serper_read_only_audit_failed');process.exitCode=1;}
}
