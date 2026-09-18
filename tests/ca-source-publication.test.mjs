import assert from 'node:assert/strict';
import test from 'node:test';

import {
  planCanadaSourceRegistry,
  canadaSourceBranchName
} from '../operations/cloudflare-global-acquisition/lib/ca-source-publication.mjs';

function source(overrides = {}) {
  return {
    id: 'ca-on-aaaaaaaaaaaa',
    name: 'Ontario Vendor Application',
    source_url: 'https://www.ontario.ca/page/market-vendors',
    application_url: 'https://www.ontario.ca/page/market-vendors',
    source_class: 'public-service',
    country_code: 'CA',
    jurisdiction: 'CA-ON',
    region_code: 'ON',
    region_name: 'Ontario',
    status: 'approved-pilot',
    discovered_at: '2026-09-13T15:30:00.000Z',
    discovery_query: 'Ontario market vendor application Canada',
    evidence: 'Verified Ontario first-party route contains vendor application evidence.',
    ...overrides
  };
}

test('Canada source publication is additions-only and deterministic', () => {
  const base = { registry: [] };
  const candidate = source();
  const first = planCanadaSourceRegistry(base, [candidate]);
  const second = planCanadaSourceRegistry(base, [candidate]);

  assert.deepEqual(first, second);
  assert.deepEqual(first.summary, { before_count: 0, additions: 1, removals: 0, after_count: 1 });
  assert.equal(first.registry.length, 1);
  assert.equal(first.registry[0].id, candidate.id);
  assert.equal(first.additions[0].source_url, candidate.source_url);
});

test('Canada source publication accepts only the two evidence-backed source classes', () => {
  const organiser = source({
    id: 'ca-on-bbbbbbbbbbbb',
    name: 'Example Festival Vendor Application',
    source_url: 'https://examplefestival.ca/vendors',
    application_url: 'https://examplefestival.ca/vendors/apply',
    source_class: 'event-organiser',
    evidence: 'Deterministic first-party organiser route with region, vendor, action and opportunity evidence.'
  });
  const plan = planCanadaSourceRegistry({ registry: [] }, [organiser]);
  assert.equal(plan.summary.additions, 1);
  assert.equal(plan.additions[0].source_class, 'event-organiser');

  assert.throws(() => planCanadaSourceRegistry({ registry: [] }, [source({ source_class: 'private-event' })]), /canada_source_class_invalid/);
  assert.throws(() => planCanadaSourceRegistry({ registry: [] }, [source({ source_class: 'aggregator' })]), /canada_source_class_invalid/);
});

test('Canada source publication does not rewrite or duplicate an existing source identity', () => {
  const existing = source();
  const attemptedRewrite = source({
    name: 'Changed title that must not replace existing data',
    application_url: 'https://www.ontario.ca/page/different-form',
    evidence: 'Different evidence that must not replace the approved record.'
  });
  const plan = planCanadaSourceRegistry({ registry: [existing] }, [attemptedRewrite]);

  assert.equal(plan.summary.additions, 0);
  assert.deepEqual(plan.registry, [existing]);
});

test('Canada source publication rejects source ID or URL substitution collisions', () => {
  const existing = source();
  const sameIdDifferentUrl = source({
    source_url: 'https://www.ontario.ca/page/other-market',
    application_url: 'https://www.ontario.ca/page/other-market'
  });
  const sameUrlDifferentId = source({ id: 'ca-on-bbbbbbbbbbbb' });

  const idCollision = planCanadaSourceRegistry({ registry: [existing] }, [sameIdDifferentUrl]);
  const urlCollision = planCanadaSourceRegistry({ registry: [existing] }, [sameUrlDifferentId]);

  assert.equal(idCollision.summary.additions, 0);
  assert.deepEqual(idCollision.registry, [existing]);
  assert.equal(urlCollision.summary.additions, 0);
  assert.deepEqual(urlCollision.registry, [existing]);
});

test('Canada source publication fails closed for invalid geography, country, class or URL', () => {
  const invalid = [
    source({ jurisdiction: 'CA-QC' }),
    source({ country_code: 'US' }),
    source({ source_class: 'private-event' }),
    source({ source_url: 'http://ontario.ca/vendors' })
  ];
  for (const candidate of invalid) {
    assert.throws(() => planCanadaSourceRegistry({ registry: [] }, [candidate]));
  }
});

test('Canada source publication branch binds exact plan and main SHA', () => {
  const plan = planCanadaSourceRegistry({ registry: [] }, [source()]);
  const mainSha = '5cceeb84ed077a32d0d8e3123c756ae705eb61e6';
  const branch = canadaSourceBranchName(plan, mainSha);

  assert.match(branch, /^sources\/cloud-ca-growth-[a-f0-9]{16}-base-5cceeb84ed077a32$/);
  assert.equal(branch, canadaSourceBranchName(plan, mainSha));
  assert.notEqual(
    branch,
    canadaSourceBranchName(planCanadaSourceRegistry({ registry: [] }, [source({ id: 'ca-qc-bbbbbbbbbbbb', region_code: 'QC', region_name: 'Quebec', jurisdiction: 'CA-QC' })]), mainSha)
  );
});