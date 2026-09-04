import { WorkflowEntrypoint } from 'cloudflare:workers';

import { runApprovedTexasStaging } from '../../opportunity-pipeline/lib/texas-staging-runner.js';
import { runApprovedStateStaging } from '../../opportunity-pipeline/lib/us-state-staging-runner.js';
import liveFetch from '../../opportunity-pipeline/lib/us-live-page-fetch.js';
import promotionLib from '../../opportunity-pipeline/lib/us-promotion-manifest.js';
import applyLib from '../../opportunity-pipeline/lib/us-promotion-apply.js';
import statePublicationLib from '../../opportunity-pipeline/lib/us-state-publication-core.js';
import { createStateAdapter } from '../../opportunity-pipeline/lib/us-state-acquisition-core.js';
import { controlledRolloutScheduled } from './controlled-rollout-schedule.js';
import { assertMainUnchanged, dataBranchName } from './data-branch-name.js';
import { mergeStagingBatches, stagingSourceBatches } from './staging-batches.js';
import { receiptsForAddedSources } from './source-evidence-receipts.js';
import {
  chunkGrowthCandidates,
  finalizeGrowthDiscovery,
  normalizeGrowthCandidates,
  searchGrowthPlan,
  validateGrowthCandidateBatch
} from './us-growth-discovery.js';
import { growthPlanSize, growthQueryBatch } from './us-growth-plan.js';
import { mergeGrowthSources, parseGrowthRegistry, sourcesForState } from './us-growth-registry.js';
import { enabledStates, getStateConfig } from './us-state-registry.js';

const { fetchApprovedPage, fetchTextTarget, extractTitle, htmlToText } = liveFetch;
const { buildTexasPromotionManifest } = promotionLib;
const { planTexasProductionSnapshot } = applyLib;
const { buildStatePromotionManifest, planStateProductionSnapshot } = statePublicationLib;
const growthRegistryPath = 'operations/opportunity-pipeline/config/us-growth-source-registry.json';
const DISCOVERY_HTML_MAX_BYTES = 1024 * 1024;

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

async function readMainSnapshot(env, state) {
  const ref = await githubJson(env, '/git/ref/heads/main');
  const [file, growthFile] = await Promise.all([
    githubJson(env, `/contents/${state.snapshot_path}?ref=main`),
    githubJson(env, `/contents/${growthRegistryPath}?ref=main`)
  ]);
  return {
    mainSha: ref?.object?.sha,
    fileSha: file?.sha,
    snapshot: parseSnapshotModule(decodeBase64Utf8(file?.content)),
    growthRegistry: parseGrowthRegistry(decodeBase64Utf8(growthFile?.content)),
    growthRegistryFileSha: growthFile?.sha
  };
}

async function readMainGrowthRegistry(env) {
  const ref = await githubJson(env, '/git/ref/heads/main');
  const file = await githubJson(env, `/contents/${growthRegistryPath}?ref=main`);
  return {
    mainSha: ref?.object?.sha,
    fileSha: file?.sha,
    registry: parseGrowthRegistry(decodeBase64Utf8(file?.content))
  };
}

async function ensureBranch(env, branch, mainSha) {
  const existing = await githubOptional(env, `/git/ref/heads/${encodeURIComponent(branch)}`);
  if (existing) return existing;
  return githubJson(env, '/git/refs', { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: mainSha }) });
}

