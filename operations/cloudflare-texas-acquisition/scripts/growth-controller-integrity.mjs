import { growthPlanSize } from '../src/us-growth-plan.js';
import { getStateConfig } from '../src/us-state-registry.js';

export function deferredUnitKey(unit = {}) {
  const mode = String(unit.mode || '');
  const stateCode = String(unit.state_code || '');
  if (!mode || !stateCode) return '';
  if (mode === 'discover') return `${mode}:${stateCode}:${Number(unit.query_offset ?? -1)}:${Number(unit.query_limit ?? 2)}`;
  if (mode === 'acquire') return `${mode}:${stateCode}:${Number(unit.batch_number ?? -1)}`;
  return '';
}

export function upsertDeferredUnit(state, event, maximum = 500) {
  state.deferred_units = Array.isArray(state.deferred_units) ? state.deferred_units : [];
  const key = deferredUnitKey(event);
  if (!key) throw new Error('Deferred unit has no stable identity');
  const index = state.deferred_units.findIndex(item => deferredUnitKey(item) === key);
  const previous = index >= 0 ? state.deferred_units[index] : null;
  const next = {
    ...(previous || {}),
    ...event,
    replay_attempts: Number(previous?.replay_attempts || 0),
    first_deferred_at: previous?.first_deferred_at || event.at,
    last_deferred_at: event.at,
    disposition: 'deferred_for_replay'
  };
  if (index >= 0) state.deferred_units[index] = next;
  else state.deferred_units.push(next);
  if (state.deferred_units.length > maximum) state.deferred_units.splice(0, state.deferred_units.length - maximum);
  return next;
}

export function scheduleNextDeferredReplay(state, now = new Date(), options = {}) {
  if (state.deferred_replay_inflight) return { scheduled: false, reason: 'replay_already_inflight', unit: state.deferred_replay_inflight };
  const maximumAttempts = Math.max(1, Number(options.maximumAttempts ?? 3));
  state.deferred_units = Array.isArray(state.deferred_units) ? state.deferred_units : [];

  let unit = null;
  let exhaustedUnit = null;
  for (const candidate of state.deferred_units) {
    if (candidate.disposition !== 'deferred_for_replay') continue;
    const attempts = Number(candidate.replay_attempts || 0);
    if (attempts >= maximumAttempts) {
      candidate.disposition = 'genuine_blocker';
      candidate.blocked_at = now.toISOString();
      candidate.blocker_reason = `Deferred unit failed ${attempts} replay attempt(s)`;
      exhaustedUnit ||= candidate;
      continue;
    }
    unit = candidate;
    break;
  }

  if (!unit) {
    if (exhaustedUnit) {
      state.status = 'blocked_deferred';
      return { scheduled: false, reason: 'replay_attempts_exhausted', unit: exhaustedUnit };
    }
    return { scheduled: false, reason: 'no_deferred_units' };
  }

  const attempts = Number(unit.replay_attempts || 0);
  unit.replay_attempts = attempts + 1;
  unit.last_replay_at = now.toISOString();
  const key = deferredUnitKey(unit);
  state.deferred_replay_inflight = { ...unit, key, replay_started_at: now.toISOString() };
  state.active_instance = null;

  if (unit.mode === 'discover') {
    const code = unit.state_code;
    const offset = Number(unit.query_offset);
    if (!code || !Number.isInteger(offset) || offset < 0) throw new Error('Deferred discovery unit is malformed');
    state.query_offsets = state.query_offsets || {};
    state.query_offsets[code] = offset;
    if (!Array.isArray(state.priority_order) || !state.priority_order.includes(code)) throw new Error(`Deferred discovery state ${code} is not in the priority order`);
    state.priority_cursor = state.priority_order.indexOf(code);
    state.current = null;
    state.pending_source_ids = [];
    state.acquisition_batch = 1;
    state.status = 'ready';
    return { scheduled: true, unit: state.deferred_replay_inflight };
  }

  if (unit.mode === 'acquire') {
    const code = unit.state_code;
    const sourceIds = Array.isArray(unit.source_ids) ? unit.source_ids.filter(Boolean) : [];
    const batch = Number(unit.batch_number || 1);
    if (!code || !sourceIds.length || !Number.isInteger(batch) || batch < 1) throw new Error('Deferred acquisition unit is missing its exact source checkpoint');
    state.current = {
      mode: 'discover',
      state_code: code,
      query_offset: Number.isInteger(Number(unit.query_offset)) ? Number(unit.query_offset) : null,
      replay_deferred_key: key
    };
    state.pending_source_ids = [...sourceIds];
    state.acquisition_batch = batch;
    state.status = 'ready_acquisition';
    return { scheduled: true, unit: state.deferred_replay_inflight };
  }

  throw new Error(`Unsupported deferred replay mode ${unit.mode}`);
}

