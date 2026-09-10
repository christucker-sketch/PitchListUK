import {
  deferredBlockers,
  deferredUnitKey,
  pendingDeferredUnits,
  resolveDeferredReplay,
  scheduleNextDeferredReplay
} from '../../cloudflare-texas-acquisition/scripts/growth-controller-integrity.mjs';

function integer(value, error, { minimum = 0 } = {}) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum) throw new Error(error);
  return number;
}

function string(value) {
  return String(value ?? '').trim();
}

function exactReplayCandidate(state, maximumAttempts) {
  return pendingDeferredUnits(state).find(unit => Number(unit?.replay_attempts || 0) < maximumAttempts) || null;
}

function assertDecisionMatchesUnit(decision, unit) {
  const mode = string(unit?.mode);
  const stateCode = string(unit?.state_code);
  if (!mode || !stateCode) throw new Error('deferred_replay_candidate_identity_invalid');
  if (string(decision?.mode) !== mode || string(decision?.state_code) !== stateCode) throw new Error('deferred_replay_decision_identity_mismatch');
  if (Number(decision?.replay_attempts || 0) !== Number(unit?.replay_attempts || 0)) throw new Error('deferred_replay_decision_attempt_mismatch');

  if (mode === 'discover') {
    if (integer(decision?.query_offset, 'deferred_replay_decision_query_offset_invalid') !== integer(unit?.query_offset, 'deferred_replay_candidate_query_offset_invalid')) {
      throw new Error('deferred_replay_decision_query_offset_mismatch');
    }
    const candidateLimit = Number(unit?.query_limit ?? 2);
    const decisionLimit = Number(decision?.query_limit ?? 2);
    if (!Number.isInteger(candidateLimit) || candidateLimit < 1 || decisionLimit !== candidateLimit) throw new Error('deferred_replay_decision_query_limit_mismatch');
  } else if (mode === 'acquire') {
    if (integer(decision?.batch_number, 'deferred_replay_decision_batch_invalid', { minimum: 1 }) !== integer(unit?.batch_number, 'deferred_replay_candidate_batch_invalid', { minimum: 1 })) {
      throw new Error('deferred_replay_decision_batch_mismatch');
    }
  } else {
    throw new Error(`deferred_replay_mode_unsupported:${mode || 'unknown'}`);
  }
}

function maximumAttemptsValue(value) {
  const maximum = Number(value ?? 3);
  if (!Number.isInteger(maximum) || maximum < 1 || maximum > 20) throw new Error('deferred_replay_maximum_attempts_invalid');
  return maximum;
}

function bindEnrichedAcquisitionCheckpoint(nextState, candidate) {
  const sourcePr = Number(candidate?.source_pr || candidate?.source_pr_number);
  const provenance = candidate?.replay_source_provenance;
  if (!Number.isInteger(sourcePr) || sourcePr <= 0) throw new Error('deferred_acquisition_replay_source_pr_not_enriched');
  if (!provenance || !/^[a-f0-9]{40}$/i.test(String(provenance.registry_blob_sha || '')) || !/^[a-f0-9]{40}$/i.test(String(provenance.deployment_anchor_sha || ''))) {
    throw new Error('deferred_acquisition_replay_provenance_not_enriched');
  }
  const expectedIds = [...(Array.isArray(candidate?.source_ids) ? candidate.source_ids : [])].map(String).sort();
  const provenIds = [...(Array.isArray(provenance.source_ids) ? provenance.source_ids : [])].map(String).sort();
  if (!expectedIds.length || JSON.stringify(expectedIds) !== JSON.stringify(provenIds)) throw new Error('deferred_acquisition_replay_provenance_ids_mismatch');
  nextState.current = {
    ...(nextState.current || {}),
    source_pr: sourcePr,
    replay_source_provenance: structuredClone(provenance)
  };
}

export function scheduleCloudDeferredReplay(state, decision, now = new Date(), options = {}) {
  if (!state || !decision || !['schedule_deferred_replay', 'schedule_deferred_replay_after_plan_exhaustion'].includes(decision.action)) {
    throw new Error('deferred_replay_schedule_decision_invalid');
  }
  if (state.deferred_replay_inflight) throw new Error('deferred_replay_schedule_inflight_present');
  const maximumAttempts = maximumAttemptsValue(options.maximumAttempts);
  const candidate = exactReplayCandidate(state, maximumAttempts);
  if (!candidate) throw new Error('deferred_replay_schedule_candidate_missing');
  assertDecisionMatchesUnit(decision, candidate);
  const expectedKey = deferredUnitKey(candidate);
  if (!expectedKey) throw new Error('deferred_replay_candidate_key_invalid');

  const nextState = structuredClone(state);
  const replay = scheduleNextDeferredReplay(nextState, now, { maximumAttempts });
  if (replay?.scheduled !== true || !replay?.unit) throw new Error(`deferred_replay_schedule_failed:${replay?.reason || 'unknown'}`);
  if (string(replay.unit.key) !== expectedKey) throw new Error('deferred_replay_schedule_key_mismatch');
  if (replay.unit.mode === 'acquire') bindEnrichedAcquisitionCheckpoint(nextState, candidate);
  nextState.updated_at = now.toISOString();
  return Object.freeze({ next_state: nextState, unit: structuredClone(replay.unit), key: expectedKey });
}

