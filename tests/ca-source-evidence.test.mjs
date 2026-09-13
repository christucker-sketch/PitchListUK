import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateCanadaSourceEvidence,
  isCanadianPublicServiceHost
} from '../operations/cloudflare-global-acquisition/lib/ca-source-evidence.mjs';
import registry from '../operations/opportunity-pipeline/config/ca-approved-source-routes.json' with { type: 'json' };

test('Canada approved source registry starts empty and cannot leak UK or US routes', () => {
  assert.deepEqual(registry, []);
});

test('Canada public-service host policy accepts bounded federal and provincial roots only', () => {
  assert.equal(isCanadianPublicServiceHost('https://www.canada.ca/en/services.html'), true);
  assert.equal(isCanadianPublicServiceHost('https://www2.gov.bc.ca/gov/content/home'), true);
  assert.equal(isCanadianPublicServiceHost('https://www.ontario.ca/page/example'), true);
  assert.equal(isCanadianPublicServiceHost('https://example.ca/vendors'), false);
  assert.equal(isCanadianPublicServiceHost('http://ontario.ca/vendors'), false);
});

test('Canada evidence auto-approves exact province plus actionable vendor evidence on a public-service route', () => {
  const result = evaluateCanadaSourceEvidence({
    region_code: 'ON',
    source_url: 'https://www.ontario.ca/page/example-market',
    application_url: 'https://www.ontario.ca/page/example-market',
    title: 'Ontario Market Vendor Application',
    page_text: 'Ontario vendors can apply using this application form. Vendor fee and registration deadline apply.'
  });
  assert.equal(result.status, 'approved');
  assert.equal(result.region_code, 'ON');
  assert.equal(result.jurisdiction, 'CA-ON');
});

test('Canada evidence requires manual review for otherwise valid non-public-service first-party hosts', () => {
  const result = evaluateCanadaSourceEvidence({
    region_code: 'BC',
    source_url: 'https://examplemarket.ca/vendors',
    title: 'British Columbia Market Vendor Application',
    page_text: 'British Columbia vendors may apply for a booth using the registration form.'
  });
  assert.equal(result.status, 'review');
  assert.equal(result.reason, 'canada_non_public_service_requires_review');
});

test('Canada evidence fails closed on missing geography, vendor/action evidence and negative signals', () => {
  assert.equal(evaluateCanadaSourceEvidence({ source_url: 'https://ontario.ca/x', page_text: 'Vendor application' }).reason, 'canada_region_not_attested');
  assert.equal(evaluateCanadaSourceEvidence({ region_code: 'ON', source_url: 'https://ontario.ca/x', page_text: 'Ontario event application' }).reason, 'canada_vendor_signal_missing');
  assert.equal(evaluateCanadaSourceEvidence({ region_code: 'ON', source_url: 'https://ontario.ca/x', page_text: 'Ontario vendor information' }).reason, 'canada_action_signal_missing');
  assert.equal(evaluateCanadaSourceEvidence({ region_code: 'ON', source_url: 'https://ontario.ca/x', page_text: 'Ontario vendor applications closed' }).reason, 'canada_negative_vendor_signal');
});
