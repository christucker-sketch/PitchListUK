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

test('UK dispatch exposes read-only polling plus additions-only PR planning', () => {
  const poll = resolveGlobalAcquisitionDispatch({ country: 'GB' });
  const additions = resolveGlobalAcquisitionDispatch({ country: 'UK', mode: 'uk_additions_only_pr' });
  assert.equal(poll.country, 'UK');
  assert.equal(poll.handler, 'uk_approved_source_poll');
  assert.equal(poll.mutation_capable, false);
  assert.equal(additions.handler, 'uk_additions_only_pr');
  assert.equal(additions.mutation_capable, true);
  assert.throws(
    () => resolveGlobalAcquisitionDispatch({ country: 'UK', mode: 'discover' }),
    /Unsupported UK global acquisition mode/
  );
});

test('read-only execution level permits evidence polling and blocks every mutating mode', () => {
  const env = { GLOBAL_ACQUISITION_EXECUTION_ENABLED: 'true', GLOBAL_ACQUISITION_EXECUTION_LEVEL: 'read_only' };
  const usPoll = resolveGlobalAcquisitionDispatch({ country: 'US', state_code: 'NY' });
  const ukPoll = resolveGlobalAcquisitionDispatch({ country: 'UK' });
  const ukAdditions = resolveGlobalAcquisitionDispatch({ country: 'UK', mode: 'uk_additions_only_pr' });
  const acquire = resolveGlobalAcquisitionDispatch({ country: 'US', state_code: 'NY', mode: 'acquire' });
  const discover = resolveGlobalAcquisitionDispatch({ country: 'US', state_code: 'NY', mode: 'discover' });
  assert.equal(assertGlobalControllerDispatchAllowed(env, usPoll), true);
  assert.equal(assertGlobalControllerDispatchAllowed(env, ukPoll), true);
  assert.throws(() => assertGlobalControllerDispatchAllowed(env, ukAdditions), /read-only/);
  assert.throws(() => assertGlobalControllerDispatchAllowed(env, acquire), /read-only/);
  assert.throws(() => assertGlobalControllerDispatchAllowed(env, discover), /read-only/);
});

test('PR-only execution level permits UK additions PRs but still blocks US production modes', () => {
  const env = { GLOBAL_ACQUISITION_EXECUTION_ENABLED: 'true', GLOBAL_ACQUISITION_EXECUTION_LEVEL: 'pr_only' };
  const ukAdditions = resolveGlobalAcquisitionDispatch({ country: 'UK', mode: 'uk_additions_only_pr' });
  const ukPoll = resolveGlobalAcquisitionDispatch({ country: 'UK' });
  const usPoll = resolveGlobalAcquisitionDispatch({ country: 'US', state_code: 'NY' });
  const acquire = resolveGlobalAcquisitionDispatch({ country: 'US', state_code: 'NY', mode: 'acquire' });
  const discover = resolveGlobalAcquisitionDispatch({ country: 'US', state_code: 'NY', mode: 'discover' });
  assert.equal(assertGlobalControllerDispatchAllowed(env, ukAdditions), true);
  assert.equal(assertGlobalControllerDispatchAllowed(env, ukPoll), true);
  assert.equal(assertGlobalControllerDispatchAllowed(env, usPoll), true);
  assert.throws(() => assertGlobalControllerDispatchAllowed(env, acquire), /PR-only/);
  assert.throws(() => assertGlobalControllerDispatchAllowed(env, discover), /PR-only/);
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
