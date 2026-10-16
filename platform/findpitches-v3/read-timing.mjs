// Per-request aggregates only: no SQL text, identifiers, evidence or persistence.
export function timedReadDatabase(db,metrics){
 metrics.queries=0;metrics.d1_ms=0;metrics.rpc_ms=0;
 function prepare(query,values=[]){return {
  bind:(...args)=>prepare(query,args),
  all:async()=>{const start=performance.now(),result=await db.prepare(query).bind(...values).all();
   metrics.rpc_ms+=performance.now()-start;metrics.queries++;metrics.d1_ms+=Number(result.meta?.duration??0);return result;}
 };}
 return {prepare};
}
export function catalogueServerTiming(metrics){
 const names={source_read:metrics.read_ms,d1:metrics.d1_ms,d1_rpc_sum:metrics.rpc_ms,serialize:metrics.serialize_ms};
 return Object.entries(names).map(([name,value])=>name+';dur='+Math.max(0,Number(value??0)).toFixed(2)).join(', ')+', d1_queries;desc="'+metrics.queries+'"';
}
