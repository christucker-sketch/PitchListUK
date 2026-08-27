import test from 'node:test';
import assert from 'node:assert/strict';
import { TEXAS_PILOT_RUN, assertTexasPilotRun } from '../config/texas-pilot-run.js';

test('Texas pilot run is staging-only and count-bound', () => {
  assert.equal(assertTexasPilotRun(), true);
  assert.equal(TEXAS_PILOT_RUN.country_code, 'US');
  assert.equal(TEXAS_PILOT_RUN.region_code, 'TX');
  assert.equal(TEXAS_PILOT_RUN.mode, 'staging-only');
  assert.equal(TEXAS_PILOT_RUN.automatic_publish, false);
  assert.equal(TEXAS_PILOT_RUN.production_writes, false);
  assert.equal(TEXAS_PILOT_RUN.source_count, TEXAS_PILOT_RUN.sources.length);
});
