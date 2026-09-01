#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { stagingSourceBatches } from '../src/staging-batches.js';
import { PRIORITY_STATE_CODES, growthPlanSize } from '../src/us-growth-plan.js';
import { parseGrowthRegistry, sourcesForState } from '../src/us-growth-registry.js';
import { enabledStates, getStateConfig } from '../src/us-state-registry.js';
import {
  safeNotifyFailureFromEnvironment,
  safeNotifyRecoveryFromEnvironment
} from '../../acquisition-notifications/notifier.mjs';
import {
  ciRollupState,
  parseInstanceId,
  parseWorkflowStatus,
  validateAutoMergeCandidate
} from './rollout-controller.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '../../..');
const workerConfig = path.join(repositoryRoot, 'operations/cloudflare-texas-acquisition/wrangler.jsonc');
const growthRegistryPath = 'operations/opportunity-pipeline/config/us-growth-source-registry.json';
const snapshotPath = 'functions/_data/us-opportunities.mjs';
const workflowName = 'pitchlist-texas-acquisition';
const githubRepository = 'christucker-sketch/PitchListUK';
const defaultStateFile = path.join(os.homedir(), '.local/state/findpitches-us-growth/controller.json');
const milestones = Object.freeze([350, 600, 850, 1100]);

function stripAnsi(value) {
  return String(value || '').replace(/\u001b\[[0-9;]*m/g, '');
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options
  });
}

