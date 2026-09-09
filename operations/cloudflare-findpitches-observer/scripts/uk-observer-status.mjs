#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const repo = process.env.FINDPITCHES_GITHUB_REPO || 'christucker-sketch/PitchListUK';
const discoveryWorkflow = 'uk-source-discovery-schedule.yml';
const acquisitionWorkflow = 'uk-source-registry-acquisition.yml';

function resolveGhBin() {
  const override = String(process.env.FINDPITCHES_GH_BIN || '').trim();
  if (override) return override;

  for (const candidate of [
    '/home/ct_admin/.local/bin/gh',
    '/usr/local/bin/gh',
    '/usr/bin/gh',
    '/snap/bin/gh'
  ]) {
    if (fs.existsSync(candidate)) return candidate;
  }

  try {
    const shell = process.env.SHELL || '/bin/bash';
    const resolved = execFileSync(shell, ['-lc', 'command -v gh'], {
      encoding: 'utf8',
      timeout: 10_000,
      stdio: ['ignore', 'pipe', 'pipe']
    }).trim();
    if (resolved) return resolved;
  } catch {
    // Fall through to the explicit diagnostic below.
  }

  throw new Error(`Unable to resolve GitHub CLI for UK observer (PATH=${process.env.PATH || ''})`);
}

const ghBin = resolveGhBin();

function ghApi(path, { raw = false } = {}) {
  const args = ['api', path];
  if (raw) args.push('-H', 'Accept: application/vnd.github.raw+json');
  try {
    const output = execFileSync(ghBin, args, {
      encoding: 'utf8',
      timeout: 20_000,
      maxBuffer: 4 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    return raw ? output : JSON.parse(output);
  } catch (error) {
    const stderr = String(error?.stderr || '').trim().slice(0, 1200);
    throw new Error(`GitHub API read failed via ${ghBin}: ${stderr || error?.message || error}`);
  }
}

function parseSnapshotTotal(source) {
  const match = String(source || '').match(/"total"\s*:\s*(\d+)/);
  if (!match) throw new Error('Unable to parse UK opportunity snapshot total');
  return Number(match[1]);
}

function workflowSummary(workflowFile) {
  const response = ghApi(`repos/${repo}/actions/workflows/${workflowFile}/runs?branch=main&per_page=1`);
  const run = Array.isArray(response?.workflow_runs) ? response.workflow_runs[0] : null;
  if (!run) return null;
  return {
    id: run.id,
    name: run.name,
    event: run.event,
    status: run.status,
    conclusion: run.conclusion,
    head_sha: run.head_sha,
    created_at: run.created_at,
    run_started_at: run.run_started_at,
    updated_at: run.updated_at,
    url: run.html_url
  };
}

function isUkAcquisitionPublicationPr(pr) {
  const title = String(pr?.title || '');
  const head = String(pr?.head?.ref || '');
  return /^Publish \d+ cloud-reviewed UK opportunit(?:y|ies)$/i.test(title)
    || /^Add \d+ cloud-discovered UK source(?:s)?$/i.test(title)
    || /^data\/cloud-uk-/i.test(head)
    || /^sources\/cloud-uk-/i.test(head);
}

function latestUkPublication() {
  const pulls = ghApi(`repos/${repo}/pulls?state=all&sort=updated&direction=desc&per_page=100`);
  const ukPull = (Array.isArray(pulls) ? pulls : []).find(isUkAcquisitionPublicationPr);
  if (!ukPull) return null;
  return {
    number: ukPull.number,
    title: ukPull.title,
    state: ukPull.state,
    merged_at: ukPull.merged_at,
    created_at: ukPull.created_at,
    updated_at: ukPull.updated_at,
    head_sha: ukPull.head?.sha || null,
    base_sha: ukPull.base?.sha || null,
    url: ukPull.html_url
  };
}

function openUkPublicationCount() {
  const pulls = ghApi(`repos/${repo}/pulls?state=open&per_page=100`);
  return (Array.isArray(pulls) ? pulls : []).filter(isUkAcquisitionPublicationPr).length;
}

function nextDailyRun(now = new Date()) {
  const next = new Date(now);
  next.setUTCHours(4, 37, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString();
}

function workflowFailed(run) {
  return run?.status === 'completed' && run?.conclusion && run.conclusion !== 'success';
}

export function buildUkObserverStatus(now = new Date()) {
  const opportunitySource = ghApi(`repos/${repo}/contents/functions/_data/opportunities.mjs`, { raw: true });
  const approvedRoutesSource = ghApi(`repos/${repo}/contents/operations/opportunity-pipeline/config/approved-source-routes.json`, { raw: true });
  const approvedRoutes = JSON.parse(approvedRoutesSource);
  const discovery = workflowSummary(discoveryWorkflow);
  const acquisition = workflowSummary(acquisitionWorkflow);
  const latestPublication = latestUkPublication();
  const openPublicationCount = openUkPublicationCount();

  const liveCount = parseSnapshotTotal(opportunitySource);
  const running = [discovery, acquisition].find((run) => run?.status === 'in_progress' || run?.status === 'queued');
  const failed = [discovery, acquisition].find(workflowFailed);

  let controllerStatus = 'healthy_idle';
  let blocker = null;
  if (failed) {
    controllerStatus = 'blocked_workflow_failure';
    blocker = {
      type: 'workflow_failure',
      workflow: failed.name,
      run_id: failed.id,
      conclusion: failed.conclusion,
      url: failed.url
    };
  } else if (openPublicationCount > 0) {
    controllerStatus = 'publication_pending';
  } else if (running) {
    controllerStatus = 'running_cloudflare_workflow';
  }

  return {
    market: 'UK',
    controller_status: controllerStatus,
    status_source: 'github_actions_and_main_snapshot',
    live_api_count: liveCount,
    snapshot_count: liveCount,
    approved_source_count: Array.isArray(approvedRoutes) ? approvedRoutes.length : 0,
    target_count: 400,
    active_workflow: running || null,
    blocker,
    open_publication_pr_count: openPublicationCount,
    last_publication: latestPublication,
    workflows: {
      discovery,
      acquisition
    },
    schedule: {
      discovery_cron_utc: '37 4 * * *',
      next_discovery_at: nextDailyRun(now)
    }
  };
}
