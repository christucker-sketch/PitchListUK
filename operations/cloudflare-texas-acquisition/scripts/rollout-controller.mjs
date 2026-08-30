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
const githubRepository = 'christucker-sketch/PitchListUK';
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

export function ciRollupState(checks = []) {
  if (!Array.isArray(checks) || checks.length === 0) return 'pending';
  let verifyPassed = false;
  for (const check of checks) {
    const name = String(check?.name || check?.context || '');
    const isVerify = /(?:^|\b)verify(?:$|\b)/i.test(name);
    if (check?.__typename === 'CheckRun') {
      if (check.status !== 'COMPLETED') return 'pending';
      if (check.conclusion !== 'SUCCESS') return 'failed';
      if (isVerify) verifyPassed = true;
      continue;
    }
    if (check?.__typename === 'StatusContext') {
      if (check.state === 'PENDING' || check.state === 'EXPECTED') return 'pending';
      if (check.state !== 'SUCCESS') return 'failed';
      if (isVerify) verifyPassed = true;
      continue;
    }
    return 'failed';
  }
  return verifyPassed ? 'passed' : 'failed';
}

export function validateAutoMergeCandidate(pr, result, { baseSha, snapshotPath }) {
  const additions = Number(result?.additions);
  const staged = Number(result?.staged_count);
  const evidence = Number(result?.evidence_passed_count);
  const expectedBranch = String(result?.publication?.branch || '');
  const expectedPr = Number(result?.publication?.pr_number);
  if (!Number.isInteger(additions) || additions < 1 || Number(result.after) !== Number(result.before) + additions) {
    throw new Error('Auto-merge result has inconsistent addition counts');
  }
  if (!Number.isInteger(staged) || staged < additions || evidence !== staged) {
    throw new Error('Auto-merge result does not have complete deterministic evidence');
  }
  if (pr?.state !== 'OPEN' || pr?.isDraft || pr?.baseRefName !== 'main' || pr?.mergeable !== 'MERGEABLE') {
    throw new Error('Auto-merge PR is not an open mergeable main-branch PR');
  }
  if (Number(pr?.number) !== expectedPr || pr?.headRefName !== expectedBranch || !expectedBranch.startsWith('data/cloud-')) {
    throw new Error('Auto-merge PR identity does not match the Workflow result');
  }
  if (pr?.baseRefOid !== baseSha || !expectedBranch.endsWith(`-base-${String(baseSha).slice(0, 16)}`)) {
    throw new Error('Auto-merge PR is not based on the exact current main SHA');
  }
  if (!/^[a-f0-9]{40}$/i.test(String(pr?.headRefOid || '')) || pr?.commits?.length !== 1 || pr.commits[0]?.oid !== pr.headRefOid) {
    throw new Error('Auto-merge PR does not have one exact reviewed head commit');
  }
  if (pr?.files?.length !== 1 || pr.files[0]?.path !== snapshotPath) {
    throw new Error('Auto-merge PR changes files outside the production snapshot');
  }
  const body = String(pr?.body || '');
  const requiredBodyLines = [
    `- state: ${result.state_name} (${result.state_code})`,
    `- production snapshot: ${result.before} -> ${result.after}`,
    `- net-new additions: ${additions}`,
    `- deterministic evidence receipts: ${evidence}/${staged} passed`,
    '- no automatic merge or deploy requested'
  ];
  if (requiredBodyLines.some(line => !body.includes(line))) throw new Error('Auto-merge PR body does not match the compact Workflow result');
  if (ciRollupState(pr.statusCheckRollup) !== 'passed') throw new Error('Auto-merge PR required CI is not successful');
  return pr.headRefOid;
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

export function retryClosedReviewState(state, { prState, mergedAt = null, snapshotCount, reason }) {
  if (!state.pending_review || state.status !== 'awaiting_review') throw new Error('No pending review can be retried');
  if (prState !== 'CLOSED' || mergedAt) throw new Error('Pending PR is not closed unmerged');
  if (Number(snapshotCount) !== Number(state.pending_review.before)) {
    throw new Error(`Closed-review retry snapshot drift: expected ${state.pending_review.before}, found ${snapshotCount}`);
  }
  const cleanReason = String(reason || '').trim();
  if (!cleanReason) throw new Error('Closed-review retry requires a reason');
  const next = structuredClone(state);
  const result = next.results.at(-1);
  if (!result || Number(result.publication?.pr_number) !== Number(next.pending_review.pr_number)) {
    throw new Error('Pending review does not match the latest controller result');
  }
  result.discarded = { reason: cleanReason, recorded_at: new Date().toISOString() };
  next.pending_review = null;
  next.active_instance = null;
  next.status = 'ready';
  next.updated_at = new Date().toISOString();
  return next;
}

export function retryFailedWorkflowState(state, { workflowStatus, reason }) {
  if (state.status !== 'running' || !state.active_instance?.id) throw new Error('No active Workflow can be retried');
  if (!['errored', 'terminated'].includes(workflowStatus)) throw new Error(`Workflow is ${workflowStatus}; only failed instances can be retried`);
  const cleanReason = String(reason || '').trim();
  if (!cleanReason) throw new Error('Failed Workflow retry requires a reason');
  const next = structuredClone(state);
  next.failed_instances = Array.isArray(next.failed_instances) ? next.failed_instances : [];
  next.failed_instances.push({
    ...next.active_instance,
    status: workflowStatus,
    reason: cleanReason,
    recorded_at: new Date().toISOString()
  });
  next.active_instance = null;
  next.status = 'ready';
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

function assertRepositoryReady({ allowBehind = false, allowedDataPr = null } = {}) {
  if (run('git', ['status', '--short']).trim()) throw new Error('Repository worktree is not clean');
  if (run('git', ['branch', '--show-current']).trim() !== 'main') throw new Error('Controller must run from main');
  run('git', ['fetch', 'origin', 'main', '--quiet']);
  const head = run('git', ['rev-parse', 'HEAD']).trim();
  const originMain = run('git', ['rev-parse', 'origin/main']).trim();
  const mergeBase = run('git', ['merge-base', head, originMain]).trim();
  if (!repositoryHeadAcceptable(head, originMain, mergeBase, allowBehind)) {
    throw new Error(`Local main ${head} does not safely match origin/main ${originMain}`);
  }
  const open = JSON.parse(run('gh', ['pr', 'list', '--repo', githubRepository, '--state', 'open', '--limit', '100', '--json', 'number,headRefName,title']));
  const dataPrs = open.filter(pr => String(pr.headRefName || '').startsWith('data/cloud-') && Number(pr.number) !== Number(allowedDataPr));
  if (dataPrs.length) throw new Error(`Unresolved acquisition PR: #${dataPrs[0].number}`);
}

function readAutoMergePr(prNumber) {
  return JSON.parse(run('gh', [
    'pr', 'view', String(prNumber), '--repo', githubRepository,
    '--json', 'number,state,isDraft,baseRefName,baseRefOid,headRefName,headRefOid,mergeable,body,files,commits,statusCheckRollup'
  ]));
}

function waitForAutoMergeCandidate(state, result) {
  const timeoutSeconds = Number(process.env.PITCHLIST_ROLLOUT_CI_TIMEOUT_SECONDS || 1800);
  const pollSeconds = Number(process.env.PITCHLIST_ROLLOUT_CI_POLL_SECONDS || 10);
  if (!Number.isFinite(timeoutSeconds) || timeoutSeconds < 60 || !Number.isFinite(pollSeconds) || pollSeconds < 1) {
    throw new Error('Invalid auto-merge CI polling configuration');
  }
  const deadline = Date.now() + timeoutSeconds * 1000;
  for (;;) {
    const pr = readAutoMergePr(state.pending_review.pr_number);
    const checks = ciRollupState(pr.statusCheckRollup);
    if (checks === 'failed') throw new Error(`PR #${pr.number} CI failed or returned an unexpected check state`);
    if (checks === 'passed' && pr.mergeable === 'MERGEABLE') {
      const baseSha = run('git', ['rev-parse', 'HEAD']).trim();
      return {
        pr,
        headOid: validateAutoMergeCandidate(pr, result, {
          baseSha,
          snapshotPath: getStateConfig(result.state_code).snapshot_path
        })
      };
    }
    if (Date.now() >= deadline) throw new Error(`PR #${pr.number} CI/mergeability timed out`);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, pollSeconds * 1000);
  }
}

function autoMergePendingReview(state) {
  const result = state.results.at(-1);
  if (!result || Number(result?.publication?.pr_number) !== Number(state.pending_review?.pr_number)) {
    throw new Error('Pending auto-merge review does not match the latest Workflow result');
  }
  assertRepositoryReady({ allowBehind: false, allowedDataPr: state.pending_review.pr_number });
  const { pr, headOid } = waitForAutoMergeCandidate(state, result);
  run('gh', [
    'pr', 'merge', String(pr.number), '--repo', githubRepository, '--merge', '--delete-branch',
    '--match-head-commit', headOid
  ]);
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
  const batches = stagingSourceBatches(config.sources, { maxSources: config.workflow_batch_max_sources });
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
  if (command === 'retry-closed') {
    assertRepositoryReady();
    const pending = state.pending_review;
    if (!pending) throw new Error('No pending review can be retried');
    const pr = JSON.parse(run('gh', ['pr', 'view', String(pending.pr_number), '--repo', githubRepository, '--json', 'state,mergedAt']));
    const actual = JSON.parse(run('node', ['-e', "import('./functions/_data/us-opportunities.mjs').then(({usOpportunitySnapshot:s})=>process.stdout.write(JSON.stringify(s.total)))"]));
    state = retryClosedReviewState(state, {
      prState: pr.state,
      mergedAt: pr.mergedAt,
      snapshotCount: actual,
      reason: argumentValue(argv, '--reason', '')
    });
    saveState(stateFile, state);
    process.stdout.write(`${JSON.stringify(compactStatus(state))}\n`);
    return;
  }
  if (command === 'retry-failed') {
    assertRepositoryReady();
    const active = state.active_instance;
    if (!active?.id) throw new Error('No active Workflow can be retried');
    const workflowStatus = parseWorkflowStatus(describeWorkflow(active.id, envFile));
    state = retryFailedWorkflowState(state, {
      workflowStatus,
      reason: argumentValue(argv, '--reason', '')
    });
    saveState(stateFile, state);
    process.stdout.write(`${JSON.stringify(compactStatus(state))}\n`);
    return;
  }
  if (command !== 'run') throw new Error('Usage: rollout-controller.mjs init|status|retry-closed|retry-failed|run');

  const autoMerge = process.env.PITCHLIST_ROLLOUT_AUTO_MERGE === '1';
  assertRepositoryReady({ allowBehind: Boolean(state.pending_review), allowedDataPr: state.pending_review?.pr_number });
  if (state.pending_review) {
    if (autoMerge) autoMergePendingReview(state);
    state = reconcileReview(state);
    saveState(stateFile, state);
  }
  if (state.status === 'complete') {
    process.stdout.write(`${JSON.stringify(compactStatus(state))}\n`);
    return;
  }
  if (!['ready', 'running'].includes(state.status)) throw new Error(`Controller is not ready: ${state.status}`);

  let latestResult = null;
  while (state.status !== 'complete') {
    if (state.pending_review) {
      if (!autoMerge) break;
      autoMergePendingReview(state);
      state = reconcileReview(state);
      saveState(stateFile, state);
      continue;
    }
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
