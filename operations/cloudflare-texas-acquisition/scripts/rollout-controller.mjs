#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { stagingSourceBatches } from '../src/staging-batches.js';
import { getStateConfig } from '../src/us-state-registry.js';

export const ROLLOUT_ORDER = Object.freeze([
  'CA', 'TX', 'FL', 'NY', 'PA', 'IL', 'OH', 'GA', 'NC', 'MI', 'VA', 'WA', 'MA', 'CO', 'AZ',
  'NJ', 'TN', 'IN', 'MO', 'MD', 'MN', 'WI', 'OR', 'SC', 'AL', 'KY', 'LA', 'OK', 'CT', 'IA',
  'KS', 'NV', 'UT', 'AR', 'NE', 'NM', 'ID', 'ME', 'AK', 'HI', 'MS', 'MT', 'DE', 'NH', 'ND',
  'RI', 'SD', 'VT', 'WV', 'WY'
]);

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '../../..');
const workerConfig = path.join(repositoryRoot, 'operations/cloudflare-texas-acquisition/wrangler.jsonc');
const workflowName = 'pitchlist-texas-acquisition';
const defaultStateFile = path.join(os.homedir(), '.local/state/findpitches-us-rollout/controller.json');

function stripAnsi(value) {
  return String(value || '').replace(/\u001b\[[0-9;]*m/g, '');
}

export function parseInstanceId(output) {
  const match = stripAnsi(output).match(/\bcf_[a-f0-9]{64}\b/i);
  if (!match) throw new Error('Wrangler did not return a Workflow instance ID');
  return match[0];
}

export function parseWorkflowStatus(output) {
  const text = stripAnsi(output);
  if (/Status:\s+.*Completed/i.test(text)) return 'complete';
  if (/Status:\s+.*Errored/i.test(text)) return 'errored';
  if (/Status:\s+.*Terminated/i.test(text)) return 'terminated';
  if (/Status:\s+.*Paused/i.test(text)) return 'paused';
  if (/Status:\s+.*Running/i.test(text)) return 'running';
  if (/Status:\s+.*Queued/i.test(text)) return 'queued';
  return 'unknown';
}

export function repositoryHeadAcceptable(head, originMain, mergeBase, allowBehind = false) {
  return head === originMain || (allowBehind && mergeBase === head);
}

export function parseCompactWorkflowOutput(output, stateName) {
  const text = stripAnsi(output);
  const marker = `Name:      emit compact ${stateName} rollout result`;
  const start = text.lastIndexOf(marker);
  if (start < 0) throw new Error(`Compact ${stateName} result step was not found`);
  const section = text.slice(start);
  const match = section.match(/^\s*Output:\s+(.+)$/m);
  if (!match) throw new Error(`Compact ${stateName} result output was not found`);
  const decoded = JSON.parse(match[1]);
  const result = typeof decoded === 'string' ? JSON.parse(decoded) : decoded;
  if (result?.state_name !== stateName || !Number.isInteger(Number(result?.additions))) {
    throw new Error(`Compact ${stateName} result is malformed`);
  }
  return result;
}

export function initialState({ nextState = 'IL', snapshotCount = 105 } = {}) {
  const nextIndex = ROLLOUT_ORDER.indexOf(String(nextState).toUpperCase());
  if (nextIndex < 0) throw new Error(`Unsupported next state: ${nextState}`);
  return {
    schema_version: 1,
    status: 'ready',
    completed_states: ROLLOUT_ORDER.slice(0, nextIndex),
    next_state: ROLLOUT_ORDER[nextIndex],
    next_batch: 1,
    snapshot_count: Number(snapshotCount),
    results: [],
    pending_review: null,
    active_instance: null,
    updated_at: new Date().toISOString()
  };
}

export function advanceAfterResult(state, result) {
  if (result.state_code !== state.next_state || Number(result.batch_number) !== Number(state.next_batch)) {
    throw new Error('Workflow result does not match the controller checkpoint');
  }
  if (Number(result.before) !== Number(state.snapshot_count)) {
    throw new Error(`Snapshot drift: expected ${state.snapshot_count}, Workflow read ${result.before}`);
  }

  const next = structuredClone(state);
  next.active_instance = null;
  next.results.push(result);
  if (Number(result.additions) > 0) {
    const prNumber = Number(result.publication?.pr_number);
    if (!Number.isInteger(prNumber) || prNumber < 1) throw new Error('Additions result has no reviewable PR');
    next.status = 'awaiting_review';
    next.pending_review = {
      state_code: result.state_code,
      batch_number: result.batch_number,
      pr_number: prNumber,
      before: result.before,
      after: result.after,
      additions: result.additions,
      instance_id: result.instance_id
    };
  } else {
    next.status = 'ready';
    next.pending_review = null;
    advanceBatchOrState(next, result);
  }
  next.updated_at = new Date().toISOString();
  return next;
}

function advanceBatchOrState(state, result) {
  if (Number(result.batch_number) < Number(result.batch_count)) {
    state.next_batch = Number(result.batch_number) + 1;
    return;
  }
  if (!state.completed_states.includes(result.state_code)) state.completed_states.push(result.state_code);
  const index = ROLLOUT_ORDER.indexOf(result.state_code);
  state.next_state = ROLLOUT_ORDER[index + 1] || null;
  state.next_batch = state.next_state ? 1 : null;
  if (!state.next_state) state.status = 'complete';
}

function loadState(stateFile) {
  return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
}

function saveState(stateFile, state) {
  fs.mkdirSync(path.dirname(stateFile), { recursive: true, mode: 0o700 });
  const temporary = `${stateFile}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, stateFile);
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options
  });
}

function wranglerArgs(envFile, tail) {
  if (!envFile) throw new Error('Set PITCHLIST_ROLLOUT_ENV_FILE to the external Wrangler environment file');
  return ['--yes', 'wrangler@4.127.0', ...tail, '--config', workerConfig, '--env-file', envFile];
}

function assertRepositoryReady({ allowBehind = false } = {}) {
  if (run('git', ['status', '--short']).trim()) throw new Error('Repository worktree is not clean');
  if (run('git', ['branch', '--show-current']).trim() !== 'main') throw new Error('Controller must run from main');
  run('git', ['fetch', 'origin', 'main', '--quiet']);
  const head = run('git', ['rev-parse', 'HEAD']).trim();
  const originMain = run('git', ['rev-parse', 'origin/main']).trim();
  const mergeBase = run('git', ['merge-base', head, originMain]).trim();
  if (!repositoryHeadAcceptable(head, originMain, mergeBase, allowBehind)) {
    throw new Error(`Local main ${head} does not safely match origin/main ${originMain}`);
  }
  const open = JSON.parse(run('gh', ['pr', 'list', '--repo', 'christucker-sketch/PitchListUK', '--state', 'open', '--limit', '100', '--json', 'number,headRefName,title']));
  const dataPrs = open.filter(pr => String(pr.headRefName || '').startsWith('data/cloud-'));
  if (dataPrs.length) throw new Error(`Unresolved acquisition PR: #${dataPrs[0].number}`);
}

function assertNoActiveWorkflow(envFile) {
  for (const status of ['queued', 'running']) {
    const output = run('npx', wranglerArgs(envFile, [
      'workflows', 'instances', 'list', workflowName, '--status', status, '--per-page', '10'
    ]));
    const active = stripAnsi(output).match(/\bcf_[a-f0-9]{64}\b/i);
    if (active) throw new Error(`Another Workflow is ${status}: ${active[0]}`);
  }
}

function triggerWorkflow(state, envFile) {
  const config = getStateConfig(state.next_state);
  const batches = stagingSourceBatches(config.sources);
  if (state.next_batch > batches.length) throw new Error(`Invalid batch checkpoint for ${config.name}`);
  const params = JSON.stringify({ state_code: config.code, batch_number: state.next_batch, trigger: 'controller' });
  const output = run('npx', wranglerArgs(envFile, ['workflows', 'trigger', workflowName, '--params', params]));
  return { instanceId: parseInstanceId(output), stateName: config.name, batchCount: batches.length };
}

function describeWorkflow(instanceId, envFile) {
  return run('npx', wranglerArgs(envFile, ['workflows', 'instances', 'describe', workflowName, instanceId]));
}

function waitForResult({ instanceId, stateName, envFile, pollSeconds = 10 }) {
  for (;;) {
    const output = describeWorkflow(instanceId, envFile);
    const status = parseWorkflowStatus(output);
    if (status === 'complete') return parseCompactWorkflowOutput(output, stateName);
    if (['errored', 'terminated', 'paused'].includes(status)) throw new Error(`Workflow ${instanceId} is ${status}`);
    if (!['queued', 'running'].includes(status)) throw new Error(`Workflow ${instanceId} returned unknown status`);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, pollSeconds * 1000);
  }
}

