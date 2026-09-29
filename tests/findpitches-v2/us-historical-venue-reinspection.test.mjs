import test from 'node:test';
import assert from 'node:assert/strict';
import { planHistoricalVenueReinspection } from '../../platform/findpitches-v2/quality/us-historical-venue-reinspection.mjs';

const evidence = (value,excerpt) => JSON.stringify({location:{
  value,evidence:[{source:'https://countyfair.org/event',excerpt}]
}});
const reviews=[
  {opportunity_id:'a',place:'Sample City'},
  {opportunity_id:'b',place:'Example Town'},
  {opportunity_id:'c',place:'Historic Village'},
  {opportunity_id:'gone',place:'No longer visible'}
];
const audit={snapshot_at:'2026-09-29T20:30:00Z',visible:[
  {id:'a',region_code:'MI',canonical_url:'https://countyfair.org/event',enrichment_json:evidence('Blossom Heath Park','Venue: Blossom Heath Park')},
  {id:'b',region_code:'NV',canonical_url:'https://countyfair.org/event2',enrichment_json:evidence('Venue Tour','Venue Tour')},
  {id:'c',region_code:'WA',application_url:'https://countyfair.org/apply',enrichment_json:'not-json'}
]};

test('prior verified venue with weak stored evidence is requeued, not rejected or automatically GEOID-matched',()=>{
  const result=planHistoricalVenueReinspection(audit,reviews);
  assert.equal(result.historical_reviews,4);
  assert.equal(result.current_visible_historical,3);
  assert.equal(result.missing_from_current_visible,1);
  assert.deepEqual(result.missing_ids,['gone']);
  assert.equal(result.strict_stored_pass,1);
  assert.equal(result.needs_source_reinspection,2);
  assert.deepEqual(result.queue.map(x=>x.opportunity_id),['b','c']);
  for(const item of result.queue){
    assert.match(item.revision_match,/unverified/);
    assert.equal('verified_venue_geoid' in item,false);
    assert.equal(item.action,'refetch_known_sources_verify_current_venue_event_date_application_and_duplicate');
  }
});
test('historical recovery is bounded and deterministic across slices',()=>{
  assert.deepEqual(planHistoricalVenueReinspection(audit,reviews,{offset:0,limit:1}).queue.map(x=>x.opportunity_id),['b']);
  assert.deepEqual(planHistoricalVenueReinspection(audit,reviews,{offset:1,limit:1}).queue.map(x=>x.opportunity_id),['c']);
  assert.deepEqual(planHistoricalVenueReinspection(audit,reviews,{offset:2,limit:1}).queue,[]);
  for(const options of [{limit:26},{limit:0},{offset:-1},{offset:1.5}]){
    assert.throws(()=>planHistoricalVenueReinspection(audit,reviews,options),/bad_batch_bounds/);
  }
});
test('duplicate reviewed/current IDs and unsafe URLs fail closed',()=>{
  assert.throws(()=>planHistoricalVenueReinspection(audit,[reviews[0],reviews[0]]),/duplicate/);
  assert.throws(()=>planHistoricalVenueReinspection({visible:[audit.visible[0],audit.visible[0]]},reviews),/duplicate/);
  const mutated={...audit,visible:[audit.visible[0],{...audit.visible[1],canonical_url:'http://127.0.0.1/'},audit.visible[2]]};
  assert.equal(planHistoricalVenueReinspection(mutated,reviews).queue[0].canonical_url,null);
});
