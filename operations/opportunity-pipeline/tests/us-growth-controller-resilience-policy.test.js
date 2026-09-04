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

test('post-merge snapshot lag is retried but remains bounded', () => {
  const error = new Error('Merged snapshot is 363; expected 364');
  const state = {
    status: 'reviewing_data_pr',
    current: { state_code: 'VA', data_pr: 636 },
    resilience_events: []
  };
  let action = classifyResilienceAction(error, state);
  assert.equal(action.action, 'wait');
  assert.equal(action.reason, 'post_merge_snapshot_visibility_lag');

  state.resilience_events = Array.from({ length: 5 }, () => ({
    reason: 'post_merge_snapshot_visibility_lag',
    state_code: 'VA'
  }));
  action = classifyResilienceAction(error, state);
  assert.equal(action.action, 'stop');
});

test('live API count/identity cache skew waits within the existing consistency deadline', () => {
  const state = {
    status: 'waiting_for_live_consistency',
    current: {
      state_code: 'VA',
      pending_deploy: { count: 380, previous_count: 379, additions: 1 },
      live_consistency: { deadline_at: '2026-09-03T12:00:00.000Z' }
    }
  };
  const action = classifyResilienceAction(
    new Error('Live FindPitches count is behind but already contains published identity opp_us_e6063078d22d44d1b7d4'),
    state
  );
  assert.equal(action.action, 'wait');
  assert.equal(action.reason, 'live_api_cache_skew');
});

test('repeated transient describe failures for one exact Workflow are automatically deferred', () => {
  const instanceId = `cf_${'d'.repeat(64)}`;
  const state = {
    status: 'running_cloudflare_discovery',
    active_instance: { id: instanceId, mode: 'discover', state_code: 'OH' },
    current: { mode: 'discover', state_code: 'OH', query_offset: 130, query_limit: 2 },
    acquisition_batch: 1,
    resilience_events: []
  };
  const error = new Error(`Command failed: npx wrangler workflows instances describe pitchlist-texas-acquisition ${instanceId} workflows.api.error.internal_server code: 10001`);

  let action = classifyResilienceAction(error, state);
  assert.equal(action.action, 'wait');
  assert.equal(action.reason, 'workflow_describe_retry_exhausted');

  state.resilience_events.push({ reason: 'workflow_describe_retry_exhausted', instance_id: instanceId });
  action = classifyResilienceAction(error, state);
  assert.equal(action.action, 'wait');

  state.resilience_events.push({ reason: 'workflow_describe_retry_exhausted', instance_id: instanceId });
  action = classifyResilienceAction(error, state);
  assert.equal(action.action, 'skip');
  assert.equal(action.reason, 'workflow_describe_retry_exhausted_deferred');
  assert.equal(action.intent.instance_id, instanceId);
  assert.equal(action.intent.state_code, 'OH');
  assert.equal(action.intent.query_offset, 130);
  assert.equal(action.intent.query_limit, 2);
});

test('malformed compact Workflow output is reread then deferred without weakening other JSON safety gates', () => {
  const instanceId = `cf_${'1'.repeat(64)}`;
  const state = {
    status: 'running_cloudflare_discovery',
    active_instance: { id: instanceId, mode: 'discover', state_code: 'MA' },
    current: { mode: 'discover', state_code: 'MA', query_offset: 136, query_limit: 2 },
    acquisition_batch: 1,
    resilience_events: []
  };
  const error = new SyntaxError('Unterminated string in JSON at position 1042 line 1 column 1043');

  let action = classifyResilienceAction(error, state);
  assert.equal(action.action, 'wait');
  assert.equal(action.reason, 'workflow_compact_output_parse_retry');

  state.resilience_events.push({ reason: 'workflow_compact_output_parse_retry', instance_id: instanceId });
  action = classifyResilienceAction(error, state);
  assert.equal(action.action, 'wait');

  state.resilience_events.push({ reason: 'workflow_compact_output_parse_retry', instance_id: instanceId });
  action = classifyResilienceAction(error, state);
  assert.equal(action.action, 'skip');
  assert.equal(action.reason, 'workflow_compact_output_parse_exhausted_deferred');
  assert.equal(action.intent.instance_id, instanceId);
  assert.equal(action.intent.state_code, 'MA');
  assert.equal(action.intent.query_offset, 136);
  assert.equal(action.intent.query_limit, 2);

  assert.equal(
    classifyResilienceAction(error, { status: 'reviewing_data_pr', active_instance: null }).action,
    'stop'
  );
  assert.equal(
    classifyResilienceAction(new Error(error.message), state).action,
    'stop'
  );
});

test('compact output parse history from another Workflow does not poison the current instance budget', () => {
  const currentId = `cf_${'2'.repeat(64)}`;
  const state = {
    status: 'running_cloudflare_acquisition',
    active_instance: { id: currentId, mode: 'acquire', state_code: 'MA' },
    current: { mode: 'discover', state_code: 'MA', query_offset: 136, query_limit: 2 },
    acquisition_batch: 2,
    resilience_events: [
      { reason: 'workflow_compact_output_parse_retry', instance_id: `cf_${'3'.repeat(64)}` },
      { reason: 'workflow_compact_output_parse_retry', instance_id: `cf_${'3'.repeat(64)}` }
    ]
  };
  const action = classifyResilienceAction(new SyntaxError('Unexpected end of JSON input'), state);
  assert.equal(action.action, 'wait');
  assert.equal(action.reason, 'workflow_compact_output_parse_retry');
});

test('describe failure history from a different Workflow does not poison the current instance budget', () => {
  const currentId = `cf_${'e'.repeat(64)}`;
  const state = {
    status: 'running_cloudflare_discovery',
    active_instance: { id: currentId, mode: 'discover', state_code: 'GA' },
    current: { mode: 'discover', state_code: 'GA', query_offset: 40, query_limit: 2 },
    resilience_events: [
      { reason: 'workflow_describe_retry_exhausted', instance_id: `cf_${'f'.repeat(64)}` },
      { reason: 'workflow_describe_retry_exhausted', instance_id: `cf_${'f'.repeat(64)}` }
    ]
  };
  const error = new Error(`Command failed: npx wrangler workflows instances describe pitchlist-texas-acquisition ${currentId} Authentication error code: 10000`);
  const action = classifyResilienceAction(error, state);
  assert.equal(action.action, 'wait');
  assert.equal(action.reason, 'workflow_describe_retry_exhausted');
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
