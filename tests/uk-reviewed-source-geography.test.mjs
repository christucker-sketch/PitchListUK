import assert from 'node:assert/strict';
import test from 'node:test';

import sourcesLib from '../operations/opportunity-pipeline/config/sources.js';

const { APPROVED_SOURCES } = sourcesLib;

test('approved UK source routes never expose discovery placeholder geography', () => {
  const bad = APPROVED_SOURCES.filter(source => /trusted-source graph/i.test(String(source.geographic_coverage || '')));
  assert.deepEqual(bad.map(source => source.host), []);
});

test('Barnsley reviewed application route carries customer-facing canonical metadata', () => {
  const source = APPROVED_SOURCES.find(source => source.host === 'my.barnsley.gov.uk');
  assert.ok(source, 'expected reviewed Barnsley application source');
  assert.equal(source.organisation, 'Barnsley Council');
  assert.equal(source.geographic_coverage, 'South Yorkshire');
  assert.equal(source.opportunity_title, 'Barnsley local market stall applications');
});

test('approved UK source routes exclude informational careers job-profile pages', () => {
  const bad = APPROVED_SOURCES.filter(source => /\/job-profiles?\//i.test(String(source.official_application_route || '')));
  assert.deepEqual(bad.map(source => source.host), []);
});


test('approved UK source registry excludes the three incorrectly auto-approved #1891 routes', () => {
  const routes = new Set(APPROVED_SOURCES.map(source => source.official_application_route));
  assert.equal(routes.has('https://bedford.gov.uk'), false);
  assert.equal(routes.has('https://buckinghamshire.gov.uk/business/street-use-and-trading-licences/become-a-market-trader'), false);
  assert.equal(routes.has('https://wearemiddlesbrough.com/venue/orange-pip-market'), false);
});
