#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const stateFile = process.env.FINDPITCHES_CONTROLLER_STATE
  || path.join(os.homedir(), '.local/state/findpitches-us-growth/controller.json');
const controllerLog = process.env.FINDPITCHES_CONTROLLER_LOG
  || path.join(os.homedir(), '.local/state/findpitches-us-growth/controller.log');
const reporterStateFile = process.env.FINDPITCHES_OBSERVER_REPORTER_STATE
  || path.join(os.homedir(), '.local/state/findpitches-observer/reporter.json');
const observerUrl = String(process.env.FINDPITCHES_OBSERVER_URL || '').replace(/\/$/, '');
const ingestToken = String(process.env.FINDPITCHES_OBSERVER_TOKEN || '');
const source = String(process.env.FINDPITCHES_OBSERVER_SOURCE || 'hal-us-growth');

if (!observerUrl) throw new Error('FINDPITCHES_OBSERVER_URL is required');
if (!ingestToken) throw new Error('FINDPITCHES_OBSERVER_TOKEN is required');

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function cleanText(value, maximum = 2000) {
  return String(value || '')
    .replace(/\u001b\[[0-9;]*m/g, '')
    .replace(/(?:ghp|github_pat|sk|xox[baprs])-[-A-Za-z0-9_]{12,}/g, '[REDACTED_TOKEN]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .slice(0, maximum);
}

function summarize(state) {
  const current = state?.current || null;
  const sweep = state?.sweep || {};
  const pending = Array.isArray(state?.deferred_units)
    ? state.deferred_units.filter((x) => x?.disposition === 'deferred_for_replay')
    : [];
  const blockers = Array.isArray(state?.deferred_units)
    ? state.deferred_units.filter((x) => x?.disposition === 'genuine_blocker')
    : [];

  return {
    controller_status: state?.status || null,
    market: 'US',
    snapshot_count: numberOrNull(state?.snapshot_count),
    live_api_count: numberOrNull(state?.live_api_count),
    target_count: numberOrNull(state?.target_count),
    approved_source_count: numberOrNull(state?.approved_source_count),
    current: current ? {
      mode: current.mode || null,
      state_code: current.state_code || null,
      query_offset: numberOrNull(current.query_offset),
      query_limit: numberOrNull(current.query_limit),
      plan_size: numberOrNull(current.plan_size),
      source_pr: numberOrNull(current.source_pr),
      data_pr: numberOrNull(current.data_pr),
      discovery_instance_id: current.discovery_instance_id || null,
      acquisition_instance_id: current.acquisition_instance_id || null,
      pending_deploy: current.pending_deploy ? {
        sha: current.pending_deploy.sha || null,
        count: numberOrNull(current.pending_deploy.count),
        additions: numberOrNull(current.pending_deploy.additions),
        pr_number: numberOrNull(current.pending_deploy.pr_number)
      } : null
    } : null,
    sweep: {
      states_total: numberOrNull(sweep.states_total),
      states_started: numberOrNull(sweep.states_started),
      states_discovery_complete: numberOrNull(sweep.states_discovery_complete),
      completed_state_codes: Array.isArray(sweep.completed_state_codes) ? sweep.completed_state_codes : [],
      sweep_completed_at: sweep.sweep_completed_at || null
    },
    deferred: {
      pending_count: pending.length,
      blocker_count: blockers.length,
      replay_inflight: sweep.replay_inflight ? {
        mode: sweep.replay_inflight.mode || null,
        state_code: sweep.replay_inflight.state_code || null,
        query_offset: numberOrNull(sweep.replay_inflight.query_offset),
        query_limit: numberOrNull(sweep.replay_inflight.query_limit),
        batch_number: numberOrNull(sweep.replay_inflight.batch_number),
        replay_attempts: numberOrNull(sweep.replay_inflight.replay_attempts),
        key: sweep.replay_inflight.key || null
      } : null
    },
    last_result: state?.last_result ? {
      state_code: state.last_result.state_code || null,
      mode: state.last_result.mode || null,
      additions: numberOrNull(state.last_result.additions),
      before: numberOrNull(state.last_result.before),
      after: numberOrNull(state.last_result.after),
      instance_id: state.last_result.instance_id || null,
      pr_number: numberOrNull(state.last_result?.publication?.pr_number)
    } : null,
    last_deployment: state?.last_deployment ? {
      deployment_id: state.last_deployment.deployment_id || null,
      production_sha: state.last_deployment.production_sha || null,
      live_api_count: numberOrNull(state.last_deployment.live_api_count),
      state_code: state.last_deployment.state_code || null,
      additions: numberOrNull(state.last_deployment.additions),
      pr_number: numberOrNull(state.last_deployment.pr_number),
      deployed_at: state.last_deployment.deployed_at || null
    } : null,
    last_resilience_event: state?.last_resilience_event || null,
    checkpoint_updated_at: state?.updated_at || null
  };
}

function readNewLogLines(logFile, previousOffset) {
  try {
    const stat = fs.statSync(logFile);
    const safeOffset = previousOffset >= 0 && previousOffset <= stat.size ? previousOffset : 0;
    const length = stat.size - safeOffset;
    if (length <= 0) return { nextOffset: stat.size, lines: [] };

    const maximumBytes = 256 * 1024;
    const start = length > maximumBytes ? stat.size - maximumBytes : safeOffset;
    const fd = fs.openSync(logFile, 'r');
    try {
      const buffer = Buffer.alloc(stat.size - start);
      fs.readSync(fd, buffer, 0, buffer.length, start);
      const text = buffer.toString('utf8');
      const lines = text.split(/\r?\n/).filter(Boolean).slice(-200);
      return { nextOffset: stat.size, lines };
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return { nextOffset: previousOffset || 0, lines: [] };
  }
}

async function main() {
  const controller = readJson(stateFile);
  if (!controller) throw new Error(`Unable to read controller checkpoint: ${stateFile}`);

  const reporterState = readJson(reporterStateFile, { log_offset: 0 });
  const log = readNewLogLines(controllerLog, Number(reporterState.log_offset || 0));
  const observedAt = new Date().toISOString();

  const events = log.lines.map((line) => ({
    observed_at: observedAt,
    level: /blocked|failed|error|refusing/i.test(line) ? 'warn' : 'info',
    event_type: 'controller_log',
    message: cleanText(line)
  }));

  if (!events.length) {
    events.push({
      observed_at: observedAt,
      level: 'info',
      event_type: 'heartbeat',
      message: `Controller heartbeat: ${controller.status || 'unknown'}`
    });
  }

  const response = await fetch(`${observerUrl}/ingest`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${ingestToken}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      source,
      observed_at: observedAt,
      status: summarize(controller),
      events
    })
  });

  if (!response.ok) {
    throw new Error(`Observer ingest failed: HTTP ${response.status} ${cleanText(await response.text())}`);
  }

  fs.mkdirSync(path.dirname(reporterStateFile), { recursive: true, mode: 0o700 });
  const temporary = `${reporterStateFile}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify({ log_offset: log.nextOffset, last_sent_at: observedAt }, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(temporary, reporterStateFile);

  process.stdout.write(`${await response.text()}\n`);
}

main().catch((error) => {
  process.stderr.write(`${cleanText(error?.stack || error)}\n`);
  process.exitCode = 1;
});