function sleep(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function wranglerArgs(envFile, tail) {
  if (!envFile) throw new Error('Set PITCHLIST_GROWTH_ENV_FILE to the external Wrangler environment file');
  return ['--yes', 'wrangler@4.127.1', ...tail, '--config', workerConfig, '--env-file', envFile];
}

function loadState(stateFile) {
  return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
}

function saveState(stateFile, state) {
  state.updated_at = new Date().toISOString();
  fs.mkdirSync(path.dirname(stateFile), { recursive: true, mode: 0o700 });
  const temporary = `${stateFile}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, stateFile);
}

function readSnapshotCount() {
  return Number(JSON.parse(run('node', ['-e', "import('./functions/_data/us-opportunities.mjs').then(({usOpportunitySnapshot:s})=>process.stdout.write(JSON.stringify(s.total)))"])));
}

function readSnapshotStateTotals() {
  return JSON.parse(run('node', ['-e', "import('./functions/_data/us-opportunities.mjs').then(({usOpportunitySnapshot:s})=>{const t={};for(const r of s.rows)t[r.region_code]=(t[r.region_code]||0)+1;process.stdout.write(JSON.stringify(t))})"]));
}

function approvedSourceCount() {
  const compiled = enabledStates().reduce((total, state) => total + state.sources.length, 0);
  const growth = parseGrowthRegistry(fs.readFileSync(path.join(repositoryRoot, growthRegistryPath), 'utf8')).sources.length;
  return compiled + growth;
}

function assertRepositoryReady({ allowPr = null, allowBehind = false } = {}) {
  if (run('git', ['status', '--short']).trim()) throw new Error('Repository worktree is not clean');
  if (run('git', ['branch', '--show-current']).trim() !== 'main') throw new Error('Growth controller must run from main');
  run('git', ['fetch', 'origin', 'main', '--quiet']);
  const head = run('git', ['rev-parse', 'HEAD']).trim();
  const originMain = run('git', ['rev-parse', 'origin/main']).trim();
  const mergeBase = run('git', ['merge-base', head, originMain]).trim();
  if (head !== originMain && !(allowBehind && mergeBase === head)) throw new Error(`Local main ${head} does not safely match origin/main ${originMain}`);
  const open = JSON.parse(run('gh', ['pr', 'list', '--repo', githubRepository, '--state', 'open', '--limit', '100', '--json', 'number,headRefName,title']));
  const acquisition = open.filter(pr => /^(?:data|sources)\/cloud-/.test(String(pr.headRefName || '')) && Number(pr.number) !== Number(allowPr));
  if (acquisition.length) throw new Error(`Unresolved acquisition PR: #${acquisition[0].number}`);
  return { head, originMain };
}

function assertNoActiveWorkflow(envFile) {
  for (const status of ['queued', 'running']) {
    const output = run('npx', wranglerArgs(envFile, ['workflows', 'instances', 'list', workflowName, '--status', status, '--per-page', '10']));
    const active = stripAnsi(output).match(/\bcf_[a-f0-9]{64}\b/i);
    if (active) throw new Error(`Another acquisition Workflow is ${status}: ${active[0]}`);
  }
}

export function parseCompactWorkflowOutput(output, stateName, mode) {
  const text = stripAnsi(output);
  const marker = mode === 'discover'
    ? `Name:      emit compact ${stateName} growth discovery result`
    : `Name:      emit compact ${stateName} rollout result`;
  const start = text.lastIndexOf(marker);
  if (start < 0) throw new Error(`Compact ${stateName} ${mode} result step was not found`);
  const match = text.slice(start).match(/^\s*Output:\s+(.+)$/m);
  if (!match) throw new Error(`Compact ${stateName} ${mode} output was not found`);
  const decoded = JSON.parse(match[1]);
  const result = typeof decoded === 'string' ? JSON.parse(decoded) : decoded;
  if (result?.state_name !== stateName) throw new Error(`Compact ${stateName} ${mode} result is malformed`);
  if (mode === 'discover' && result?.workflow_execution !== 'cloudflare') throw new Error('Discovery result does not attest Cloudflare execution');
  if (mode === 'acquire' && !Number.isInteger(Number(result?.additions))) throw new Error('Acquisition result has invalid additions');
  return result;
}

function triggerWorkflow(envFile, params) {
  assertNoActiveWorkflow(envFile);
  const output = run('npx', wranglerArgs(envFile, ['workflows', 'trigger', workflowName, '--params', JSON.stringify(params)]));
  return parseInstanceId(output);
}

function waitForWorkflow(envFile, active) {
  const pollSeconds = Math.max(3, Number(process.env.PITCHLIST_GROWTH_WORKFLOW_POLL_SECONDS || 10));
  for (;;) {
    const output = run('npx', wranglerArgs(envFile, ['workflows', 'instances', 'describe', workflowName, active.id]));
    const status = parseWorkflowStatus(output);
    if (status === 'complete') return parseCompactWorkflowOutput(output, active.state_name, active.mode);
    if (['errored', 'terminated', 'paused'].includes(status)) throw new Error(`Workflow ${active.id} is ${status}`);
    if (!['queued', 'running'].includes(status)) throw new Error(`Workflow ${active.id} returned unknown status`);
    sleep(pollSeconds * 1000);
  }
}

function readPr(prNumber) {
  const pr = JSON.parse(run('gh', ['pr', 'view', String(prNumber), '--repo', githubRepository, '--json', 'number,state,isDraft,baseRefName,headRefName,headRefOid,mergeable,body,files,commits,statusCheckRollup,mergedAt,mergeCommit']));
  const pull = JSON.parse(run('gh', ['api', `repos/${githubRepository}/pulls/${prNumber}`, '--jq', '{baseRefOid:.base.sha}']));
  return { ...pr, baseRefOid: pull.baseRefOid };
}

function waitForPr(prNumber) {
  const deadline = Date.now() + Math.max(300, Number(process.env.PITCHLIST_GROWTH_CI_TIMEOUT_SECONDS || 1800)) * 1000;
  const pollSeconds = Math.max(3, Number(process.env.PITCHLIST_GROWTH_CI_POLL_SECONDS || 10));
  for (;;) {
    const pr = readPr(prNumber);
    const checks = ciRollupState(pr.statusCheckRollup);
    if (checks === 'failed') throw new Error(`PR #${pr.number} CI failed or returned an unexpected check state`);
    if (checks === 'passed' && pr.mergeable === 'MERGEABLE') return pr;
    if (Date.now() >= deadline) throw new Error(`PR #${pr.number} CI/mergeability timed out`);
    sleep(pollSeconds * 1000);
  }
}

export function validateSourcePr(pr, result, currentRegistry, nextRegistry, baseSha, options = {}) {
  const expectedCount = Number(result?.publication?.source_count || result?.publication?.source_ids?.length || 0);
  if (expectedCount < 1 || expectedCount !== Number(result.generated_source_count) || Number(result.generated_source_count) !== Number(result.evidence_passed_count)) {
    throw new Error('Source PR lacks complete deterministic evidence');
  }
  const exactState = pr?.state === 'OPEN' || (options.allowMerged === true && pr?.state === 'MERGED' && pr?.mergedAt && pr?.mergeCommit?.oid);
  if (!exactState || pr?.isDraft || pr?.baseRefName !== 'main' || (pr.state === 'OPEN' && pr?.mergeable !== 'MERGEABLE')) throw new Error('Source PR is not an exact open or reconciled merged main PR');
  if (pr?.baseRefOid !== baseSha || !String(pr?.headRefName || '').startsWith('sources/cloud-us-') || !pr.headRefName.endsWith(`-base-${baseSha.slice(0, 16)}`)) throw new Error('Source PR base or branch is not exact');
  if (!/^[a-f0-9]{40}$/i.test(String(pr?.headRefOid || '')) || pr?.commits?.length !== 1 || pr.commits[0]?.oid !== pr.headRefOid) throw new Error('Source PR does not have one exact head commit');
  if (pr?.files?.length !== 1 || pr.files[0]?.path !== growthRegistryPath) throw new Error('Source PR changes files outside the growth registry');
  if (ciRollupState(pr.statusCheckRollup) !== 'passed') throw new Error('Source PR required CI is not successful');
  const before = parseGrowthRegistry(currentRegistry);
  const after = parseGrowthRegistry(nextRegistry);
  if (after.sources.length !== before.sources.length + expectedCount) throw new Error('Source PR count is not additions-only');
  const afterById = new Map(after.sources.map(source => [source.id, source]));
  for (const source of before.sources) if (JSON.stringify(afterById.get(source.id)) !== JSON.stringify(source)) throw new Error(`Source PR changed existing source ${source.id}`);
  const addedIds = after.sources.filter(source => !before.sources.some(item => item.id === source.id)).map(source => source.id).sort();
  const outputIds = [...(result?.publication?.source_ids || [])].sort();
  if (outputIds.length && JSON.stringify(addedIds) !== JSON.stringify(outputIds)) throw new Error('Source PR additions do not match Workflow output');
  const body = String(pr.body || '');
  for (const line of [
    `- state: ${result.state_name} (${result.state_code})`,
    `- net-new approved sources: ${expectedCount}`,
    `- deterministic source evidence receipts: ${result.evidence_passed_count}/${result.generated_source_count} passed`,
    '- additions only; no source removals',
    '- no automatic merge or deploy requested'
  ]) if (!body.includes(line)) throw new Error('Source PR body does not match compact Workflow output');
  const normalizedBody = body.toLowerCase();
  for (const id of addedIds) if (!normalizedBody.includes(`  - ${id.toLowerCase()}:`)) throw new Error(`Source PR lacks an evidence receipt for ${id}`);
  return pr.headRefOid;
}

function fileAt(ref, filePath) {
  return run('git', ['show', `${ref}:${filePath}`]);
}

function mergeSourcePr(state, result) {
  let pr = readPr(result.publication.pr_number);
  if (pr.state === 'OPEN') pr = waitForPr(result.publication.pr_number);
  if (!['OPEN', 'MERGED'].includes(pr.state)) throw new Error(`Source PR #${pr.number} is ${pr.state}`);
  const baseSha = pr.baseRefOid;
  run('git', ['fetch', 'origin', `pull/${pr.number}/head`, '--quiet']);
  const current = fileAt(baseSha, growthRegistryPath);
  const next = fileAt(pr.headRefOid, growthRegistryPath);
  const headOid = validateSourcePr(pr, result, current, next, baseSha, { allowMerged: true });
  const before = parseGrowthRegistry(current);
  const after = parseGrowthRegistry(next);
  const sourceIds = after.sources.filter(source => !before.sources.some(item => item.id === source.id)).map(source => source.id).sort();
  if (pr.state === 'OPEN') run('gh', ['pr', 'merge', String(pr.number), '--repo', githubRepository, '--merge', '--delete-branch', '--match-head-commit', headOid]);
  run('git', ['fetch', 'origin', 'main', '--quiet']);
  const localHead = run('git', ['rev-parse', 'HEAD']).trim();
  if (localHead !== run('git', ['rev-parse', 'origin/main']).trim()) run('git', ['merge', '--ff-only', 'origin/main']);
  state.approved_source_count = approvedSourceCount();
  return sourceIds;
}

function mergeDataPr(result) {
  let pr = readPr(result.publication.pr_number);
  if (pr.state === 'OPEN') pr = waitForPr(result.publication.pr_number);
  if (!['OPEN', 'MERGED'].includes(pr.state)) throw new Error(`Data PR #${pr.number} is ${pr.state}`);
  const baseSha = pr.baseRefOid;
  const validationPr = pr.state === 'MERGED' ? { ...pr, state: 'OPEN', mergeable: 'MERGEABLE' } : pr;
  const headOid = validateAutoMergeCandidate(validationPr, result, { baseSha, snapshotPath });
  if (pr.state === 'OPEN') run('gh', ['pr', 'merge', String(pr.number), '--repo', githubRepository, '--merge', '--delete-branch', '--match-head-commit', headOid]);
  run('git', ['fetch', 'origin', 'main', '--quiet']);
  const localHead = run('git', ['rev-parse', 'HEAD']).trim();
  if (localHead !== run('git', ['rev-parse', 'origin/main']).trim()) run('git', ['merge', '--ff-only', 'origin/main']);
  const count = readSnapshotCount();
  if (count !== Number(result.after)) throw new Error(`Merged snapshot is ${count}; expected ${result.after}`);
  return { count, sha: run('git', ['rev-parse', 'HEAD']).trim() };
}

function parseEnvFile(file) {
  const values = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    values[match[1]] = value;
  }
  return values;
}

