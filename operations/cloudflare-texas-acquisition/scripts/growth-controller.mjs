#!/usr/bin/env node

import childProcess from 'node:child_process';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  safeNotifyFailureFromEnvironment,
  safeNotifyRecoveryFromEnvironment
} from '../../acquisition-notifications/notifier.mjs';

const originalExecFileSync = childProcess.execFileSync;
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const coreControllerPath = path.join(scriptDirectory, 'growth-controller-core.mjs');
const defaultStateFile = path.join(os.homedir(), '.local/state/findpitches-us-growth/controller.json');
let lastTriggerFailureIntent = null;

function stripAnsi(value) {
  return String(value || '').replace(/\u001b\[[0-9;]*m/g, '');
}

function sleep(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function isWorkflowDescribe(command, args) {
  if (command !== 'npx' || !Array.isArray(args)) return false;
  const index = args.indexOf('workflows');
  return index >= 0 && args[index + 1] === 'instances' && args[index + 2] === 'describe';
}

function isWorkflowTrigger(command, args) {
  if (command !== 'npx' || !Array.isArray(args)) return false;
  const index = args.indexOf('workflows');
  return index >= 0 && args[index + 1] === 'trigger';
}

function triggerIntent(args) {
  const index = Array.isArray(args) ? args.indexOf('--params') : -1;
  if (index < 0 || !args[index + 1]) return null;
  try {
    const params = JSON.parse(args[index + 1]);
    return {
      mode: String(params?.mode || ''),
      state_code: String(params?.state_code || ''),
      query_offset: Number.isFinite(Number(params?.query_offset)) ? Number(params.query_offset) : null,
      query_limit: Number.isFinite(Number(params?.query_limit)) ? Number(params.query_limit) : null,
      batch_number: Number.isFinite(Number(params?.batch_number)) ? Number(params.batch_number) : null
    };
  } catch {
    return null;
  }
}

export function isTransientWorkflowDescribeError(error) {
  const text = stripAnsi([
    error?.message,
    error?.stderr,
    error?.stdout
  ].filter(Boolean).join('\n'));
  return /workflows\.api\.error\.internal_server|code:\s*10001|ECONNRESET|ETIMEDOUT|EAI_AGAIN|fetch failed|socket hang up/i.test(text);
}

export function workflowDescribeBackoffMilliseconds(attempt, options = {}) {
  const base = Math.max(1000, Number(options.baseMs ?? 5000));
  const maximum = Math.max(base, Number(options.maximumMs ?? 60000));
  return Math.min(maximum, base * (2 ** Math.max(0, Number(attempt || 1) - 1)));
}

function assertCoreControllerSafetyContracts(source) {
  const waitingStateMarker = "if (state.status === 'waiting_for_live_consistency')";
  const waitingCheckpointMarker = 'saveState(stateFile, state)';
  const readyAcquisitionMarker = "if (state.status === 'ready_acquisition')";
  const dirtyDeploymentMarker = 'Deployment left unexpected repository changes';
  const forbiddenNextWorkflowCall = 'trigger' + 'Workflow';

  const waitingStart = source.indexOf(waitingStateMarker);
  const readyStart = source.indexOf(readyAcquisitionMarker, waitingStart);
  const waitingBranch = waitingStart >= 0 && readyStart > waitingStart
    ? source.slice(waitingStart, readyStart)
    : '';

  if (!waitingBranch.includes(waitingCheckpointMarker) || waitingBranch.includes(forbiddenNextWorkflowCall)) {
    throw new Error('Growth controller core lost the waiting-for-live-consistency checkpoint safety contract');
  }
  if (!source.includes(dirtyDeploymentMarker)) {
    throw new Error('Growth controller core lost the unexpected deployment dirtiness fail-closed contract');
  }
}

childProcess.execFileSync = function resilientExecFileSync(command, args, options) {
  const workflowDescribe = isWorkflowDescribe(command, args);
  const workflowTrigger = isWorkflowTrigger(command, args);
  if (!workflowDescribe && !workflowTrigger) return originalExecFileSync(command, args, options);

  if (workflowTrigger) {
    try {
      const output = originalExecFileSync(command, args, options);
      lastTriggerFailureIntent = null;
      return output;
    } catch (error) {
      if (isTransientWorkflowDescribeError(error)) lastTriggerFailureIntent = triggerIntent(args);
      throw error;
    }
  }

  const maxRetries = Math.max(1, Number(
    process.env.PITCHLIST_GROWTH_WORKFLOW_API_RETRIES
      || process.env.PITCHLIST_GROWTH_WORKFLOW_DESCRIBE_RETRIES
      || 6
  ));
  let failures = 0;
  for (;;) {
    try {
      return originalExecFileSync(command, args, options);
    } catch (error) {
      if (!isTransientWorkflowDescribeError(error) || failures >= maxRetries) throw error;
      failures += 1;
      const delay = workflowDescribeBackoffMilliseconds(failures);
      process.stderr.write(`Transient Cloudflare Workflow describe failure; retry ${failures}/${maxRetries} in ${delay}ms\n`);
      sleep(delay);
    }
  }
};

const coreControllerSource = fs.readFileSync(coreControllerPath, 'utf8');
assertCoreControllerSafetyContracts(coreControllerSource);
syncBuiltinESMExports();
const core = await import('./growth-controller-core.mjs');

export const reconcileRepositoryMain = core.reconcileRepositoryMain;
export const parseCompactWorkflowOutput = core.parseCompactWorkflowOutput;
export const validateSourcePr = core.validateSourcePr;
export const parseUsOpportunitySnapshot = core.parseUsOpportunitySnapshot;
export const readLiveOpportunityConsistency = core.readLiveOpportunityConsistency;
export const classifyLiveConsistency = core.classifyLiveConsistency;
export const liveConsistencyBackoffMilliseconds = core.liveConsistencyBackoffMilliseconds;
export const assertLiveConsistencyWithinDeadline = core.assertLiveConsistencyWithinDeadline;
export const cleanupGeneratedDeploymentArtifacts = core.cleanupGeneratedDeploymentArtifacts;
export const initialState = core.initialState;
export const compactStatus = core.compactStatus;

function argumentValue(args, name, fallback = null) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}

function readControllerState(stateFile) {
  return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
}

function writeControllerState(stateFile, state) {
  state.updated_at = new Date().toISOString();
  fs.mkdirSync(path.dirname(stateFile), { recursive: true, mode: 0o700 });
  const temporary = `${stateFile}.${process.pid}.resilience.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, stateFile);
}

function boundedPush(target, value, maximum = 500) {
  target.push(value);
  if (target.length > maximum) target.splice(0, target.length - maximum);
}

function normalizedErrorText(error) {
  return stripAnsi([
    error?.message,
    error?.stderr,
    error?.stdout
  ].filter(Boolean).join('\n')).replace(/\s+/g, ' ').trim();
}

function recentMergeVisibilityRetries(state) {
  const events = Array.isArray(state?.resilience_events) ? state.resilience_events : [];
  let count = 0;
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.reason !== 'post_merge_snapshot_visibility_lag') break;
    if (event?.state_code !== (state?.current?.state_code || null)) break;
    count += 1;
  }
  return count;
}

export function classifyResilienceAction(error, state, triggerFailureIntent = null) {
  const text = normalizedErrorText(error);
  if (/Another acquisition Workflow is (?:queued|running):\s*cf_[a-f0-9]{64}/i.test(text)) {
    return { action: 'wait', reason: 'active_workflow_guard', detail: text };
  }
  if (state?.active_instance && /^Workflow cf_[a-f0-9]{64} is (?:errored|terminated|paused)$/i.test(String(error?.message || '').trim())) {
    return {
      action: 'skip',
      reason: 'confirmed_terminal_workflow',
      detail: text,
      intent: {
        mode: state.active_instance.mode,
        state_code: state.active_instance.state_code,
        query_offset: state.current?.query_offset ?? null,
        query_limit: state.current?.query_limit ?? null,
        batch_number: state.acquisition_batch ?? null,
        instance_id: state.active_instance.id
      }
    };
  }
  if (triggerFailureIntent && isTransientWorkflowDescribeError(error) && /workflows trigger/i.test(text)) {
    return {
      action: 'skip',
      reason: 'uncertain_trigger_result',
      detail: text,
      intent: { ...triggerFailureIntent, instance_id: null }
    };
  }
  if (state?.active_instance && isTransientWorkflowDescribeError(error) && /workflows instances describe/i.test(text)) {
    return { action: 'wait', reason: 'workflow_describe_retry_exhausted', detail: text };
  }
  if (state?.status === 'reviewing_data_pr' && /^Merged snapshot is \d+; expected \d+$/i.test(String(error?.message || '').trim())) {
    const retries = recentMergeVisibilityRetries(state);
    const maximum = Math.max(1, Number(process.env.PITCHLIST_GROWTH_MERGE_VISIBILITY_RETRIES || 5));
    if (retries < maximum) {
      return { action: 'wait', reason: 'post_merge_snapshot_visibility_lag', detail: text };
    }
  }
  if (state?.status === 'waiting_for_live_consistency' && /^Live FindPitches count is behind but already contains published identity /i.test(String(error?.message || '').trim())) {
    return { action: 'wait', reason: 'live_api_cache_skew', detail: text };
  }
  return { action: 'stop', reason: 'safety_gate', detail: text };
}

export function applyDeferredSkip(state, action, now = new Date()) {
  const intent = action?.intent || {};
  const mode = intent.mode || state?.active_instance?.mode || state?.current?.mode || '';
  const stateCode = intent.state_code || state?.active_instance?.state_code || state?.current?.state_code || '';
  const event = {
    at: now.toISOString(),
    reason: action.reason,
    mode,
    state_code: stateCode || null,
    query_offset: Number.isFinite(Number(intent.query_offset)) ? Number(intent.query_offset) : null,
    query_limit: Number.isFinite(Number(intent.query_limit)) ? Number(intent.query_limit) : null,
    batch_number: Number.isFinite(Number(intent.batch_number)) ? Number(intent.batch_number) : null,
    instance_id: intent.instance_id || state?.active_instance?.id || null,
    error: action.detail,
    disposition: 'deferred_for_replay'
  };

  state.resilience_events = Array.isArray(state.resilience_events) ? state.resilience_events : [];
  state.deferred_units = Array.isArray(state.deferred_units) ? state.deferred_units : [];
  boundedPush(state.resilience_events, event);
  boundedPush(state.deferred_units, event);

  if (mode === 'acquire') {
    const failedBatch = Number.isFinite(Number(intent.batch_number)) ? Number(intent.batch_number) : Number(state.acquisition_batch || 1);
    state.active_instance = null;
    state.acquisition_batch = Math.max(Number(state.acquisition_batch || 1) + 1, failedBatch + 1);
    state.status = 'ready_acquisition';
    return state;
  }

  if (mode === 'discover') {
    const currentOffset = Number.isFinite(Number(intent.query_offset))
      ? Number(intent.query_offset)
      : Number(state.query_offsets?.[stateCode] || 0);
    const queryLimit = Number.isFinite(Number(intent.query_limit)) && Number(intent.query_limit) > 0
      ? Number(intent.query_limit)
      : 2;
    state.query_offsets = state.query_offsets || {};
    if (stateCode) state.query_offsets[stateCode] = Math.max(Number(state.query_offsets[stateCode] || 0), currentOffset + queryLimit);
    if (stateCode && Array.isArray(state.priority_order) && state.priority_order.length) {
      const index = state.priority_order.indexOf(stateCode);
      if (index >= 0) state.priority_cursor = (index + 1) % state.priority_order.length;
    }
    state.active_instance = null;
    state.current = null;
    state.status = 'ready';
    return state;
  }

  throw new Error('Resilience skip has no safe discovery/acquisition unit identity');
}

function recordWaitEvent(state, action) {
  state.resilience_events = Array.isArray(state.resilience_events) ? state.resilience_events : [];
  boundedPush(state.resilience_events, {
    at: new Date().toISOString(),
    reason: action.reason,
    mode: state.active_instance?.mode || state.current?.mode || null,
    state_code: state.active_instance?.state_code || state.current?.state_code || null,
    instance_id: state.active_instance?.id || null,
    error: action.detail,
    disposition: 'wait_and_retry'
  });
}

export async function resilientMain(argv = process.argv.slice(2)) {
  const command = argv[0] || 'status';
  if (command !== 'run') return core.main(argv);
  const stateFile = path.resolve(argumentValue(argv, '--state-file', process.env.PITCHLIST_GROWTH_STATE_FILE || defaultStateFile));
  const waitSeconds = Math.max(10, Number(process.env.PITCHLIST_GROWTH_RESILIENCE_WAIT_SECONDS || 60));
  const skipDelaySeconds = Math.max(1, Number(process.env.PITCHLIST_GROWTH_SKIP_DELAY_SECONDS || 15));

  for (;;) {
    try {
      return await core.main(argv);
    } catch (error) {
      const state = readControllerState(stateFile);
      const action = classifyResilienceAction(error, state, lastTriggerFailureIntent);
      if (action.action === 'stop') throw error;

      if (action.action === 'wait') {
        recordWaitEvent(state, action);
        writeControllerState(stateFile, state);
        process.stderr.write(`Growth resilience: ${action.reason}; retaining checkpoint and retrying in ${waitSeconds}s\n`);
        lastTriggerFailureIntent = null;
        await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));
        continue;
      }

      applyDeferredSkip(state, action);
      writeControllerState(stateFile, state);
      process.stderr.write(`Growth resilience: deferred failed ${action.intent?.mode || 'workflow'} unit for ${action.intent?.state_code || 'unknown state'} (${action.reason}); continuing\n`);
      lastTriggerFailureIntent = null;
      await new Promise(resolve => setTimeout(resolve, skipDelaySeconds * 1000));
    }
  }
}

export const main = resilientMain;

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void safeNotifyRecoveryFromEnvironment;
  main().catch(error => {
    const stateFile = path.resolve(argumentValue(process.argv.slice(2), '--state-file', process.env.PITCHLIST_GROWTH_STATE_FILE || defaultStateFile));
    safeNotifyFailureFromEnvironment(error, {
      status: 'blocked',
      config: { controller_state_file: stateFile }
    });
    process.stderr.write(`${String(error?.message || error).replace(/[^a-z0-9_.,:/ #=-]+/gi, '')}\n`);
    process.exit(1);
  });
}
