import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAuthoritativeUkObserverStatus } from '../operations/cloudflare-findpitches-observer/scripts/uk-observer-status.mjs';

test('UK observer reports authoritative cloud controller activity instead of stale GitHub workflow health', () => {
  const status = buildAuthoritativeUkObserverStatus({
    ok: true,
    available: true,
    authority: 'authoritative',
    status: 'running_discovery',
    state_version: 2797,
    production_count: 290,
    source_count: 22,
    cycle: 11,
    query_offset: 20,
    query_limit: 4,
    plan_size: 96,
    blocker: null,
    totals: { discovery_runs: 269, acquisition_runs: 266, source_additions: 29, opportunity_additions: 2, source_prs_merged: 3, data_prs_merged: 1 },
    last_discovery: { workflow_id: 'd1', source_additions: 0 },
    last_acquisition: { workflow_id: 'a1', manifest_additions: 0 },
    recent_results: [
      { workflow_id: 'd1', mode: 'discovery', completed_at: '2026-10-02T10:20:00Z', source_additions: 0, manifest_additions: 0 },
      { workflow_id: 'a1', mode: 'acquisition', completed_at: '2026-10-02T10:23:00Z', source_additions: 0, manifest_additions: 0 }
    ],
    decision: { action: 'inspect_active_workflow' },
    updated_at: '2026-10-02T10:25:28Z'
  }, new Date('2026-10-02T10:30:00Z'));

  assert.equal(status.status_source, 'cloudflare_authoritative_controller');
  assert.equal(status.controller_status, 'running_discovery');
  assert.equal(status.state_version, 2797);
  assert.equal(status.live_api_count, 290);
  assert.equal(status.approved_source_count, 22);
  assert.deepEqual(status.totals, { discovery_runs: 269, acquisition_runs: 266, source_additions: 29, opportunity_additions: 2, source_prs_merged: 3, data_prs_merged: 1 });
  assert.equal(status.recent_activity.completed_runs, 2);
  assert.equal(status.recent_activity.recoveries, 0);
});

test('UK observer fails closed when receipt is not authoritative', () => {
  assert.throws(() => buildAuthoritativeUkObserverStatus({ ok: true, available: true, authority: 'shadow' }), /authoritative/);
});
