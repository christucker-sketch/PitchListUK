import test from 'node:test';
import assert from 'node:assert/strict';
import {buildOfficialFirstUsQueries} from '../../platform/findpitches-v2/queries/us-official-first.mjs';
import {discoverBatch} from '../../platform/findpitches-v2/acquisition/discover-batch.mjs';

test('official-first US city discovery runs only four targeted known-source queries',async()=>{
 const searches=[];
 const result=await discoverBatch({market:'US',region_code:'CA',location:'Los Angeles CA',
  discovery_profile:'us_official_first',query_limit:4}, {searchProvider:{async search(x){
    searches.push(x);return [{url:'https://officialfair.org/vendors',title:'Apply as a vendor'}];
  }}});
 assert.equal(result.discovery_profile,'us_official_first');
 assert.equal(result.metrics.queries,4);
 assert.equal(searches.length,4);
 assert.ok(searches.every(x=>x.region_code==='CA'&&x.market.code==='US'));
 assert.match(searches[0].query,/Los Angeles CA.*official vendor application/);
 assert.match(searches[1].query,/Los Angeles CA.*official become a vendor/);
 assert.equal(result.candidates.length,1);
 assert.equal(result.candidates[0].discovery_region_code,'CA');
 assert.equal(result.candidates[0].status,'discovered');
 assert.equal('venue_geoid' in result.candidates[0],false);
});
test('baseline GB and US discovery remain unchanged',async()=>{
 const profile=await discoverBatch({market:'GB',region_code:'GB-ENG-KENT',
   location:'Kent',query_limit:1},{searchProvider:{async search(){return [];}}});
 assert.equal(profile.discovery_profile,'baseline');
 assert.equal(profile.metrics.queries,1);
 assert.equal(profile.queries[0].category,'general');
 await assert.rejects(discoverBatch({market:'GB',region_code:'GB-ENG-KENT',
   location:'Kent',discovery_profile:'us_official_first'},
   {searchProvider:{async search(){return [];}}}),/profile_invalid/);
});
test('city queries are bounded, deterministic and reject malformed location strings',()=>{
 assert.deepEqual(buildOfficialFirstUsQueries({location:'Austin TX',limit:2}),
  buildOfficialFirstUsQueries({location:'Austin TX',limit:2,rotation:4}));
 assert.equal(buildOfficialFirstUsQueries({location:'Austin TX',limit:4}).length,4);
 for(const location of ['', 'Austin TX\nsite:example.org', 'a'.repeat(121)]){
  assert.throws(()=>buildOfficialFirstUsQueries({location}),/invalid_location/);
 }
 for(const limit of [0,5,1.5]){
  assert.throws(()=>buildOfficialFirstUsQueries({location:'Austin TX',limit}),/query_bounds/);
 }
});
