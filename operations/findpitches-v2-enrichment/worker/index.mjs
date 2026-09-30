import { createHttpFetchProvider } from '../../../platform/findpitches-v2/providers/fetch/http.mjs';
import { enqueueValidatedForEnrichment, enqueueEnrichmentRulesetRefresh, runEnrichmentBatch } from '../../../platform/findpitches-v2/enrichment/run-batch.mjs';

const SERVICE='findpitches-v2-enrichment';
const FRESH_ENQUEUE_LIMIT=8;
const MIN_RULESET_REFRESH_LIMIT=4;
const BATCH_LIMIT=12;
const ENRICHMENT_RULESET_VERSION='2026-09-30-practical-location-v2';

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
  const queued=await enqueueValidatedForEnrichment(env.FINDPITCHES_DB,{now,limit:FRESH_ENQUEUE_LIMIT});
  const refreshLimit=Math.max(MIN_RULESET_REFRESH_LIMIT,BATCH_LIMIT-Math.min(FRESH_ENQUEUE_LIMIT,Number(queued.enqueued||0)));
  const ruleset=await enqueueEnrichmentRulesetRefresh(env.FINDPITCHES_DB,{now,limit:refreshLimit,ruleset:ENRICHMENT_RULESET_VERSION});
  const enrichment=await runEnrichmentBatch(env.FINDPITCHES_DB,{fetchProvider:createHttpFetchProvider(),limit:BATCH_LIMIT,now});
  return Object.freeze({ok:true,service:SERVICE,queued,ruleset,enrichment,serper_configured:false,at:now.toISOString()});
}
async function health(env){
  try{const row=await env.FINDPITCHES_DB.prepare('SELECT 1 AS ok').first();return Response.json({ok:row?.ok===1,service:SERVICE,database:'isolated',serper_configured:false,enrichment_ruleset:ENRICHMENT_RULESET_VERSION,batch_limit:BATCH_LIMIT,fresh_enqueue_limit:FRESH_ENQUEUE_LIMIT,minimum_ruleset_refresh_limit:MIN_RULESET_REFRESH_LIMIT});}
  catch(e){return Response.json({ok:false,service:SERVICE,error:String(e?.message||e)},{status:503});}
}
async function status(env){
  const now=new Date().toISOString();
  const [row,stored,locationArea,metaRows]=await Promise.all([
    env.FINDPITCHES_DB.prepare(`SELECT
      SUM(CASE WHEN status='ready' THEN 1 ELSE 0 END) AS ready,
      SUM(CASE WHEN status='leased' THEN 1 ELSE 0 END) AS leased,
      SUM(CASE WHEN status='complete' THEN 1 ELSE 0 END) AS complete,
      SUM(CASE WHEN status='dead' THEN 1 ELSE 0 END) AS dead,
      SUM(CASE WHEN status='leased' AND lease_until IS NOT NULL AND lease_until<=? THEN 1 ELSE 0 END) AS expired
      FROM enrichment_queue`).bind(now).first(),
    env.FINDPITCHES_DB.prepare('SELECT COUNT(*) AS count FROM candidate_enrichment').first(),
    env.FINDPITCHES_DB.prepare(`SELECT
      SUM(CASE WHEN json_extract(enrichment_json,'$.location_area.value') IS NOT NULL THEN 1 ELSE 0 END) AS supported,
      SUM(CASE WHEN json_extract(enrichment_json,'$.location_area.precision')='place' THEN 1 ELSE 0 END) AS place,
      SUM(CASE WHEN json_extract(enrichment_json,'$.location_area.precision')='area' THEN 1 ELSE 0 END) AS area
      FROM candidate_enrichment`).first(),
    env.FINDPITCHES_DB.prepare(`SELECT key,value,updated_at FROM runtime_meta
      WHERE key IN ('enrichment_ruleset_version','enrichment_ruleset_sweep_version','enrichment_ruleset_sweep_started_at')`).all()
  ]);
  const meta=Object.fromEntries((metaRows?.results||[]).map(item=>[item.key,{value:item.value,updated_at:item.updated_at}]));
  return Response.json({
    ok:true,service:SERVICE,serper_configured:false,
    enrichment_ruleset:ENRICHMENT_RULESET_VERSION,
    queue:{ready:Number(row?.ready||0),leased:Number(row?.leased||0),complete:Number(row?.complete||0),expired:Number(row?.expired||0),dead:Number(row?.dead||0)},
    enriched:Number(stored?.count||0),
    practical_location:{supported:Number(locationArea?.supported||0),place:Number(locationArea?.place||0),area:Number(locationArea?.area||0)},
    ruleset_meta:meta
  });
}
