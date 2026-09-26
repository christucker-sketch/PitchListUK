import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectCustomerOpportunity, summariseCustomerQuality } from '../../platform/findpitches-v2/audit/customer-ready-quality.mjs';

const now = new Date('2026-09-26T12:00:00Z');

test('flags wrapper, social and stale customer URLs without rejecting the record', () => {
  const result = inspectCustomerOpportunity({
    id:'x', market:'GB',
    canonical_url:'https://www.google.com.hk/url?q=https://instagram.com/p/foo',
    application_url:'https://example.org/forms/vendor-2022.docx'
  }, { now });
  assert.deepEqual(result.flags.map(x => x.code).sort(), ['search_wrapper_url','stale_year_in_url']);
});

test('flags past dates and reports optional enrichment completeness', () => {
  const result = inspectCustomerOpportunity({
    id:'x', market:'GB', organiser:'Example Org', offerings:[{label:'Jamaican jerk',kind:'food',cuisine:'Jamaican'}],
    event_end:'2025-06-01', application_deadline:'2025-05-01'
  }, { now });
  assert.equal(result.flag_count, 2);
  assert.ok(result.enrichment_completeness > 0);
});

test('summary is read-only diagnostic output', () => {
  const result = summariseCustomerQuality([
    {id:'a',market:'GB',canonical_url:'https://example.org/event',application_url:'https://example.org/apply'},
    {id:'b',market:'US',canonical_url:'https://instagram.com/p/foo',application_url:'https://example.org/apply'}
  ], { now });
  assert.equal(result.inspected, 2);
  assert.equal(result.flagged, 1);
  assert.equal(result.clean, 1);
  assert.equal(result.flags.social_url, 1);
});