export function resolveDeferredReplay(state, now = new Date()) {
  const inflight = state.deferred_replay_inflight;
  if (!inflight) return null;
  const key = inflight.key || deferredUnitKey(inflight);
  state.deferred_units = (Array.isArray(state.deferred_units) ? state.deferred_units : []).filter(item => deferredUnitKey(item) !== key);
  state.resolved_deferred_units = Array.isArray(state.resolved_deferred_units) ? state.resolved_deferred_units : [];
  state.resolved_deferred_units.push({ ...inflight, resolved_at: now.toISOString(), disposition: 'replayed_successfully' });
  if (state.resolved_deferred_units.length > 500) state.resolved_deferred_units.splice(0, state.resolved_deferred_units.length - 500);
  state.deferred_replay_inflight = null;
  return key;
}

export function pendingDeferredUnits(state) {
  return (Array.isArray(state?.deferred_units) ? state.deferred_units : []).filter(item => item.disposition === 'deferred_for_replay');
}

export function deferredBlockers(state) {
  return (Array.isArray(state?.deferred_units) ? state.deferred_units : []).filter(item => item.disposition === 'genuine_blocker');
}

export function buildOperationalStatus(state) {
  const order = Array.isArray(state.priority_order) ? state.priority_order : [];
  const stateProgress = order.map(code => {
    const offset = Number(state.query_offsets?.[code] || 0);
    let planSize = null;
    try {
      planSize = growthPlanSize(getStateConfig(code));
    } catch {
      planSize = null;
    }
    return {
      state_code: code,
      query_offset: offset,
      plan_size: planSize,
      discovery_complete: Number.isInteger(planSize) ? offset >= planSize : false
    };
  });
  const fullyDiscovered = stateProgress.filter(item => item.discovery_complete).map(item => item.state_code);
  const started = stateProgress.filter(item => item.query_offset > 0).map(item => item.state_code);
  const deferred = pendingDeferredUnits(state);
  const blockers = deferredBlockers(state);
  const events = Array.isArray(state.resilience_events) ? state.resilience_events : [];
  return {
    status: state.status,
    sweep: {
      states_total: order.length,
      states_started: started.length,
      states_discovery_complete: fullyDiscovered.length,
      completed_state_codes: fullyDiscovered,
      deferred_units: deferred.length,
      deferred_blockers: blockers.length,
      replay_inflight: state.deferred_replay_inflight || null,
      sweep_completed_at: state.sweep_completed_at || null
    },
    snapshot_count: state.snapshot_count,
    target_count: state.target_count,
    live_api_count: state.live_api_count,
    approved_source_count: state.approved_source_count,
    worker_sha: state.worker_sha,
    worker_version: state.worker_version,
    current: state.current,
    active_instance: state.active_instance,
    last_result: Array.isArray(state.results) ? state.results.at(-1) || null : null,
    last_deployment: Array.isArray(state.deployments) ? state.deployments.at(-1) || null : null,
    last_resilience_event: events.at(-1) || null,
    deferred_queue: deferred,
    deferred_blocker_queue: blockers,
    updated_at: state.updated_at
  };
}
