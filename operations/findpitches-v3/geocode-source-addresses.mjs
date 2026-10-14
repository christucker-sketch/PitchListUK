// Manual free street-address proof; no source fact or identity writes.
import fs from'node:fs';import path from'node:path';import{fileURLToPath}from'node:url';
import{shadowContext}from'./shadow-context.mjs';import{assertFreeGrowth}from'./inventory-scale.mjs';
const save=(dir,name,data)=>fs.writeFileSync(path.join(dir,name),JSON.stringify(data,null,2)+'\n',{mode:0o600});
export async function mapSourceAddresses({credentialsFile,stateDirectory,outDirectory,maxRequests=200}){
 fs.mkdirSync(outDirectory,{recursive:true,mode:0o700});const c=await shadowContext({credentialsFile,stateDirectory}),initial=await c.call('api','/status');assertFreeGrowth(initial);
 const before=await c.catalogue();save(outDirectory,'map-baseline-private.json',before);
 const us=before.items.filter(r=>r.country==='US'),groups=new Map();for(const r of us){if(r.venue_coordinates||r.address_coordinates)continue;const key=r.location;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r.id);}
 const run=await c.call('enrichment','/venue-map/start',{max_requests:maxRequests,max_entities:Math.min(3000,us.length+100)}),results=[];save(outDirectory,'map-run-private.json',run);let stop='bounded_map_complete';
 try{for(const [location,ids]of[...groups].sort((a,b)=>b[1].length-a[1].length||a[0].localeCompare(b[0]))){
   // A representative first; identical source addresses reuse immutable cache.
   const first=await c.call('enrichment','/venue-map/resolve',{run_id:run.id,entity_id:ids[0]});results.push(first);save(outDirectory,'map-outcomes-private.json',results);
   if(/census_http_(?:403|429|5\d\d)|request_limit|fetch_failed/.test(first.reason??'')){stop=first.reason;break;}
   if(first.status==='mapped')for(let i=1;i<ids.length;i+=8){const batch=await c.call('enrichment','/venue-map/batch',{run_id:run.id,entity_ids:ids.slice(i,i+8)});results.push(...batch.results);save(outDirectory,'map-outcomes-private.json',results);}
   if(results.length%20===0)console.log(JSON.stringify({checked:results.length,mapped:results.filter(r=>r.status==='mapped').length,provider_requests:results.reduce((n,r)=>n+r.provider_requests,0)}));
   await new Promise(r=>setTimeout(r,1000));
 }}finally{await c.call('enrichment','/venue-map/stop',{run_id:run.id,reason:stop});}
 const after=await c.catalogue();save(outDirectory,'map-current-private.json',after);const current=after.items.filter(r=>r.country==='US'),mapped=current.filter(r=>r.venue_coordinates||r.address_coordinates),state=await c.db.prepare('SELECT * FROM venue_map_runs WHERE id=?').bind(run.id).first(),final=await c.call('api','/status');assertFreeGrowth(final,initial.commercial.kpis.paid_acquisition_queries);
 const tally=(rows,key)=>rows.reduce((o,r)=>(o[key(r)]=(o[key(r)]??0)+1,o),{}),report={schema:'findpitches-v3-us-address-map-v1',as_of:after.as_of,run:state,us_ready:current.length,coordinate_opportunities:mapped.length,coverage_percent:Number((100*mapped.length/Math.max(1,current.length)).toFixed(2)),distinct_source_address_locations:new Set(mapped.map(r=>r.location)).size,
  distinct_coordinate_positions:new Set(mapped.map(r=>JSON.stringify([r.venue_coordinates?.lat??r.address_coordinates.lat,r.venue_coordinates?.lng??r.address_coordinates.lng]))).size,
  mapped_by_source_state:tally(mapped,r=>r.region??r.address_coordinates?.source_address?.state??'not_proved'),provider_requests:results.reduce((n,r)=>n+(r.provider_requests??0),0),cache_hits:results.filter(r=>r.cached).length,checked:results.length,
  unpinned:current.length-mapped.length,held_reasons:tally(results.filter(r=>r.status==='held'),r=>r.reason),stop_reason:stop,paid_queries_added:0,paid_geocoding_cost:0,
  precision:'Existing source venue coordinates or US Census exact street-address matches, interpolated along a proved street range; no GPS/rooftop accuracy claim.',original_source_updates:0,identity_updates:0,readiness_updates:0};save(outDirectory,'us-map-report.json',report);return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const a=process.argv.slice(2),v=k=>a[a.indexOf(k)+1];try{const r=await mapSourceAddresses({credentialsFile:v('--credentials'),stateDirectory:v('--state-dir'),outDirectory:v('--out-dir'),maxRequests:a.includes('--max-requests')?Number(v('--max-requests')):200});console.log(JSON.stringify({us_ready:r.us_ready,mapped:r.coordinate_opportunities,provider_requests:r.provider_requests,stop:r.stop_reason}));}catch(e){console.error(/^[a-z0-9_]+$/.test(e.message)?e.message:'venue_map_custody_requires_review');process.exitCode=1;}}
