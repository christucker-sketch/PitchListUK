import { hash } from './contract.mjs';
import { ingestRecords,sql,loadEntity } from './store.mjs';
import { runStage,enrichEntity } from './pipeline.mjs';
import { enqueue,requeueDead } from './jobs.mjs';
import { verifyStructuredControl } from './control.mjs';
import { acquireCity,CITY,canaryApproved } from './acquisition.mjs';

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
    'SELECT COALESCE(SUM(queries_reserved),0) AS provider_queries_reserved,COALESCE(SUM(queries_completed),0) AS provider_queries_completed FROM acquisition_runs WHERE day=?',
    'SELECT (SELECT COUNT(*) FROM customer_projections) AS customer_rows,(SELECT COUNT(*) FROM publication_queue) AS publication_rows',
  ];
  const values=[[],[],[],[],[],[new Date(Date.parse(now)-3600000).toISOString()],[now],[],[now.slice(0,10)],[]];
  const results=await Promise.all(queries.map((q,i)=>sql(db,q,...values[i]).all()));
  const [producers,jobs,entities,readiness,gates,throughput,leases,conflicts,cost,leakage]=results.map(r=>r.results);
  return {service:'findpitches-v3',role,mode:'shadow',publication_enabled:false,now,producers,jobs,entities,readiness,gates,throughput,...leases[0],...conflicts[0],...cost[0],...leakage[0]};
}
export async function wakeStage(env,stage) {
  if(!stage||!env.NEXT_QUEUE)return;
  const jobs=(await sql(env.FINDPITCHES_V3_DB,"SELECT id FROM jobs WHERE stage=? AND status='ready' AND available_at<=? ORDER BY available_at LIMIT 100",stage,new Date().toISOString()).all()).results;
  if(jobs.length)await env.NEXT_QUEUE.sendBatch(jobs.map(j=>({body:{stage,job_id:j.id}})));
}
async function tick(env,{jobId=null,limit=10}={}) {
  const stage=env.V3_ROLE;if(!STAGES.includes(stage))throw new Error('stage_worker_required');
  const results=[];
  for(let i=0;i<limit;i++) {
    const result=await runStage(env.FINDPITCHES_V3_DB,stage,{jobId,clock:()=>new Date(),handlers:stage==='acquisition'?{acquisition:p=>acquireCity(env.FINDPITCHES_V3_DB,p,env,{runId:p.run_id})}:{}});
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
      const ingest=path==='/imports'||path==='/rechecks'||path==='/rechecks/ack';
      if(!await authorized(request,ingest?env.V3_INGEST_TOKEN:env.V3_OPERATOR_TOKEN))return json({error:'authorization_required'},401);
      if(request.method==='POST'&&path==='/imports'&&role==='ingest') {
        const body=await bodyJson(request);
        const result=await ingestRecords(db,body.records,{producer:'independent-structured',environment:body.environment??'shadow'});
        // Durable jobs survive a missing transport wakeup; the role cron recovers them.
        ctx?.waitUntil(wakeStage(env,'reconcile').catch(()=>{}));return json(result,202);
      }
      if(request.method==='GET'&&path==='/rechecks'&&role==='ingest')return json({requests:(await sql(db,`SELECT q.entity_id,q.requested_at,q.reason,r.producer_record_id,r.market,r.environment
        FROM recheck_requests q JOIN entity_records er ON er.entity_id=q.entity_id JOIN producer_records r ON r.id=er.record_id
        WHERE r.producer_name='independent-structured' AND r.environment='shadow'
        GROUP BY q.entity_id,r.producer_record_id ORDER BY q.requested_at LIMIT 100`).all()).results});
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
        return json({items:rows.map(r=>JSON.parse(r.payload_json)),next:rows.length===limit?rows.at(-1).entity_id:null});
      }
      if(request.method==='GET'&&path.startsWith('/entities/')&&role==='api') {
        const entity=await loadEntity(db,decodeURIComponent(path.slice(10)));if(!entity)return json({error:'entity_missing'},404);
        const audit=(await sql(db,'SELECT * FROM selection_audit WHERE entity_id=? ORDER BY created_at,id LIMIT 250',entity.id).all()).results;
        return json({entity,audit});
      }
      if(request.method==='POST'&&path==='/tick'&&STAGES.includes(role)) {const body=await bodyJson(request);return json({results:await tick(env,{limit:Math.min(25,Math.max(1,Number(body.limit)||10))})});}
      if(request.method==='POST'&&path==='/proposals'&&role==='enrichment') {
        const body=await bodyJson(request);if(!Array.isArray(body.proposals)||body.proposals.length<1||body.proposals.length>10)throw new Error('proposal_batch_1_to_10_required');
        const result=await enrichEntity(db,body.entity_id,{proposals:body.proposals});ctx?.waitUntil(wakeStage(env,'readiness').catch(()=>{}));return json(result,202);
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
      if(request.method==='POST'&&path==='/acquisition'&&role==='acquisition') {
        const body=await bodyJson(request);
        if(env.V3_CITY_ENABLED!=='true')throw new Error('city_acquisition_disabled');
        if(body.city!==CITY.id||!Number.isInteger(body.query_limit)||body.query_limit<1||body.query_limit>4)throw new Error('bounded_approved_city_required');
        const runId=crypto.randomUUID();await enqueue(db,'acquisition',runId,{city:body.city,query_limit:body.query_limit,run_id:runId});return json({run_id:runId},202);
      }
      return json({error:'route_not_found'},404);
    } catch(error) {
      const known=/^[a-z][a-z0-9_:\-]+$/.test(error.message)?error.message:'request_failed';
      return json({error:known},known==='request_size_limit'?413:400);
    }
  },
  async scheduled(_event,env,ctx) {ctx.waitUntil(tick(env,{limit:25}));},
  async queue(batch,env) {
    for(const message of batch.messages) {
      if(message.body?.stage!==env.V3_ROLE||typeof message.body?.job_id!=='string') {message.retry();continue;}
      try {
        const results=await tick(env,{jobId:message.body.job_id,limit:1});
        if(results.some(r=>r.phase==='failed'))message.retry({delaySeconds:120});else message.ack();
      } catch {message.retry({delaySeconds:120});}
    }
  },
};
