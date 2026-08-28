import { WorkflowEntrypoint } from 'cloudflare:workers';

import { runApprovedTexasStaging } from '../../opportunity-pipeline/lib/texas-staging-runner.js';
import liveFetch from '../../opportunity-pipeline/lib/us-live-page-fetch.js';
import promotionLib from '../../opportunity-pipeline/lib/us-promotion-manifest.js';
import applyLib from '../../opportunity-pipeline/lib/us-promotion-apply.js';
import { enabledStates, getStateConfig } from './us-state-registry.js';

const { fetchApprovedPage } = liveFetch;
const { buildTexasPromotionManifest } = promotionLib;
const { planTexasProductionSnapshot } = applyLib;

function requireEnv(env, key) {
  const value = String(env?.[key] || '').trim();
  if (!value) throw new Error(`Missing required secret/config: ${key}`);
  return value;
}

function apiHeaders(env) {
  return {
    authorization: `Bearer ${requireEnv(env, 'GITHUB_TOKEN')}`,
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
    'user-agent': 'FindPitches-US-Acquisition/1.0'
  };
}

async function githubRequest(env, path, options = {}) {
  const repo = requireEnv(env, 'GITHUB_REPO');
  const response = await fetch(`https://api.github.com/repos/${repo}${path}`, {
    ...options,
    headers: { ...apiHeaders(env), ...(options.headers || {}) }
  });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { message: text }; }
  return { response, body };
}

async function githubJson(env, path, options = {}) {
  const { response, body } = await githubRequest(env, path, options);
  if (!response.ok) throw new Error(`GitHub ${response.status}: ${body?.message || response.statusText}`);
  return body;
}