async function openDataPullRequest(env, state, planned, promotionManifest, base, reviewedSourceCount = state.sources.length, evidenceReceipts = []) {
  const additions = Number(planned?.summary?.additions || 0);
  if (additions < 1) return { created: false, reason: 'no_net_new_rows' };

  const currentMain = await githubJson(env, '/git/ref/heads/main');
  assertMainUnchanged(base.mainSha, currentMain?.object?.sha);
  const branch = dataBranchName(state, promotionManifest, base.mainSha);
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
        `- reviewed routes: ${reviewedSourceCount}`,
        `- reviewed rows: ${planned.summary.reviewed_rows}`,
        `- production snapshot: ${planned.summary.before_count} -> ${planned.summary.after_count}`,
        `- net-new additions: ${additions}`,
        `- promotion rows SHA256: ${promotionManifest.rows_sha256}`,
        `- deterministic evidence receipts: ${evidenceReceipts.length}/${planned.summary.reviewed_rows} passed`,
        ...evidenceReceipts.map(receipt => `  - ${receipt.source_id}: route=${receipt.attestation_method}; years=${receipt.live_application_years.join(',') || 'none'}; event_dates=${receipt.live_event_dates.join(',') || 'none'}; deadlines=${receipt.live_application_deadlines.join(',') || 'none'}`),
        '- no automatic merge or deploy requested', '',
        'This PR was created by the scheduled Cloudflare US acquisition workflow; GitHub CI remains the publication gate.'
      ].join('\n')
    })
  });
  return { created: true, branch, pr_number: pr.number, pr_url: pr.html_url, additions };
}

function sourceBranchName(state, sources, mainSha) {
  const material = sources.map(source => `${source.id}:${source.application_url}`).sort().join('|');
  let hash = 2166136261;
  for (const char of material) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `sources/cloud-us-${state.slug}-growth-${(hash >>> 0).toString(16).padStart(8, '0')}-base-${String(mainSha).slice(0, 16)}`;
}

async function openSourcePullRequest(env, state, base, discovery) {
  const merged = mergeGrowthSources(base.registry, discovery.sources, { stateCode: state.code });
  if (!merged.added.length) return { created: false, reason: 'no_net_new_sources', source_ids: [] };
  const currentMain = await githubJson(env, '/git/ref/heads/main');
  assertMainUnchanged(base.mainSha, currentMain?.object?.sha);
  const branch = sourceBranchName(state, merged.added, base.mainSha);
  await ensureBranch(env, branch, base.mainSha);
  const branchFile = await githubJson(env, `/contents/${growthRegistryPath}?ref=${encodeURIComponent(branch)}`);
  const branchRegistry = parseGrowthRegistry(decodeBase64Utf8(branchFile.content));
  const expectedIds = merged.added.map(source => source.id).sort();
  const evidenceReceipts = receiptsForAddedSources(discovery.receipts, merged.added);
  const alreadyWritten = expectedIds.every(id => branchRegistry.sources.some(source => source.id === id));
  if (!alreadyWritten) {
    await githubJson(env, `/contents/${growthRegistryPath}`, {
      method: 'PUT',
      body: JSON.stringify({
        message: `Add ${merged.added.length} Cloudflare-discovered ${state.name} sources`,
        content: encodeBase64Utf8(`${JSON.stringify(merged.registry, null, 2)}\n`),
        sha: branchFile.sha,
        branch
      })
    });
  }
  const owner = requireEnv(env, 'GITHUB_REPO').split('/')[0];
  const existingPrs = await githubJson(env, `/pulls?state=open&head=${encodeURIComponent(`${owner}:${branch}`)}&base=main`);
  if (Array.isArray(existingPrs) && existingPrs.length) {
    const pr = existingPrs[0];
    return { created: false, reused: true, branch, pr_number: pr.number, pr_url: pr.html_url, source_ids: expectedIds };
  }
  const beforeCount = base.registry.sources.length;
  const afterCount = merged.registry.sources.length;
  const pr = await githubJson(env, '/pulls', {
    method: 'POST',
    body: JSON.stringify({
      title: `Add ${merged.added.length} cloud-discovered ${state.name} sources`,
      head: branch,
      base: 'main',
      body: [
        'Cloudflare US source-discovery Workflow run.', '',
        `- state: ${state.name} (${state.code})`,
        `- discovery queries: ${discovery.metrics.queries_used}`,
        `- direct source pages fetched: ${discovery.metrics.pages_fetched}`,
        `- approved source registry: ${beforeCount} -> ${afterCount}`,
        `- net-new approved sources: ${merged.added.length}`,
        `- deterministic source evidence receipts: ${evidenceReceipts.length}/${merged.added.length} passed`,
        ...evidenceReceipts.map(receipt => `  - ${receipt.source_id}: ${receipt.route}; locality=${receipt.locality}; event_dates=${receipt.live_event_dates.join(',')}`),
        '- additions only; no source removals',
        '- no automatic merge or deploy requested', '',
        'This PR was generated from search and live-page evidence fetched inside the production Cloudflare Workflow. GitHub CI remains the publication gate.'
      ].join('\n')
    })
  });
  return { created: true, branch, pr_number: pr.number, pr_url: pr.html_url, source_ids: expectedIds };
}

