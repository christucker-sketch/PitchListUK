import test from 'node:test';
import assert from 'node:assert/strict';
import {planCityPilotJobs} from '../../platform/findpitches-v2/geography/us-city-pilot.mjs';
import {readFile} from 'node:fs/promises';
test('pilot spreads high-gap fresh searches without replacing existing market catalogue',async()=>{
 const now=new Date('2026-09-29T20:00:00Z');
 const jobs=planCityPilotJobs({now,spacingMinutes:25});
 assert.equal(jobs.length,8);
 assert.equal(new Set(jobs.map(j=>j.id)).size,8);
 assert.equal(new Set(jobs.map(j=>j.region_code)).size,8);
 assert.ok(jobs.every(j=>j.market==='US'&&j.query_group===1&&j.status==='ready'));
 assert.deepEqual(jobs.map(j=>j.location),[
  'Los Angeles CA','Houston TX','Miami FL','Phoenix AZ',
  'Charlotte NC','Seattle WA','Denver CO','Atlanta GA']);
 assert.equal(jobs[0].available_at,'2026-09-29T20:00:00.000Z');
 assert.equal(jobs.at(-1).available_at,'2026-09-29T22:55:00.000Z');
 const original=await readFile(new URL('../../platform/findpitches-v2/scheduler/catalogue.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(original,/city:US:/);
});
test('pilot invalid intervals rejected before touching D1',()=>{
 for(const spacingMinutes of [0,14,121,25.5]){
  assert.throws(()=>planCityPilotJobs({spacingMinutes}),/invalid_bounds/);
 }
 assert.throws(()=>planCityPilotJobs({now:new Date('invalid')}),/invalid_bounds/);
});
test('live worker switches only US query_group 1 to official-first and preserves other groups',async()=>{
 const worker=await readFile(new URL('../../operations/findpitches-v2/worker/index.mjs',import.meta.url),'utf8');
 assert.match(worker,/Number\(job\.query_group\)===1 && job\.market==='US'/);
 assert.match(worker,/us_official_first/);
 assert.match(worker,/'baseline'/);
});
