function pendingDeferred(state) {
  return (Array.isArray(state?.deferred_units) ? state.deferred_units : [])
    .filter(item => item?.disposition === 'deferred_for_replay');
}

function genuineBlockers(state) {
  return (Array.isArray(state?.deferred_units) ? state.deferred_units : [])
    .filter(item => item?.disposition === 'genuine_blocker');
}

function assertNoActiveWork(state) {
  if (state?.active_instance) throw new Error('controller_terminal_active_workflow_present');
  if (state?.cloud_controller_intent) throw new Error('controller_terminal_reserved_intent_present');
  if (state?.current) throw new Error('controller_terminal_current_work_present');
  if (Array.isArray(state?.pending_source_ids) && state.pending_source_ids.length) throw new Error('controller_terminal_pending_sources_present');
}

function assertNoDeferredWork(state) {
  if (pendingDeferred(state).length) throw new Error('controller_complete_deferred_replay_pending');
  if (genuineBlockers(state).length) throw new Error('controller_complete_blockers_present');
  if (state?.deferred_replay_inflight) throw new Error('controller_complete_deferred_replay_inflight');
}

export function markCloudControllerSweepComplete(state, now = new Date()) {
  if (!state || state.status !== 'ready') throw new Error('controller_sweep_complete_state_invalid');
  assertNoActiveWork(state);
  if (pendingDeferred(state).length) throw new Error('controller_sweep_complete_deferred_replay_pending');
  if (genuineBlockers(state).length) throw new Error('controller_sweep_complete_blockers_present');
  if (state?.deferred_replay_inflight) throw new Error('controller_sweep_complete_deferred_replay_inflight');
  const order = Array.isArray(state.priority_order) ? state.priority_order : [];
  if (!order.length) throw new Error('controller_sweep_complete_priority_order_missing');
  for (const code of order) {
    const offset = Number(state?.query_offsets?.[code]);
    if (!Number.isInteger(offset) || offset < 0) throw new Error(`controller_sweep_complete_offset_invalid:${code}`);
  }
  const nextState = structuredClone(state);
  nextState.status = 'sweep_complete';
  nextState.sweep_completed_at = now.toISOString();
  nextState.updated_at = now.toISOString();
  return nextState;
}

export function completeCloudController(state, now = new Date()) {
  if (!state) throw new Error('controller_complete_state_invalid');
  assertNoDeferredWork(state);
  const alreadyComplete = state.status === 'complete';
  const cleanSweep = state.status === 'sweep_complete';
  const targetReached = Number.isFinite(Number(state.target_count)) && Number(state.snapshot_count) >= Number(state.target_count);
  if (!alreadyComplete && !cleanSweep && !targetReached) throw new Error('controller_complete_state_invalid');

  if (alreadyComplete || cleanSweep) {
    assertNoActiveWork(state);
  } else {
    if (state.active_instance) throw new Error('controller_complete_active_workflow_present');
    if (state.cloud_controller_intent) throw new Error('controller_complete_reserved_intent_present');
  }

  const nextState = structuredClone(state);
  nextState.status = 'complete';
  nextState.current = null;
  nextState.active_instance = null;
  nextState.pending_source_ids = [];
  nextState.acquisition_batch = 1;
  nextState.completed_at = nextState.completed_at || now.toISOString();
  nextState.completion_reason = nextState.completion_reason || (targetReached ? 'target_reached' : 'sweep_exhausted');
  nextState.updated_at = now.toISOString();
  return nextState;
}

export function blockCloudController(state, decision, now = new Date()) {
  if (!state || !decision || decision.action !== 'block') throw new Error('controller_block_decision_invalid');
  if (state.active_instance || state.cloud_controller_intent) throw new Error('controller_block_active_work_present');
  const reason = String(decision.reason || '').trim();
  if (!reason) throw new Error('controller_block_reason_missing');
  if (!['deferred_blocker', 'deferred_replay_attempts_exhausted'].includes(reason)) {
    throw new Error(`controller_block_reason_unsupported:${reason}`);
  }
  if (reason === 'deferred_blocker' && genuineBlockers(state).length < 1) throw new Error('controller_block_expected_blocker_missing');
  if (reason === 'deferred_replay_attempts_exhausted' && pendingDeferred(state).length < 1) throw new Error('controller_block_expected_deferred_missing');
  const nextState = structuredClone(state);
  nextState.status = 'blocked_deferred';
  nextState.blocked = {
    reason,
    blocker_count: genuineBlockers(state).length,
    deferred_count: pendingDeferred(state).length,
    previous_status: String(state.status || ''),
    blocked_at: now.toISOString()
  };
  nextState.updated_at = now.toISOString();
  return nextState;
}
