import assert from 'node:assert/strict';
import test from 'node:test';

import { buildInitialCaControllerState } from '../operations/cloudflare-global-acquisition/lib/ca-cloud-controller.mjs';
import {
  boundedGithubJson,
  buildCaControllerCutoverReadinessReport,
  globalCaCutoverFlagEnabled
} from '../operations/cloudflare-global-acquisition/lib/ca-controller-cutover-readiness.mjs';

const meta = {
  authority: 'shadow',
  version: 7,
  sha256: 'a'.repeat(64),
  source: 'cloudflare-ca-controller-bootstrap',
  imported_at: '2026-09-13T16:00:00.000Z'
};
const bases = {
  main_sha: 'b'.repeat(40),
  production_count: 0,
  source_count: 0
};

test('Canada cutover flag remains literal-true only', () => {
  assert.equal(globalCaCutoverFlagEnabled({}), false);
  assert.equal(globalCaCutoverFlagEnabled({ GLOBAL_CA_CONTROLLER_CUTOVER_ENABLED: '1' }), false);
  assert.equal(globalCaCutoverFlagEnabled({ GLOBAL_CA_CONTROLLER_CUTOVER_ENABLED: 'yes' }), false);
  assert.equal(globalCaCutoverFlagEnabled({ GLOBAL_CA_CONTROLLER_CUTOVER_ENABLED: 'true' }), true);
});

test('clean shadow checkpoint with exact live data parity is promotion-ready', () => {
  const state = buildInitialCaControllerState({
    productionCount: 0,
    sourceCount: 0,
    mainSha: 'a'.repeat(40)
  });
  const report = buildCaControllerCutoverReadinessReport(state, meta, bases, {
    GLOBAL_CA_CONTROLLER_CUTOVER_ENABLED: 'false'
  });

  assert.equal(report.promotion_ready, true);
  assert.equal(report.launch_ready, false);
  assert.deepEqual(report.promotion_blockers, []);
  assert.equal(report.production_count_matches, true);
  assert.equal(report.source_count_matches, true);
  assert.equal(report.state_base_matches_current_main, false);
  assert.equal(report.current_main_sha, 'b'.repeat(40));
});

test('code-only main movement is reported but does not invalidate exact Canada data parity', () => {
  const state = buildInitialCaControllerState({ productionCount: 4, sourceCount: 12, mainSha: 'c'.repeat(40) });
  const report = buildCaControllerCutoverReadinessReport(state, meta, {
    main_sha: 'd'.repeat(40),
    production_count: 4,
    source_count: 12
  }, {});
  assert.equal(report.state_base_matches_current_main, false);
  assert.equal(report.promotion_ready, true);
});

test('Canada promotion fails closed on any production or source count drift', () => {
  const state = buildInitialCaControllerState({ productionCount: 3, sourceCount: 10, mainSha: 'b'.repeat(40) });
  const report = buildCaControllerCutoverReadinessReport(state, meta, {
    main_sha: 'b'.repeat(40),
    production_count: 4,
    source_count: 11
  }, {});
  assert.equal(report.promotion_ready, false);
  assert.ok(report.promotion_blockers.includes('production_count:3->4'));
  assert.ok(report.promotion_blockers.includes('source_count:10->11'));
});

test('Canada promotion fails closed with reserved, active or pending work', () => {
  for (const mutation of [
    state => { state.active_instance = { id: 'cf_123', mode: 'discovery' }; },
    state => { state.cloud_controller_intent = { phase: 'reserved', action: 'start_discovery' }; },
    state => { state.pending_source_pr = { pr_number: 1733 }; },
    state => { state.pending_data_pr = { pr_number: 1734 }; },
    state => { state.pending_deployment = { kind: 'data', merge_sha: 'e'.repeat(40) }; }
  ]) {
    const state = buildInitialCaControllerState({ productionCount: 0, sourceCount: 0, mainSha: 'b'.repeat(40) });
    mutation(state);
    const report = buildCaControllerCutoverReadinessReport(state, meta, bases, {});
    assert.equal(report.promotion_ready, false);
    assert.ok(report.promotion_blockers.includes('checkpoint_not_clean'));
  }
});

test('Canada promotion fails closed if cutover is already enabled', () => {
  const state = buildInitialCaControllerState({ productionCount: 0, sourceCount: 0, mainSha: 'b'.repeat(40) });
  const report = buildCaControllerCutoverReadinessReport(state, meta, bases, {
    GLOBAL_CA_CONTROLLER_CUTOVER_ENABLED: 'true'
  });
  assert.equal(report.promotion_ready, false);
  assert.ok(report.promotion_blockers.includes('cutover_already_enabled'));
});

test('authoritative clean checkpoint is launch-ready only while cutover remains off', () => {
  const state = buildInitialCaControllerState({ productionCount: 0, sourceCount: 0, mainSha: 'b'.repeat(40) });
  const report = buildCaControllerCutoverReadinessReport(state, { ...meta, authority: 'authoritative' }, bases, {});
  assert.equal(report.promotion_ready, false);
  assert.equal(report.launch_ready, true);
  assert.ok(report.promotion_blockers.includes('authority:authoritative'));
  assert.deepEqual(report.launch_blockers, []);
});

test('Canada readiness GitHub reads abort instead of hanging indefinitely', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options = {}) => new Promise((_resolve, reject) => {
    const signal = options.signal;
    if (signal?.aborted) return reject(signal.reason || new Error('aborted'));
    signal?.addEventListener('abort', () => reject(signal.reason || new Error('aborted')), { once: true });
  });
  try {
    await assert.rejects(
      () => boundedGithubJson({ GITHUB_REPO: 'example/repo', GITHUB_TOKEN: 'fixture' }, '/git/ref/heads/main', 10),
      /ca_readiness_github_timeout|aborted/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