function reconcileReview(state) {
  const pending = state.pending_review;
  const pr = JSON.parse(run('gh', ['pr', 'view', String(pending.pr_number), '--repo', 'christucker-sketch/PitchListUK', '--json', 'state,mergedAt,mergeCommit']));
  if (pr.state !== 'MERGED' || !pr.mergeCommit?.oid) {
    throw new Error(`PR #${pending.pr_number} is ${pr.state}; reviewed merge required before continuing`);
  }
  run('git', ['fetch', 'origin', 'main', '--quiet']);
  run('git', ['merge', '--ff-only', 'origin/main']);
  const actual = JSON.parse(run('node', ['-e', "import('./functions/_data/us-opportunities.mjs').then(({usOpportunitySnapshot:s})=>process.stdout.write(JSON.stringify(s.total)))"]));
  if (Number(actual) !== Number(pending.after)) throw new Error(`Merged snapshot is ${actual}; expected ${pending.after}`);
  const result = state.results.at(-1);
  state.snapshot_count = Number(actual);
  state.pending_review = null;
  state.status = 'ready';
  advanceBatchOrState(state, result);
  state.updated_at = new Date().toISOString();
  return state;
}

export function compactStatus(state) {
  return {
    status: state.status,
    processed: state.completed_states.length,
    remaining: ROLLOUT_ORDER.length - state.completed_states.length,
    snapshot_count: state.snapshot_count,
    next_state: state.next_state,
    next_batch: state.next_batch,
    pending_review: state.pending_review,
    active_instance: state.active_instance,
    updated_at: state.updated_at
  };
}

