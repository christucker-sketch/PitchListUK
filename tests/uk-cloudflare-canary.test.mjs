import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { buildUkCloudflareCanaryPlan, UK_CLOUDFLARE_CANARY } from '../platform/acquisition/uk-cloudflare-canary.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const approvedRoutes = JSON.parse(fs.readFileSync(path.join(root, 'operations/opportunity-pipeline/config/approved-source-routes.json'), 'utf8'));

test('UKCF-003 remains dormant, bounded and read-only', () => {
  const plan = buildUkCloudflareCanaryPlan();
  assert.equal(UK_CLOUDFLARE_CANARY.enabled, false);
  assert.equal(UK_CLOUDFLARE_CANARY.trigger_ready, false);
  assert.equal(plan.status, 'dormant');
  assert.equal(plan.trigger_ready, false);
  assert.equal(plan.requires_control_plane_health_gate, true);
  assert.equal(plan.source_count, 3);
  assert.equal(plan.snapshot_path, 'functions/_data/opportunities.mjs');
  assert.equal(new Set(plan.units.map(unit => unit.source.application_url)).size, 3);
  for (const unit of plan.units) {
    assert.equal(unit.context.country, 'UK');
    assert.equal(unit.context.geography_kind, 'acquisition_area');
    assert.equal(unit.execution.fetch_live_page, true);
    assert.equal(unit.execution.extract_candidate, true);
    assert.equal(unit.execution.validate_candidate, true);
    assert.equal(unit.execution.discovery, false);
    assert.equal(unit.execution.serper_credits, 0);
    assert.equal(unit.execution.create_source_pr, false);
    assert.equal(unit.execution.create_opportunity_pr, false);
    assert.equal(unit.execution.publish, false);
    assert.equal(unit.execution.mutate, false);
  }
});

test('every UKCF-003 route is already approved with matching deterministic evidence', () => {
  for (const source of UK_CLOUDFLARE_CANARY.sources) {
    const approved = approvedRoutes.find(route => route.official_application_route === source.application_url);
    assert.ok(approved, `approved source missing for ${source.application_url}`);
    assert.equal(approved.approval_evidence_hash, source.approval_evidence_hash);
  }
});

test('UKCF-003 refuses accidental activation or publication', () => {
  assert.throws(() => buildUkCloudflareCanaryPlan({ ...UK_CLOUDFLARE_CANARY, enabled: true }), /must remain dormant/);
  assert.throws(() => buildUkCloudflareCanaryPlan({ ...UK_CLOUDFLARE_CANARY, trigger_ready: true }), /must remain dormant/);
  assert.throws(() => buildUkCloudflareCanaryPlan({ ...UK_CLOUDFLARE_CANARY, publication_enabled: true }), /must not publish or mutate/);
  assert.throws(() => buildUkCloudflareCanaryPlan({ ...UK_CLOUDFLARE_CANARY, discovery_enabled: true }), /approved direct sources only/);
  assert.throws(() => buildUkCloudflareCanaryPlan({ ...UK_CLOUDFLARE_CANARY, serper_credit_limit: 1 }), /approved direct sources only/);
});