async function runGrowthDiscoveryWorkflow(env, event, step, state) {
  const base = await step.do(`read current GitHub ${state.name} growth source registry`, {
    retries: { limit: 3, delay: '15 seconds', backoff: 'exponential' }, timeout: '5 minutes'
  }, async () => readMainGrowthRegistry(env));
  const queryOffset = Math.max(0, Number(event?.payload?.query_offset || 0));
  const queryLimit = Math.max(1, Math.min(4, Number(event?.payload?.query_limit || 2)));
  const asOfDate = String(event?.payload?.as_of_date || new Date().toISOString()).slice(0, 10);
  const plans = growthQueryBatch(state, { offset: queryOffset, limit: queryLimit });
  const searchBatches = [];
  for (const plan of plans) {
    searchBatches.push(await step.do(`search ${state.code} growth query ${plan.id}`, {
      retries: { limit: 3, delay: '15 seconds', backoff: 'exponential' }, timeout: '2 minutes'
    }, async () => searchGrowthPlan(env, plan)));
  }
  const normalized = await step.do(`normalize ${state.code} growth candidates offset ${queryOffset}`, async () => (
    normalizeGrowthCandidates({
      plans,
      searchBatches,
      existingSources: [...state.sources, ...base.registry.sources]
    })
  ));
  const candidateBatches = chunkGrowthCandidates(normalized.candidates, { batchSize: 4 });
  const validationBatches = [];
  for (let index = 0; index < candidateBatches.length; index += 1) {
    const candidates = candidateBatches[index];
    validationBatches.push(await step.do(`validate ${state.code} growth candidates batch ${index + 1} of ${candidateBatches.length}`, {
      retries: { limit: 2, delay: '30 seconds', backoff: 'exponential' }, timeout: '10 minutes'
    }, async () => validateGrowthCandidateBatch({
      candidates,
      state,
      asOfDate,
      fetchPage: async candidate => {
        const fetched = await fetchTextTarget(candidate.url, {
          timeoutMs: 15000,
          retries: 1,
          maxBytes: DISCOVERY_HTML_MAX_BYTES
        });
        return {
          url: fetched.finalUrl,
          title: extractTitle(fetched.html),
          text: htmlToText(fetched.html),
          fetch_route: 'discovery_source'
        };
      }
    })));
  }
  const discovery = await step.do(`dedupe and approve ${state.code} growth candidates offset ${queryOffset}`, async () => (
    finalizeGrowthDiscovery({
      plans,
      validationBatches,
      planSize: growthPlanSize(state),
      queryOffset,
      searchMetrics: normalized.metrics
    })
  ));
  let publication = { created: false, reason: 'no_net_new_sources', source_ids: [] };
  if (discovery.sources.length) {
    publication = await step.do(`open GitHub ${state.name} source registry PR`, {
      retries: { limit: 2, delay: '30 seconds', backoff: 'exponential' }, timeout: '5 minutes'
    }, async () => openSourcePullRequest(env, state, base, discovery));
  }
  const compactResult = {
    mode: 'discover',
    state_code: state.code,
    state_name: state.name,
    trigger: event?.payload?.trigger || 'manual',
    workflow_execution: 'cloudflare',
    base_main_sha: base.mainSha,
    query_offset: queryOffset,
    next_query_offset: queryOffset + discovery.metrics.queries_used,
    plan_size: discovery.metrics.plan_size,
    queries_used: discovery.metrics.queries_used,
    search_results_seen: discovery.metrics.results_seen,
    candidate_count: discovery.metrics.candidates_selected,
    validation_batches: discovery.metrics.validation_batches,
    direct_source_pages_polled: discovery.metrics.pages_fetched,
    generated_source_count: discovery.sources.length,
    evidence_passed_count: discovery.receipts.length,
    held_count: discovery.held.length,
    held_reasons: discovery.held_reasons,
    publication: publication.source_ids?.length ? {
      created: publication.created,
      reused: publication.reused === true,
      branch: publication.branch,
      pr_number: publication.pr_number,
      source_count: publication.source_ids.length
    } : publication
  };
  return step.do(`emit compact ${state.name} growth discovery result`, async () => compactResult);
}

