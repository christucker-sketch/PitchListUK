import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  candidateFromLivePage,
  chunkGrowthCandidates,
  discoverGrowthSources,
  finalizeGrowthDiscovery,
  normalizeGrowthCandidates,
  validateGrowthCandidateBatch
} from '../../cloudflare-texas-acquisition/src/us-growth-discovery.js';
import liveFetch from '../lib/us-live-page-fetch.js';
import { growthQueryBatch, growthQueryPlan, PRIORITY_STATE_CODES } from '../../cloudflare-texas-acquisition/src/us-growth-plan.js';
import { mergeGrowthSources, parseGrowthRegistry, sourcesForState, validateGrowthSource } from '../../cloudflare-texas-acquisition/src/us-growth-registry.js';
import {
  assertLiveConsistencyWithinDeadline,
  classifyLiveConsistency,
  cleanupGeneratedDeploymentArtifacts,
  initialState,
  liveConsistencyBackoffMilliseconds,
  parseCompactWorkflowOutput,
  parseUsOpportunitySnapshot,
  readLiveOpportunityConsistency,
  validateSourcePr
} from '../../cloudflare-texas-acquisition/scripts/growth-controller.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '../../..');
const state = { code: 'CA', name: 'California', slug: 'california', jurisdiction: 'US-CA', sources: [] };
const { fetchTextTarget } = liveFetch;

function source(overrides = {}) {
  return {
    id: 'ca-riverside-autumn-fair-2026-1234abcd',
    name: 'Riverside Autumn Fair Vendor Application',
    organiser: 'Riverside Autumn Fair',
    source_url: 'https://riverside.example.org/vendors',
    application_url: 'https://riverside.example.org/vendors',
    source_class: 'festival-organisation',
    country_code: 'US', jurisdiction: 'US-CA', region_code: 'CA', locality: 'Riverside',
    recurring: false, multi_event: false, event_start: '2026-10-10', event_end: '2026-10-11',
    status: 'approved-pilot', evidence: 'Live first-party route attests exact event dates and vendor applications.',
    ...overrides
  };
}

test('growth query plan prioritises the requested high-density states and stays bounded per Workflow', () => {
  assert.deepEqual(PRIORITY_STATE_CODES.slice(0, 5), ['CA', 'TX', 'FL', 'NY', 'PA']);
  const plan = growthQueryPlan(state, { years: [2026] });
  assert.equal(plan.length, 72);
  assert.match(plan[0].query, /California/);
  assert.match(plan[0].query, /site:\.gov/);
  assert.deepEqual(growthQueryBatch(state, { years: [2026], offset: 3, limit: 2 }).map(item => item.id), plan.slice(3, 5).map(item => item.id));
  assert.equal(growthQueryBatch(state, { years: [2026], offset: plan.length, limit: 2 }).length, 0);
});

test('growth registry is additions-only, state-scoped and duplicate-safe', () => {
  const empty = parseGrowthRegistry({ version: 1, updated_at: null, sources: [] });
  const merged = mergeGrowthSources(empty, [source()], { stateCode: 'CA', updatedAt: '2026-08-31T09:30:00.000Z' });
  assert.equal(merged.added.length, 1);
  assert.equal(merged.registry.sources.length, 1);
  assert.deepEqual(sourcesForState(merged.registry, 'CA', [source().id]).map(item => item.id), [source().id]);
  assert.equal(mergeGrowthSources(merged.registry, [source()], { stateCode: 'CA' }).added.length, 0);
  assert.throws(() => validateGrowthSource(source({ region_code: 'TX', jurisdiction: 'US-TX' }), { stateCode: 'CA' }), /escaped requested state/);
  assert.throws(() => parseGrowthRegistry({ version: 1, sources: [source(), source({ id: 'ca-other', source_url: 'https://other.example', application_url: source().application_url })] }), /duplicate application routes/);
});

