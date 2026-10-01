// Runs only against the isolated historical Hal V1 harness base.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { sourceRuleFor } = require('../operations/opportunity-pipeline/config/sources.js');

test('Hal V1 does not silently promote the three cloud #1891 routes', () => {
  const routes = [
    'https://bedford.gov.uk',
    'https://buckinghamshire.gov.uk/business/street-use-and-trading-licences/become-a-market-trader',
    'https://wearemiddlesbrough.com/venue/orange-pip-market'
  ];
  for (const route of routes) assert.equal(sourceRuleFor(route).approved, false, route);
});

test('Hal V1 approves only the reviewed Buckinghamshire route and pins its geography', () => {
  const route = 'https://weblabsforms.buckinghamshire.gov.uk/ShowForm.asp?fm_fid=325';
  const rule = sourceRuleFor(route);
  assert.equal(rule.approved, true);
  assert.equal(rule.geographic_coverage, 'Buckinghamshire');
  assert.equal(rule.official_application_route, route);
});
