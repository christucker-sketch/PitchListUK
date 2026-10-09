import {commercialStatus} from './commercial.mjs';
import {startUKRun,discoverUKSource,importUKCandidate,stopUKRun,ukSourceStatus} from './uk-store.mjs';
import {stagingReady} from './staging.mjs';
import {fetchCatalogueDocument} from './source-catalogue.mjs';
import {startCatalogueRun,resumeReviewedCatalogueRun,discoverCataloguePage,verifyCatalogueCandidate,recoverUncommittedCatalogueLease,settleCommittedCatalogueReceipt,adoptCommittedCatalogueReceipt,stopCatalogueRun,catalogueStatus} from './catalogue-store.mjs';
import {verifyEntitySource,reverifyRetainedSource,verificationGate,verificationStatus} from './verification-store.mjs';
import { hash } from './contract.mjs';
export function safeFailureCode(error) {
  const message=String(error?.message??'');
  if(/SQLITE_(?:BUSY|LOCKED)|\b(?:locked|busy|overloaded)\b/i.test(message))return 'database_busy';
  if(/too many sql variables/i.test(message))return 'sql_parameter_limit';
  if(/too many (?:api requests|queries|subrequests)/i.test(message))return 'worker_request_limit';
  if(/SQLITE_CONSTRAINT/i.test(message))return 'sqlite_constraint';
  if(/SQLITE_ERROR/i.test(message))return 'sqlite_error';
  return {TypeError:'type_error',ReferenceError:'reference_error',SyntaxError:'syntax_error',TimeoutError:'timeout',AbortError:'aborted'}[error?.name]??'runtime_error';
}
import { ingestRecords,sql,loadEntity } from './store.mjs';
import { runStage,enrichEntity } from './pipeline.mjs';
import { enqueue,requeueDead } from './jobs.mjs';
import { verifyStructuredControl } from './control.mjs';
import { acquireCity,CITY,canaryApproved } from './acquisition.mjs';
import {serperStatus,serperPolicy,budgetDay} from './serper-usage.mjs';
import {fetchLegacySource} from './legacy.mjs';
import {selectRecordFacts} from './evidence.mjs';
import {importLegacyBatch,completeLegacyRecovery,legacyRecoveryStatus} from './legacy-store.mjs';
import {noteDeliveryContact,structuredDeliveryStatus} from './delivery-health.mjs';
import {repairLifecycleObservations} from './lifecycle-repair.mjs';
import {importLegacyGlobalRecords} from './legacy-global.mjs';
import {importMk1Source} from './mk1-source.mjs';
import {schedulePilotRun,stopPilot,pilotStatus} from './pilot.mjs';
import {fetchSourceDocument} from './source-document.mjs';
import {startSourceLed,scheduleSourceLed,executeSourceLed,verifySourceLedCandidate,stopSourceLed,sourceLedStatus} from './source-led.mjs';