test('live Cloudflare discovery candidate requires place, actionable vendor evidence and exact future dates', () => {
  const plan = { id: 'ca-riverside-2026-festival', locality: 'Riverside', state_code: 'CA', state_name: 'California', year: 2026 };
  const result = { title: 'Riverside Autumn Fair Vendor Application', url: 'https://riversideautumnfair.org/vendors' };
  const accepted = candidateFromLivePage({
    plan, result, state, asOfDate: '2026-08-31',
    fetched: { url: result.url, title: result.title, text: 'Riverside, California Autumn Fair event October 10-11, 2026. Vendor applications are open for artists, makers and food vendors.' }
  });
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.source.event_start, '2026-10-10');
  assert.equal(accepted.source.event_end, '2026-10-11');
  assert.equal(accepted.receipt.locality, 'Riverside');

  const wrongPlace = candidateFromLivePage({
    plan, result, state, asOfDate: '2026-08-31',
    fetched: { url: result.url, title: result.title, text: 'Sacramento, California Autumn Fair event October 10-11, 2026. Vendor applications are open.' }
  });
  assert.equal(wrongPlace.accepted, false);
  assert.equal(wrongPlace.reason, 'state_or_locality_not_attested');

  const ambiguous = candidateFromLivePage({
    plan, result, state, asOfDate: '2026-08-31',
    fetched: { url: result.url, title: result.title, text: 'Riverside, California vendor market events September 5, 2026. Market event October 10, 2026. Market event December 1, 2026. Vendor applications are open.' }
  });
  assert.equal(ambiguous.accepted, false);
  assert.equal(ambiguous.reason, 'live_event_dates_ambiguous');
});

test('discovery performs injected Cloudflare search/fetch and returns compact evidence-bound sources', async () => {
  const result = await discoverGrowthSources({}, state, {
    asOfDate: '2026-08-31', years: [2026], queryOffset: 0, queryLimit: 1,
    search: async () => [{ title: 'Los Angeles Makers Fair Vendor Application', url: 'https://lamakersfair.example/vendors' }],
    fetchPage: async candidate => ({ url: candidate.url, title: 'Los Angeles Makers Fair Vendor Application', text: 'Los Angeles, California Makers Fair event November 7-8, 2026. Vendor applications are open for artists and food vendors.' })
  });
  assert.equal(result.metrics.queries_used, 1);
  assert.equal(result.metrics.pages_fetched, 1);
  assert.equal(result.sources.length, 1);
  assert.equal(result.receipts.length, 1);
  assert.equal(result.sources[0].region_code, 'CA');
  assert.equal(result.sources[0].status, 'approved-pilot');
});

test('large discovery result sets are capped and split into bounded validation batches', async () => {
  const plans = growthQueryBatch(state, { years: [2026], offset: 0, limit: 4 });
  const searchBatches = plans.map((plan, planIndex) => ({
    plan_id: plan.id,
    results: Array.from({ length: 10 }, (_, resultIndex) => ({
      rank: resultIndex + 1,
      title: `Candidate ${planIndex}-${resultIndex}`,
      url: `https://candidate-${planIndex}-${resultIndex}.example/vendors`
    }))
  }));
  const normalized = normalizeGrowthCandidates({ plans, searchBatches, candidateCap: 24 });
  assert.equal(normalized.metrics.results_seen, 40);
  assert.equal(normalized.metrics.unique_routes_considered, 40);
  assert.equal(normalized.metrics.candidates_selected, 24);
  assert.deepEqual(chunkGrowthCandidates(normalized.candidates, { batchSize: 4 }).map(batch => batch.length), [4, 4, 4, 4, 4, 4]);
});

test('normalization fetches the same route only once when multiple queries return it', () => {
  const plans = growthQueryBatch(state, { years: [2026], offset: 0, limit: 2 });
  const repeated = { rank: 1, title: 'Shared Vendor Route', url: 'https://shared.example/vendors' };
  const normalized = normalizeGrowthCandidates({
    plans,
    searchBatches: plans.map(plan => ({ plan_id: plan.id, results: [repeated] }))
  });
  assert.equal(normalized.metrics.results_seen, 2);
  assert.equal(normalized.metrics.unique_routes_considered, 1);
  assert.equal(normalized.candidates.length, 1);
  assert.equal(normalized.candidates[0].plan.id, plans[0].id);
});