function acquisitionAdapter(state) {
  if (state.code === 'TX') {
    return createStateAdapter(state, {
      stage: async (sources = state.sources) => {
        const now = new Date();
        return runApprovedTexasStaging({
          sources,
          generatedAt: now.toISOString(),
          runId: `cloudflare-${state.slug}-${now.toISOString().replace(/[:.]/g, '-')}`,
          fetchPage: candidate => fetchApprovedPage(candidate, { timeoutMs: 15000 })
        });
      },
      promote: (staging, sources = state.sources) => buildTexasPromotionManifest(staging, { sources }),
      plan: (snapshot, promotion, staging, sources = state.sources) => planTexasProductionSnapshot(snapshot, promotion, staging, { sources })
    });
  }

  return createStateAdapter(state, {
    stage: async (sources = state.sources) => {
      const now = new Date();
      return runApprovedStateStaging(state, {
        sources,
        generatedAt: now.toISOString(),
        runId: `cloudflare-${state.slug}-${now.toISOString().replace(/[:.]/g, '-')}`,
        fetchPage: candidate => fetchApprovedPage(candidate, { timeoutMs: 15000 })
      });
    },
    promote: (staging, sources = state.sources) => buildStatePromotionManifest(state, staging, { sources }),
    plan: (snapshot, promotion, staging, sources = state.sources) => planStateProductionSnapshot(state, snapshot, promotion, staging, { sources })
  });
}

function reasonCounts(items = []) {
  const counts = {};
  for (const item of items) {
    const reasons = Array.isArray(item?.reasons) && item.reasons.length
      ? item.reasons
      : [item?.reason || 'unspecified'];
    for (const reason of reasons) {
      const key = String(reason || 'unspecified');
      counts[key] = (counts[key] || 0) + 1;
    }
  }
  return counts;
}

