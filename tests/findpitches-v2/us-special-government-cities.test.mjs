import test from 'node:test';
import assert from 'node:assert/strict';
import {planUsSpecialGovernmentCityJobs} from '../../platform/findpitches-v2/geography/us-special-government-cities.mjs';
import {planAllMajorUsCityJobs} from '../../platform/findpitches-v2/geography/us-all-major-city-jobs.mjs';

test('seven verified major special-government places yield six supplementary unique searches',()=>{
 const now=new Date('2026-09-29T20:00:00Z');
 const normal=planAllMajorUsCityJobs({now});
 const extra=planUsSpecialGovernmentCityJobs({now});
 assert.equal(extra.length,7);
 assert.equal(new Set(extra.map(x=>x.geoid)).size,7);
 const overlap=extra.filter(x=>normal.some(j=>j.id===x.id));
 assert.deepEqual(overlap.map(x=>x.location),['Louisville KY']);
 const newSearches=extra.filter(x=>!normal.some(j=>j.id===x.id));
 assert.equal(newSearches.length,6);
 assert.equal(new Set([...normal,...newSearches].map(x=>x.id)).size,320);
 assert.ok(extra.every(x=>x.census_type==='large_special_government_review'));
 assert.equal(extra[0].location,'Indianapolis IN');
 assert.equal(extra[1].location,'Nashville TN');
 assert.equal(extra.at(-1).available_at,'2026-09-29T21:30:00.000Z');
});
test('special-government search staging rejects invalid time or batch spacing',()=>{
 assert.throws(()=>planUsSpecialGovernmentCityJobs({now:new Date(NaN)}),/special_city_bad_bounds/);
 for(const spacingMinutes of [4,121,4.5])assert.throws(()=>
  planUsSpecialGovernmentCityJobs({spacingMinutes}),/special_city_bad_bounds/);
});