function argumentValue(args, name, fallback = null) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}

export function main(argv = process.argv.slice(2)) {
  const command = argv[0] || 'status';
  const stateFile = path.resolve(argumentValue(argv, '--state-file', process.env.PITCHLIST_ROLLOUT_STATE_FILE || defaultStateFile));
  const envFile = process.env.PITCHLIST_ROLLOUT_ENV_FILE;

  if (command === 'init') {
    if (fs.existsSync(stateFile)) throw new Error(`Controller state already exists: ${stateFile}`);
    const state = initialState({
      nextState: argumentValue(argv, '--next', 'IL'),
      snapshotCount: Number(argumentValue(argv, '--snapshot-count', 105))
    });
    saveState(stateFile, state);
    process.stdout.write(`${JSON.stringify(compactStatus(state))}\n`);
    return;
  }

  let state = loadState(stateFile);
  if (command === 'status') {
    process.stdout.write(`${JSON.stringify(compactStatus(state))}\n`);
    return;
  }
  if (command !== 'run') throw new Error('Usage: rollout-controller.mjs init|status|run');

  assertRepositoryReady({ allowBehind: Boolean(state.pending_review) });
  if (state.pending_review) {
    state = reconcileReview(state);
    saveState(stateFile, state);
  }
  if (state.status === 'complete') {
    process.stdout.write(`${JSON.stringify(compactStatus(state))}\n`);
    return;
  }
  if (!['ready', 'running'].includes(state.status)) throw new Error(`Controller is not ready: ${state.status}`);

  let latestResult = null;
  while (state.status !== 'complete' && !state.pending_review) {
    if (state.status === 'ready') {
      assertRepositoryReady();
      assertNoActiveWorkflow(envFile);
      const triggered = triggerWorkflow(state, envFile);
      state.active_instance = {
        id: triggered.instanceId,
        state_name: triggered.stateName,
        batch_count: triggered.batchCount
      };
      state.status = 'running';
      state.updated_at = new Date().toISOString();
      saveState(stateFile, state);
    }

    const active = state.active_instance;
    if (!active?.id || !active?.state_name || !active?.batch_count) {
      throw new Error('Running checkpoint has no resumable Workflow metadata');
    }
    const result = waitForResult({
      instanceId: active.id,
      stateName: active.state_name,
      envFile,
      pollSeconds: Number(process.env.PITCHLIST_ROLLOUT_POLL_SECONDS || 10)
    });
    result.instance_id = active.id;
    result.batch_count = active.batch_count;
    state = advanceAfterResult(state, result);
    saveState(stateFile, state);
    latestResult = result;
  }
  process.stdout.write(`${JSON.stringify({ ...compactStatus(state), result: latestResult })}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ status: 'blocked', error: String(error?.message || error) })}\n`);
    process.exitCode = 1;
  }
}