export class TexasAcquisitionWorkflow extends WorkflowEntrypoint {
  async run(event, step) {
    const state = getStateConfig(event?.payload?.state_code || 'TX');
    if (event?.payload?.mode === 'discover') return runGrowthDiscoveryWorkflow(this.env, event, step, state);
    const adapter = acquisitionAdapter(state);
    const base = await step.do(`read current GitHub ${state.name} production snapshot`, {
      retries: { limit: 3, delay: '15 seconds', backoff: 'exponential' }, timeout: '5 minutes'
    }, async () => readMainSnapshot(this.env, state));
    const requestedSourceIds = Array.isArray(event?.payload?.source_ids) ? event.payload.source_ids : [];
    const acquisitionSources = requestedSourceIds.length
      ? sourcesForState(base.growthRegistry, state.code, requestedSourceIds)
      : state.sources;
    if (!acquisitionSources.length) throw new Error(`${state.name} acquisition has no selected approved sources`);
    const sourceBatches = stagingSourceBatches(acquisitionSources, { maxSources: state.workflow_batch_max_sources });
    const requestedBatch = event?.payload?.batch_number;
    const batchNumber = requestedBatch == null && sourceBatches.length === 1
      ? 1
      : Number(requestedBatch);
    if (!Number.isInteger(batchNumber) || batchNumber < 1 || batchNumber > sourceBatches.length) {
      throw new Error(`${state.name} requires batch_number between 1 and ${sourceBatches.length}`);
    }
    const selectedSources = sourceBatches[batchNumber - 1];
    const stagingBatch = await step.do(`fetch and stage approved ${state.name} sources batch ${batchNumber} of ${sourceBatches.length}`, {
      retries: { limit: 3, delay: '30 seconds', backoff: 'exponential' }, timeout: '20 minutes'
    }, async () => adapter.stage(selectedSources));
    const staging = await step.do(`validate controlled ${state.name} staging batch ${batchNumber}`, async () => (
      mergeStagingBatches(state, [stagingBatch])
    ));

    let promotion = null;
    let planned = {
      summary: {
        before_count: Number(base.snapshot?.total || 0),
        after_count: Number(base.snapshot?.total || 0),
        additions: 0
      }
    };
    let publication = { created: false, reason: 'no_net_new_rows' };
    if (Number(staging.staged_count || 0) > 0) {
      promotion = await step.do(`build controlled ${state.name} promotion`, async () => adapter.promote(staging, selectedSources));
      planned = await step.do(`plan isolated ${state.name} production delta`, async () => (
        adapter.plan(base.snapshot, promotion, staging, selectedSources)
      ));
    }
    if (promotion && Number(planned?.summary?.additions || 0) > 0) {
      publication = await step.do(`open GitHub ${state.name} data PR`, {
        retries: { limit: 2, delay: '30 seconds', backoff: 'exponential' }, timeout: '5 minutes'
      }, async () => openDataPullRequest(this.env, state, planned, promotion, base, selectedSources.length, staging.evidence_receipts));
    }

    const compactResult = {
      state_code: state.code,
      state_name: state.name,
      trigger: event?.payload?.trigger || (event.schedule ? 'schedule' : 'manual'),
      state_source_count: state.sources.length + sourcesForState(base.growthRegistry, state.code).length,
      requested_growth_source_count: requestedSourceIds.length,
      batch_number: batchNumber,
      batch_count: sourceBatches.length,
      source_count: selectedSources.length,
      staged_count: staging.staged_count,
      held_count: staging.held_count,
      rejected_count: staging.rejected_count,
      before: planned.summary.before_count,
      after: planned.summary.after_count,
      additions: planned.summary.additions,
      promotion_rows_sha256: promotion?.rows_sha256 || null,
      held_reasons: reasonCounts(staging.held),
      rejected_reasons: reasonCounts(staging.rejected),
      evidence_passed_count: staging.evidence_receipts.length,
      publication
    };
    return step.do(`emit compact ${state.name} rollout result`, async () => compactResult);
  }
}

export default {
  scheduled: controlledRolloutScheduled,

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
      const requestedBatch = url.searchParams.get('batch');
      const params = { trigger: 'manual', state_code: state.code, mode: url.searchParams.get('mode') || 'acquire' };
      if (requestedBatch != null) {
        const batchNumber = Number(requestedBatch);
        if (!Number.isInteger(batchNumber) || batchNumber < 1) return new Response('Invalid batch', { status: 400 });
        params.batch_number = batchNumber;
      }
      const instance = await env.TEXAS_ACQUISITION.create({ params });
      return Response.json({ ok: true, state_code: state.code, batch_number: params.batch_number || null, instance_id: instance.id }, { status: 202 });
    }
    return new Response('Not found', { status: 404 });
  }
};