test('multiple candidate batches preserve evidence validation and deterministic output', async () => {
  const plan = { id: 'ca-riverside-2026-festival', locality: 'Riverside', state_code: 'CA', state_name: 'California', year: 2026 };
  const candidates = Array.from({ length: 9 }, (_, index) => ({
    plan,
    result: { title: `Riverside Fair ${index} Vendor Application`, url: `https://fair-${index}.example/vendors` }
  }));
  const validate = batch => validateGrowthCandidateBatch({
    candidates: batch,
    state,
    asOfDate: '2026-08-31',
    fetchPage: async candidate => ({
      url: candidate.url,
      title: `Riverside Fair Vendor Application`,
      text: 'Riverside, California Fair event November 7-8, 2026. Vendor applications are open for artists and food vendors.'
    })
  });
  const batchesOfFour = await Promise.all(chunkGrowthCandidates(candidates, { batchSize: 4 }).map(validate));
  const batchesOfThree = await Promise.all(chunkGrowthCandidates(candidates, { batchSize: 3 }).map(validate));
  const first = finalizeGrowthDiscovery({ plans: [plan], validationBatches: batchesOfFour, planSize: 1, searchMetrics: { candidates_selected: 9 } });
  const second = finalizeGrowthDiscovery({ plans: [plan], validationBatches: batchesOfThree, planSize: 1, searchMetrics: { candidates_selected: 9 } });
  assert.equal(first.metrics.validation_batches, 3);
  assert.equal(first.sources.length, 9);
  assert.deepEqual(first.sources, second.sources);
  assert.deepEqual(first.receipts, second.receipts);
});

test('growth discovery fetch fails closed before an oversized response can exhaust Worker memory', async () => {
  const oversized = 'x'.repeat(1025);
  await assert.rejects(() => fetchTextTarget('https://oversized.example/vendors', {
    retries: 0,
    maxBytes: 1024,
    fetchImpl: async () => new Response(oversized, {
      headers: { 'content-type': 'text/html' }
    })
  }), /response body exceeds 1024 byte limit/);
});

test('resumed validation output cannot create duplicate approved sources', async () => {
  const plan = { id: 'ca-riverside-2026-festival', locality: 'Riverside', state_code: 'CA', state_name: 'California', year: 2026 };
  const batch = await validateGrowthCandidateBatch({
    candidates: [{ plan, result: { title: 'Riverside Fair Vendor Application', url: 'https://retry.example/vendors' } }],
    state,
    asOfDate: '2026-08-31',
    fetchPage: async candidate => ({
      url: candidate.url,
      title: 'Riverside Fair Vendor Application',
      text: 'Riverside, California Fair event November 7-8, 2026. Vendor applications are open.'
    })
  });
  const resumed = finalizeGrowthDiscovery({ plans: [plan], validationBatches: [batch, batch], planSize: 1 });
  assert.equal(resumed.sources.length, 1);
  assert.equal(resumed.receipts.length, 1);
  assert.equal(resumed.held_reasons.in_batch_duplicate, 1);
});

test('Worker source routes discovery and selected growth sources through Cloudflare Workflow steps', () => {
  const worker = fs.readFileSync(path.join(repositoryRoot, 'operations/cloudflare-texas-acquisition/src/index.js'), 'utf8');
  const wrangler = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'operations/cloudflare-texas-acquisition/wrangler.jsonc'), 'utf8'));
  assert.equal(wrangler.limits.cpu_ms, 300000);
  assert.match(worker, /event\?\.payload\?\.mode === 'discover'/);
  assert.match(worker, /search \$\{state\.code\} growth query \$\{plan\.id\}/);
  assert.match(worker, /normalize \$\{state\.code\} growth candidates offset/);
  assert.match(worker, /validate \$\{state\.code\} growth candidates batch/);
  assert.match(worker, /dedupe and approve \$\{state\.code\} growth candidates offset/);
  assert.match(worker, /fetchTextTarget\(candidate\.url/);
  assert.match(worker, /maxBytes: DISCOVERY_HTML_MAX_BYTES/);
  assert.doesNotMatch(worker, /links: extractLinks\(fetched\.html/);
  assert.match(worker, /sourcesForState\(base\.growthRegistry, state\.code, requestedSourceIds\)/);
  assert.match(worker, /open GitHub \$\{state\.name\} source registry PR/);
});

test('growth controller parses only the compact Cloudflare discovery result and checkpoints the 185 baseline', () => {
  const payload = { mode: 'discover', state_code: 'CA', state_name: 'California', workflow_execution: 'cloudflare', generated_source_count: 0, publication: { source_ids: [] } };
  const output = `Status: Completed\nName:      emit compact California growth discovery result\nOutput:    ${JSON.stringify(JSON.stringify(payload))}\n`;
  assert.deepEqual(parseCompactWorkflowOutput(output, 'California', 'discover'), payload);
  const checkpoint = initialState({ baseline: 185, target: 1100, workerVersion: 'version-id', workerSha: 'a'.repeat(40) });
  assert.equal(checkpoint.snapshot_count, 185);
  assert.equal(checkpoint.target_count, 1100);
  assert.equal(checkpoint.status, 'ready');
});

