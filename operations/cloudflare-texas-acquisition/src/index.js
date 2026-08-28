import { WorkflowEntrypoint } from 'cloudflare:workers';

import { TEXAS_SOURCES } from '../../opportunity-pipeline/config/texas-source-registry.js';
import { runApprovedTexasStaging } from '../../opportunity-pipeline/lib/texas-staging-runner.js';
import liveFetch from '../../opportunity-pipeline/lib/us-live-page-fetch.js';
import promotionLib from '../../opportunity-pipeline/lib/us-promotion-manifest.js';
import applyLib from '../../opportunity-pipeline/lib/us-promotion-apply.js';

const { fetchApprovedPage } = liveFetch;
const { buildTexasPromotionManifest } = promotionLib;
const { planTexasProductionSnapshot } = applyLib;
const SNAPSHOT_PATH = 'functions/_data/us-opportunities.mjs';

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
    'user-agent': 'FindPitches-Texas-Acquisition/1.0'
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

function branchName(promotionManifest) {
  return `data/cloud-texas-growth-${promotionManifest.rows_sha256.slice(0, 16)}`;
}

async function readMainSnapshot(env) {
  const [ref, file] = await Promise.all([
    githubJson(env, '/git/ref/heads/main'),
    githubJson(env, `/contents/${SNAPSHOT_PATH}?ref=main`)
  ]);
  return {
    mainSha: ref?.object?.sha,
    fileSha: file?.sha,
    snapshot: parseSnapshotModule(decodeBase64Utf8(file?.content))
  };
}

async function ensureBranch(env, branch, mainSha) {
  const existing = await githubOptional(env, `/git/ref/heads/${encodeURIComponent(branch)}`);
  if (existing) return existing;
  return githubJson(env, '/git/refs', {
    method: 'POST',
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: mainSha })
  });
}

async function openDataPullRequest(env, planned, promotionManifest, base) {
  const additions = Number(planned?.summary?.additions || 0);
  if (additions < 1) return { created: false, reason: 'no_net_new_rows' };

  const branch = branchName(promotionManifest);
  await ensureBranch(env, branch, base.mainSha);

  const branchFile = await githubJson(env, `/contents/${SNAPSHOT_PATH}?ref=${encodeURIComponent(branch)}`);
  const branchSnapshot = parseSnapshotModule(decodeBase64Utf8(branchFile.content));
  const alreadyWritten = Number(branchSnapshot.total || branchSnapshot.rows?.length || 0) === planned.summary.after_count
    && String(branchSnapshot.source || '').includes(promotionManifest.rows_sha256);

  if (!alreadyWritten) {
    const nextSnapshot = {
      ...planned.preview,
      exported_at: new Date().toISOString(),
      source: `reviewed-us-texas-cloud-promotion:${promotionManifest.rows_sha256}`,
      total: planned.summary.after_count
    };
    await githubJson(env, `/contents/${SNAPSHOT_PATH}`, {
      method: 'PUT',
      body: JSON.stringify({
        message: `Publish ${additions} reviewed Texas opportunities`,
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
      title: `Publish ${additions} cloud-reviewed Texas opportunities`,
      head: branch,
      base: 'main',
      body: [
        'Cloudflare Workflow acquisition run.', '',
        `- reviewed routes: ${TEXAS_SOURCES.length}`,
        `- reviewed rows: ${planned.summary.reviewed_rows}`,
        `- production snapshot: ${planned.summary.before_count} -> ${planned.summary.after_count}`,
        `- net-new additions: ${additions}`,
        `- promotion rows SHA256: ${promotionManifest.rows_sha256}`,
        '- UK snapshot unchanged',
        '- no automatic merge or deploy requested', '',
        'This PR was created by the scheduled Cloudflare Texas acquisition workflow; GitHub CI remains the publication gate.'
      ].join('\n')
    })
  });
  return { created: true, branch, pr_number: pr.number, pr_url: pr.html_url, additions };
}

export class TexasAcquisitionWorkflow extends WorkflowEntrypoint {
  async run(event, step) {
    const staging = await step.do('fetch and stage approved Texas sources', {
      retries: { limit: 3, delay: '30 seconds', backoff: 'exponential' }, timeout: '20 minutes'
    }, async () => {
      const now = new Date();
      return runApprovedTexasStaging({
        sources: TEXAS_SOURCES,
        generatedAt: now.toISOString(),
        runId: `cloudflare-texas-${now.toISOString().replace(/[:.]/g, '-')}`,
        fetchPage: candidate => fetchApprovedPage(candidate, { timeoutMs: 15000 })
      });
    });

    const promotion = await step.do('build controlled Texas promotion', async () => buildTexasPromotionManifest(staging, { sources: TEXAS_SOURCES }));
    const base = await step.do('read current GitHub production snapshot', {
      retries: { limit: 3, delay: '15 seconds', backoff: 'exponential' }, timeout: '5 minutes'
    }, async () => readMainSnapshot(this.env));
    const planned = await step.do('plan isolated Texas production delta', async () => planTexasProductionSnapshot(base.snapshot, promotion, staging, { sources: TEXAS_SOURCES }));
    const publication = await step.do('open GitHub data PR if needed', {
      retries: { limit: 2, delay: '30 seconds', backoff: 'exponential' }, timeout: '5 minutes'
    }, async () => openDataPullRequest(this.env, planned, promotion, base));

    return {
      trigger: event.schedule ? 'schedule' : 'manual', source_count: TEXAS_SOURCES.length,
      staged_count: staging.staged_count, held_count: staging.held_count, rejected_count: staging.rejected_count,
      before: planned.summary.before_count, after: planned.summary.after_count, additions: planned.summary.additions,
      promotion_rows_sha256: promotion.rows_sha256, publication
    };
  }
}

export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(env.TEXAS_ACQUISITION.create({ params: { trigger: 'cron', cron: controller.cron, scheduled_time: controller.scheduledTime } }));
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') return Response.json({ ok: true, service: 'pitchlist-texas-acquisition', source_count: TEXAS_SOURCES.length });
    if (request.method === 'POST' && url.pathname === '/run') {
      const expected = requireEnv(env, 'ADMIN_TOKEN');
      const supplied = String(request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
      if (!supplied || supplied !== expected) return new Response('Unauthorized', { status: 401 });
      const instance = await env.TEXAS_ACQUISITION.create({ params: { trigger: 'manual' } });
      return Response.json({ ok: true, instance_id: instance.id }, { status: 202 });
    }
    return new Response('Not found', { status: 404 });
  }
};
