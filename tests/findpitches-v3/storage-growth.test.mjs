import test from 'node:test';import assert from 'node:assert/strict';import {growthWindow,changeExcludedGrowth} from '../../operations/findpitches-v3/storage-growth-report.mjs';
test('storage growth reports actual coverage and labelled scenarios, never a completed72h observation from24h data',()=>{
 const w=growthWindow([{observed_at:'2026-10-15T09:00Z',file_size_bytes:3700000000},{observed_at:'2026-10-16T09:00Z',file_size_bytes:3940000000}],3940000000);
 assert.equal(w.elapsed_hours,24);assert.equal(w.net_bytes_per_day,240000000);assert.equal(w.coverage_24h,true);assert.equal(w.coverage_48h,false);assert.equal(w.coverage_72h,false);assert.equal(w.linear_scenario_days_to_70_percent,12.75);
});
test('storage verdict separates whole migration intervals without subtracting concurrent growth or double-counting overlaps',()=>{
 const samples=[0,6,12,18,24].map((h,i)=>({observed_at:new Date(Date.parse('2026-10-16T00:00Z')+h*3600000).toISOString(),file_size_bytes:[0,60,1120,1180,1240][i]}));
 const event={id:'0026_customer_proof_heads.sql',observed_at:'2026-10-16T09:00Z',measured_window_delta_bytes:1000,uncertainty_minutes:15};
 const r=changeExcludedGrowth(samples,[event,{...event,id:'0027_customer_selection_heads.sql',measured_window_delta_bytes:1}]);
 assert.equal(r.excluded_intervals.length,1);assert.equal(r.excluded_intervals[0].change_ids.length,2);
 assert.equal(r.retained_hours,18);assert.equal(r.retained_net_bytes,180);assert.equal(r.retained_net_bytes_per_day,240);
 assert.equal(r.measured_change_window_bytes,1001);assert.equal(growthWindow(samples,1240).net_bytes_per_day,1240);
 assert.equal(changeExcludedGrowth(samples,[]).retained_net_bytes_per_day,1240);
 assert.throws(()=>changeExcludedGrowth(samples,[event,event]),/valid_unique/);
});
test('event exclusion does not fabricate coverage, hide retained reclaim or project from an empty interval',()=>{
 const samples=[{observed_at:'2026-10-16T00:00Z',file_size_bytes:900000000},{observed_at:'2026-10-17T00:00Z',file_size_bytes:700000000}];
 assert.equal(changeExcludedGrowth(samples).retained_large_reclaim,true);
 const event={id:'0026_customer_proof_heads.sql',observed_at:'2026-10-16T12:00Z',measured_window_delta_bytes:1000,uncertainty_minutes:15};
 const r=changeExcludedGrowth(samples,[event]);assert.equal(r.available,false);assert.equal(r.retained_net_bytes_per_day,null);assert.equal(growthWindow(samples,700000000).coverage_48h,false);
});
test('storage reclaim, zero-time and insufficient observations cannot imply sustainable growth headroom',()=>{
 assert.equal(growthWindow([],0).available,false);const same={observed_at:'2026-10-15T09:00Z',file_size_bytes:3700000000};assert.equal(growthWindow([same,same],3700000000).available,false);
 const w=growthWindow([{observed_at:'2026-10-14T09:00Z',file_size_bytes:9600000000},{observed_at:'2026-10-15T09:00Z',file_size_bytes:3700000000},{observed_at:'2026-10-16T09:00Z',file_size_bytes:3900000000}],3900000000);assert.equal(w.includes_large_reclaim,true);assert.equal(w.linear_scenario_days_to_97_percent,null);
});
