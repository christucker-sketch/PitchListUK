import { createHash } from 'node:crypto';

import sourceOnboardingLib from '../../opportunity-pipeline/lib/source-onboarding.js';
import safetyLib from '../../opportunity-pipeline/lib/opportunity-safety.js';
import { assertMainUnchanged } from '../../cloudflare-texas-acquisition/src/data-branch-name.js';
import { githubJson } from './github-publication.mjs';

const { buildSourcePromotionManifest, validateSourcePromotionManifest } = sourceOnboardingLib;
const { canonicalUrl } = safetyLib;
const SOURCE_REGISTRY_PATH = 'operations/opportunity-pipeline/config/approved-source-routes.json';

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

async function githubOptional(env, path) {
  try { return await githubJson(env, path); }
  catch (error) {
    if (/GitHub 404:/.test(String(error?.message || ''))) return null;
    throw error;
  }
}

export async function readMainUkSourceRegistry(env) {
  const ref = await githubJson(env, '/git/ref/heads/main');
  const file = await githubJson(env, `/contents/${SOURCE_REGISTRY_PATH}?ref=main`);
  const registry = JSON.parse(decodeBase64Utf8(file?.content));
  if (!Array.isArray(registry)) throw new Error('UK approved source registry must be an array');
  return Object.freeze({
    mainSha: ref?.object?.sha,
    fileSha: file?.sha,
    registry: Object.freeze(registry),
    registry_path: SOURCE_REGISTRY_PATH
  });
}

function routeFromManifest(item, manifest) {
  return Object.freeze({
    host: item.host,
    organisation: item.organisation,
    type: item.type,
    terms_policy: item.terms_policy,
    geographic_coverage: item.geographic_coverage,
    opportunity_type: item.opportunity_type,
    official_application_route: item.official_application_route,
    recurring: item.recurring,
    recommended_polling_days: item.recommended_polling_days,
    opportunity_title: item.opportunity_title,
    source_path_prefix: item.source_path_prefix,
    approval_evidence_hash: item.evidence_hash,
    approval_decision: item.decision,
    approval_manifest_hash: manifest.manifest_hash
  });
}

export function planUkSourceRegistry(base, approvedCandidates, options = {}) {
  if (!base || !Array.isArray(base.registry)) throw new Error('UK source publication requires registry base');
  const candidates = Array.isArray(approvedCandidates) ? approvedCandidates : [];
  if (!candidates.length) return Object.freeze({
    manifest: null,
    registry: base.registry,
    summary: Object.freeze({ before_count: base.registry.length, additions: 0, after_count: base.registry.length })
  });
  const manifest = buildSourcePromotionManifest({
    candidates,
    reviewedCommit: base.mainSha,
    reviewer: options.reviewer || 'FindPitches Cloudflare deterministic source automation',
    expectedSourceCount: base.registry.length,
    now: options.generated_at || new Date().toISOString()
  });
  validateSourcePromotionManifest(manifest, { reviewedCommit: base.mainSha, currentSourceCount: base.registry.length });
  const existing = new Set(base.registry.map(item => canonicalUrl(item.official_application_route)).filter(Boolean));
  const additions = [];
  for (const item of manifest.routes) {
    const route = canonicalUrl(item.official_application_route);
    if (!route || existing.has(route)) continue;
    existing.add(route);
    additions.push(routeFromManifest(item, manifest));
  }
  if (additions.length !== manifest.routes.length) throw new Error('UK source publication manifest contains an existing route');
  const registry = [...base.registry, ...additions].sort((a, b) => String(a.official_application_route).localeCompare(String(b.official_application_route)));
  return Object.freeze({
    manifest,
    registry: Object.freeze(registry),
    summary: Object.freeze({
      before_count: base.registry.length,
      additions: additions.length,
      after_count: registry.length,
      removals: 0
    })
  });
}

function shortHash(value) {
  return createHash('sha256').update(String(value || '')).digest('hex').slice(0, 16);
}

export function ukSourceBranchName(plan, mainSha) {
  const manifestHash = String(plan?.manifest?.manifest_hash || '');
  if (!/^[a-f0-9]{64}$/i.test(manifestHash)) throw new Error('Invalid UK source manifest hash');
  if (!/^[a-f0-9]{40}$/i.test(String(mainSha || ''))) throw new Error('Invalid main SHA for UK source branch');
  return `sources/cloud-uk-growth-${manifestHash.slice(0, 16)}-base-${String(mainSha).slice(0, 16)}`;
}

export async function openUkSourcePullRequest(env, options = {}) {
  const base = options.base;
  const plan = options.plan;
  const additions = Number(plan?.summary?.additions || 0);
  if (additions < 1) return Object.freeze({ created: false, reason: 'no_net_new_sources', additions: 0 });
  if (!base?.mainSha || !Array.isArray(base.registry)) throw new Error('UK source publication requires registry base');
  if (Number(plan.summary.after_count) !== base.registry.length + additions) throw new Error('UK source publication count mismatch');

  const currentMain = await githubJson(env, '/git/ref/heads/main');
  assertMainUnchanged(base.mainSha, currentMain?.object?.sha);
  const branch = ukSourceBranchName(plan, base.mainSha);
  let existingBranch = await githubOptional(env, `/git/ref/heads/${encodeURIComponent(branch)}`);
  if (!existingBranch) {
    existingBranch = await githubJson(env, '/git/refs', {
      method: 'POST',
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: base.mainSha })
    });
  }

  const branchFile = await githubJson(env, `/contents/${base.registry_path || SOURCE_REGISTRY_PATH}?ref=${encodeURIComponent(branch)}`);
  const branchRegistry = JSON.parse(decodeBase64Utf8(branchFile.content));
  const expectedRoutes = new Set(plan.registry.map(item => canonicalUrl(item.official_application_route)));
  const alreadyWritten = Array.isArray(branchRegistry)
    && branchRegistry.length === plan.registry.length
    && branchRegistry.every(item => expectedRoutes.has(canonicalUrl(item.official_application_route)));
  if (!alreadyWritten) {
    await githubJson(env, `/contents/${base.registry_path || SOURCE_REGISTRY_PATH}`, {
      method: 'PUT',
      body: JSON.stringify({
        message: `Add ${additions} Cloudflare-discovered UK sources`,
        content: encodeBase64Utf8(`${JSON.stringify(plan.registry, null, 2)}\n`),
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

  const pr = await githubJson(env, '/pulls', {
    method: 'POST',
    body: JSON.stringify({
      title: `Add ${additions} cloud-discovered UK sources`,
      head: branch,
      base: 'main',
      body: [
        'Cloudflare global acquisition Workflow — UK source-discovery run.', '',
        `- approved source registry: ${base.registry.length} -> ${plan.registry.length}`,
        `- net-new public-service sources: ${additions}`,
        `- discovery queries: ${Number(options.query_count || 0)}`,
        `- Serper credits used: ${Number(options.serper_credits_used || 0)}`,
        `- manual-review candidates held out of this PR: ${Number(options.manual_review_count || 0)}`,
        '- only deterministic public-service first-party candidates are auto-promoted',
        '- source removals: forbidden',
        '- production opportunity rows: untouched',
        '- automatic merge: disabled',
        '- direct production deployment: disabled', '',
        'GitHub CI remains the source-registry gate. Opportunity acquisition runs only after this exact source PR is reviewed and merged.'
      ].join('\n')
    })
  });
  return Object.freeze({ created: true, branch, pr_number: pr.number, pr_url: pr.html_url, additions });
}

export { SOURCE_REGISTRY_PATH };
