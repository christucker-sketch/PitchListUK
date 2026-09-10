import { growthPlanSize } from '../../cloudflare-texas-acquisition/src/us-growth-plan.js';
import { getStateConfig } from '../../cloudflare-texas-acquisition/src/us-state-registry.js';

function pendingDeferred(state) {
  return (Array.isArray(state?.deferred_units) ? state.deferred_units : [])
    .filter(item => item?.disposition === 'deferred_for_replay');
}

function deferredBlockers(state) {
  return (Array.isArray(state?.deferred_units) ? state.deferred_units : [])
    .filter(item => item?.disposition === 'genuine_blocker');
}

function selectDiscovery(state) {
  const order = Array.isArray(state?.priority_order) ? state.priority_order : [];
  if (!order.length) return null;
  const cursor = Number(state?.priority_cursor || 0);
  for (let checked = 0; checked < order.length; checked += 1) {
    const index = (cursor + checked) % order.length;
    const code = order[index];
    const scoped = getStateConfig(code);
    const offset = Number(state?.query_offsets?.[code] || 0);
    const size = growthPlanSize(scoped);
    if (offset < size) {
      return {
        action: 'trigger_discovery',
        mode: 'discover',
        state_code: code,
        state_name: scoped.name,
        query_offset: offset,
        query_limit: 4,
        plan_size: size,
        next_priority_cursor: (index + 1) % order.length
      };
    }
  }
  return null;
}

function deferredReplayDecision(state, pending, blockers, maximumReplayAttempts, exhaustedAction) {
  if (state.deferred_replay_inflight) {
    return {
      action: 'resume_deferred_replay',
      mode: state.deferred_replay_inflight.mode || null,
      state_code: state.deferred_replay_inflight.state_code || null,
      key: state.deferred_replay_inflight.key || null
    };
  }
  if (pending.length) {
    const candidate = pending.find(unit => Number(unit?.replay_attempts || 0) < maximumReplayAttempts);
    if (!candidate) return { action: 'block', reason: 'deferred_replay_attempts_exhausted', pending_count: pending.length };
    return {
      action: exhaustedAction,
      mode: candidate.mode || null,
      state_code: candidate.state_code || null,
      query_offset: candidate.query_offset ?? null,
      query_limit: candidate.query_limit ?? null,
      batch_number: candidate.batch_number ?? null,
      replay_attempts: Number(candidate.replay_attempts || 0)
    };
  }
  if (blockers.length) return { action: 'block', reason: 'deferred_blocker', blocker_count: blockers.length };
  return null;
}

export function shadowControllerDecision(state, options = {}) {
  if (!state || typeof state !== 'object') throw new Error('Controller state is required');
  const maximumReplayAttempts = Math.max(1, Number(options.maximumReplayAttempts ?? 3));
  const pending = pendingDeferred(state);
  const blockers = deferredBlockers(state);

  if (state.active_instance) {
    return {
      action: 'inspect_active_workflow',
      status: state.status,
      mode: state.active_instance.mode || state.current?.mode || null,
      state_code: state.active_instance.state_code || state.current?.state_code || null,
      instance_id: state.active_instance.id || null
    };
  }

  if (state.status === 'reviewing_source_pr') {
    return { action: 'review_source_pr', pr_number: state.current?.source_pr ?? null, state_code: state.current?.state_code ?? null };
  }
  if (state.status === 'reviewing_data_pr') {
    return { action: 'review_data_pr', pr_number: state.current?.data_pr ?? null, state_code: state.current?.state_code ?? null };
  }
  if (state.status === 'deploying_production') {
    return { action: 'verify_or_deploy_production', state_code: state.current?.state_code ?? null, sha: state.current?.pending_deploy?.sha ?? null };
  }
  if (state.status === 'waiting_for_live_consistency') {
    return {
      action: 'verify_live_consistency',
      state_code: state.current?.state_code ?? null,
      expected_count: state.current?.pending_deploy?.count ?? null,
      deployment_id: state.current?.live_consistency?.deployment_id ?? null
    };
  }
  if (state.status === 'blocked_deferred') {
    return { action: 'block', reason: 'deferred_blocker', blocker_count: blockers.length };
  }

  if (state.status === 'complete' || Number(state.snapshot_count) >= Number(state.target_count)) {
    const replay = deferredReplayDecision(state, pending, blockers, maximumReplayAttempts, 'schedule_deferred_replay');
    return replay || { action: 'complete' };
  }

  if (state.status === 'ready_acquisition') {
    return {
      action: 'trigger_acquisition_or_advance_batch',
      state_code: state.current?.state_code ?? null,
      batch_number: Number(state.acquisition_batch || 1),
      pending_source_count: Array.isArray(state.pending_source_ids) ? state.pending_source_ids.length : 0,
      source_ids: Array.isArray(state.pending_source_ids) ? [...state.pending_source_ids] : []
    };
  }

  if (state.status === 'ready') {
    const discovery = selectDiscovery(state);
    if (discovery) return discovery;
    const replay = deferredReplayDecision(state, pending, blockers, maximumReplayAttempts, 'schedule_deferred_replay_after_plan_exhaustion');
    return replay || { action: 'mark_sweep_complete' };
  }

  if (state.status === 'sweep_complete') return { action: 'complete' };
  return { action: 'block', reason: 'unsupported_controller_status', status: state.status ?? null };
}
