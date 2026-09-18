import { createHash } from 'node:crypto';

import { githubJson } from './github-publication.mjs';

const SOURCE_REGISTRY_PATH = 'operations/opportunity-pipeline/config/ca-approved-source-routes.json';
const ALLOWED_SOURCE_CLASSES = new Set(['public-service', 'event-organiser']);

function requireEnv(env, key) {
  const value = String(env?.[key] || '').trim();
  if (!value) throw new Error(`Missing required secret/config: ${key}`);
  return value;
}

function decodeBase64Utf8(value) {
  const binary = atob(String(value || '').replace(/\s+/g, ''));
  return new TextDecoder().decode(Uint8Array.from(binary, char => char.charCodeAt(0)));
}

function encodeBase64Utf8(value) {
  const bytes = new TextEncoder().encode(String(value));
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

function canonicalUrl(value) {
  const url = new URL(String(value || ''));
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) throw new Error('canada_source_url_invalid');
  url.hash = '';
  return url.toString();
}

function assertSource(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error('canada_source_invalid');
  if (!/^ca-[a-z]{2}-[a-f0-9]{12}$/.test(String(source.id || ''))) throw new Error('canada_source_id_invalid');
  if (String(source.country_code || '') !== 'CA') throw new Error('canada_source_country_invalid');
  const region = String(source.region_code || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(region) || String(source.jurisdiction || '') !== `CA-${region}`) throw new Error('canada_source_jurisdiction_invalid');
  if (!ALLOWED_SOURCE_CLASSES.has(String(source.source_class || ''))) throw new Error('canada_source_class_invalid');
  if (String(source.status || '') !== 'approved-pilot') throw new Error('canada_source_status_invalid');
  canonicalUrl(source.source_url);
  canonicalUrl(source.application_url);
  if (!String(source.evidence || '').trim()) throw new Error('canada_source_evidence_missing');
  return source;
}

export async function readMainCanadaSourceRegistry(env) {
  const [ref, file] = await Promise.all([
    githubJson(env, '/git/ref/heads/main'),
    githubJson(env, `/contents/${SOURCE_REGISTRY_PATH}?ref=main`)
  ]);
  const registry = JSON.parse(decodeBase64Utf8(file?.content));
  if (!Array.isArray(registry)) throw new Error('canada_source_registry_invalid');
  registry.forEach(assertSource);
  return Object.freeze({ mainSha: String(ref?.object?.sha || ''), fileSha: String(file?.sha || ''), registry: Object.freeze(registry), registry_path: SOURCE_REGISTRY_PATH });
}

export function planCanadaSourceRegistry(base, approvedSources = []) {
  if (!base || !Array.isArray(base.registry)) throw new Error('canada_source_publication_base_invalid');
  const existingIds = new Set();
  const existingUrls = new Set();
  for (const source of base.registry) {
    assertSource(source);
    if (existingIds.has(source.id)) throw new Error('canada_source_registry_duplicate_id');
    const route = canonicalUrl(source.source_url);
    if (existingUrls.has(route)) throw new Error('canada_source_registry_duplicate_url');
    existingIds.add(source.id);
    existingUrls.add(route);
  }

  const additions = [];
  for (const candidate of approvedSources || []) {
    assertSource(candidate);
    const route = canonicalUrl(candidate.source_url);
    if (existingIds.has(candidate.id) || existingUrls.has(route)) continue;
    if (additions.some(item => item.id === candidate.id || canonicalUrl(item.source_url) === route)) continue;
    additions.push(candidate);
  }
  additions.sort((a, b) => a.id.localeCompare(b.id));
  const registry = [...base.registry, ...additions].sort((a, b) => a.id.localeCompare(b.id));
  return Object.freeze({
    registry: Object.freeze(registry),
    additions: Object.freeze(additions),
    summary: Object.freeze({ before_count: base.registry.length, additions: additions.length, removals: 0, after_count: registry.length })
  });
}

function planDigest(plan, baseSha) {
  return createHash('sha256').update(JSON.stringify({ baseSha, additions: plan.additions.map(source => source.id) })).digest('hex');
}

export function canadaSourceBranchName(plan, mainSha) {
  if (!/^[a-f0-9]{40}$/i.test(String(mainSha || ''))) throw new Error('canada_source_main_sha_invalid');
  const digest = planDigest(plan, mainSha);
  return `sources/cloud-ca-growth-${digest.slice(0, 16)}-base-${String(mainSha).slice(0, 16)}`;
}

