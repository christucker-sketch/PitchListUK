import test from 'node:test';
import assert from 'node:assert/strict';
import { enrichValidatedCandidate } from '../../platform/findpitches-v2/enrichment/enrich-candidate.mjs';

test('enrichment fetches known pages and bounded useful same-site links without search',async()=>{
  const calls=[];
  const fetchProvider={async fetch(url){
    calls.push(url);
    if(url.endsWith('/event')) return {final_url:url,body:`<html><head><meta name="description" content="Kent food festival seeking traders"></head><body>Hosted by Kent Events. Location: Maidstone, Kent. Event date: 14 June 2027. <a href="/vendors/apply">Vendor application</a><a href="/privacy">Privacy</a></body></html>`};
    return {final_url:url,body:'Applications close: 1 May 2027. Apply to trade.'};
  }};
  const result=await enrichValidatedCandidate({id:'x',canonical_url:'https://example.test/event',application_url:'https://example.test/vendors'},{fetchProvider,maxPages:3});
  assert.ok(calls.length<=3);
  assert.ok(calls.some(url=>url.includes('/vendors/apply')));
  assert.equal(calls.some(url=>url.includes('/privacy')),false);
  assert.equal(result.enrichment.organiser.value,'Kent Events');
  assert.equal(result.enrichment.location.value,'Maidstone, Kent');
  assert.equal(result.enrichment.application_deadline.value,'1 May 2027');
  assert.match(result.enrichment.description.value,/seeking traders/);
});

test('enrichment stays useful when one supplied URL fails',async()=>{
  const fetchProvider={async fetch(url){
    if(url.includes('broken')) throw new Error('boom');
    return {final_url:url,body:'Hosted by Example Markets.'};
  }};
  const result=await enrichValidatedCandidate({id:'x',canonical_url:'https://example.test/broken',application_url:'https://example.test/apply'},{fetchProvider});
  assert.equal(result.pages_fetched,1);
  assert.equal(result.enrichment.organiser.value,'Example Markets');
});