const STAGES=['reconcile','eligibility','enrichment','readiness','acquisition','watch'];
const NEXT={ingest:'reconcile',acquisition:'reconcile',reconcile:'eligibility',eligibility:'enrichment',enrichment:'readiness',readiness:'watch',watch:'eligibility'};
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
async function authorized(request,secret) {
  if(typeof secret!=='string'||secret.length<24)return false;
  const candidate=request.headers.get('authorization')??'';
  const a=await hash(candidate),b=await hash('Bearer '+secret);
  let mismatch=0;for(let i=0;i<a.length;i++)mismatch|=a.charCodeAt(i)^b.charCodeAt(i);
  return mismatch===0;
}
async function bodyJson(request) {
  if(!request.body)throw new Error('json_body_required');
  if(Number(request.headers.get('content-length'))>1048576)throw new Error('request_size_limit');
  const reader=request.body.getReader(),parts=[];let size=0;
  try { for(;;) { const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>1048576)throw new Error('request_size_limit');parts.push(value); } }
  finally {reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
  return JSON.parse(new TextDecoder().decode(bytes));
}
export async function status(db,{role='api',now=new Date().toISOString()}={}) {
  const queries=[
    'SELECT producer_name,validation_status,COUNT(*) AS records,MAX(received_at) AS last_received_at FROM producer_records GROUP BY producer_name,validation_status',
    'SELECT stage,status,COUNT(*) AS jobs,MIN(available_at) AS oldest_available_at,MIN(lease_until) AS first_lease_expiry FROM jobs GROUP BY stage,status',
    'SELECT environment,COUNT(*) AS entities FROM entities GROUP BY environment',
    'SELECT status,COUNT(*) AS entities FROM readiness GROUP BY status',
    'SELECT name,tested_records,destructive_mutations,passed_at,report_hash FROM quality_gates',
    "SELECT stage,COUNT(*) AS completed_last_hour FROM jobs WHERE status='complete' AND updated_at>=? GROUP BY stage",
    "SELECT COUNT(*) AS stale_leases FROM jobs WHERE status='leased' AND lease_until<=?",
    'SELECT COUNT(*) AS unresolved_conflicts FROM conflicts WHERE resolved=0',
    'SELECT COALESCE(SUM(queries_reserved),0) AS provider_queries_reserved,COALESCE(SUM(queries_completed),0) AS provider_queries_completed FROM serper_usage WHERE budget_day=?',
    'SELECT (SELECT COUNT(*) FROM customer_projections) AS customer_rows,(SELECT COUNT(*) FROM publication_queue) AS publication_rows',
  ];
  const values=[[],[],[],[],[],[new Date(Date.parse(now)-3600000).toISOString()],[now],[],[budgetDay(now)],[]];
  const results=await Promise.all(queries.map((q,i)=>sql(db,q,...values[i]).all()));
  const [producers,jobs,entities,readiness,gates,throughput,leases,conflicts,cost,leakage]=results.map(r=>r.results);
  return {service:'findpitches-v3',role,mode:'shadow',publication_enabled:false,now,producers,jobs,entities,readiness,gates,throughput,...leases[0],...conflicts[0],...cost[0],...leakage[0],serper:await serperStatus(db,now),source_led_programme:await sourceLedStatus(db,now),free_source_discovery:await catalogueStatus(db),legacy_recovery:await legacyRecoveryStatus(db),structured_delivery:await structuredDeliveryStatus(db,now),controlled_pilot:await pilotStatus(db,now),source_verification:await verificationStatus(db,now),commercial:await commercialStatus(db,now)};
}
export async function wakeStage(env,stage,queue=env.NEXT_QUEUE) {
  if(!stage||!queue)return;
  const now=new Date().toISOString(),retryBefore=new Date(Date.parse(now)-300000).toISOString();
  const jobs=(await sql(env.FINDPITCHES_V3_DB,`INSERT INTO queue_dispatches(job_id,last_sent_at)
    SELECT j.id,? FROM jobs j LEFT JOIN queue_dispatches d ON d.job_id=j.id
    WHERE j.stage=? AND j.status='ready' AND j.available_at<=?
      AND (d.job_id IS NULL OR d.last_sent_at<=?) ORDER BY (json_extract(j.payload_json,'$.refresh_verification_id') IS NOT NULL) DESC,j.available_at LIMIT 100
    ON CONFLICT(job_id) DO UPDATE SET last_sent_at=excluded.last_sent_at
      WHERE queue_dispatches.last_sent_at<=? RETURNING job_id AS id`,now,stage,now,retryBefore,retryBefore).all()).results;
  if(jobs.length)await queue.sendBatch(jobs.map(j=>({body:{stage,job_id:j.id}})));
}
async function tick(env,{jobId=null,limit=10}={}) {
  const stage=env.V3_ROLE;if(!STAGES.includes(stage))throw new Error('stage_worker_required');
  // Candidate loading and source-field selection are bounded per record, but costly
  // across many records in one invocation. Reconciliation uses one queue message.
  if(['reconcile','acquisition','enrichment'].includes(stage))limit=1;
  const results=[];
  for(let i=0;i<limit;i++) {
    const handlers=stage==='acquisition'?{acquisition:p=>acquireCity(env.FINDPITCHES_V3_DB,p,env,{runId:p.run_id})}:stage==='enrichment'?{enrichment:async p=>{
      const entity=await loadEntity(env.FINDPITCHES_V3_DB,p.entity_id),gate=await verificationGate(env.FINDPITCHES_V3_DB,entity);
      // Unchanged exports cannot extend proof freshness. Missing/expired proof is fetched directly.
      if(entity.environment==='shadow'&&(gate.status==='unverified'||p.refresh_verification_id&&p.refresh_verification_id===gate.verification_id))await verifyEntitySource(env.FINDPITCHES_V3_DB,p.entity_id);
      return enrichEntity(env.FINDPITCHES_V3_DB,p.entity_id,{proposals:p.proposals??[],recheckToken:p.recheck_token});
    }}:{};
    const result=await runStage(env.FINDPITCHES_V3_DB,stage,{jobId,clock:()=>new Date(),handlers});
    results.push(result);if(result.phase!=='complete'||jobId)break;
  }
  await wakeStage(env,NEXT[stage]);
  return results;
}
export default {
  async fetch(request,env,ctx) {
    const url=new URL(request.url),path=url.pathname,role=env.V3_ROLE,db=env.FINDPITCHES_V3_DB;
    if(path==='/v1/opportunities')return json({error:'publication_disabled'},403);
    if(!db)return json({error:'v3_database_unavailable'},503);
    try {
      if(request.method==='GET'&&path==='/health') { await sql(db,'SELECT publication_enabled FROM runtime_policy WHERE id=1').first();return json({service:'findpitches-v3',role,ok:true,mode:'shadow',publication_enabled:false}); }
      if(request.method==='GET'&&path==='/status')return json(await status(db,{role}));
      if(path==='/staging/ready') {
        if(request.method!=='GET'||role!=='api')return json({error:'staging_read_only'},403);
        if(!await authorized(request,env.V3_STAGING_TOKEN))return json({error:'authorization_required'},401);
        return json(await stagingReady(db,{market:url.searchParams.get('market'),after:url.searchParams.get('after')??'',limit:Number(url.searchParams.get('limit')??50),region:url.searchParams.get('region'),location:url.searchParams.get('location')}));
      }
      const ingest=path==='/imports'||path==='/rechecks'||path==='/rechecks/ack';
      if(!await authorized(request,ingest?env.V3_INGEST_TOKEN:env.V3_OPERATOR_TOKEN))return json({error:'authorization_required'},401);
      if(request.method==='GET'&&path==='/commercial'&&role==='api')return json(await commercialStatus(db));
      if(request.method==='POST'&&path==='/lifecycle/repair'&&role==='reconcile') {
        const result=await repairLifecycleObservations(db,(await bodyJson(request)).entity_id);
        ctx?.waitUntil(wakeStage(env,'eligibility').catch(()=>{}));return json(result);
      }
      if(request.method==='GET'&&path==='/uk/status')return json(await ukSourceStatus(db));
      if(request.method==='POST'&&path==='/uk/start'&&role==='enrichment')return json(await startUKRun(db,await bodyJson(request)),201);
      if(request.method==='POST'&&path==='/uk/discover'&&role==='enrichment')return json(await discoverUKSource(db,await bodyJson(request)));
      if(request.method==='POST'&&path==='/uk/import'&&role==='enrichment')return json(await importUKCandidate(db,(await bodyJson(request)).candidate_id));
      if(request.method==='POST'&&path==='/uk/stop'&&role==='enrichment'){const b=await bodyJson(request);await stopUKRun(db,b.run_id,b.reason??'operator_stopped');return json({paused:true});}
      if(request.method==='GET'&&path==='/source-led/status')return json(await sourceLedStatus(db));
      if(request.method==='POST'&&path==='/source-led/start'&&role==='acquisition')return json(await startSourceLed(db,await bodyJson(request)),201);
      if(request.method==='POST'&&path==='/source-led/next'&&role==='acquisition')return json(await scheduleSourceLed(db,(await bodyJson(request)).programme_id));
      if(request.method==='POST'&&path==='/source-led/run'&&role==='acquisition')return json(await executeSourceLed(db,(await bodyJson(request)).run_id,env));
      if(request.method==='POST'&&path==='/source-led/stop'&&role==='acquisition') {const body=await bodyJson(request);await stopSourceLed(db,body.programme_id,body.reason??'operator_stop');return json({paused:true});}
      if(request.method==='POST'&&path==='/source-led/verify'&&role==='enrichment')return json(await verifySourceLedCandidate(db,(await bodyJson(request)).candidate_id));
      if(request.method==='POST'&&path==='/catalogue/start'&&role==='enrichment')return json(await startCatalogueRun(db,await bodyJson(request)),201);
      if(request.method==='POST'&&path==='/mk1/verify-import'&&role==='enrichment') {
        const result=await importMk1Source(db,await bodyJson(request));
        ctx?.waitUntil(wakeStage(env,'readiness').catch(()=>{}));return json(result);
      }
      if(request.method==='POST'&&path==='/catalogue/resume'&&role==='enrichment')return json(await resumeReviewedCatalogueRun(db,await bodyJson(request)));
      if(request.method==='POST'&&path==='/catalogue/adopt-committed'&&role==='enrichment')return json(await adoptCommittedCatalogueReceipt(db,await bodyJson(request)));
      if(request.method==='POST'&&path==='/catalogue/discover'&&role==='enrichment')return json(await discoverCataloguePage(db,await bodyJson(request)));
      if(request.method==='POST'&&path==='/catalogue/verify'&&role==='enrichment') {
        const result=await verifyCatalogueCandidate(db,(await bodyJson(request)).candidate_id);
        ctx?.waitUntil(wakeStage(env,'readiness').catch(()=>{}));return json(result);
      }
      if(request.method==='POST'&&path==='/catalogue/recover'&&role==='enrichment')return json(await recoverUncommittedCatalogueLease(db,(await bodyJson(request)).candidate_id));
      if(request.method==='POST'&&path==='/catalogue/stop'&&role==='enrichment') {const body=await bodyJson(request);await stopCatalogueRun(db,body.run_id,body.reason??'operator_stopped');return json({paused:true});}
      if(request.method==='POST'&&path==='/imports'&&role==='ingest') {
        const body=await bodyJson(request);
        const result=await ingestRecords(db,body.records,{producer:'independent-structured',environment:body.environment??'shadow'});
        await noteDeliveryContact(db,{kind:'import',environment:body.environment??'shadow',records:body.records,receipt:result});
        // Durable jobs survive a missing transport wakeup; the role cron recovers them.
        ctx?.waitUntil(wakeStage(env,'reconcile').catch(()=>{}));return json(result,202);
      }
      if(request.method==='POST'&&path==='/legacy-global/import'&&role==='ingest') {
        const result=await importLegacyGlobalRecords(db,await bodyJson(request));
        ctx?.waitUntil(wakeStage(env,'reconcile').catch(()=>{}));return json(result,202);
      }
      if(request.method==='POST'&&path==='/legacy/import'&&role==='ingest') {
        const result=await importLegacyBatch(db,await bodyJson(request));
        ctx?.waitUntil(wakeStage(env,'reconcile').catch(()=>{}));return json(result,202);
      }
      if(request.method==='POST'&&path==='/legacy/complete'&&role==='ingest')return json(await completeLegacyRecovery(db,(await bodyJson(request)).run_id));
      if(request.method==='POST'&&path==='/legacy/refetch'&&role==='ingest') {
        const body=await bodyJson(request);
        if(typeof body.url!=='string')throw Error('legacy_original_source_url_required');
        return json(await fetchLegacySource(body.url));
      }
      if(request.method==='POST'&&path==='/verification/verify'&&role==='enrichment') {
        const body=await bodyJson(request);if(typeof body.entity_id!=='string')throw Error('entity_id_required');
        const result=await verifyEntitySource(db,body.entity_id);
        await enqueue(db,'readiness',result.verification_id,{entity_id:body.entity_id});
        ctx?.waitUntil(wakeStage(env,'readiness').catch(()=>{}));return json(result);
      }
      if(request.method==='POST'&&path==='/verification/replay'&&role==='enrichment') {
        const body=await bodyJson(request),result=await reverifyRetainedSource(db,body.entity_id);
        await enqueue(db,'readiness',result.verification_id,{entity_id:body.entity_id});
        ctx?.waitUntil(wakeStage(env,'readiness').catch(()=>{}));return json(result);
      }
      if(request.method==='POST'&&path==='/verification/document'&&role==='enrichment') {
        const body=await bodyJson(request);if(typeof body.url!=='string')throw Error('original_source_url_required');
        return json(await fetchSourceDocument(body.url));
      }
      if(request.method==='POST'&&path==='/catalogue/document'&&role==='enrichment') {
        return json(await fetchCatalogueDocument((await bodyJson(request)).url));
      }
      if(request.method==='POST'&&path==='/catalogue/settle'&&role==='enrichment') {
        return json(await settleCommittedCatalogueReceipt(db,(await bodyJson(request)).candidate_id));
      }
      if(request.method==='GET'&&path==='/rechecks'&&role==='ingest') {
        if(url.searchParams.get('probe')!=='1')await noteDeliveryContact(db,{kind:'rechecks'});
        return json({requests:(await sql(db,`SELECT q.entity_id,q.requested_at,q.reason,r.producer_record_id,r.market,r.environment
        FROM recheck_requests q JOIN entity_records er ON er.entity_id=q.entity_id JOIN producer_records r ON r.id=er.record_id
        WHERE r.producer_name='independent-structured' AND r.environment='shadow'
        GROUP BY q.entity_id,r.producer_record_id ORDER BY q.requested_at LIMIT 100`).all()).results});
      }
      if(request.method==='POST'&&path==='/rechecks/ack'&&role==='ingest') {
        const body=await bodyJson(request);
        const result=await sql(db,`DELETE FROM recheck_requests WHERE entity_id=? AND requested_at=? AND EXISTS(
          SELECT 1 FROM entity_records er JOIN producer_records r ON r.id=er.record_id WHERE er.entity_id=? AND r.producer_name='independent-structured' AND r.environment='shadow'
          AND julianday(json_extract(r.normalized_json,'$.last_checked'))>=julianday(recheck_requests.requested_at))`,body.entity_id,body.requested_at,body.entity_id).run();
        return json({acknowledged:Number(result.meta?.changes)===1});
      }
      if(request.method==='GET'&&path==='/shadow'&&role==='api') {
        const limit=Math.min(100,Math.max(1,Number(url.searchParams.get('limit'))||25)),after=url.searchParams.get('after')??'';
        const environment=url.searchParams.get('environment')??'shadow';if(!['shadow','test'].includes(environment))throw new Error('shadow_or_test_required');
        const rows=(await sql(db,'SELECT p.entity_id,p.entity_revision,p.payload_json FROM shadow_projections p JOIN entities e ON e.id=p.entity_id WHERE e.environment=? AND p.entity_id>? ORDER BY p.entity_id LIMIT ?',environment,after,limit).all()).results;
        const items=rows.map(r=>JSON.parse(r.payload_json));
        for(const item of items)if(item.readiness==='ready'&&Date.parse(item.verification?.expires_at??'')<=Date.now()){item.readiness='watch';item.verification={...item.verification,status:'unverified',reasons:['source_verification_expired']};}
        return json({items,next:rows.length===limit?rows.at(-1).entity_id:null});
      }
      if(request.method==='GET'&&path.startsWith('/entities/')&&role==='api') {
        const entity=await loadEntity(db,decodeURIComponent(path.slice(10)));if(!entity)return json({error:'entity_missing'},404);
        const audit=(await sql(db,'SELECT * FROM selection_audit WHERE entity_id=? ORDER BY created_at,id LIMIT 250',entity.id).all()).results;
        const quality_holds=(await sql(db,'SELECT h.* FROM legacy_quality_holds h JOIN selected_facts f ON f.record_id=h.record_id WHERE f.entity_id=? GROUP BY h.record_id',entity.id).all()).results;
        return json({entity,audit,quality_holds,verification:await verificationGate(db,entity)});
      }
      if(request.method==='POST'&&path==='/tick'&&STAGES.includes(role)) {const body=await bodyJson(request);return json({results:await tick(env,{limit:Math.min(25,Math.max(1,Number(body.limit)||10))})});}
      if(request.method==='POST'&&path==='/proposals'&&role==='enrichment') {
        const body=await bodyJson(request);if(!Array.isArray(body.proposals)||body.proposals.length<1||body.proposals.length>10)throw new Error('proposal_batch_1_to_10_required');
        const result=await enrichEntity(db,body.entity_id,{proposals:body.proposals});ctx?.waitUntil(wakeStage(env,'readiness').catch(()=>{}));return json(result,202);
      }
      if(request.method==='POST'&&path==='/corroboration/reselect'&&role==='enrichment') {
        const body=await bodyJson(request),ids=body.fact_ids;
        if(!Array.isArray(ids)||ids.length<1||ids.length>14||new Set(ids).size!==ids.length)throw Error('bounded_corroborating_fact_ids_required');
        const entity=await loadEntity(db,body.entity_id);if(!entity||!['test','shadow'].includes(entity.environment))throw Error('shadow_entity_required');
        const facts=(await sql(db,`SELECT f.* FROM source_facts f JOIN entity_facts ef ON ef.fact_id=f.id
          WHERE ef.entity_id=? AND f.id IN (SELECT value FROM json_each(?))
          AND NOT EXISTS(SELECT 1 FROM legacy_quality_holds h WHERE h.record_id=f.record_id)`,entity.id,JSON.stringify(ids)).all()).results;
        if(facts.length!==ids.length||facts.some(f=>!entity.selections[f.field_name]||f.value_json!==entity.selections[f.field_name].value_json||f.authority<entity.selections[f.field_name].authority))throw Error('same_value_stronger_membership_required');
        const results=await selectRecordFacts(db,entity.id,facts,{snapshot:entity});
        const current=await loadEntity(db,entity.id),key=current.id+':'+current.revision+':corroboration';
        await enqueue(db,'eligibility',key,{entity_id:current.id});await enqueue(db,'readiness',key,{entity_id:current.id});
        return json({entity_id:entity.id,results,source_value_mutations:0});
      }
      if(request.method==='POST'&&path==='/control'&&role==='api') {const body=await bodyJson(request);return json(await verifyStructuredControl(db,body.records,body.record_ids));}
      if(request.method==='POST'&&path==='/jobs/requeue'&&STAGES.includes(role)) {
        const body=await bodyJson(request),job=await sql(db,'SELECT stage FROM jobs WHERE id=?',body.job_id).first();if(job?.stage!==role)throw new Error('job_stage_mismatch');
        const result=await requeueDead(db,body.job_id);return json({requeued:Number(result.meta?.changes)===1});
      }
      if(request.method==='POST'&&path==='/acquisition/canary'&&role==='acquisition') {
        const body=await bodyJson(request);
        if(!canaryApproved(env,body.run_id))throw new Error('one_shot_canary_not_authorized');
        await enqueue(db,'acquisition',body.run_id,{city:CITY.id,query_limit:1,run_id:body.run_id,canary:true});
        return json({run_id:body.run_id,query_limit:1,city:CITY.id},202);
      }
      if(request.method==='POST'&&path==='/acquisition/pilot/start'&&role==='acquisition')return json({error:'city_pilot_retired_use_source_led'},403);
      if(request.method==='POST'&&path==='/acquisition/pilot/next'&&role==='acquisition')return json(await schedulePilotRun(db,(await bodyJson(request)).pilot_id),202);
      if(request.method==='POST'&&path==='/acquisition/pilot/stop'&&role==='acquisition') {const body=await bodyJson(request);const reason=body.reason??'operator_stop';if(!/^[a-z][a-z0-9_]{0,79}$/.test(reason))throw Error('pilot_stop_reason_invalid');await stopPilot(db,body.pilot_id,reason);return json({paused:true});}
      if(request.method==='POST'&&path==='/acquisition'&&role==='acquisition') {
        const body=await bodyJson(request);
        if(env.V3_CITY_ENABLED!=='true'||(await serperPolicy(db)).bulk_enabled!==1)throw new Error('city_acquisition_disabled');
        if(body.city!==CITY.id||!Number.isInteger(body.query_limit)||body.query_limit<1||body.query_limit>4)throw new Error('bounded_approved_city_required');
        const runId=crypto.randomUUID();await enqueue(db,'acquisition',runId,{city:body.city,query_limit:body.query_limit,run_id:runId});return json({run_id:runId},202);
      }
      return json({error:'route_not_found'},404);
    } catch(error) {
      const known=/^[a-z][a-z0-9_:\-]+$/.test(error.message)?error.message:'request_failed';
      return json({error:known,diagnostic_code:safeFailureCode(error)},known==='request_size_limit'?413:400);
    }
  },
  async scheduled(_event,env,ctx) {
    ctx.waitUntil((async()=>{
      if(env.V3_ROLE==='reconcile'&&env.SELF_QUEUE)await wakeStage(env,'reconcile',env.SELF_QUEUE).catch(()=>{});
      return tick(env,{limit:25});
    })());
  },
  async queue(batch,env) {
    for(const message of batch.messages) {
      if(message.body?.stage!==env.V3_ROLE||typeof message.body?.job_id!=='string') {message.retry();continue;}
      try {
        const job=await sql(env.FINDPITCHES_V3_DB,'SELECT status,available_at,lease_until FROM jobs WHERE id=? AND stage=?',message.body.job_id,env.V3_ROLE).first();
        const now=new Date().toISOString();
        // A duplicate pointer must not create another claim/write/fan-out cycle.
        if(!job||['complete','dead'].includes(job.status)||job.status==='leased'&&job.lease_until>now){message.ack();continue;}
        if(job.status==='ready'&&job.available_at>now){message.retry({delaySeconds:Math.min(3600,Math.max(1,Math.ceil((Date.parse(job.available_at)-Date.now())/1000)))});continue;}
        const results=await tick(env,{jobId:message.body.job_id,limit:1});
        if(results.some(r=>r.phase==='failed'))message.retry({delaySeconds:120});else message.ack();
      } catch {message.retry({delaySeconds:120});}
    }
  },
};
