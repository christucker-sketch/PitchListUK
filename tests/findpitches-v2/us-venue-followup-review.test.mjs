import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root=new URL('../../platform/findpitches-v2/quality/',import.meta.url);
const historical=JSON.parse(readFileSync(new URL('us-venue-review-2026-09-29.json',root),'utf8'));
const followup=JSON.parse(readFileSync(new URL('us-venue-review-2026-09-29-followup.json',root),'utf8'));

test('new independently reviewed regional-city venue is separate from historic 31 and never auto-published',()=>{
 const historicalIds=new Set(historical.map(x=>x.opportunity_id));
 assert.equal(historicalIds.size,31);
 assert.equal(followup.records.length,1);
 for(const row of followup.records){
  assert.equal(historicalIds.has(row.opportunity_id),false);
  assert.match(row.venue_geoid,/^\d{7}$/);
  assert.equal(row.venue_geoid,'2670760');
  assert.equal(row.census_place,'St. Clair Shores city');
  assert.equal(row.event_date,'2026-10-11');
  assert.equal(row.publication_status,'no_change; v2 shadow publication disabled');
  assert.equal(row.venue_source_urls.length>=2,true);
  assert.equal(row.venue_source_urls.every(url=>new URL(url).protocol==='https:'),true);
  assert.match(row.candidate_revision,/recheck/);
 }
});
