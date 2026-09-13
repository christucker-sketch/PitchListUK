import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertGlobalControllerDispatchAllowed,
  CA_SOURCE_DISCOVERY_MODE,
  resolveGlobalAcquisitionDispatch
} from '../operations/cloudflare-global-acquisition/lib/dispatch.mjs';

const productionEnv = {
  GLOBAL_ACQUISITION_EXECUTION_ENABLED: 'true',
  GLOBAL_ACQUISITION_EXECUTION_LEVEL: 'production'
};

const prOnlyEnv = {
  GLOBAL_ACQUISITION_EXECUTION_ENABLED: 'true',
  GLOBAL_ACQUISITION_EXECUTION_LEVEL: 'pr_only'
};

test('Canada shadow source discovery is the only planned-market dispatch currently permitted', () => {
  const dispatch = resolveGlobalAcquisitionDispatch({ country: 'CA', mode: CA_SOURCE_DISCOVERY_MODE, query_offset: 0, query_limit: 4 });
  assert.equal(dispatch.country, 'CA');
  assert.equal(dispatch.handler, 'ca_source_discovery_pr');
  assert.equal(dispatch.mutation_capable, true);
  assert.equal(dispatch.shadow_only, true);
  assert.equal(assertGlobalControllerDispatchAllowed(productionEnv, dispatch), true);
  assert.equal(assertGlobalControllerDispatchAllowed(prOnlyEnv, dispatch), true);

  assert.throws(() => resolveGlobalAcquisitionDispatch({ country: 'CA', mode: 'acquire' }));
  assert.throws(() => resolveGlobalAcquisitionDispatch({ country: 'CA', mode: 'approved_source_cloudflare_read_only_poll' }));
});

test('Canada source discovery remains blocked when global execution is read-only or disabled', () => {
  const dispatch = resolveGlobalAcquisitionDispatch({ country: 'CA', mode: CA_SOURCE_DISCOVERY_MODE });
  assert.throws(() => assertGlobalControllerDispatchAllowed({
    GLOBAL_ACQUISITION_EXECUTION_ENABLED: 'true',
    GLOBAL_ACQUISITION_EXECUTION_LEVEL: 'read_only'
  }, dispatch));
  assert.throws(() => assertGlobalControllerDispatchAllowed({
    GLOBAL_ACQUISITION_EXECUTION_ENABLED: 'false',
    GLOBAL_ACQUISITION_EXECUTION_LEVEL: 'production'
  }, dispatch));
});
