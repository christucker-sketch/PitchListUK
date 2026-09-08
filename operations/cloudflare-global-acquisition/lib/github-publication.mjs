import { createHash } from 'node:crypto';

import {
  getGlobalAcquisitionMarket,
  globalAcquisitionServiceIdentity,
  parseAcquisitionSnapshotModule,
  serializeAcquisitionSnapshotModule
} from '../../../platform/acquisition/global-engine.mjs';
import { assertMainUnchanged } from '../../cloudflare-texas-acquisition/src/data-branch-name.js';
import { openPullRequestViaBroker } from './github-pr-broker.mjs';

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
    'user-agent': globalAcquisitionServiceIdentity()
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

export async function githubJson(env, path, options = {}) {
  if (path === '/pulls' && String(options.method || 'GET').toUpperCase() === 'POST') {
    let payload = {};
    try { payload = JSON.parse(String(options.body || '{}')); } catch { throw new Error('GitHub PR payload is invalid JSON'); }
    const result = await openPullRequestViaBroker(env, payload);
    return { number: result.pr_number, html_url: result.pr_url };
  }
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
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

export async function readMainMarketSnapshot(env, country) {
  const market = getGlobalAcquisitionMarket(country);
  const ref = await githubJson(env, '/git/ref/heads/main');
  const file = await githubJson(env, `/contents/${market.snapshot_path}?ref=main`);
  return Object.freeze({
    country: market.country,
    snapshot_path: market.snapshot_path,
    mainSha: ref?.object?.sha,
    fileSha: file?.sha,
    snapshot: parseAcquisitionSnapshotModule(decodeBase64Utf8(file?.content), market.country)
  });
}

async function ensureBranch(env, branch, mainSha) {
  const existing = await githubOptional(env, `/git/ref/heads/${encodeURIComponent(branch)}`);
  if (existing) return existing;
  return githubJson(env, '/git/refs', {
    method: 'POST',
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: mainSha })
  });
}

function shortSha(value, label) {
  const sha = String(value || '').trim().toLowerCase();
  if (!/^[a-f0-9]{40,64}$/.test(sha)) throw new Error(`Invalid ${label} SHA`);
  return sha.slice(0, 16);
}

export function ukAdditionBranchName(manifest, mainSha) {
  const rows = (manifest?.changes?.additions || []).map(item => item.row);
  const rowsHash = createHash('sha256').update(JSON.stringify(rows)).digest('hex');
  return `data/cloud-uk-approved-additions-${shortSha(rowsHash, 'UK addition rows')}-base-${shortSha(mainSha, 'main')}`;
}

export async function openUkAdditionPullRequest(env, options = {}) {
  const base = options.base;
  const manifest = options.manifest;
  const nextSnapshot = options.nextSnapshot;
  const additions = Number(manifest?.changes?.additions?.length || 0);
  if (additions < 1) return Object.freeze({ created: false, reason: 'no_net_new_rows', additions: 0 });
  if (base?.country !== 'UK') throw new Error('UK addition publication requires UK snapshot base');
  if (!nextSnapshot || !Array.isArray(nextSnapshot.rows)) throw new Error('UK addition publication requires planned snapshot');

  const currentMain = await githubJson(env, '/git/ref/heads/main');
  assertMainUnchanged(base.mainSha, currentMain?.object?.sha);
  const branch = ukAdditionBranchName(manifest, base.mainSha);
  await ensureBranch(env, branch, base.mainSha);

  const branchFile = await githubJson(env, `/contents/${base.snapshot_path}?ref=${encodeURIComponent(branch)}`);
  const branchSnapshot = parseAcquisitionSnapshotModule(decodeBase64Utf8(branchFile.content), 'UK');
  const expectedSource = String(nextSnapshot.source || '');
  const alreadyWritten = Number(branchSnapshot.total || branchSnapshot.rows?.length || 0) === Number(nextSnapshot.total)
    && String(branchSnapshot.source || '') === expectedSource;

  if (!alreadyWritten) {
    await githubJson(env, `/contents/${base.snapshot_path}`, {
      method: 'PUT',
      body: JSON.stringify({
        message: `Publish ${additions} reviewed UK opportunities`,
        content: encodeBase64Utf8(serializeAcquisitionSnapshotModule(nextSnapshot, 'UK')),
        sha: branchFile.sha,
        branch
      })
    });
  }

  const currentMainAfterWrite = await githubJson(env, '/git/ref/heads/main');
  assertMainUnchanged(base.mainSha, currentMainAfterWrite?.object?.sha);

  const owner = requireEnv(env, 'GITHUB_REPO').split('/')[0];
  const existingPrs = await githubJson(env, `/pulls?state=open&head=${encodeURIComponent(`${owner}:${branch}`)}&base=main`);
  if (Array.isArray(existingPrs) && existingPrs.length) {
    const pr = existingPrs[0];
    return Object.freeze({ created: false, reused: true, branch, pr_number: pr.number, pr_url: pr.html_url, additions });
  }

  const heldExisting = manifest?.automation?.held_existing_routes || [];
  const pr = await githubJson(env, '/pulls', {
    method: 'POST',
    body: JSON.stringify({
      title: `Publish ${additions} cloud-reviewed UK opportunities`,
      head: branch,
      base: 'main',
      body: [
        'Cloudflare global acquisition Workflow — UK additions-only run.', '',
        `- production snapshot: ${base.snapshot.rows.length} -> ${nextSnapshot.rows.length}`,
        `- net-new additions: ${additions}`,
        `- customer-ready direct-source rows reviewed: ${Number(options.reviewed_row_count || 0)}`,
        `- existing source routes held as forbidden updates: ${heldExisting.length}`,
        '- source discovery: none',
        '- Serper credits: 0',
        '- updates: forbidden',
        '- removals: forbidden',
        '- automatic merge: disabled',
        '- direct production deployment: disabled', '',
        'GitHub CI remains the publication gate. A merge of this exact data PR is the only route to the customer-facing UK snapshot.'
      ].join('\n')
    })
  });

  return Object.freeze({ created: true, branch, pr_number: pr.number, pr_url: pr.html_url, additions });
}
