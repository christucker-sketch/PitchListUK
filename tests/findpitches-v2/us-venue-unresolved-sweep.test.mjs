import test from 'node:test';
import assert from 'node:assert/strict';
import {planUsUnresolvedVenueSweep} from '../../platform/findpitches-v2/quality/us-venue-unresolved-sweep.mjs';

const good=JSON.stringify({location:{value:'Riverside Showground',evidence:[
 {source:'https://example.org/venues',excerpt:'Venue: Riverside Showground'}]}});
const audit={snapshot_at:'2026-09-29T20:00:00Z',visible:[
 {id:'new',enrichment_json:'{}',canonical_url:'https://example.org/new'},
 {id:'historic',enrichment_json:'{}',canonical_url:'https://example.org/historic'},
 {id:'followup',enrichment_json:'{}',canonical_url:'https://example.org/followup'},
 {id:'strong',enrichment_json:good,canonical_url:'https://example.org/strong'}
]};
test('unresolved sweep excludes independently reviewed historic/followup cohorts and strict text matches',()=>{
 const result=planUsUnresolvedVenueSweep(audit,{
  historicalIds:['historic'],followupIds:['followup']});
 assert.equal(result.visible,4);
 assert.equal(result.strict_text_candidates,1);
 assert.equal(result.weak_stored_evidence,3);
 assert.equal(result.selected,1);
 assert.deepEqual(result.queue.map(x=>x.opportunity_id),['new']);
 assert.equal('verified_venue_geoid' in result.queue[0],false);
});
test('does not silently truncate inventory or accept duplicate IDs',()=>{
 assert.throws(()=>planUsUnresolvedVenueSweep(audit,{maxVisible:3}),/above_cap/);
 assert.throws(()=>planUsUnresolvedVenueSweep({visible:[audit.visible[0],audit.visible[0]]}),/duplicate/);
});
