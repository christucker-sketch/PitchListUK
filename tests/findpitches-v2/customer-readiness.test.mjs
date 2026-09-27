import test from 'node:test';
import assert from 'node:assert/strict';
import { assessCustomerReadiness } from '../../platform/findpitches-v2/customer/readiness.mjs';

const base = {
  id:'fpv2_test', market:'GB', title:'Example Market', region_code:'GB-ENG-KENT',
  canonical_url:'https://example.test/event', application_url:'https://example.test/apply',
  last_checked:'2026-09-26T12:00:00Z'
};
const now = new Date('2026-09-27T08:00:00Z');

test('minimum customer-facing identity can pass the boundary',()=>{
  const r=assessCustomerReadiness(base,{now});
  assert.equal(r.ready,true);
  assert.deepEqual(r.missing,[]);
  assert.deepEqual(r.blocked,[]);
});

test('validated-like record without application provenance is not customer-ready',()=>{
  const r=assessCustomerReadiness({...base,application_url:null},{now});
  assert.equal(r.ready,false);
  assert.ok(r.missing.includes('application_url'));
});

test('unknown enrichment remains unknown rather than being invented',()=>{
  const r=assessCustomerReadiness({...base,sells:null,recurring:null,coordinates:null},{now});
  assert.equal(r.ready,true);
  assert.deepEqual(r.invalid,[]);
});

test('bad coordinates and invented-style nonboolean recurring fail validation',()=>{
  const r=assessCustomerReadiness({...base,coordinates:{lat:200,lng:1},recurring:'yes'},{now});
  assert.equal(r.ready,false);
  assert.ok(r.invalid.includes('coordinates'));
  assert.ok(r.invalid.includes('recurring'));
});

test('promotion fails closed for search wrappers, social URLs and procurement paths',()=>{
  const records=[
    {...base,canonical_url:'https://www.google.com/url?q=https://example.test/event'},
    {...base,application_url:'https://instagram.com/p/example'},
    {...base,application_url:'https://example.test/procurement/vendor-registration'}
  ];
  for (const record of records) {
    const r=assessCustomerReadiness(record,{now});
    assert.equal(r.ready,false);
    assert.ok(r.blocked.length > 0);
  }
});

test('promotion blocks stale URL years and explicitly expired opportunities',()=>{
  const stale=assessCustomerReadiness({...base,application_url:'https://example.test/vendor-2022.pdf'},{now});
  assert.equal(stale.ready,false);
  assert.ok(stale.blocked.some(item=>item.code==='stale_year_in_url'));

  const ended=assessCustomerReadiness({...base,event_end:'2026-09-01'},{now});
  assert.equal(ended.ready,false);
  assert.ok(ended.blocked.some(item=>item.code==='event_ended'));

  const closed=assessCustomerReadiness({...base,application_deadline:'2026-09-01'},{now});
  assert.equal(closed.ready,false);
  assert.ok(closed.blocked.some(item=>item.code==='application_deadline_passed'));
});

test('missing optional dates and enrichment do not block a genuine actionable opportunity',()=>{
  const r=assessCustomerReadiness({...base,event_start:null,event_end:null,application_deadline:null,organiser:null,description:null},{now});
  assert.equal(r.ready,true);
  assert.deepEqual(r.blocked,[]);
});
