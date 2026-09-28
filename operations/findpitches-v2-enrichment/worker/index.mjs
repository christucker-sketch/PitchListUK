import { createHttpFetchProvider } from '../../../platform/findpitches-v2/providers/fetch/http.mjs';
import { enqueueValidatedForEnrichment, runEnrichmentBatch } from '../../../platform/findpitches-v2/enrichment/run-batch.mjs';

const SERVICE='findpitches-v2-enrichment';
const BATCH_LIMIT=8;

export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(request.method==='GET' && url.pathname==='/health') return health(env);
    if(request.method==='GET' && url.pathname==='/status') return status(env);
    return Response.json({ok:false,service:SERVICE,error:'not_found'},{status:404});
  },
  async scheduled(_event,env,ctx){
    ctx.waitUntil(runTick(env).then(r=>console.log('findpitches_v2_enrichment_tick',JSON.stringify(r)))
      .catch(e=>console.error('findpitches_v2_enrichment_tick_failed',String(e?.stack||e))));
  }
};

export async function runTick(env,{now=new Date()}={}){
  const queued=await enqueueValidatedForEnrichment(env.FINDPITCHES_DB,{now});
  const enrichment=await runEnrichmentBatch(env.FINDPITCHES_DB,{fetchProvider:createHttpFetchProvider(),limit:BATCH_LIMIT,now});
  return Object.freeze({ok:true,service:SERVICE,queued,enrichment,serper_configured:false,at:now.toISOString()});
}
async function health(env){
  try{const row=await env.FINDPITCHES_DB.prepare('SELECT 1 AS ok').first();return Response.json({ok:row?.ok===1,service:SERVICE,database:'isolated',serper_configured:false});}
  catch(e){return Response.json({ok:false,service:SERVICE,error:String(e?.message||e)},{status:503});}
}
async function status(env){
  const now=new Date().toISOString();
  const row=await env.FINDPITCHES_DB.prepare(`SELECT
    SUM(CASE WHEN status='ready' THEN 1 ELSE 0 END) AS ready,
    SUM(CASE WHEN status='leased' THEN 1 ELSE 0 END) AS leased,
    SUM(CASE WHEN status='complete' THEN 1 ELSE 0 END) AS complete,
    SUM(CASE WHEN status='leased' AND lease_until IS NOT NULL AND lease_until<=? THEN 1 ELSE 0 END) AS expired
    FROM enrichment_queue`).bind(now).first();
  const stored=await env.FINDPITCHES_DB.prepare('SELECT COUNT(*) AS count FROM candidate_enrichment').first();
  return Response.json({ok:true,service:SERVICE,serper_configured:false,queue:{ready:Number(row?.ready||0),leased:Number(row?.leased||0),complete:Number(row?.complete||0),expired:Number(row?.expired||0),dead:Number(row?.dead||0)},enriched:Number(stored?.count||0)});
}