export function resolveCloudDeferredReplay(state, decision, now = new Date()) {
  if (!state || !decision || decision.action !== 'resume_deferred_replay') throw new Error('deferred_replay_resume_decision_invalid');
  const inflight = state.deferred_replay_inflight;
  if (!inflight) throw new Error('deferred_replay_resume_inflight_missing');
  const key = string(inflight.key || deferredUnitKey(inflight));
  if (!key) throw new Error('deferred_replay_resume_key_invalid');
  if (string(decision.key) !== key || string(decision.mode) !== string(inflight.mode) || string(decision.state_code) !== string(inflight.state_code)) {
    throw new Error('deferred_replay_resume_identity_mismatch');
  }

  const nextState = structuredClone(state);
  const resolved = resolveDeferredReplay(nextState, now);
  if (resolved !== key) throw new Error('deferred_replay_resume_resolution_mismatch');
  nextState.updated_at = now.toISOString();
  return Object.freeze({ next_state: nextState, key });
}

export function resolveCloudDeferredReplayAfterWorkflowSuccess(state, active, now = new Date()) {
  const inflight = state?.deferred_replay_inflight;
  if (!inflight) return Object.freeze({ next_state: structuredClone(state), key: null, resolved: false });
  const mode = string(inflight.mode);
  const stateCode = string(inflight.state_code).toUpperCase();
  if (!active || string(active.mode) !== mode || string(active.state_code).toUpperCase() !== stateCode) {
    throw new Error('deferred_replay_workflow_success_identity_mismatch');
  }
  const key = string(inflight.key || deferredUnitKey(inflight));
  if (!key) throw new Error('deferred_replay_workflow_success_key_invalid');
  const nextState = structuredClone(state);
  const resolvedKey = resolveDeferredReplay(nextState, now);
  if (resolvedKey !== key) throw new Error('deferred_replay_workflow_success_resolution_mismatch');
  nextState.updated_at = now.toISOString();
  return Object.freeze({ next_state: nextState, key, resolved: true });
}

export function quarantineCloudDeferredReplayExhausted(state, decision, now = new Date(), options = {}) {
  if (!state || !decision || decision.action !== 'block' || decision.reason !== 'deferred_replay_attempts_exhausted') {
    throw new Error('deferred_replay_quarantine_decision_invalid');
  }
  if (state.deferred_replay_inflight) throw new Error('deferred_replay_quarantine_inflight_present');
  const maximumAttempts = maximumAttemptsValue(options.maximumAttempts);
  const pending = pendingDeferredUnits(state);
  if (!pending.length) throw new Error('deferred_replay_quarantine_pending_missing');
  if (pending.some(unit => Number(unit?.replay_attempts || 0) < maximumAttempts)) throw new Error('deferred_replay_quarantine_recoverable_candidate_present');

  const nextState = structuredClone(state);
  const replay = scheduleNextDeferredReplay(nextState, now, { maximumAttempts });
  if (replay?.scheduled === true) throw new Error('deferred_replay_quarantine_stale_decision');
  if (replay?.reason !== 'replay_attempts_exhausted') throw new Error(`deferred_replay_quarantine_failed:${replay?.reason || 'unknown'}`);
  const blockers = deferredBlockers(nextState);
  if (!blockers.length) throw new Error('deferred_replay_quarantine_blocker_missing');
  if (pendingDeferredUnits(nextState).length) throw new Error('deferred_replay_quarantine_pending_remains');

  nextState.blocked = {
    reason: 'deferred_replay_attempts_exhausted',
    blocker_count: blockers.length,
    deferred_count: 0,
    previous_status: string(state.status),
    blocked_at: now.toISOString()
  };
  nextState.status = 'blocked_deferred';
  nextState.updated_at = now.toISOString();
  return Object.freeze({ next_state: nextState, blocker_count: blockers.length });
}
