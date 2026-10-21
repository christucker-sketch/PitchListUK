import test from 'node:test';import assert from 'node:assert/strict';
import {customerInventoryFunnel} from '../../platform/findpitches-v3/inventory-funnel.mjs';
const row=(id,extra={})=>({id,country:'GB',source_domain:'myntimage.co.uk',title:id,event_start:'2027-01-01',event_end:'2027-01-01',organiser:'Operator',location:'Venue',...extra});
const snap=(day,items)=>({schema:'findpitches-v3-customer-proof-snapshot-v1',as_of:`2026-10-${day}T12:00:00Z`,publication_enabled:false,production_cutover_enabled:false,items});
test('customer funnel separates new entities, proved recoveries, unproven history and withdrawals',()=>{
 const report=customerInventoryFunnel(snap('20',[row('retained'),row('withdrawn')]),snap('21',[row('retained'),row('new'),row('recovered'),row('unknown')]),{history:[snap('19',[row('recovered')])],createdAt:{new:'2026-10-21T09:00:00Z',recovered:'2026-10-18T00:00:00Z'}});
 assert.deepEqual(report.total,{before:2,after:4,retained:1,new_entities_ready:1,recoveries:1,prior_visibility_unproven:1,withdrawals:1,net:2,retention_percent:50});assert.equal(report.distinct_new_event_groups,1);assert.equal(report.by_country_source[0].net,2);
});
test('gross acquisitions cannot hide a negative country/source net or lost cohort',()=>{
 const report=customerInventoryFunnel(snap('20',[row('a'),row('b'),row('c',{country:'US',source_domain:'eventeny.com'})]),snap('21',[row('d',{country:'US',source_domain:'eventeny.com'})]),{createdAt:{d:'2026-10-21T01:00:00Z'}});
 assert.equal(report.total.net,-2);assert.equal(report.total.retention_percent,0);assert.equal(report.by_country_source.find(r=>r.country==='GB').net,-2);assert.equal(report.by_country_source.find(r=>r.country==='US').new_entities_ready,1);
});
test('equivalent new entities do not multiply distinct dated events; no identity is merged',()=>{
 const report=customerInventoryFunnel(snap('20',[]),snap('21',[row('a',{title:'Same'}),row('b',{title:'Same'})]),{createdAt:{a:'2026-10-21T01:00:00Z',b:'2026-10-21T01:00:00Z'}});assert.equal(report.total.new_entities_ready,2);assert.equal(report.distinct_new_event_groups,1);
});
test('duplicates, reversed clocks, future history and attribution changes fail closed',()=>{
 assert.throws(()=>customerInventoryFunnel(snap('20',[row('a'),row('a')]),snap('21',[])),/unique/);
 assert.throws(()=>customerInventoryFunnel(snap('21',[]),snap('20',[])),/ordered/);
 assert.throws(()=>customerInventoryFunnel(snap('20',[]),snap('21',[]),{history:[snap('21',[])]}),/prior/);
 assert.throws(()=>customerInventoryFunnel(snap('20',[row('a')]),snap('21',[row('a',{country:'US'})])),/attribution_changed/);
});