async function githubOptional(env, path) {
  try { return await githubJson(env, path); }
  catch (error) {
    if (/GitHub 404:/.test(String(error?.message || ''))) return null;
    throw error;
  }
}

export async function openCanadaSourcePullRequest(env, options = {}) {
  const base = options.base;
  const plan = options.plan;
  const additions = Number(plan?.summary?.additions || 0);
  if (additions < 1) return Object.freeze({ created: false, reason: 'no_net_new_sources', additions: 0 });
  if (!base?.mainSha || !Array.isArray(base.registry) || Number(plan.summary.after_count) !== base.registry.length + additions) throw new Error('canada_source_publication_count_mismatch');

  const currentMain = await githubJson(env, '/git/ref/heads/main');
  if (String(currentMain?.object?.sha || '') !== base.mainSha) throw new Error('canada_source_publication_main_advanced');
  const branch = canadaSourceBranchName(plan, base.mainSha);
  let branchRef = await githubOptional(env, `/git/ref/heads/${encodeURIComponent(branch)}`);
  if (!branchRef) branchRef = await githubJson(env, '/git/refs', { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: base.mainSha }) });

  const branchFile = await githubJson(env, `/contents/${SOURCE_REGISTRY_PATH}?ref=${encodeURIComponent(branch)}`);
  const branchRegistry = JSON.parse(decodeBase64Utf8(branchFile?.content));
  const expectedIds = plan.registry.map(source => source.id);
  const alreadyWritten = Array.isArray(branchRegistry) && branchRegistry.length === plan.registry.length && branchRegistry.every((source, index) => source?.id === expectedIds[index]);
  if (!alreadyWritten) {
    await githubJson(env, `/contents/${SOURCE_REGISTRY_PATH}`, {
      method: 'PUT',
      body: JSON.stringify({
        message: `Add ${additions} Cloudflare-discovered Canada sources`,
        content: encodeBase64Utf8(`${JSON.stringify(plan.registry, null, 2)}\n`),
        sha: branchFile.sha,
        branch
      })
    });
  }

  const currentMainAfterWrite = await githubJson(env, '/git/ref/heads/main');
  if (String(currentMainAfterWrite?.object?.sha || '') !== base.mainSha) throw new Error('canada_source_publication_main_advanced');
  const owner = requireEnv(env, 'GITHUB_REPO').split('/')[0];
  const existingPrs = await githubJson(env, `/pulls?state=open&head=${encodeURIComponent(`${owner}:${branch}`)}&base=main`);
  if (Array.isArray(existingPrs) && existingPrs.length) {
    const pr = existingPrs[0];
    return Object.freeze({ created: false, reused: true, branch, pr_number: pr.number, pr_url: pr.html_url, additions, source_ids: plan.additions.map(source => source.id) });
  }

  const receipts = plan.additions.map(source => `  - ${source.id}: ${source.source_url}; region=${source.region_code}; class=${source.source_class}`);
  const pr = await githubJson(env, '/pulls', {
    method: 'POST',
    body: JSON.stringify({
      title: `Add ${additions} cloud-discovered Canada sources`,
      head: branch,
      base: 'main',
      body: [
        'Cloudflare global acquisition Workflow — Canada opportunity-first source promotion.', '',
        `- approved Canada source registry: ${base.registry.length} -> ${plan.registry.length}`,
        `- net-new approved sources: ${additions}`,
        `- deterministic source evidence receipts: ${additions}/${additions} passed`,
        ...receipts,
        `- discovery queries: ${Number(options.query_count || 0)}`,
        `- Serper credits used: ${Number(options.serper_credits_used || 0)}`,
        `- manual-review candidates held out: ${Number(options.manual_review_count || 0)}`,
        '- additions only; no source removals',
        '- production Canada opportunities untouched by this PR',
        '- no automatic merge or deploy requested by the source-discovery Workflow', '',
        'GitHub CI and the controller publication gates remain authoritative.'
      ].join('\n')
    })
  });
  return Object.freeze({ created: true, reused: false, branch, pr_number: pr.number, pr_url: pr.html_url, additions, source_ids: plan.additions.map(source => source.id) });
}

export { SOURCE_REGISTRY_PATH, ALLOWED_SOURCE_CLASSES };