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

export function reconcileRepositoryMain(options = {}) {
  const git = options.git || (args => run('git', args));
  if (git(['status', '--short']).trim()) throw new Error('Repository worktree is not clean');
  if (git(['branch', '--show-current']).trim() !== 'main') throw new Error('Growth controller must run from main');
  try {
    git(['fetch', 'origin', 'main', '--quiet']);
  } catch (error) {
    throw new Error(`Failed to fetch origin/main: ${String(error?.message || error)}`);
  }
  let head = git(['rev-parse', 'HEAD']).trim();
  const originMain = git(['rev-parse', 'origin/main']).trim();
  if (head === originMain) return { head, originMain, fast_forwarded: false };

  let counts;
  try {
    counts = git(['rev-list', '--left-right', '--count', `${head}...${originMain}`]).trim().split(/\s+/).map(Number);
  } catch (error) {
    throw new Error(`Cannot prove local main ancestry: ${String(error?.message || error)}`);
  }
  if (counts.length !== 2 || counts.some(value => !Number.isInteger(value) || value < 0)) {
    throw new Error('Cannot prove local main ancestry from Git history');
  }
  const [localOnly, upstreamOnly] = counts;
  if (localOnly > 0 && upstreamOnly === 0) throw new Error(`Local main ${head} has ${localOnly} commit(s) not present on origin/main ${originMain}`);
  if (localOnly > 0) throw new Error(`Local main ${head} has diverged from origin/main ${originMain}`);
  if (upstreamOnly < 1) throw new Error(`Local main ${head} does not safely match origin/main ${originMain}`);
  if (git(['status', '--short']).trim()) throw new Error('Repository worktree became dirty before fast-forward');
  try {
    git(['merge', '--ff-only', 'origin/main']);
  } catch (error) {
    throw new Error(`Failed to fast-forward local main: ${String(error?.message || error)}`);
  }
  head = git(['rev-parse', 'HEAD']).trim();
  if (head !== originMain) throw new Error(`Fast-forward verification failed: local main ${head} != origin/main ${originMain}`);
  if (git(['status', '--short']).trim()) throw new Error('Repository worktree is not clean after fast-forward');
  return { head, originMain, fast_forwarded: true };
}

