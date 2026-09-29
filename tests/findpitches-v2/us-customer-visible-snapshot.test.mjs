import test from 'node:test';
import assert from 'node:assert/strict';
import { getUsCustomerVisibleSnapshot } from '../../platform/findpitches-v2/quality/us-customer-visible-snapshot.mjs';

const base={market:'US',region_code:'CA',title:'Farmers market',location:'Actual fairground',
 location_evidence_url:'https://example.org/venue',canonical_url:'https://example.org/apply',
 application_url:'https://example.org/vendor/application',last_checked:'2026-09-28T00:00:00Z',
 event_start:'2026-12-01',event_end:'2026-12-02',application_deadline:'2026-11-15',recurring:0};

test('reads bounded pages, checks in-code readiness and refuses to invent venue GEOIDs',async()=>{
 const binds=[],queries=[];
 const rows=[{...base,id:'a'}, {...base,id:'b',application_url:'https://facebook.com/something'},
  {...base,id:'c',region_code:'TX'}];
 const db={prepare(sql){queries.push(sql);assert.match(sql,/^SELECT/);return {bind(...args){binds.push(args);return {all:async()=>({results:rows.filter(x=>x.id>args[0]).slice(0,args.at(-1))})}}}}};
 const result=await getUsCustomerVisibleSnapshot(db,{now:new Date('2026-09-29T12:00:00Z'),pageSize:2});
 assert.equal(result.counts.sql_eligible,3);
 assert.equal(result.counts.customer_visible,2);
 assert.equal(result.counts.readiness_rejected,1);
 assert.equal(result.counts.verified_venue_geoids,0);
 assert.equal(result.counts.venue_geoid_unresolved,2);
 assert.deepEqual(result.discovery_region_only,[{region_code:'CA',visible_opportunities:1},{region_code:'TX',visible_opportunities:1}]);
 assert.match(result.city_coverage_status,/unknown/);
 assert.equal(binds.length,2);
 assert.match(queries[0],/customer_promotion_disposition/);
 assert.match(queries[0],/location_evidence_url/);
 assert.match(queries[0],/datetime\(o.last_checked\)/);
});

test('zero rows stays unknown rather than reporting zero-covered cities',async()=>{
 const db={prepare(sql){assert.match(sql,/^SELECT/);return {bind(){return {all:async()=>({results:[]})}}}}};
 const result=await getUsCustomerVisibleSnapshot(db);
 assert.equal(result.counts.customer_visible,0);
 assert.match(result.city_coverage_status,/unknown/);
 assert.deepEqual(result.discovery_region_only,[]);
});

test('rejects malformed D1 pages and invalid parameters',async()=>{
 await assert.rejects(getUsCustomerVisibleSnapshot(null),/db_missing/);
 await assert.rejects(getUsCustomerVisibleSnapshot({prepare(){}},{pageSize:501}),/page_size/);
 const bad={prepare(){return {bind(){return {all:async()=>({results:null})}}}}};
 await assert.rejects(getUsCustomerVisibleSnapshot(bad),/invalid_d1_page/);
});
