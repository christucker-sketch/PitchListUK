#!/usr/bin/env node

import fs from 'node:fs';

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

export function buildObserverStatus(checkpoint, operational, expectedStatesTotal = 50) {
  const source = operational || checkpoint || {};
  const sweep = operational?.sweep || checkpoint?.sweep || {};
  const completedStateCodes = Array.isArray(sweep.completed_state_codes) ? sweep.completed_state_codes : [];

  const checkpointDeferred = Array.isArray(checkpoint?.deferred_units) ? checkpoint.deferred_units : [];
  const pendingCount = Number.isFinite(Number(sweep.deferred_units))
    ? Number(sweep.deferred_units)
    : checkpointDeferred.filter((item) => item?.disposition === 'deferred_for_replay').length;
  const blockerCount = Number.isFinite(Number(sweep.deferred_blockers))
    ? Number(sweep.deferred_blockers)
    : checkpointDeferred.filter((item) => item?.disposition === 'genuine_blocker').length;

  const numberOrNull = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  };

  const statesTotal = numberOrNull(sweep.states_total);
  const statesStarted = numberOrNull(sweep.states_started);
  const statesDiscoveryComplete = numberOrNull(sweep.states_discovery_complete);
  const nationwideComplete = source?.status === 'sweep_complete'
    && statesTotal === expectedStatesTotal
    && statesStarted === expectedStatesTotal
    && statesDiscoveryComplete === expectedStatesTotal
    && completedStateCodes.length === expectedStatesTotal
    && pendingCount === 0
    && blockerCount === 0
    && !sweep.replay_inflight;

  return {
    controller_status: source?.status || checkpoint?.status || null,
    market: 'US',
    snapshot_count: numberOrNull(source?.snapshot_count ?? checkpoint?.snapshot_count),
    live_api_count: numberOrNull(source?.live_api_count ?? checkpoint?.live_api_count),
    target_count: numberOrNull(source?.target_count ?? checkpoint?.target_count),
    approved_source_count: numberOrNull(source?.approved_source_count ?? checkpoint?.approved_source_count),
    current: source?.current || checkpoint?.current || null,
    sweep: {
      expected_states_total: expectedStatesTotal,
      states_total: statesTotal,
      states_started: statesStarted,
      states_discovery_complete: statesDiscoveryComplete,
      completed_state_codes: completedStateCodes,
      completed_state_count: completedStateCodes.length,
      sweep_completed_at: sweep.sweep_completed_at || null,
      nationwide_complete: nationwideComplete,
      completion_gap: nationwideComplete ? 0 : Math.max(0, expectedStatesTotal - completedStateCodes.length)
    },
    deferred: {
      pending_count: pendingCount,
      blocker_count: blockerCount,
      replay_inflight: sweep.replay_inflight || null
    },
    active_instance: source?.active_instance || checkpoint?.active_instance || null,
    last_result: source?.last_result || checkpoint?.last_result || null,
    last_deployment: source?.last_deployment || checkpoint?.last_deployment || null,
    last_resilience_event: source?.last_resilience_event || checkpoint?.last_resilience_event || null,
    worker_sha: source?.worker_sha || checkpoint?.worker_sha || null,
    worker_version: source?.worker_version || checkpoint?.worker_version || null,
    checkpoint_updated_at: source?.updated_at || checkpoint?.updated_at || null,
    status_source: operational ? 'controller_compact_log' : 'controller_checkpoint'
  };
}
