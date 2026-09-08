import assert from 'node:assert/strict';
import test from 'node:test';

import {
  globalControllerExecutionEnabled,
  resolveGlobalAcquisitionDispatch
} from '../operations/cloudflare-global-acquisition/lib/dispatch.mjs';

test('global controller requires an explicit enabled country', () => {
  assert.throws(() => resolveGlobalAcquisitionDispatch({}), /explicit country/);
  assert.throws(() => resolveGlobalAcquisitionDispatch({ country: 'CA' }), /planned but not enabled/);
  assert.throws(() => resolveGlobalAcquisitionDispatch({ country: 'FR' }), /Unsupported acquisition country/);
});

test('US dispatch preserves the production acquire/discover modes', () => {
  const acquire = resolveGlobalAcquisitionDispatch({ country: 'US', state_code: 'TX' });
  const discover = resolveGlobalAcquisitionDispatch({ country: 'USA', state_code: 'NY', mode: 'discover' });
  assert.equal(acquire.country, 'US');
  assert.equal(acquire.mode, 'acquire');
  assert.equal(acquire.handler, 'us_production_workflow');
  assert.equal(acquire.mutation_capable, true);
  assert.equal(discover.country, 'US');
  assert.equal(discover.mode, 'discover');
  assert.equal(discover.payload.state_code, 'NY');
});

test('UK dispatch maps to the proven approved-source Cloudflare poll only', () => {
  const uk = resolveGlobalAcquisitionDispatch({ country: 'GB' });
  assert.equal(uk.country, 'UK');
  assert.equal(uk.mode, 'approved_source_cloudflare_read_only_poll');
  assert.equal(uk.handler, 'uk_approved_source_poll');
  assert.equal(uk.mutation_capable, false);
  assert.throws(
    () => resolveGlobalAcquisitionDispatch({ country: 'UK', mode: 'discover' }),
    /Unsupported UK global acquisition mode/
  );
});

test('shadow controller execution is disabled unless explicitly enabled', () => {
  assert.equal(globalControllerExecutionEnabled({}), false);
  assert.equal(globalControllerExecutionEnabled({ GLOBAL_ACQUISITION_EXECUTION_ENABLED: 'false' }), false);
  assert.equal(globalControllerExecutionEnabled({ GLOBAL_ACQUISITION_EXECUTION_ENABLED: 'TRUE' }), true);
});
