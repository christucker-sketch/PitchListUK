import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertCloudLiveConsistencyWithinDeadline,
  classifyCloudLiveConsistency,
  finishCloudLiveConsistency,
  readLiveUsOpportunityConsistency,
  recordCloudLiveConsistencyTransientFailure,
  recordCloudLiveConsistencyWait
} from '../operations/cloudflare-global-acquisition/lib/controller-live-consistency.mjs';

const mergeSha = 'c'.repeat(40);

function pending() {
  return {
    sha: mergeSha,
    count: 706,
    previous_count: 704,
    additions: 2,
    opportunity_ids: ['opp_b', 'opp_a'],
    pr_number: 1701
  };
}

function waitingState() {
  return {
    status: 'waiting_for_live_consistency',
    snapshot_count: 706,
    live_api_count: 704,
    acquisition_batch: 1,
    completed_milestones: [250, 500],
    deployments: [],
    current: {
      state_code: 'TX',
      pending_deploy: pending(),
      live_consistency: {
        deployment_id: 'github-check:123',
        deployment_check_id: 123,
        production_sha: mergeSha,
        started_at: '2026-09-10T16:20:00.000Z',
        deadline_at: '2026-09-10T16:22:00.000Z',
        attempts: 0,
        last_checked_at: null,
        last_live_count: null,
        last_error: null
      }
    }
  };
}

test('live reader obtains global count and exact state identities with bounded pagination', async () => {
  const seen = [];
  const fetchImpl = async url => {
    seen.push(String(url));
    if (String(url).includes('limit=1')) return Response.json({ total: 706 });
    return Response.json({ total: 3, rows: [
      { stable_id: 'old_tx' }, { id: 'opp_a' }, { stable_id: 'opp_b' }
    ] });
  };
  const result = await readLiveUsOpportunityConsistency('tx', { fetchImpl });
  assert.equal(result.count, 706);
  assert.equal(result.state_total, 3);
  assert.deepEqual([...result.ids].sort(), ['old_tx', 'opp_a', 'opp_b']);
  assert.equal(seen.length, 2);
});

test('live classification accepts only fully consistent publication or exact pre-publication lag', () => {
  assert.deepEqual(classifyCloudLiveConsistency(pending(), { count: 706, ids: new Set(['opp_a', 'opp_b']) }), {
    status: 'consistent', live_count: 706, missing_ids: []
  });
  assert.deepEqual(classifyCloudLiveConsistency(pending(), { count: 704, ids: new Set(['old_tx']) }), {
    status: 'waiting', live_count: 704, missing_ids: ['opp_a', 'opp_b']
  });
});

test('live classification fails closed on partial count, missing identity, premature identity or count ahead', () => {
  assert.throws(() => classifyCloudLiveConsistency(pending(), { count: 705, ids: new Set() }), /unexpected_partial_count/);
  assert.throws(() => classifyCloudLiveConsistency(pending(), { count: 706, ids: new Set(['opp_a']) }), /missing_expected_identity:opp_b/);
  assert.throws(() => classifyCloudLiveConsistency(pending(), { count: 704, ids: new Set(['opp_a']) }), /partial_identity_visible:opp_a/);
  assert.throws(() => classifyCloudLiveConsistency(pending(), { count: 707, ids: new Set(['opp_a', 'opp_b']) }), /count_exceeds_expected/);
});

test('waiting checkpoint records attempts without advancing acquisition batch', () => {
  const next = recordCloudLiveConsistencyWait(waitingState(), { status: 'waiting', live_count: 704 }, new Date('2026-09-10T16:21:00.000Z'));
  assert.equal(next.status, 'waiting_for_live_consistency');
  assert.equal(next.acquisition_batch, 1);
  assert.equal(next.current.live_consistency.attempts, 1);
  assert.equal(next.current.live_consistency.last_live_count, 704);
  assert.ok(next.current.pending_deploy);
});

test('successful live consistency records deployment and advances exactly one acquisition batch', () => {
  const next = finishCloudLiveConsistency(waitingState(), { status: 'consistent', live_count: 706 }, new Date('2026-09-10T16:21:00.000Z'));
  assert.equal(next.status, 'ready_acquisition');
  assert.equal(next.live_api_count, 706);
  assert.equal(next.acquisition_batch, 2);
  assert.equal(next.current.pending_deploy, undefined);
  assert.equal(next.current.live_consistency, undefined);
  assert.deepEqual(next.deployments, [{
    deployment_id: 'github-check:123',
    deployment_check_id: 123,
    production_sha: mergeSha,
    live_api_count: 706,
    state_code: 'TX',
    additions: 2,
    pr_number: 1701,
    deployed_at: '2026-09-10T16:21:00.000Z'
  }]);
});

test('transient live API failures are checkpointable only inside the bounded deadline', () => {
  const error = new Error('live_api_http_503');
  error.liveConsistencyTransient = true;
  const next = recordCloudLiveConsistencyTransientFailure(waitingState(), error, new Date('2026-09-10T16:21:00.000Z'));
  assert.equal(next.current.live_consistency.attempts, 1);
  assert.equal(next.current.live_consistency.last_error, 'live_api_http_503');
  assert.throws(() => recordCloudLiveConsistencyTransientFailure(waitingState(), error, new Date('2026-09-10T16:22:00.000Z')), /live_consistency_timed_out/);
  assert.throws(() => assertCloudLiveConsistencyWithinDeadline({ deadline_at: 'bad' }, pending()), /deadline_invalid/);
});