function assertRepositoryReady({ allowPr = null } = {}) {
  const { head } = reconcileRepositoryMain();
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

export function parseUsOpportunitySnapshot(source) {
  const match = String(source || '').match(/export const usOpportunitySnapshot\s*=\s*([\s\S]+);\s*$/);
  if (!match) throw new Error('US opportunity snapshot source is malformed');
  const snapshot = JSON.parse(match[1]);
  if (!Number.isInteger(snapshot?.total) || !Array.isArray(snapshot?.rows) || snapshot.total !== snapshot.rows.length) {
    throw new Error('US opportunity snapshot count is malformed');
  }
  return snapshot;
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
  const beforeSnapshot = parseUsOpportunitySnapshot(fileAt(baseSha, snapshotPath));
  const afterSnapshot = parseUsOpportunitySnapshot(fileAt(pr.headRefOid, snapshotPath));
  const beforeIds = new Set(beforeSnapshot.rows.map(row => String(row.id || row.stable_id || '')));
  const opportunityIds = afterSnapshot.rows
    .map(row => String(row.id || row.stable_id || ''))
    .filter(id => id && !beforeIds.has(id));
  if (beforeSnapshot.total + Number(result.additions) !== afterSnapshot.total || opportunityIds.length !== Number(result.additions) || new Set(opportunityIds).size !== opportunityIds.length) {
    throw new Error('Data PR published opportunity identities do not match the reviewed addition delta');
  }
  if (pr.state === 'OPEN') run('gh', ['pr', 'merge', String(pr.number), '--repo', githubRepository, '--merge', '--delete-branch', '--match-head-commit', headOid]);
  run('git', ['fetch', 'origin', 'main', '--quiet']);
  const localHead = run('git', ['rev-parse', 'HEAD']).trim();
  if (localHead !== run('git', ['rev-parse', 'origin/main']).trim()) run('git', ['merge', '--ff-only', 'origin/main']);
  const count = readSnapshotCount();
  if (count !== Number(result.after)) throw new Error(`Merged snapshot is ${count}; expected ${result.after}`);
  return {
    count,
    previous_count: beforeSnapshot.total,
    opportunity_ids: opportunityIds.sort(),
    sha: run('git', ['rev-parse', 'HEAD']).trim()
  };
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

async function verifyProductionDeployment(envFile, expectedSha) {
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
  return { deployment_id: production.id, production_sha: sha };
}

async function fetchLiveJson(url, fetchImpl) {
  try {
    const response = await fetchImpl(url, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (!response.ok) {
      const error = new Error(`Live FindPitches API returned ${response.status}`);
      error.liveConsistencyTransient = true;
      throw error;
    }
    return response.json();
  } catch (error) {
    if (error?.liveConsistencyTransient) throw error;
    const transient = new Error(`Live FindPitches API request failed: ${String(error?.message || error)}`);
    transient.liveConsistencyTransient = true;
    throw transient;
  }
}

export async function readLiveOpportunityConsistency(stateCode, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const global = await fetchLiveJson('https://findpitches.com/api/us-customer-opportunities/search?limit=1', fetchImpl);
  const count = Number(global.total);
  if (!Number.isInteger(count) || count < 0) throw new Error('Live FindPitches API returned an invalid total');
  const ids = new Set();
  let offset = 0;
  let stateTotal = null;
  do {
    const url = `https://findpitches.com/api/us-customer-opportunities/search?state=${encodeURIComponent(stateCode)}&limit=250&offset=${offset}`;
    const page = await fetchLiveJson(url, fetchImpl);
    const pageTotal = Number(page.total);
    if (!Number.isInteger(pageTotal) || pageTotal < 0 || !Array.isArray(page.rows)) throw new Error('Live state opportunity response is malformed');
    if (stateTotal === null) stateTotal = pageTotal;
    if (pageTotal !== stateTotal) throw new Error('Live state opportunity total changed during consistency verification');
    for (const row of page.rows) {
      const id = String(row?.id || row?.stable_id || '');
      if (id) ids.add(id);
    }
    offset += page.rows.length;
    if (page.rows.length === 0 && offset < stateTotal) throw new Error('Live state opportunity pagination ended early');
    if (offset > count || offset > 2000) throw new Error('Live state opportunity pagination exceeded its safe bound');
  } while (offset < stateTotal);
  return { count, ids };
}

export function classifyLiveConsistency(pending, live) {
  const expected = Number(pending?.count);
  const previous = Number(pending?.previous_count);
  const additions = Number(pending?.additions);
  const opportunityIds = [...(pending?.opportunity_ids || [])].map(String);
  if (!Number.isInteger(expected) || !Number.isInteger(previous) || !Number.isInteger(additions) || additions < 1 || previous + additions !== expected) {
    throw new Error('Live consistency checkpoint has an invalid published count delta');
  }
  if (opportunityIds.length !== additions || new Set(opportunityIds).size !== opportunityIds.length) {
    throw new Error('Live consistency checkpoint has invalid published opportunity identities');
  }
  const liveCount = Number(live?.count);
  if (!Number.isInteger(liveCount) || liveCount < 0) throw new Error('Live consistency response has an invalid count');
  if (liveCount > expected) throw new Error(`Live FindPitches count ${liveCount} exceeds expected ${expected}`);
  const liveIds = live?.ids instanceof Set ? live.ids : new Set(live?.ids || []);
  const missingIds = opportunityIds.filter(id => !liveIds.has(id));
  if (liveCount === expected) {
    if (missingIds.length) throw new Error(`Live FindPitches is missing expected opportunity identity ${missingIds[0]}`);
    return { status: 'consistent', live_count: liveCount };
  }
  if (expected - liveCount !== additions || liveCount !== previous) {
    throw new Error(`Live FindPitches count is ${liveCount}; expected ${expected} after publishing ${additions}`);
  }
  const prematurelyVisible = opportunityIds.find(id => liveIds.has(id));
  if (prematurelyVisible) throw new Error(`Live FindPitches count is behind but already contains published identity ${prematurelyVisible}`);
  return { status: 'waiting', live_count: liveCount, missing_ids: missingIds };
}

export function liveConsistencyBackoffMilliseconds(attempt, options = {}) {
  const base = Number(options.baseMs ?? 5000);
  const maximum = Number(options.maximumMs ?? 20000);
  if (!Number.isFinite(base) || base < 0 || !Number.isFinite(maximum) || maximum < base) throw new Error('Live consistency backoff configuration is invalid');
  return Math.min(maximum, base * (2 ** Math.max(0, Number(attempt || 1) - 1)));
}

export function assertLiveConsistencyWithinDeadline(waiting, pending, now = Date.now()) {
  if (now < Date.parse(waiting?.deadline_at || '')) return;
  const detail = waiting?.last_error || `Live FindPitches count is ${waiting?.last_live_count}; expected ${pending?.count}`;
  throw new Error(`Live consistency timed out: ${detail}`);
}

function beginLiveConsistency(pending, deployment) {
  const now = new Date();
  const windowSeconds = Math.max(30, Number(process.env.PITCHLIST_GROWTH_LIVE_CONSISTENCY_TIMEOUT_SECONDS || 120));
  return {
    deployment_id: deployment.deployment_id,
    production_sha: deployment.production_sha,
    started_at: now.toISOString(),
    deadline_at: new Date(now.getTime() + windowSeconds * 1000).toISOString(),
    attempts: 0,
    last_checked_at: null,
    last_live_count: null,
    last_error: null
  };
}

function finishProductionDeployment(state, pending, deployment, liveCount) {
  state.live_api_count = liveCount;
  if (!state.deployments.some(item => item.production_sha === deployment.production_sha)) {
    state.deployments.push({ ...deployment, live_api_count: liveCount, state_code: state.current.state_code, additions: pending.additions, pr_number: pending.pr_number, deployed_at: new Date().toISOString() });
  }
  for (const milestone of milestones) if (state.snapshot_count >= milestone && !state.completed_milestones.includes(milestone)) state.completed_milestones.push(milestone);
  delete state.current.pending_deploy;
  delete state.current.live_consistency;
  state.acquisition_batch += 1;
  state.status = 'ready_acquisition';
}

export function cleanupGeneratedDeploymentArtifacts(root = repositoryRoot) {
  for (const directory of ['global', 'us', 'uk', 'shared']) {
    fs.rmSync(path.join(root, 'public', directory), { recursive: true, force: true });
  }
}

async function deployProduction(envFile, sha) {
  run('npm', ['run', 'deploy:production'], { env: { ...process.env, PITCHLIST_DEPLOY_ENV_FILE: envFile } });
  run('git', ['restore', '--source=HEAD', '--', 'public/sitemap.xml']);
  cleanupGeneratedDeploymentArtifacts();
  if (run('git', ['status', '--short']).trim()) throw new Error('Deployment left unexpected repository changes');
  return verifyProductionDeployment(envFile, sha);
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
    assertRepositoryReady({ allowPr: discovery.publication.pr_number });
    state.pending_source_ids = mergeSourcePr(state, discovery);
    state.acquisition_batch = 1;
    state.status = 'ready_acquisition';
    saveState(stateFile, state);
    return true;
  }

  if (state.status === 'reviewing_data_pr') {
    const acquisition = resultForInstance(state, state.current?.acquisition_instance_id);
    if (!acquisition) throw new Error('Data review has no checkpointed Cloudflare acquisition result');
    assertRepositoryReady({ allowPr: acquisition.publication.pr_number });
    const merged = mergeDataPr(acquisition);
    state.snapshot_count = merged.count;
    state.state_totals = readSnapshotStateTotals();
    state.current.pending_deploy = {
      sha: merged.sha,
      count: merged.count,
      previous_count: merged.previous_count,
      additions: acquisition.additions,
      opportunity_ids: merged.opportunity_ids,
      pr_number: acquisition.publication.pr_number
    };
    state.status = 'deploying_production';
    saveState(stateFile, state);
    return true;
  }

  if (state.status === 'deploying_production') {
    const pending = state.current?.pending_deploy;
    if (!pending) throw new Error('Production deployment has no exact merged checkpoint');
    let deployment;
    try {
      deployment = await verifyProductionDeployment(envFile, pending.sha);
    } catch {
      deployment = await deployProduction(envFile, pending.sha);
    }
    state.current.live_consistency = beginLiveConsistency(pending, deployment);
    state.status = 'waiting_for_live_consistency';
    saveState(stateFile, state);
    return true;
  }

  if (state.status === 'waiting_for_live_consistency') {
    const pending = state.current?.pending_deploy;
    const waiting = state.current?.live_consistency;
    if (!pending || !waiting) throw new Error('Live consistency wait has no exact deployment checkpoint');
    const deployment = await verifyProductionDeployment(envFile, pending.sha);
    if (deployment.deployment_id !== waiting.deployment_id || deployment.production_sha !== waiting.production_sha) {
      throw new Error('Live consistency deployment no longer matches the expected publication');
    }
    waiting.attempts = Number(waiting.attempts || 0) + 1;
    waiting.last_checked_at = new Date().toISOString();
    try {
      const live = await readLiveOpportunityConsistency(state.current.state_code);
      const consistency = classifyLiveConsistency(pending, live);
      waiting.last_live_count = consistency.live_count;
      waiting.last_error = null;
      if (consistency.status === 'consistent') {
        finishProductionDeployment(state, pending, deployment, consistency.live_count);
        saveState(stateFile, state);
        return true;
      }
    } catch (error) {
      const message = String(error?.message || error);
      if (!error?.liveConsistencyTransient) throw error;
      waiting.last_error = message;
    }
    assertLiveConsistencyWithinDeadline(waiting, pending);
    saveState(stateFile, state);
    await new Promise(resolve => setTimeout(resolve, liveConsistencyBackoffMilliseconds(waiting.attempts)));
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