async function githubOptional(env, path) {
  const { response, body } = await githubRequest(env, path);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub ${response.status}: ${body?.message || response.statusText}`);
  return body;
}

function decodeBase64Utf8(value) {
  const binary = atob(String(value || '').replace(/\s+/g, ''));
  return new TextDecoder().decode(Uint8Array.from(binary, char => char.charCodeAt(0)));
}

function encodeBase64Utf8(value) {
  const bytes = new TextEncoder().encode(String(value));
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function parseSnapshotModule(source) {
  const match = String(source || '').match(/export\s+const\s+usOpportunitySnapshot\s*=\s*([\s\S]*);\s*$/);
  if (!match) throw new Error('Could not parse US production snapshot module');
  return JSON.parse(match[1]);
}

function serializeSnapshot(snapshot) {
  return `export const usOpportunitySnapshot = ${JSON.stringify(snapshot, null, 2)};\n`;
}

function branchName(state, promotionManifest) {
  return `data/cloud-${state.slug}-growth-${promotionManifest.rows_sha256.slice(0, 16)}`;
}

async function readMainSnapshot(env, state) {
  const [ref, file] = await Promise.all([
    githubJson(env, '/git/ref/heads/main'),
    githubJson(env, `/contents/${state.snapshot_path}?ref=main`)
  ]);
  return { mainSha: ref?.object?.sha, fileSha: file?.sha, snapshot: parseSnapshotModule(decodeBase64Utf8(file?.content)) };
}

async function ensureBranch(env, branch, mainSha) {
  const existing = await githubOptional(env, `/git/ref/heads/${encodeURIComponent(branch)}`);
  if (existing) return existing;
  return githubJson(env, '/git/refs', { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: mainSha }) });
}

async function openDataPullRequest(env, state, planned, promotionManifest, base) {
  const additions = Number(planned?.summary?.additions || 0);
  if (additions < 1) return { created: false, reason: 'no_net_new_rows' };

  const branch = branchName(state, promotionManifest);
  await ensureBranch(env, branch, base.mainSha);
  const branchFile = await githubJson(env, `/contents/${state.snapshot_path}?ref=${encodeURIComponent(branch)}`);
  const branchSnapshot = parseSnapshotModule(decodeBase64Utf8(branchFile.content));
  const alreadyWritten = Number(branchSnapshot.total || branchSnapshot.rows?.length || 0) === planned.summary.after_count
    && String(branchSnapshot.source || '').includes(promotionManifest.rows_sha256);

  if (!alreadyWritten) {
    const nextSnapshot = {
      ...planned.preview,
      exported_at: new Date().toISOString(),
      source: `reviewed-us-${state.slug}-cloud-promotion:${promotionManifest.rows_sha256}`,
      total: planned.summary.after_count
    };
    await githubJson(env, `/contents/${state.snapshot_path}`, {
      method: 'PUT',
      body: JSON.stringify({
        message: `Publish ${additions} reviewed ${state.name} opportunities`,
        content: encodeBase64Utf8(serializeSnapshot(nextSnapshot)),
        sha: branchFile.sha,
        branch
      })
    });
  }

  const owner = requireEnv(env, 'GITHUB_REPO').split('/')[0];
  const existingPrs = await githubJson(env, `/pulls?state=open&head=${encodeURIComponent(`${owner}:${branch}`)}&base=main`);
  if (Array.isArray(existingPrs) && existingPrs.length) {
    const pr = existingPrs[0];
    return { created: false, reused: true, branch, pr_number: pr.number, pr_url: pr.html_url, additions };
  }

  const pr = await githubJson(env, '/pulls', {
    method: 'POST',
    body: JSON.stringify({
      title: `Publish ${additions} cloud-reviewed ${state.name} opportunities`,
      head: branch,
      base: 'main',
      body: [
        'Cloudflare US acquisition workflow run.', '',
        `- state: ${state.name} (${state.code})`,
        `- reviewed routes: ${state.sources.length}`,
        `- reviewed rows: ${planned.summary.reviewed_rows}`,
        `- production snapshot: ${planned.summary.before_count} -> ${planned.summary.after_count}`,
        `- net-new additions: ${additions}`,
        `- promotion rows SHA256: ${promotionManifest.rows_sha256}`,
        '- no automatic merge or deploy requested', '',
        'This PR was created by the scheduled Cloudflare US acquisition workflow; GitHub CI remains the publication gate.'
      ].join('\n')
    })
  });
  return { created: true, branch, pr_number: pr.number, pr_url: pr.html_url, additions };
}

function texasAdapter(state) {
  if (state.code !== 'TX') throw new Error(`No acquisition adapter registered for ${state.code}`);
  return {
    stage: async () => {
      const now = new Date();
      return runApprovedTexasStaging({
        sources: state.sources,
        generatedAt: now.toISOString(),
        runId: `cloudflare-${state.slug}-${now.toISOString().replace(/[:.]/g, '-')}`,
        fetchPage: candidate => fetchApprovedPage(candidate, { timeoutMs: 15000 })
      });
    },
    promote: staging => buildTexasPromotionManifest(staging, { sources: state.sources }),
    plan: (snapshot, promotion, staging) => planTexasProductionSnapshot(snapshot, promotion, staging, { sources: state.sources })
  };
}

export class TexasAcquisitionWorkflow extends WorkflowEntrypoint {
  async run(event, step) {
    const state = getStateConfig(event?.payload?.state_code || 'TX');
    const adapter = texasAdapter(state);

    const staging = await step.do(`fetch and stage approved ${state.name} sources`, {
      retries: { limit: 3, delay: '30 seconds', backoff: 'exponential' }, timeout: '20 minutes'
    }, adapter.stage);

    const promotion = await step.do(`build controlled ${state.name} promotion`, async () => adapter.promote(staging));
    const base = await step.do(`read current GitHub ${state.name} production snapshot`, {
      retries: { limit: 3, delay: '15 seconds', backoff: 'exponential' }, timeout: '5 minutes'
    }, async () => readMainSnapshot(this.env, state));
    const planned = await step.do(`plan isolated ${state.name} production delta`, async () => adapter.plan(base.snapshot, promotion, staging));
    const publication = await step.do(`open GitHub ${state.name} data PR if needed`, {
      retries: { limit: 2, delay: '30 seconds', backoff: 'exponential' }, timeout: '5 minutes'
    }, async () => openDataPullRequest(this.env, state, planned, promotion, base));

    return {
      state_code: state.code,
      state_name: state.name,
      trigger: event?.payload?.trigger || (event.schedule ? 'schedule' : 'manual'),
      source_count: state.sources.length,
      staged_count: staging.staged_count,
      held_count: staging.held_count,
      rejected_count: staging.rejected_count,
      before: planned.summary.before_count,
      after: planned.summary.after_count,
      additions: planned.summary.additions,
      promotion_rows_sha256: promotion.rows_sha256,
      publication
    };
  }
}

export default {
  async scheduled(controller, env, ctx) {
    for (const state of enabledStates()) {
      ctx.waitUntil(env.TEXAS_ACQUISITION.create({ params: {
        trigger: 'cron', state_code: state.code, cron: controller.cron, scheduled_time: controller.scheduledTime
      } }));
    }
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') {
      return Response.json({
        ok: true,
        service: 'pitchlist-us-acquisition',
        states: enabledStates().map(state => ({ code: state.code, name: state.name, source_count: state.sources.length }))
      });
    }
    if (request.method === 'POST' && url.pathname === '/run') {
      const expected = requireEnv(env, 'ADMIN_TOKEN');
      const supplied = String(request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
      if (!supplied || supplied !== expected) return new Response('Unauthorized', { status: 401 });
      const state = getStateConfig(url.searchParams.get('state') || 'TX');
      const instance = await env.TEXAS_ACQUISITION.create({ params: { trigger: 'manual', state_code: state.code } });
      return Response.json({ ok: true, state_code: state.code, instance_id: instance.id }, { status: 202 });
    }
    return new Response('Not found', { status: 404 });
  }
};
