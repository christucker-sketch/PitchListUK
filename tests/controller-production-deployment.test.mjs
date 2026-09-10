import test from 'node:test';
import assert from 'node:assert/strict';
import {
  beginCloudLiveConsistency,
  validatePendingProductionDeployment
} from '../operations/cloudflare-global-acquisition/lib/controller-production-deployment.mjs';

const mergeSha = 'c'.repeat(40);

function state() {
  return {
    status: 'deploying_production',
    snapshot_count: 706,
    current: {
      state_code: 'TX',
      pending_deploy: {
        sha: mergeSha,
        count: 706,
        previous_count: 704,
        additions: 2,
        opportunity_ids: ['opp_b', 'opp_a'],
        pr_number: 1701
      }
    }
  };
}

function inspection() {
  return { pr_number: 1701, merge_sha: mergeSha };
}

function gate() {
  return { ready: true, status: 'passed', merge_sha: mergeSha, deployment_check_id: 12345 };
}

test('pending production deployment validation binds exact state, PR, merge SHA and published delta', () => {
  assert.deepEqual(validatePendingProductionDeployment(
    state(),
    { action: 'verify_or_deploy_production', state_code: 'TX', sha: mergeSha },
    inspection()
  ), {
    state_code: 'TX', pr_number: 1701, merge_sha: mergeSha,
    count: 706, previous_count: 704, additions: 2,
    opportunity_ids: ['opp_a', 'opp_b']
  });
});

test('production deployment validation fails closed on merge SHA or controller snapshot drift', () => {
  assert.throws(() => validatePendingProductionDeployment(
    state(),
    { state_code: 'TX', sha: 'd'.repeat(40) },
    inspection()
  ), /production_deploy_decision_sha_mismatch/);

  const drifted = state();
  drifted.snapshot_count = 707;
  assert.throws(() => validatePendingProductionDeployment(
    drifted,
    { state_code: 'TX', sha: mergeSha },
    inspection()
  ), /production_deploy_snapshot_count_mismatch/);
});

test('successful exact deployment proof creates bounded live-consistency checkpoint without discarding pending deploy', () => {
  const original = state();
  const validated = validatePendingProductionDeployment(original, { state_code: 'TX', sha: mergeSha }, inspection());
  const next = beginCloudLiveConsistency(original, validated, gate(), new Date('2026-09-10T16:20:00.000Z'), { timeoutSeconds: 120 });
  assert.equal(next.status, 'waiting_for_live_consistency');
  assert.deepEqual(next.current.pending_deploy, original.current.pending_deploy);
  assert.deepEqual(next.current.live_consistency, {
    deployment_id: 'github-check:12345',
    deployment_check_id: 12345,
    production_sha: mergeSha,
    started_at: '2026-09-10T16:20:00.000Z',
    deadline_at: '2026-09-10T16:22:00.000Z',
    attempts: 0,
    last_checked_at: null,
    last_live_count: null,
    last_error: null
  });
});

test('live-consistency checkpoint refuses wrong deployment SHA, invalid check identity or unsafe timeout', () => {
  const validated = validatePendingProductionDeployment(state(), { state_code: 'TX', sha: mergeSha }, inspection());
  assert.throws(() => beginCloudLiveConsistency(state(), validated, { ...gate(), merge_sha: 'd'.repeat(40) }), /production_deploy_gate_sha_mismatch/);
  assert.throws(() => beginCloudLiveConsistency(state(), validated, { ...gate(), deployment_check_id: 0 }), /production_deploy_gate_check_id_invalid/);
  assert.throws(() => beginCloudLiveConsistency(state(), validated, gate(), new Date(), { timeoutSeconds: 10 }), /production_live_consistency_timeout_invalid/);
});
