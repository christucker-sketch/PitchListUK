import test from 'node:test';
import assert from 'node:assert/strict';
import { getUsCustomerVisibleAuditInventory, getUsCustomerVisibleSnapshot } from '../../platform/findpitches-v2/quality/us-customer-visible-snapshot.mjs';
import { customerVisibilityClause } from '../../platform/findpitches-v2/customer/visibility.mjs';

const base={market:'US',region_code:'CA',title:'Farmers market',location:'Actual fairground',
 location_evidence_url:'https://example.org/venue',canonical_url:'https://example.org/apply',
 application_url:'https://example.org/vendor/application',last_checked:'2026-09-28T00:00:00Z',
 event_start:'2026-12-01',event_end:'2026-12-02',application_deadline:'2026-11-15',recurring:0};

test('reads bounded pages, checks in-code readiness and refuses to invent venue GEOIDs',async()=>{
 const binds=[],queries=[];
 const rows=[{...base,id:'a'}, {...base,id:'b',application_url:'https://facebook.com/something'},
  {...base,id:'c',region_code:'TX'}];
 const db={prepare(sql){queries.push(sql);assert.match(sql,/^SELECT/);return {bind(...args){binds.push(args);return {all:async()=>({results:rows.filter(x=>x.id>args.at(-2)).slice(0,args.at(-1))})}}}}};
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
 assert.match(queries[0],/COALESCE\(d.disposition, ''\) <> 'not_ready'/);
 assert.doesNotMatch(queries[0],/c\.last_checked <= o\.last_checked/);
});

test('shared visibility policy fails closed on every current not-ready disposition',()=>{
 const sql=customerVisibilityClause({market:'US',afterId:true});
 assert.match(sql,/COALESCE\(d.disposition, ''\) <> 'not_ready'/);
 assert.doesNotMatch(sql,/c\.last_checked <= o\.last_checked/);
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

test('private audit inventory applies the same SQL and in-code visibility gates',async()=>{
 const rows=[{...base,id:'a'}, {...base,id:'b',application_url:'https://facebook.com/event'}];
 const db={prepare(sql){assert.match(sql,/customer_promotion_disposition/);return {bind(...args){return {all:async()=>({results:rows.filter(x=>x.id>args.at(-2)).slice(0,args.at(-1))})}}}}};
 const result=await getUsCustomerVisibleAuditInventory(db,{now:new Date('2026-09-29T12:00:00Z'),pageSize:10});
 assert.deepEqual(result.visible.map(r=>r.id),['a']);
 assert.deepEqual(result.readiness_rejected.map(r=>r.id),['b']);
});