test('growth controller removes only known generated shell directories and leaves unexpected dirtiness visible', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pitchlist-growth-cleanup-'));
  try {
    for (const directory of ['global', 'us', 'uk', 'shared']) {
      const generated = path.join(root, 'public', directory);
      fs.mkdirSync(generated, { recursive: true });
      fs.writeFileSync(path.join(generated, 'generated.txt'), 'generated');
    }
    const preserved = path.join(root, 'public', 'database.js');
    fs.writeFileSync(preserved, 'preserved');
    const unexpected = path.join(root, 'public', 'unexpected-output.txt');
    fs.writeFileSync(unexpected, 'unexpected');

    cleanupGeneratedDeploymentArtifacts(root);

    for (const directory of ['global', 'us', 'uk', 'shared']) {
      assert.equal(fs.existsSync(path.join(root, 'public', directory)), false);
    }
    assert.equal(fs.readFileSync(preserved, 'utf8'), 'preserved');
    assert.equal(fs.readFileSync(unexpected, 'utf8'), 'unexpected');
    const controller = fs.readFileSync(path.join(repositoryRoot, 'operations/cloudflare-texas-acquisition/scripts/growth-controller.mjs'), 'utf8');
    assert.match(controller, /Deployment left unexpected repository changes/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('temporary one-record propagation lag waits and then self-recovers by identity and count', () => {
  const pending = { previous_count: 241, count: 242, additions: 1, opportunity_ids: ['opp-new'] };
  assert.deepEqual(classifyLiveConsistency(pending, { count: 241, ids: new Set() }), {
    status: 'waiting', live_count: 241, missing_ids: ['opp-new']
  });
  assert.deepEqual(classifyLiveConsistency(pending, { count: 242, ids: new Set(['opp-new']) }), {
    status: 'consistent', live_count: 242
  });
});

test('repeated propagation lag remains a waiting state with bounded backoff', () => {
  const pending = { previous_count: 241, count: 242, additions: 1, opportunity_ids: ['opp-new'] };
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    assert.equal(classifyLiveConsistency(pending, { count: 241, ids: new Set() }).status, 'waiting');
  }
  assert.deepEqual([1, 2, 3, 4].map(attempt => liveConsistencyBackoffMilliseconds(attempt)), [5000, 10000, 20000, 20000]);
});

test('live consistency timeout remains a terminal fail-closed error', () => {
  const pending = { count: 242 };
  const waiting = { deadline_at: '2026-09-01T20:02:00.000Z', last_live_count: 241 };
  assert.throws(() => assertLiveConsistencyWithinDeadline(waiting, pending, Date.parse('2026-09-01T20:02:00.000Z')), /Live consistency timed out: Live FindPitches count is 241; expected 242/);
});

test('wrong or missing opportunity identity fails closed even when the count matches', () => {
  const pending = { previous_count: 241, count: 242, additions: 1, opportunity_ids: ['opp-expected'] };
  assert.throws(() => classifyLiveConsistency(pending, { count: 242, ids: new Set(['opp-wrong']) }), /missing expected opportunity identity opp-expected/);
});

test('live count ahead of the expected snapshot fails closed immediately', () => {
  const pending = { previous_count: 241, count: 242, additions: 1, opportunity_ids: ['opp-new'] };
  assert.throws(() => classifyLiveConsistency(pending, { count: 243, ids: new Set(['opp-new']) }), /count 243 exceeds expected 242/);
});

test('live consistency reads the global count and exact state opportunity identities', async () => {
  const requests = [];
  const live = await readLiveOpportunityConsistency('MA', {
    fetchImpl: async (url, options) => {
      requests.push(url);
      assert.equal(options.cache, 'no-store');
      if (url.includes('state=MA')) return { ok: true, json: async () => ({ total: 2, rows: [{ id: 'opp-old' }, { id: 'opp-new' }] }) };
      return { ok: true, json: async () => ({ total: 242, rows: [] }) };
    }
  });
  assert.equal(live.count, 242);
  assert.deepEqual([...live.ids], ['opp-old', 'opp-new']);
  assert.equal(requests.length, 2);
});

test('waiting consistency branch checkpoints and cannot trigger the next acquisition Workflow', () => {
  const controller = fs.readFileSync(path.join(repositoryRoot, 'operations/cloudflare-texas-acquisition/scripts/growth-controller.mjs'), 'utf8');
  const start = controller.indexOf("if (state.status === 'waiting_for_live_consistency')");
  const end = controller.indexOf("if (state.status === 'ready_acquisition')", start);
  const waitingBranch = controller.slice(start, end);
  assert.ok(start > 0 && end > start);
  assert.match(waitingBranch, /saveState\(stateFile, state\)/);
  assert.doesNotMatch(waitingBranch, /triggerWorkflow/);
});

test('generated opportunity snapshot parsing preserves exact published identities', () => {
  const parsed = parseUsOpportunitySnapshot('export const usOpportunitySnapshot = {"total":1,"rows":[{"id":"opp-new"}]};\n');
  assert.equal(parsed.total, 1);
  assert.equal(parsed.rows[0].id, 'opp-new');
});

test('growth controller accepts only an exact-head additions-only source PR with successful CI', () => {
  const baseSha = 'a'.repeat(40);
  const headOid = 'b'.repeat(40);
  const added = source();
  const before = { version: 1, updated_at: null, sources: [] };
  const after = { version: 1, updated_at: '2026-08-31T09:30:00.000Z', sources: [added] };
  const result = {
    state_code: 'CA', state_name: 'California', generated_source_count: 1, evidence_passed_count: 1,
    publication: { source_ids: [added.id], pr_number: 200, branch: `sources/cloud-us-california-growth-12345678-base-${baseSha.slice(0, 16)}` }
  };
  const pr = {
    number: 200, state: 'OPEN', isDraft: false, baseRefName: 'main', baseRefOid: baseSha,
    headRefName: result.publication.branch, headRefOid: headOid, mergeable: 'MERGEABLE',
    commits: [{ oid: headOid }], files: [{ path: 'operations/opportunity-pipeline/config/us-growth-source-registry.json' }],
    statusCheckRollup: [{ __typename: 'CheckRun', name: 'verify', status: 'COMPLETED', conclusion: 'SUCCESS' }],
    body: [
      '- state: California (CA)', '- net-new approved sources: 1',
      '- deterministic source evidence receipts: 1/1 passed', `  - ${added.id}: https://example.test/vendors`, '- additions only; no source removals',
      '- no automatic merge or deploy requested'
    ].join('\n')
  };
  assert.equal(validateSourcePr(pr, result, before, after, baseSha), headOid);
  assert.throws(() => validateSourcePr({ ...pr, files: [{ path: 'README.md' }] }, result, before, after, baseSha), /outside the growth registry/);
  assert.throws(() => validateSourcePr(pr, result, after, before, baseSha), /count is not additions-only/);
});

test('compact source handoff derives exact IDs from the PR diff and binds every evidence receipt', () => {
  const baseSha = 'a'.repeat(40);
  const headOid = 'b'.repeat(40);
  const added = source({ id: `ca-${'long-source-id-'.repeat(5)}1234abcd` });
  const before = { version: 1, updated_at: null, sources: [] };
  const after = { version: 1, updated_at: '2026-08-31T13:00:00.000Z', sources: [added] };
  const result = {
    state_code: 'CA', state_name: 'California', generated_source_count: 1, evidence_passed_count: 1,
    publication: { source_count: 1, pr_number: 227, branch: `sources/cloud-us-california-growth-12345678-base-${baseSha.slice(0, 16)}` }
  };
  const pr = {
    number: 227, state: 'OPEN', isDraft: false, baseRefName: 'main', baseRefOid: baseSha,
    headRefName: result.publication.branch, headRefOid: headOid, mergeable: 'MERGEABLE',
    commits: [{ oid: headOid }], files: [{ path: 'operations/opportunity-pipeline/config/us-growth-source-registry.json' }],
    statusCheckRollup: [{ __typename: 'CheckRun', name: 'verify', status: 'COMPLETED', conclusion: 'SUCCESS' }],
    body: [
      '- state: California (CA)', '- net-new approved sources: 1',
      '- deterministic source evidence receipts: 1/1 passed', `  - ${added.id.toUpperCase()}: https://example.test/vendors`,
      '- additions only; no source removals', '- no automatic merge or deploy requested'
    ].join('\n')
  };
  assert.equal(validateSourcePr(pr, result, before, after, baseSha), headOid);
  assert.throws(() => validateSourcePr({ ...pr, body: pr.body.replace(`  - ${added.id.toUpperCase()}:`, '  - wrong-id:') }, result, before, after, baseSha), /lacks an evidence receipt/);
  assert.ok(JSON.stringify(JSON.stringify({ ...result, publication: { ...result.publication, source_ids: undefined } })).length < 1024);
});
