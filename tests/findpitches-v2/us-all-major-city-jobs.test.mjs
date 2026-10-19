import test from 'node:test';
import assert from 'node:assert/strict';
import {US_MAJOR_CITIES} from '../../operations/findpitches-v2/us-major-cities-manifest.mjs';
import {planAllMajorUsCityJobs} from '../../platform/findpitches-v2/geography/us-all-major-city-jobs.mjs';
import {planCityPilotJobs} from '../../platform/findpitches-v2/geography/us-city-pilot.mjs';

test('pinned original Census import gives 314 unique incorporated major cities across 44 states',()=>{
 assert.equal(US_MAJOR_CITIES.length,314);
 assert.equal(new Set(US_MAJOR_CITIES.map(x=>x.geoid)).size,314);
 const jobs=planAllMajorUsCityJobs({now:new Date('2026-09-29T20:00:00Z')});
 assert.equal(jobs.length,314);
 assert.equal(new Set(jobs.map(x=>x.id)).size,314);
 assert.equal(new Set(jobs.map(x=>x.region_code)).size,44);
 assert.ok(jobs.every(x=>x.market==='US' && x.query_group===1 && x.status==='ready'));
 assert.equal(jobs.at(-1).available_at,'2026-10-03T02:15:00.000Z');
 assert.ok(jobs.every(x=>/^\d{7}$/.test(x.geoid)));
});
test('state-first ordering, no duplicate existing eight-city pilot identities',()=>{
 const jobs=planAllMajorUsCityJobs({now:new Date('2026-09-29T20:00:00Z')});
 const firstRound=jobs.slice(0,44);
 assert.equal(new Set(firstRound.map(x=>x.region_code)).size,44);
 const pilot=planCityPilotJobs({now:new Date('2026-09-29T20:00:00Z')});
 for(const row of pilot)assert.ok(jobs.some(x=>x.id===row.id),row.id);
 assert.ok(jobs.some(x=>x.location==='New York NY'));
 assert.ok(jobs.some(x=>x.location==='Ventura CA'));
 assert.equal(jobs.some(x=>x.location.includes('(balance)')),false);
});
test('bad scheduling bounds fail before any database operations',()=>{
 for(const spacingMinutes of [0,4,121,12.5])assert.throws(()=>
  planAllMajorUsCityJobs({spacingMinutes}),/major_city_bad_bounds/);
 assert.throws(()=>planAllMajorUsCityJobs({now:new Date('invalid')}),/major_city_bad_bounds/);
});
