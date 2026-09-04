import assert from 'node:assert/strict';
import test from 'node:test';

import { buildUkCloudflareCanaryPlan } from '../platform/acquisition/uk-cloudflare-canary.mjs';
import { assertUkCanaryHealthGate, executeUkCloudflareCanary } from '../platform/acquisition/uk-cloudflare-canary-execution.mjs';

const NOW = '2026-09-04T13:30:00.000Z';
const healthyGate = {
  status: 'passed',
  control_plane_healthy: true,
  trigger_probe_passed: true,
  describe_probe_passed: true,
  checked_at: '2026-09-04T13:25:00.000Z',
  verifier: 'findpitches-control-plane-check'
};

function response(body, options = {}) {
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    url: options.url || '',
    async text() { return body; }
  };
}

test('UK canary health gate fails closed unless both trigger and describe probes are fresh and passed', () => {
  assert.equal(assertUkCanaryHealthGate(healthyGate, { now: NOW }), true);
  assert.throws(() => assertUkCanaryHealthGate({ ...healthyGate, describe_probe_passed: false }, { now: NOW }), /trigger and describe probes/);
  assert.throws(() => assertUkCanaryHealthGate({ ...healthyGate, checked_at: '2026-09-04T12:00:00.000Z' }, { now: NOW }), /stale or invalid/);
  assert.throws(() => assertUkCanaryHealthGate({}, { now: NOW }), /has not passed/);
});

test('read-only UK canary executes exactly three approved direct-source checks and cannot publish', async () => {
  const plan = buildUkCloudflareCanaryPlan();
  const calls = [];
  const fetchImpl = async url => {
    calls.push(url);
    if (url.endsWith('/robots.txt')) return response('User-agent: *\nDisallow:');
    return response('<html><head><title>Trader applications</title></head><body>Apply to become a market trader.</body></html>', { url });
  };
  const report = await executeUkCloudflareCanary({ plan, health_gate: healthyGate, now: NOW, fetchImpl });
  assert.equal(report.source_count, 3);
  assert.equal(report.passed_count, 3);
  assert.equal(report.held_count, 0);
  assert.equal(report.serper_credits_used, 0);
  assert.equal(report.publication_attempted, false);
  assert.equal(report.mutation_attempted, false);
  assert.equal(calls.length, 6);
  assert.deepEqual(report.results.map(item => item.area_code), ['GB-ENG-LONDON', 'GB-ENG-HERTS', 'GB-ENG-HANTS']);
});

test('UK canary holds robots blocks, cross-host redirects and pages with no application evidence', async () => {
  const plan = buildUkCloudflareCanaryPlan();
  let applicationIndex = 0;
  const fetchImpl = async url => {
    if (url.endsWith('/robots.txt')) {
      if (url.includes('boroughmarket.org.uk')) return response('User-agent: *\nDisallow: /become-a-trader');
      return response('User-agent: *\nDisallow:');
    }
    applicationIndex += 1;
    if (url.includes('eastherts.gov.uk')) return response('<html><body>Apply as a trader</body></html>', { url: 'https://example.com/redirected' });
    return response('<html><head><title>Business information</title></head><body>General council information.</body></html>', { url });
  };
  const report = await executeUkCloudflareCanary({ plan, health_gate: healthyGate, now: NOW, fetchImpl });
  assert.equal(report.passed_count, 0);
  assert.equal(report.held_count, 3);
  assert.deepEqual(report.results.map(item => item.reason), ['robots_disallowed', 'redirect_outside_approved_host', 'no_application_signal']);
  assert.equal(applicationIndex, 2);
});

test('execution refuses any plan that enables publication or mutation semantics', async () => {
  const plan = buildUkCloudflareCanaryPlan();
  const unsafe = {
    ...plan,
    units: plan.units.map((unit, index) => index === 0 ? { ...unit, execution: { ...unit.execution, publish: true } } : unit)
  };
  await assert.rejects(() => executeUkCloudflareCanary({ plan: unsafe, health_gate: healthyGate, now: NOW, fetchImpl: async () => response('') }), /cannot discover, publish, create PRs or mutate data/);
});
