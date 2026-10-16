import test from 'node:test';import assert from 'node:assert/strict';import {growthWindow} from '../../operations/findpitches-v3/storage-growth-report.mjs';
test('storage growth reports actual coverage and labelled scenarios, never a completed72h observation from24h data',()=>{
 const w=growthWindow([{observed_at:'2026-10-15T09:00Z',file_size_bytes:3700000000},{observed_at:'2026-10-16T09:00Z',file_size_bytes:3940000000}],3940000000);
 assert.equal(w.elapsed_hours,24);assert.equal(w.net_bytes_per_day,240000000);assert.equal(w.coverage_24h,true);assert.equal(w.coverage_48h,false);assert.equal(w.coverage_72h,false);assert.equal(w.linear_scenario_days_to_70_percent,12.75);
});
test('storage reclaim, zero-time and insufficient observations cannot imply sustainable growth headroom',()=>{
 assert.equal(growthWindow([],0).available,false);const same={observed_at:'2026-10-15T09:00Z',file_size_bytes:3700000000};assert.equal(growthWindow([same,same],3700000000).available,false);
 const w=growthWindow([{observed_at:'2026-10-14T09:00Z',file_size_bytes:9600000000},{observed_at:'2026-10-15T09:00Z',file_size_bytes:3700000000},{observed_at:'2026-10-16T09:00Z',file_size_bytes:3900000000}],3900000000);assert.equal(w.includes_large_reclaim,true);assert.equal(w.linear_scenario_days_to_97_percent,null);
});
