import test from 'node:test';
import assert from 'node:assert/strict';
import { assessCustomerReadiness } from '../../platform/findpitches-v2/customer/readiness.mjs';

const base = {
  id:'fpv2_test', market:'GB', title:'Example Market', region_code:'GB-ENG-KENT',
  canonical_url:'https://example.test/event', application_url:'https://example.test/apply',
  last_checked:'2026-09-26T12:00:00Z'
};

test('minimum customer-facing identity can pass the boundary',()=>{
  const r=assessCustomerReadiness(base);
  assert.equal(r.ready,true);
  assert.deepEqual(r.missing,[]);
});

test('validated-like record without application provenance is not customer-ready',()=>{
  const r=assessCustomerReadiness({...base,application_url:null});
  assert.equal(r.ready,false);
  assert.ok(r.missing.includes('application_url'));
});

test('unknown enrichment remains unknown rather than being invented',()=>{
  const r=assessCustomerReadiness({...base,sells:null,recurring:null,coordinates:null});
  assert.equal(r.ready,true);
  assert.deepEqual(r.invalid,[]);
});

test('bad coordinates and invented-style nonboolean recurring fail validation',()=>{
  const r=assessCustomerReadiness({...base,coordinates:{lat:200,lng:1},recurring:'yes'});
  assert.equal(r.ready,false);
  assert.ok(r.invalid.includes('coordinates'));
  assert.ok(r.invalid.includes('recurring'));
});
