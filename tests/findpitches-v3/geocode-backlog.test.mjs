import test from'node:test';import assert from'node:assert/strict';
import{retainedMapAddress,planMapBacklog,mapStopReason,remainingMapFailures}from'../../operations/findpitches-v3/geocode-source-addresses.mjs';
const address={country:'US',location:'Hall, 1 River Street, Austin, Texas',street:'1 River Street',city:'Austin',state:'TX',postal_code:null};
const proof={facts:{country:'US',location:address.location},venue_address:address};
test('complete retained source address outranks a larger missing-evidence group; existing source pins are skipped',()=>{
 const items=[...Array.from({length:5},(_,i)=>({id:'weak'+i,country:'US',location:'Unknown hall'})),{id:'complete',country:'US',location:address.location},{id:'pinned',country:'US',location:address.location,venue_coordinates:{lat:30,lng:-97}},{id:'foreign',country:'GB',location:address.location}],before=structuredClone(items);
 const plan=planMapBacklog(items,new Map([['complete',proof]]));assert.deepEqual(plan.map(p=>p.ids.length),[1,5]);assert.equal(plan[0].complete,true);assert.deepEqual(items,before);
});
test('older retained Event JSON-LD can supply priority, while guessed geography, conflicting venue and truncated evidence cannot',()=>{
 const event={location:{name:'Hall',address:{addressCountry:'US',streetAddress:'1 River Street',addressLocality:'Austin',addressRegion:'Texas'}}};
 const p={facts:proof.facts,events:[JSON.stringify(event)]};assert.equal(retainedMapAddress(p).state,'TX');
 assert.equal(retainedMapAddress({...p,facts:{...p.facts,country:'GB'}}),null);assert.equal(retainedMapAddress({...p,facts:{...p.facts,location:'Other hall'}}),null);assert.equal(retainedMapAddress({...p,events:['{"location":']}),null);
});
test('same exact address groups for cache reuse but different states never share a group',()=>{
 const other={...address,state:'CA'},items=[{id:'a',country:'US',location:address.location},{id:'b',country:'US',location:address.location},{id:'c',country:'US',location:address.location}];
 const plan=planMapBacklog(items,new Map([['a',proof],['b',proof],['c',{...proof,venue_address:other}]]));assert.deepEqual(plan.map(g=>g.ids.length),[2,1]);
});
test('provider failures and weak conversion stop a batch; cached negatives cannot distort provider-attempt yield',()=>{
 assert.equal(mapStopReason([{status:'held',reason:'census_http_429',provider_requests:1}]),'census_http_429');
 assert.equal(mapStopReason([{status:'held',reason:'census_coordinate_country_disagrees',provider_requests:1}]),'census_coordinate_country_disagrees');
 const bad=Array.from({length:25},()=>({status:'held',reason:'census_no_exact_match',provider_requests:1}));assert.equal(mapStopReason(bad),'poor_exact_address_conversion');
 assert.equal(mapStopReason(bad.map(r=>({...r,provider_requests:0,cached:true}))),null);
 const good=bad.map((r,i)=>i<5?{status:'mapped',provider_requests:1}:r);assert.equal(mapStopReason(good),null);
 assert.equal(mapStopReason(Array.from({length:10},(_,i)=>({status:'held',reason:i<3?'census_invalid_json':'census_no_exact_match',provider_requests:1}))),'abnormal_geocoder_response_rate');
});
test('remaining failure buckets account only for currently unpinned US READY, including proof changes after a successful resolution',()=>{
 const items=['no-match','missing','unattempted','drift','ambiguous','disagree','provider'].map(id=>({id,country:'US'}));items.push({id:'pinned',country:'US',address_coordinates:{lat:30,lng:-97}},{id:'foreign',country:'GB'});
 const results=[{entity_id:'no-match',status:'held',reason:'census_no_exact_match'},{entity_id:'missing',status:'held',reason:'source_exact_street_city_state_missing'},{entity_id:'drift',status:'mapped'},{entity_id:'ambiguous',status:'held',reason:'census_ambiguous_address'},{entity_id:'disagree',status:'held',reason:'census_house_range_not_proved'},{entity_id:'provider',status:'held',reason:'census_http_429'},{entity_id:'withdrawn',status:'held',reason:'census_no_exact_match'}];
 const buckets=remainingMapFailures(items,results);assert.equal(Object.values(buckets).reduce((a,b)=>a+b,0),7);assert.deepEqual(buckets,{not_attempted:1,no_exact_match:1,address_disagreement:1,missing_street_city_state:1,ambiguous_match:1,source_evidence_deficiency:1,provider_error:1});
});
