#!/usr/bin/env node

import fs from 'node:fs';

import { growthPlanSize } from '../../cloudflare-texas-acquisition/src/us-growth-plan.js';
import { getStateConfig } from '../../cloudflare-texas-acquisition/src/us-state-registry.js';

export function readLatestCompactStatus(logFile, maximumBytes = 512 * 1024) {
  try {
    const stat = fs.statSync(logFile);
    const start = Math.max(0, stat.size - maximumBytes);
    const fd = fs.openSync(logFile, 'r');
    try {
      const buffer = Buffer.alloc(stat.size - start);
      fs.readSync(fd, buffer, 0, buffer.length, start);
      const lines = buffer.toString('utf8').split(/\r?\n/).filter(Boolean);
      for (let index = lines.length - 1; index >= 0; index -= 1) {
        const line = lines[index].trim();
        if (!line.startsWith('{')) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed && typeof parsed === 'object' && parsed.status && parsed.sweep && Object.hasOwn(parsed, 'snapshot_count')) {
            return parsed;
          }
        } catch {
          // Ignore non-JSON or truncated controller-log lines.
        }
      }
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    // Observer reporting must remain fail-open relative to acquisition.
  }
  return null;
}

function timestamp(value) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function checkpointSweep(checkpoint, expectedStatesTotal) {
  const codes = Array.isArray(checkpoint?.priority_order) ? checkpoint.priority_order : [];
  const offsets = checkpoint?.query_offsets && typeof checkpoint.query_offsets === 'object'
    ? checkpoint.query_offsets
    : {};
  const currentCode = String(checkpoint?.current?.state_code || checkpoint?.active_instance?.state_code || '').toUpperCase();
  const completedStateCodes = [];
  let statesStarted = 0;

  for (const code of codes) {
    try {
      const offset = Math.max(0, Number(offsets[code] || 0));
      const planSize = growthPlanSize(getStateConfig(code));
      if (offset > 0 || currentCode === code) statesStarted += 1;
      if (offset >= planSize) completedStateCodes.push(code);
    } catch {
      // Fail open for observer reporting; unsupported states simply remain incomplete.
    }
  }

  const checkpointDeferred = Array.isArray(checkpoint?.deferred_units) ? checkpoint.deferred_units : [];
  const pendingCount = checkpointDeferred.filter((item) => item?.disposition === 'deferred_for_replay').length;
  const blockerCount = checkpointDeferred.filter((item) => item?.disposition === 'genuine_blocker').length;
  const replayInflight = checkpoint?.deferred_replay_inflight || null;
  const statesTotal = codes.length || null;
  const statesDiscoveryComplete = completedStateCodes.length;
  const nationwideComplete = checkpoint?.status === 'sweep_complete'
    && statesTotal === expectedStatesTotal
    && statesStarted === expectedStatesTotal
    && statesDiscoveryComplete === expectedStatesTotal
    && pendingCount === 0
    && blockerCount === 0
    && !replayInflight;

  return {
    sweep: {
      expected_states_total: expectedStatesTotal,
      states_total: statesTotal,
      states_started: statesStarted,
      states_discovery_complete: statesDiscoveryComplete,
      completed_state_codes: completedStateCodes,
      completed_state_count: completedStateCodes.length,
      sweep_completed_at: nationwideComplete ? checkpoint?.updated_at || null : null,
      nationwide_complete: nationwideComplete,
      completion_gap: Math.max(0, expectedStatesTotal - completedStateCodes.length)
    },
    deferred: {
      pending_count: pendingCount,
      blocker_count: blockerCount,
      replay_inflight: replayInflight
    }
  };
}

export function buildObserverStatus(checkpoint, operational, expectedStatesTotal = 50) {
  const checkpointUpdated = timestamp(checkpoint?.updated_at);
  const operationalUpdated = timestamp(operational?.updated_at);
  const checkpointIsFresher = Boolean(checkpoint)
    && (!operational || checkpointUpdated > operationalUpdated);
  const source = checkpointIsFresher ? checkpoint : (operational || checkpoint || {});

  let sweep;
  let deferred;
  if (checkpointIsFresher && Array.isArray(checkpoint?.priority_order) && checkpoint?.query_offsets) {
    ({ sweep, deferred } = checkpointSweep(checkpoint, expectedStatesTotal));
  } else {
    const legacySweep = operational?.sweep || checkpoint?.sweep || {};
    const completedStateCodes = Array.isArray(legacySweep.completed_state_codes) ? legacySweep.completed_state_codes : [];
    const checkpointDeferred = Array.isArray(checkpoint?.deferred_units) ? checkpoint.deferred_units : [];
    const pendingCount = Number.isFinite(Number(legacySweep.deferred_units))
      ? Number(legacySweep.deferred_units)
      : checkpointDeferred.filter((item) => item?.disposition === 'deferred_for_replay').length;
    const blockerCount = Number.isFinite(Number(legacySweep.deferred_blockers))
      ? Number(legacySweep.deferred_blockers)
      : checkpointDeferred.filter((item) => item?.disposition === 'genuine_blocker').length;
    const statesTotal = numberOrNull(legacySweep.states_total);
    const statesStarted = numberOrNull(legacySweep.states_started);
    const statesDiscoveryComplete = numberOrNull(legacySweep.states_discovery_complete);
    const nationwideComplete = source?.status === 'sweep_complete'
      && statesTotal === expectedStatesTotal
      && statesStarted === expectedStatesTotal
      && statesDiscoveryComplete === expectedStatesTotal
      && completedStateCodes.length === expectedStatesTotal
      && pendingCount === 0
      && blockerCount === 0
      && !legacySweep.replay_inflight;

    sweep = {
      expected_states_total: expectedStatesTotal,
      states_total: statesTotal,
      states_started: statesStarted,
      states_discovery_complete: statesDiscoveryComplete,
      completed_state_codes: completedStateCodes,
      completed_state_count: completedStateCodes.length,
      sweep_completed_at: legacySweep.sweep_completed_at || null,
      nationwide_complete: nationwideComplete,
      completion_gap: nationwideComplete ? 0 : Math.max(0, expectedStatesTotal - completedStateCodes.length)
    };
    deferred = {
      pending_count: pendingCount,
      blocker_count: blockerCount,
      replay_inflight: legacySweep.replay_inflight || null
    };
  }

  return {
    controller_status: source?.status || null,
    market: 'US',
    snapshot_count: numberOrNull(source?.snapshot_count ?? checkpoint?.snapshot_count),
    live_api_count: numberOrNull(source?.live_api_count ?? checkpoint?.live_api_count),
    target_count: numberOrNull(source?.target_count ?? checkpoint?.target_count),
    approved_source_count: numberOrNull(source?.approved_source_count ?? checkpoint?.approved_source_count),
    current: source?.current || null,
    sweep,
    deferred,
    active_instance: source?.active_instance || null,
    last_result: source?.last_result || checkpoint?.last_result || operational?.last_result || null,
    last_deployment: source?.last_deployment || checkpoint?.last_deployment || operational?.last_deployment || null,
    last_resilience_event: source?.last_resilience_event || checkpoint?.last_resilience_event || operational?.last_resilience_event || null,
    worker_sha: source?.worker_sha || checkpoint?.worker_sha || operational?.worker_sha || null,
    worker_version: source?.worker_version || checkpoint?.worker_version || operational?.worker_version || null,
    checkpoint_updated_at: checkpoint?.updated_at || source?.updated_at || null,
    status_source: checkpointIsFresher ? 'controller_checkpoint' : (operational ? 'controller_compact_log' : 'controller_checkpoint')
  };
}
