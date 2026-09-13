import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertGlobalControllerDispatchAllowed,
  resolveGlobalAcquisitionDispatch
} from '../operations/cloudflare-global-acquisition/lib/dispatch.mjs';

test('planned Canada exposes only explicit read-only controller readiness without enabling acquisition', () => {
  const readiness = resolveGlobalAcquisitionDispatch({
    country: 'CA',
    mode: 'controller_cutover_readiness'
  });

  assert.equal(readiness.country, 'CA');
  assert.equal(readiness.mode, 'controller_cutover_readiness');
  assert.equal(readiness.handler, 'ca_controller_cutover_readiness');
  assert.equal(readiness.mutation_capable, false);
  assert.equal(readiness.shadow_only, false);

  assert.throws(
    () => resolveGlobalAcquisitionDispatch({ country: 'CA' }),
    /planned but not enabled/
  );
  assert.throws(
    () => resolveGlobalAcquisitionDispatch({ country: 'CA', mode: 'acquire' }),
    /planned but not enabled/
  );
});

test('Canada readiness is permitted at every execution level that permits non-mutating evidence', () => {
  const dispatch = resolveGlobalAcquisitionDispatch({ country: 'CA', mode: 'controller_cutover_readiness' });

  assert.equal(assertGlobalControllerDispatchAllowed({
    GLOBAL_ACQUISITION_EXECUTION_ENABLED: 'true',
    GLOBAL_ACQUISITION_EXECUTION_LEVEL: 'read_only'
  }, dispatch), true);

  assert.equal(assertGlobalControllerDispatchAllowed({
    GLOBAL_ACQUISITION_EXECUTION_ENABLED: 'true',
    GLOBAL_ACQUISITION_EXECUTION_LEVEL: 'pr_only'
  }, dispatch), true);

  assert.equal(assertGlobalControllerDispatchAllowed({
    GLOBAL_ACQUISITION_EXECUTION_ENABLED: 'true',
    GLOBAL_ACQUISITION_EXECUTION_LEVEL: 'production'
  }, dispatch), true);
});
