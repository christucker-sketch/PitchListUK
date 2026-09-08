import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertGlobalControllerDispatchAllowed,
  globalControllerExecutionEnabled,
  globalControllerExecutionLevel,
  resolveGlobalAcquisitionDispatch
} from '../operations/cloudflare-global-acquisition/lib/dispatch.mjs';
import { selectUsReadOnlySources, US_GLOBAL_READ_ONLY_LIMITS } from '../operations/cloudflare-global-acquisition/lib/us-approved-source-poll.mjs';
import { getStateConfig } from '../operations/cloudflare-texas-acquisition/src/us-state-registry.js';

test('global controller requires an explicit enabled country', () => {
  assert.throws(() => resolveGlobalAcquisitionDispatch({}), /explicit country/);
  assert.throws(() => resolveGlobalAcquisitionDispatch({ country: 'CA' }), /planned but not enabled/);
  assert.throws(() => resolveGlobalAcquisitionDispatch({ country: 'FR' }), /Unsupported acquisition country/);
});

test('US dispatch supports production modes plus the shared read-only poll mode', () => {
  const acquire = resolveGlobalAcquisitionDispatch({ country: 'US', state_code: 'TX', mode: 'acquire' });
  const discover = resolveGlobalAcquisitionDispatch({ country: 'USA', state_code: 'NY', mode: 'discover' });
  const readOnly = resolveGlobalAcquisitionDispatch({ country: 'US', state_code: 'NY' });
  assert.equal(acquire.handler, 'us_production_workflow');
  assert.equal(acquire.mutation_capable, true);
  assert.equal(discover.handler, 'us_production_workflow');
  assert.equal(discover.mutation_capable, true);
  assert.equal(readOnly.mode, 'approved_source_cloudflare_read_only_poll');
  assert.equal(readOnly.handler, 'us_approved_source_poll');
  assert.equal(readOnly.mutation_capable, false);
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

test('read-only execution level permits evidence polling and blocks every mutating US mode', () => {
  const env = { GLOBAL_ACQUISITION_EXECUTION_ENABLED: 'true', GLOBAL_ACQUISITION_EXECUTION_LEVEL: 'read_only' };
  const usPoll = resolveGlobalAcquisitionDispatch({ country: 'US', state_code: 'NY' });
  const ukPoll = resolveGlobalAcquisitionDispatch({ country: 'UK' });
  const acquire = resolveGlobalAcquisitionDispatch({ country: 'US', state_code: 'NY', mode: 'acquire' });
  const discover = resolveGlobalAcquisitionDispatch({ country: 'US', state_code: 'NY', mode: 'discover' });
  assert.equal(assertGlobalControllerDispatchAllowed(env, usPoll), true);
  assert.equal(assertGlobalControllerDispatchAllowed(env, ukPoll), true);
  assert.throws(() => assertGlobalControllerDispatchAllowed(env, acquire), /read-only/);
  assert.throws(() => assertGlobalControllerDispatchAllowed(env, discover), /read-only/);
});

test('controller fails closed for missing or invalid execution level', () => {
  assert.equal(globalControllerExecutionEnabled({}), false);
  assert.equal(globalControllerExecutionLevel({}), 'disabled');
  assert.equal(globalControllerExecutionLevel({ GLOBAL_ACQUISITION_EXECUTION_ENABLED: 'true' }), 'invalid');
  assert.throws(
    () => assertGlobalControllerDispatchAllowed({ GLOBAL_ACQUISITION_EXECUTION_ENABLED: 'true' }, resolveGlobalAcquisitionDispatch({ country: 'UK' })),
    /execution level is invalid/
  );
});

test('US read-only source selection is bounded and exact', () => {
  const state = getStateConfig('NY');
  const defaultSelection = selectUsReadOnlySources(state);
  assert.equal(defaultSelection.length, Math.min(US_GLOBAL_READ_ONLY_LIMITS.default_source_limit, state.sources.length));
  assert.ok(defaultSelection.length <= US_GLOBAL_READ_ONLY_LIMITS.maximum_source_limit);
  const exact = selectUsReadOnlySources(state, { source_ids: [state.sources[0].id] });
  assert.deepEqual(exact.map(source => source.id), [state.sources[0].id]);
  assert.throws(() => selectUsReadOnlySources(state, { source_ids: ['not-a-real-source'] }), /unknown source id/);
});
