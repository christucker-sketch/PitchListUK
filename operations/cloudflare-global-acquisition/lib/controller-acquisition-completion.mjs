import { deferredUnitKey, resolveDeferredReplay } from '../../cloudflare-texas-acquisition/scripts/growth-controller-integrity.mjs';

function integer(value, name, { minimum = 0 } = {}) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum) throw new Error(`acquisition_completion_${name}_invalid`);
  return number;
}

function requirePublicationPr(result) {
  const prNumber = integer(result?.publication?.pr_number, 'data_pr', { minimum: 1 });
  return prNumber;
}

function resolveMatchingDeferredAcquisitionReplay(state, active, now = new Date()) {
  const inflight = state?.deferred_replay_inflight;
  if (!inflight) return null;
  if (inflight.mode !== 'acquire' || String(inflight.state_code || '') !== String(active.state_code || '')) {
    throw new Error('acquisition_completion_deferred_replay_identity_mismatch');
  }
  const key = String(inflight.key || deferredUnitKey(inflight));
  if (!key) throw new Error('acquisition_completion_deferred_replay_key_invalid');
  const resolved = resolveDeferredReplay(state, now);
  if (resolved !== key) throw new Error('acquisition_completion_deferred_replay_resolution_mismatch');
  state.resilience_events = Array.isArray(state.resilience_events) ? state.resilience_events : [];
  state.resilience_events.push({ at: now.toISOString(), reason: 'deferred_replay_succeeded', disposition: 'resolved', deferred_key: key, workflow_instance_id: active.id });
  if (state.resilience_events.length > 500) state.resilience_events.splice(0, state.resilience_events.length - 500);
  return key;
}

export function applyAcquisitionWorkflowCompletion(state, active, rawResult) {
  if (!state || typeof state !== 'object') throw new Error('acquisition_completion_state_missing');
  if (!active || active.mode !== 'acquire' || !active.id) throw new Error('acquisition_completion_active_invalid');
  if (!rawResult || typeof rawResult !== 'object' || Array.isArray(rawResult)) throw new Error('acquisition_completion_result_invalid');
  if (String(rawResult.state_code || '') !== String(active.state_code || '')) throw new Error('acquisition_completion_state_code_mismatch');

  const snapshotCount = integer(state.snapshot_count, 'snapshot_count');
  const before = integer(rawResult.before, 'before');
  const after = integer(rawResult.after, 'after');
  const additions = integer(rawResult.additions, 'additions');
  if (before !== snapshotCount) throw new Error(`acquisition_snapshot_drift:${before}:${snapshotCount}`);
  if (after !== before + additions) throw new Error(`acquisition_completion_count_delta_invalid:${before}:${additions}:${after}`);

  const nextState = structuredClone(state);
  const existing = Array.isArray(nextState.results)
    ? nextState.results.find(item => item?.instance_id === active.id)
    : null;
  const completed = existing || {
    ...rawResult,
    instance_id: active.id,
    worker_version: active.worker_version,
    worker_sha: active.worker_sha
  };
  nextState.results = Array.isArray(nextState.results) ? nextState.results : [];
  if (!existing) nextState.results.push(completed);
  nextState.active_instance = null;
  if (!nextState.current || String(nextState.current.state_code || '') !== String(active.state_code || '')) {
    throw new Error('acquisition_completion_current_checkpoint_mismatch');
  }
  nextState.current = { ...nextState.current, acquisition_instance_id: active.id };

  if (additions > 0) {
    nextState.current.data_pr = requirePublicationPr(completed);
    nextState.status = 'reviewing_data_pr';
  } else {
    nextState.acquisition_batch = integer(nextState.acquisition_batch || 1, 'batch', { minimum: 1 }) + 1;
    nextState.status = 'ready_acquisition';
  }

  const resolvedReplayKey = resolveMatchingDeferredAcquisitionReplay(nextState, active, new Date());
  nextState.updated_at = new Date().toISOString();

  return Object.freeze({
    next_state: nextState,
    completed_result: completed,
    additions,
    before,
    after,
    next_status: nextState.status,
    data_pr: additions > 0 ? Number(nextState.current.data_pr) : null,
    next_batch: additions === 0 ? Number(nextState.acquisition_batch) : null,
    resolved_replay_key: resolvedReplayKey
  });
}
