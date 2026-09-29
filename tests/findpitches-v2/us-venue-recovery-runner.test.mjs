import test from 'node:test';
import assert from 'node:assert/strict';
import { runUsVenueRecoveryPreview,allowedExistingSource } from '../../platform/findpitches-v2/quality/us-venue-recovery-runner.mjs';

test('bounded preview refetches known sources only and never assigns GEOIDs',async()=>{
 const urls=[];
 const queue=[
  {opportunity_id:'a',location_evidence_url:'https://townmarket.org/vendors',
   canonical_url:'https://townmarket.org/vendors',application_url:'https://townmarket.org/apply'},
  {opportunity_id:'b',canonical_url:'https://countyfair.org/contact'},
  {opportunity_id:'c',canonical_url:'https://thirdfair.org/vendors'}
 ];
 const fetchProvider={async fetch(url){
  urls.push(url);
  if(url==='https://townmarket.org/vendors')return {final_url:url,body:'Event venue: Market Square'};
  if(url==='https://townmarket.org/apply')throw new Error('Sensitive token must never appear');
  return {final_url:url,body:'Office location: Company Headquarters'};
 }};
 const result=await runUsVenueRecoveryPreview(queue,{fetchProvider,limit:2});
 assert.equal(result.attempted,2);
 assert.equal(result.possible_venue,1);
 assert.equal(result.without_venue,1);
 assert.equal(result.fetch_failed_records,1);
 assert.equal(result.remaining_queue,1);
 assert.deepEqual(urls,['https://townmarket.org/vendors','https://townmarket.org/apply','https://countyfair.org/contact']);
 assert.equal(result.outcomes[0].venue_candidate,'Market Square');
 assert.equal(result.outcomes[0].verified_venue_geoid,null);
 assert.equal(result.outcomes[0].failures[0].reason,'fetch_failed');
 assert.ok(!JSON.stringify(result).includes('Sensitive token'));
});

test('cross-host redirects and internal URLs fail closed before parsing or fetching',async()=>{
 const got=[];
 const queue=[{opportunity_id:'a',location_evidence_url:'http://127.0.0.1/secret',
  canonical_url:'https://example.org/vendors'}];
 const result=await runUsVenueRecoveryPreview(queue,{fetchProvider:{async fetch(url){
  got.push(url);return {final_url:'https://other.org/',body:'Venue: Other venue'};
 }}});
 assert.deepEqual(got,['https://example.org/vendors']);
 assert.equal(result.outcomes[0].fetched,0);
 assert.equal(result.outcomes[0].failures[0].reason,'unsafe_or_cross_host_redirect');
 assert.equal(result.outcomes[0].venue_candidate,null);
 for (const url of ['http://localhost/path','http://169.254.169.254/meta',
  'http://[::1]/','ftp://example.org/file','https://u:p@example.org/path',
  'http://example.internal/path','https://a.test/path']) {
  assert.equal(allowedExistingSource(url),null,url);
 }
});

test('batch bounds, invalid IDs and fetch provider are checked before work',async()=>{
 await assert.rejects(runUsVenueRecoveryPreview([]),/fetch_provider/);
 await assert.rejects(runUsVenueRecoveryPreview([],{fetchProvider:{fetch(){}},limit:26}),/batch_limit/);
 await assert.rejects(runUsVenueRecoveryPreview([{opportunity_id:'a'},{opportunity_id:'a'}],{
  fetchProvider:{fetch(){}}
 }),/duplicate/);
});
