import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LEGACY_INFLIGHT_INSPECTION_TARGET,
  summarizeLegacyInflightInspection
} from '../operations/cloudflare-global-acquisition/lib/controller-legacy-inflight-inspection.mjs';

test('legacy inflight inspection target is pinned to the exact imported Hal checkpoint', () => {
  assert.equal(LEGACY_INFLIGHT_INSPECTION_TARGET.workflow_name, 'pitchlist-texas-acquisition');
  assert.equal(LEGACY_INFLIGHT_INSPECTION_TARGET.instance_id, 'cf_d9de4e04c49d1ad3d02156da21d02d30db1f0bbb60c0e0185ebee0c8eef41fe5');
  assert.equal(LEGACY_INFLIGHT_INSPECTION_TARGET.state_code, 'MI');
  assert.equal(LEGACY_INFLIGHT_INSPECTION_TARGET.mode, 'discover');
  assert.equal(LEGACY_INFLIGHT_INSPECTION_TARGET.replay_key, 'discover:MI:128:4');
  assert.equal(LEGACY_INFLIGHT_INSPECTION_TARGET.controller_state_version, 12);
});

test('legacy inflight inspection summary preserves terminal completion evidence', () => {
  const summary = summarizeLegacyInflightInspection({
    success: true,
    result: {
      status: 'complete',
      success: true,
      start: '2026-09-10T11:50:00.000Z',
      end: '2026-09-10T11:52:00.000Z',
      output: { state_code: 'MI', next_query_offset: 132 },
      error: null
    }
  });
  assert.equal(summary.terminal, true);
  assert.equal(summary.success, true);
  assert.equal(summary.workflow_status, 'complete');
  assert.deepEqual(summary.output, { state_code: 'MI', next_query_offset: 132 });
});

test('legacy inflight inspection summary preserves terminal failures without normalizing them', () => {
  const summary = summarizeLegacyInflightInspection({
    success: true,
    result: {
      status: 'errored',
      success: false,
      error: { message: 'network timeout' },
      output: null
    }
  });
  assert.equal(summary.terminal, true);
  assert.equal(summary.success, false);
  assert.deepEqual(summary.error, { message: 'network timeout' });
});

test('legacy inflight inspection fails closed on malformed Cloudflare responses', () => {
  assert.throws(() => summarizeLegacyInflightInspection(null), /response_invalid/);
  assert.throws(() => summarizeLegacyInflightInspection({ success: false, result: {} }), /response_invalid/);
  assert.throws(() => summarizeLegacyInflightInspection({ success: true, result: {} }), /status_missing/);
});
