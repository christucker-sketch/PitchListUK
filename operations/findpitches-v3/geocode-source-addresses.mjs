// Manual free street-address proof; no source fact or identity writes.
import fs from'node:fs';import path from'node:path';import{fileURLToPath}from'node:url';
import{shadowContext}from'./shadow-context.mjs';import{assertFreeGrowth}from'./inventory-scale.mjs';
const save=(dir,name,data)=>fs.writeFileSync(path.join(dir,name),JSON.stringify(data,null,2)+'\n',{mode:0o600});
import{censusAddressInput}from'../../platform/findpitches-v3/address-coordinates.mjs';
import{sourceVenueAddress}from'../../platform/findpitches-v3/source-coordinates.mjs';
export function retainedMapAddress(proof){
 if(proof?.facts?.country!=='US')return null;
 if(proof.venue_address?.location===proof.facts.location&&censusAddressInput(proof.venue_address))return proof.venue_address;
 const events=[];for(const excerpt of proof.events??[])try{events.push(JSON.parse(excerpt));}catch{}
 const address=sourceVenueAddress(events,proof.facts);return censusAddressInput(address)?address:null;
}
export function planMapBacklog(items,proofs=new Map()){
 const groups=new Map();for(const r of items){if(r.country!=='US'||r.venue_coordinates||r.address_coordinates)continue;
  const address=retainedMapAddress(proofs.get(r.id)),a=censusAddressInput(address),key=a?JSON.stringify([a.state,a.city,a.street_name,a.house_number,a.zip]):'unproved:'+r.location;
  if(!groups.has(key))groups.set(key,{key,complete:Boolean(a),ids:[]});groups.get(key).ids.push(r.id);
 }return [...groups.values()].sort((a,b)=>Number(b.complete)-Number(a.complete)||b.ids.length-a.ids.length||a.key.localeCompare(b.key));
}
export function mapStopReason(results){
 const last=results.at(-1);if(!last)return null;
 if(/census_http_|request_limit|fetch_failed|custody|integrity|coordinate_country_disagrees/.test(last.reason??''))return last.reason;
 const requests=results.filter(r=>r.provider_requests===1),window=requests.slice(-25);
 if(window.length>=10&&window.filter(r=>/invalid_json|response_size_limit/.test(r.reason??'')).length>=3)return 'abnormal_geocoder_response_rate';
 if(window.length===25&&window.filter(r=>r.status==='mapped').length<3)return 'poor_exact_address_conversion';
 return null;
}
export function remainingMapFailures(items,results){
 const outcomes=new Map(results.map(r=>[r.entity_id,r])),buckets={not_attempted:0,no_exact_match:0,address_disagreement:0,missing_street_city_state:0,ambiguous_match:0,source_evidence_deficiency:0,provider_error:0};
 for(const r of items){if(r.country!=='US'||r.venue_coordinates||r.address_coordinates)continue;const outcome=outcomes.get(r.id),reason=outcome?.reason??'';
  const key=!outcome||reason==='free_geocoder_request_limit'?'not_attempted':reason==='census_no_exact_match'?'no_exact_match':/components_disagree|house_range|coordinate_country_disagrees/.test(reason)?'address_disagreement':reason==='source_exact_street_city_state_missing'?'missing_street_city_state':reason==='census_ambiguous_address'?'ambiguous_match':/census_http_|fetch_failed|invalid_json|response_size_limit/.test(reason)?'provider_error':'source_evidence_deficiency';
  buckets[key]++;
 }return buckets;
}
export async function retainedMapProofs(c,ids){
 if(!ids.length)return new Map();
 const proofs=new Map();let after='';for(;;){const rows=(await c.db.prepare(`SELECT e.id,
   json_object('facts',json(json_extract(v.report_json,'$.facts')),'venue_address',json(json_extract(v.report_json,'$.venue_address')),
    'events',json((SELECT json_group_array(json_extract(x.value,'$.excerpt')) FROM json_each(v.report_json,'$.evidence') x WHERE json_extract(x.value,'$.kind')='event_json_ld'))) proof_json
   FROM entities e JOIN source_verifications v ON v.entity_id=e.id
   WHERE e.id IN (SELECT value FROM json_each(?)) AND e.id>? AND v.sequence=(SELECT MAX(sequence) FROM source_verifications WHERE entity_id=e.id)
   ORDER BY e.id LIMIT 250`).bind(JSON.stringify(ids),after).all()).results;
  for(const row of rows)proofs.set(row.id,JSON.parse(row.proof_json));if(rows.length<250)break;after=rows.at(-1).id;
 }return proofs;
}
export async function mapSourceAddresses({credentialsFile,stateDirectory,outDirectory,maxRequests=200}){
 if(!Number.isInteger(maxRequests)||maxRequests<1||maxRequests>250)throw Error('bounded_map_requests_1_to_250_required');
 fs.mkdirSync(outDirectory,{recursive:true,mode:0o700});const c=await shadowContext({credentialsFile,stateDirectory}),initial=await c.call('api','/status');assertFreeGrowth(initial);
 const before=await c.catalogue();save(outDirectory,'map-baseline-private.json',before);
 const us=before.items.filter(r=>r.country==='US'),proofs=await retainedMapProofs(c,us.filter(r=>!r.venue_coordinates&&!r.address_coordinates).map(r=>r.id)),groups=planMapBacklog(us,proofs);
 save(outDirectory,'map-plan-private.json',{as_of:before.as_of,groups});
 const run=await c.call('enrichment','/venue-map/start',{max_requests:maxRequests,max_entities:Math.min(3000,us.length+100)}),results=[];save(outDirectory,'map-run-private.json',run);let stop='bounded_map_complete';
 let lastProgress=Date.now();try{groupLoop:for(const {ids}of groups){
   // A representative first; identical source addresses reuse immutable cache.
   const first=await c.call('enrichment','/venue-map/resolve',{run_id:run.id,entity_id:ids[0]});results.push(first);save(outDirectory,'map-outcomes-private.json',results);
   if(mapStopReason(results)){stop=mapStopReason(results);break;}
   // Negative results apply only to their exact proof/address. Siblings must
   // still be checked: the native resolver uses the negative address cache.
   for(let i=1;i<ids.length;i+=8){const batch=await c.call('enrichment','/venue-map/batch',{run_id:run.id,entity_ids:ids.slice(i,i+8)});results.push(...batch.results);save(outDirectory,'map-outcomes-private.json',results);
    if(mapStopReason(results)){stop=mapStopReason(results);break groupLoop;}}
   if(results.length%20===0||Date.now()-lastProgress>30000){console.log(JSON.stringify({checked:results.length,mapped:results.filter(r=>r.status==='mapped').length,provider_requests:results.reduce((n,r)=>n+(r.provider_requests??0),0)}));lastProgress=Date.now();}
   await new Promise(r=>setTimeout(r,1000));
 }}catch(error){stop=/^[a-z0-9_]+$/.test(error.message)?error.message:'venue_map_custody_requires_review';save(outDirectory,'map-failure-private.json',{run_id:run.id,reason:stop,as_of:new Date().toISOString(),checked:results.length});throw error;}
 finally{await c.call('enrichment','/venue-map/stop',{run_id:run.id,reason:stop});}
 const after=await c.catalogue();save(outDirectory,'map-current-private.json',after);const current=after.items.filter(r=>r.country==='US'),mapped=current.filter(r=>r.venue_coordinates||r.address_coordinates),state=await c.db.prepare('SELECT * FROM venue_map_runs WHERE id=?').bind(run.id).first(),final=await c.call('api','/status');assertFreeGrowth(final,initial.commercial.kpis.paid_acquisition_queries);
 const tally=(rows,key)=>rows.reduce((o,r)=>(o[key(r)]=(o[key(r)]??0)+1,o),{}),report={schema:'findpitches-v3-us-address-map-v1',as_of:after.as_of,run:state,us_ready:current.length,coordinate_opportunities:mapped.length,coverage_percent:Number((100*mapped.length/Math.max(1,current.length)).toFixed(2)),distinct_source_address_locations:new Set(mapped.map(r=>r.location)).size,
  distinct_coordinate_positions:new Set(mapped.map(r=>JSON.stringify([r.venue_coordinates?.lat??r.address_coordinates.lat,r.venue_coordinates?.lng??r.address_coordinates.lng]))).size,
  mapped_by_source_state:tally(mapped,r=>r.region??r.address_coordinates?.source_address?.state??'not_proved'),provider_requests:results.reduce((n,r)=>n+(r.provider_requests??0),0),cache_hits:results.filter(r=>r.cached).length,checked:results.length,
  unpinned:current.length-mapped.length,held_reasons:tally(results.filter(r=>r.status==='held'),r=>r.reason),not_attempted:us.filter(r=>!r.venue_coordinates&&!r.address_coordinates&&!results.some(x=>x.entity_id===r.id)).length,
  remaining_failure_buckets:remainingMapFailures(current,results),planned_complete_address_entities:groups.filter(g=>g.complete).reduce((n,g)=>n+g.ids.length,0),planned_source_evidence_deficiency_entities:groups.filter(g=>!g.complete).reduce((n,g)=>n+g.ids.length,0),stop_reason:stop,paid_queries_added:0,paid_geocoding_cost:0,
  precision:'Existing source venue coordinates or US Census exact street-address matches, interpolated along a proved street range; no GPS/rooftop accuracy claim.',original_source_updates:0,identity_updates:0,readiness_updates:0};save(outDirectory,'us-map-report.json',report);return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const a=process.argv.slice(2),v=k=>a[a.indexOf(k)+1];try{const r=await mapSourceAddresses({credentialsFile:v('--credentials'),stateDirectory:v('--state-dir'),outDirectory:v('--out-dir'),maxRequests:a.includes('--max-requests')?Number(v('--max-requests')):200});console.log(JSON.stringify({us_ready:r.us_ready,mapped:r.coordinate_opportunities,provider_requests:r.provider_requests,stop:r.stop_reason}));}catch(e){console.error(/^[a-z0-9_]+$/.test(e.message)?e.message:'venue_map_custody_requires_review');process.exitCode=1;}}