async function verifyProduction(envFile, expectedSha, expectedCount) {
  const secrets = parseEnvFile(envFile);
  const token = secrets.CLOUDFLARE_API_TOKEN;
  if (!token) throw new Error('CLOUDFLARE_API_TOKEN is missing from the external environment file');
  const account = secrets.CLOUDFLARE_ACCOUNT_ID || '7e1bec4650ae51a1a429d4449cda169d';
  const deployments = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/pages/projects/pitchlistuk/deployments`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
  if (!deployments.ok) throw new Error(`Cloudflare Pages deployments returned ${deployments.status}`);
  const body = await deployments.json();
  const production = body.result?.find(item => item.environment === 'production');
  const sha = production?.deployment_trigger?.metadata?.commit_hash || '';
  if (sha !== expectedSha || production?.latest_stage?.status !== 'success') throw new Error(`Production deployment SHA/status mismatch: ${sha || 'missing'}`);
  const liveCount = await verifyLiveOpportunityCount(expectedCount, {
    attempts: Number(process.env.PITCHLIST_GROWTH_LIVE_POLL_ATTEMPTS || 24),
    intervalMs: Number(process.env.PITCHLIST_GROWTH_LIVE_POLL_SECONDS || 5) * 1000
  });
  return { deployment_id: production.id, production_sha: sha, live_api_count: liveCount };
}

export async function verifyLiveOpportunityCount(expectedCount, options = {}) {
  const attempts = Number(options.attempts ?? 24);
  const intervalMs = Number(options.intervalMs ?? 5000);
  const fetchImpl = options.fetchImpl || fetch;
  const sleepImpl = options.sleepImpl || (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)));
  if (!Number.isInteger(attempts) || attempts < 1) throw new Error('Live count verification attempts must be a positive integer');
  if (!Number.isFinite(intervalMs) || intervalMs < 0) throw new Error('Live count verification interval must be non-negative');
  let lastError = new Error(`Live FindPitches count is unavailable; expected ${expectedCount}`);
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const live = await fetchImpl('https://findpitches.com/api/us-customer-opportunities/search?limit=1', {
        cache: 'no-store',
        signal: AbortSignal.timeout(15000)
      });
      if (!live.ok) {
        lastError = new Error(`Live FindPitches API returned ${live.status}`);
      } else {
        const payload = await live.json();
        const liveCount = Number(payload.total);
        if (liveCount === Number(expectedCount)) return liveCount;
        lastError = new Error(`Live FindPitches count is ${payload.total}; expected ${expectedCount}`);
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
    if (attempt < attempts) await sleepImpl(intervalMs);
  }
  throw lastError;
}

export function cleanupGeneratedDeploymentArtifacts(root = repositoryRoot) {
  for (const directory of ['global', 'us', 'uk', 'shared']) {
    fs.rmSync(path.join(root, 'public', directory), { recursive: true, force: true });
  }
}

async function deployAndVerify(envFile, sha, count) {
  run('npm', ['run', 'deploy:production'], { env: { ...process.env, PITCHLIST_DEPLOY_ENV_FILE: envFile } });
  run('git', ['restore', '--source=HEAD', '--', 'public/sitemap.xml']);
  cleanupGeneratedDeploymentArtifacts();
  if (run('git', ['status', '--short']).trim()) throw new Error('Deployment left unexpected repository changes');
  return verifyProduction(envFile, sha, count);
}

function selectDiscovery(state) {
  for (let checked = 0; checked < state.priority_order.length; checked += 1) {
    const index = (state.priority_cursor + checked) % state.priority_order.length;
    const code = state.priority_order[index];
    const scoped = getStateConfig(code);
    const offset = Number(state.query_offsets[code] || 0);
    const size = growthPlanSize(scoped);
    if (offset < size) return { code, state: scoped, offset, size, nextCursor: (index + 1) % state.priority_order.length };
  }
  return null;
}

export function initialState(options = {}) {
  const baseline = Number(options.baseline || 185);
  return {
    schema_version: 1,
    status: 'ready',
    target_count: Number(options.target || 1100),
    snapshot_count: baseline,
    live_api_count: baseline,
    worker_version: String(options.workerVersion || ''),
    worker_sha: String(options.workerSha || ''),
    priority_order: [...PRIORITY_STATE_CODES],
    priority_cursor: 0,
    query_offsets: Object.fromEntries(PRIORITY_STATE_CODES.map(code => [code, 0])),
    approved_source_count: 0,
    state_totals: options.stateTotals || {},
    completed_milestones: milestones.filter(value => baseline >= value),
    current: null,
    active_instance: null,
    pending_source_ids: [],
    acquisition_batch: 1,
    results: [],
    deployments: [],
    blockers: [],
    updated_at: new Date().toISOString()
  };
}

export function compactStatus(state) {
  return {
    status: state.status,
    snapshot_count: state.snapshot_count,
    target_count: state.target_count,
    worker_version: state.worker_version,
    current: state.current,
    active_instance: state.active_instance,
    approved_source_count: state.approved_source_count,
    state_totals: state.state_totals,
    completed_milestones: state.completed_milestones,
    last_result: state.results.at(-1) || null,
    last_deployment: state.deployments.at(-1) || null,
    updated_at: state.updated_at
  };
}

function resultForInstance(state, instanceId) {
  return state.results.find(result => result.instance_id === instanceId) || null;
}

function currentAcquisitionBatches(state) {
  const code = state.current?.state_code;
  if (!code || !state.pending_source_ids.length) return [];
  const scoped = getStateConfig(code);
  const registry = parseGrowthRegistry(fs.readFileSync(path.join(repositoryRoot, growthRegistryPath), 'utf8'));
  const selected = sourcesForState(registry, code, state.pending_source_ids);
  return stagingSourceBatches(selected, { maxSources: scoped.workflow_batch_max_sources });
}

function checkpointResult(state, active, result) {
  const completed = {
    ...result,
    instance_id: active.id,
    worker_version: active.worker_version,
    worker_sha: active.worker_sha
  };
  if (!resultForInstance(state, active.id)) state.results.push(completed);
  return resultForInstance(state, active.id) || completed;
}

async function cycle(state, envFile, stateFile) {
  if (state.snapshot_count >= state.target_count) {
    state.status = 'complete';
    state.current = null;
    state.active_instance = null;
    saveState(stateFile, state);
    return false;
  }

  if (state.active_instance) {
    const active = state.active_instance;
    const result = checkpointResult(state, active, waitForWorkflow(envFile, active));
    state.active_instance = null;
    if (active.mode === 'discover') {
      state.query_offsets[active.state_code] = Number(result.next_query_offset);
      state.priority_cursor = Number(state.current?.next_priority_cursor || state.priority_cursor);
      const sourceCount = Number(result.publication?.source_count || result.publication?.source_ids?.length || 0);
      if (sourceCount > 0) {
        state.current = { ...state.current, discovery_instance_id: active.id, source_pr: result.publication.pr_number };
        state.status = 'reviewing_source_pr';
      } else {
        state.current = null;
        state.status = 'ready';
      }
    } else {
      if (Number(result.before) !== Number(state.snapshot_count)) throw new Error(`Acquisition snapshot drift: ${result.before} != ${state.snapshot_count}`);
      state.current = { ...state.current, acquisition_instance_id: active.id };
      if (Number(result.additions) > 0) {
        state.current.data_pr = result.publication.pr_number;
        state.status = 'reviewing_data_pr';
      } else {
        state.acquisition_batch += 1;
        state.status = 'ready_acquisition';
      }
    }
    saveState(stateFile, state);
    return true;
  }

  if (state.status === 'reviewing_source_pr') {
    const discovery = resultForInstance(state, state.current?.discovery_instance_id);
    if (!discovery) throw new Error('Source review has no checkpointed Cloudflare discovery result');
    assertRepositoryReady({ allowPr: discovery.publication.pr_number, allowBehind: true });
    state.pending_source_ids = mergeSourcePr(state, discovery);
    state.acquisition_batch = 1;
    state.status = 'ready_acquisition';
    saveState(stateFile, state);
    return true;
  }

  if (state.status === 'reviewing_data_pr') {
    const acquisition = resultForInstance(state, state.current?.acquisition_instance_id);
    if (!acquisition) throw new Error('Data review has no checkpointed Cloudflare acquisition result');
    assertRepositoryReady({ allowPr: acquisition.publication.pr_number, allowBehind: true });
    const merged = mergeDataPr(acquisition);
    state.snapshot_count = merged.count;
    state.state_totals = readSnapshotStateTotals();
    state.current.pending_deploy = { sha: merged.sha, count: merged.count, additions: acquisition.additions, pr_number: acquisition.publication.pr_number };
    state.status = 'deploying_production';
    saveState(stateFile, state);
    return true;
  }

  if (state.status === 'deploying_production') {
    const pending = state.current?.pending_deploy;
    if (!pending) throw new Error('Production deployment has no exact merged checkpoint');
    let deployment;
    try {
      deployment = await verifyProduction(envFile, pending.sha, pending.count);
    } catch {
      deployment = await deployAndVerify(envFile, pending.sha, pending.count);
    }
    state.live_api_count = deployment.live_api_count;
    if (!state.deployments.some(item => item.production_sha === deployment.production_sha)) {
      state.deployments.push({ ...deployment, state_code: state.current.state_code, additions: pending.additions, pr_number: pending.pr_number, deployed_at: new Date().toISOString() });
    }
    for (const milestone of milestones) if (state.snapshot_count >= milestone && !state.completed_milestones.includes(milestone)) state.completed_milestones.push(milestone);
    delete state.current.pending_deploy;
    state.acquisition_batch += 1;
    state.status = 'ready_acquisition';
    saveState(stateFile, state);
    return true;
  }

  if (state.status === 'ready_acquisition') {
    const batches = currentAcquisitionBatches(state);
    if (state.acquisition_batch > batches.length) {
      state.pending_source_ids = [];
      state.acquisition_batch = 1;
      state.current = null;
      state.status = 'ready';
      saveState(stateFile, state);
      return true;
    }
    assertRepositoryReady();
    const scoped = getStateConfig(state.current.state_code);
    state.active_instance = {
      id: triggerWorkflow(envFile, {
        mode: 'acquire', state_code: scoped.code, source_ids: state.pending_source_ids,
        batch_number: state.acquisition_batch, trigger: 'growth-controller'
      }),
      mode: 'acquire', state_code: scoped.code, state_name: scoped.name,
      worker_version: state.worker_version, worker_sha: state.worker_sha, started_at: new Date().toISOString()
    };
    state.status = 'running_cloudflare_acquisition';
    saveState(stateFile, state);
    safeNotifyRecoveryFromEnvironment({
      config: { controller_state_file: stateFile },
      overrides: {
        region: scoped.name,
        cursor: state.current?.query_offset,
        workflow_id: state.active_instance.id
      }
    });
    return true;
  }

  if (state.status !== 'ready') throw new Error(`Growth controller cannot resume status ${state.status}`);
  assertRepositoryReady();
  const selected = selectDiscovery(state);
  if (!selected) throw new Error('Priority discovery plan exhausted before target count was reached');
  state.current = {
    mode: 'discover', state_code: selected.code, query_offset: selected.offset,
    query_limit: 2, plan_size: selected.size, next_priority_cursor: selected.nextCursor
  };
  state.active_instance = {
    id: triggerWorkflow(envFile, { mode: 'discover', state_code: selected.code, query_offset: selected.offset, query_limit: 2, trigger: 'growth-controller' }),
    mode: 'discover', state_code: selected.code, state_name: selected.state.name,
    worker_version: state.worker_version, worker_sha: state.worker_sha, started_at: new Date().toISOString()
  };
  state.status = 'running_cloudflare_discovery';
  saveState(stateFile, state);
  safeNotifyRecoveryFromEnvironment({
    config: { controller_state_file: stateFile },
    overrides: {
      region: selected.state.name,
      cursor: selected.offset,
      workflow_id: state.active_instance.id
    }
  });
  return true;
}

function argumentValue(args, name, fallback = null) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}

export async function main(argv = process.argv.slice(2)) {
  const command = argv[0] || 'status';
  const stateFile = path.resolve(argumentValue(argv, '--state-file', process.env.PITCHLIST_GROWTH_STATE_FILE || defaultStateFile));
  const envFile = process.env.PITCHLIST_GROWTH_ENV_FILE;
  if (command === 'init') {
    if (fs.existsSync(stateFile)) throw new Error(`Growth controller state already exists: ${stateFile}`);
    assertRepositoryReady();
    const baseline = readSnapshotCount();
    const state = initialState({
      baseline,
      target: Number(argumentValue(argv, '--target', 1100)),
      workerVersion: argumentValue(argv, '--worker-version', ''),
      workerSha: run('git', ['rev-parse', 'HEAD']).trim(),
      stateTotals: readSnapshotStateTotals()
    });
    state.approved_source_count = approvedSourceCount();
    saveState(stateFile, state);
    process.stdout.write(`${JSON.stringify(compactStatus(state))}\n`);
    return;
  }
  let state = loadState(stateFile);
  if (command === 'status') {
    process.stdout.write(`${JSON.stringify(compactStatus(state))}\n`);
    return;
  }
  if (command !== 'run') throw new Error(`Unknown growth controller command: ${command}`);
  if (!envFile) throw new Error('Set PITCHLIST_GROWTH_ENV_FILE');
  while (await cycle(state, envFile, stateFile)) state = loadState(stateFile);
  process.stdout.write(`${JSON.stringify(compactStatus(loadState(stateFile)))}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
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
