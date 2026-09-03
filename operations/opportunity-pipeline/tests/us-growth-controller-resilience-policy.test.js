import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyDeferredSkip,
  classifyResilienceAction
} from '../../cloudflare-texas-acquisition/scripts/growth-controller.mjs';

test('confirmed terminal discovery workflow is deferred and advances the query slice', () => {
  const state = {
    status: 'running_cloudflare_discovery',
    active_instance: { id: `cf_${'a'.repeat(64)}`, mode: 'discover', state_code: 'NY' },
    current: { mode: 'discover', state_code: 'NY', query_offset: 76, query_limit: 2 },
    query_offsets: { NY: 76 },
    priority_order: ['NY', 'PA'],
    priority_cursor: 0,
    resilience_events: [],
    deferred_units: []
  };
  const action = classifyResilienceAction(new Error(`Workflow cf_${'a'.repeat(64)} is errored`), state);
  assert.equal(action.action, 'skip');
  applyDeferredSkip(state, action, new Date('2026-09-03T06:00:00Z'));
  assert.equal(state.status, 'ready');
  assert.equal(state.active_instance, null);
  assert.equal(state.current, null);
  assert.equal(state.query_offsets.NY, 78);
  assert.equal(state.priority_cursor, 1);
  assert.equal(state.deferred_units.length, 1);
  assert.equal(state.deferred_units[0].disposition, 'deferred_for_replay');
});

test('confirmed terminal acquisition workflow is deferred and advances only the batch', () => {
  const state = {
    status: 'running_cloudflare_acquisition',
    active_instance: { id: `cf_${'b'.repeat(64)}`, mode: 'acquire', state_code: 'TX' },
    current: { mode: 'discover', state_code: 'TX', query_offset: 20 },
    acquisition_batch: 3,
    pending_source_ids: ['one', 'two'],
    resilience_events: [],
    deferred_units: []
  };
  const action = classifyResilienceAction(new Error(`Workflow cf_${'b'.repeat(64)} is terminated`), state);
  assert.equal(action.action, 'skip');
  applyDeferredSkip(state, action, new Date('2026-09-03T06:00:00Z'));
  assert.equal(state.status, 'ready_acquisition');
  assert.equal(state.active_instance, null);
  assert.equal(state.acquisition_batch, 4);
  assert.deepEqual(state.pending_source_ids, ['one', 'two']);
});

test('uncertain trigger result is defer-skipped rather than blindly retriggered', () => {
  const error = new Error('Command failed: npx wrangler workflows trigger pitchlist-texas-acquisition workflows.api.error.internal_server code: 10001');
  const state = { status: 'ready', active_instance: null };
  const action = classifyResilienceAction(error, state, {
    mode: 'discover', state_code: 'NY', query_offset: 76, query_limit: 2, batch_number: null
  });
  assert.equal(action.action, 'skip');
  assert.equal(action.reason, 'uncertain_trigger_result');
});

test('unknown active workflow is waited on, while evidence and repository failures still stop', () => {
  const activeId = `cf_${'c'.repeat(64)}`;
  assert.equal(
    classifyResilienceAction(new Error(`Another acquisition Workflow is running: ${activeId}`), {}).action,
    'wait'
  );
  assert.equal(
    classifyResilienceAction(new Error('Source PR lacks complete deterministic evidence'), {}).action,
    'stop'
  );
  assert.equal(
    classifyResilienceAction(new Error('Repository worktree is not clean'), {}).action,
    'stop'
  );
});
