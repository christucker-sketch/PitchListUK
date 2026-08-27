import test from 'node:test';
import assert from 'node:assert/strict';
import { TEXAS_PILOT_QUALITY_GATES } from '../config/texas-pilot-quality-gates.js';

test('Texas pilot quality gates keep publishing disabled', () => {
  assert.equal(TEXAS_PILOT_QUALITY_GATES.require_country_code, 'US');
  assert.equal(TEXAS_PILOT_QUALITY_GATES.require_region_code, 'TX');
  assert.equal(TEXAS_PILOT_QUALITY_GATES.automatic_publish, false);
  assert.equal(TEXAS_PILOT_QUALITY_GATES.production_writes, false);
  assert.equal(TEXAS_PILOT_QUALITY_GATES.reject_regulatory_only, true);
});
