import assert from 'node:assert/strict';
import test from 'node:test';

import sourcesLib from '../operations/opportunity-pipeline/config/sources.js';

const { APPROVED_SOURCES } = sourcesLib;

test('approved UK source routes never expose discovery placeholder geography', () => {
  const bad = APPROVED_SOURCES.filter(source => /trusted-source graph/i.test(String(source.geographic_coverage || '')));
  assert.deepEqual(bad.map(source => source.host), []);
});

test('approved UK source routes exclude informational careers pages', () => {
  const bad = APPROVED_SOURCES.filter(source => source.host === 'nationalcareers.service.gov.uk' || /\/job-profiles?\//i.test(String(source.official_application_route || '')));
  assert.deepEqual(bad.map(source => source.host), []);
});

test('Barnsley reviewed application route carries customer-facing canonical metadata', () => {
  const source = APPROVED_SOURCES.find(source => source.host === 'my.barnsley.gov.uk');
  assert.ok(source, 'expected reviewed Barnsley application source');
  assert.equal(source.organisation, 'Barnsley Council');
  assert.equal(source.geographic_coverage, 'South Yorkshire');
  assert.equal(source.opportunity_title, 'Barnsley local market stall applications');
});
