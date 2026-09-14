import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateCanadaSourceEvidence,
  isCanadianPublicServiceHost
} from '../operations/cloudflare-global-acquisition/lib/ca-source-evidence.mjs';
import registry from '../operations/opportunity-pipeline/config/ca-approved-source-routes.json' with { type: 'json' };

const allowedRegionCodes = new Set(['AB','BC','MB','NB','NL','NS','ON','PE','QC','SK','NT','NU','YT']);

test('Canada approved source registry contains only valid Canadian routes and cannot leak UK or US sources', () => {
  assert.ok(Array.isArray(registry));

  const ids = new Set();
  const sourceUrls = new Set();
  for (const source of registry) {
    assert.equal(source.country_code, 'CA');
    assert.ok(allowedRegionCodes.has(source.region_code));
    assert.equal(source.jurisdiction, `CA-${source.region_code}`);
    assert.equal(source.source_class, 'public-service');
    assert.match(source.id, /^ca-[a-z]{2}-[a-f0-9]{12}$/i);
    assert.equal(isCanadianPublicServiceHost(source.source_url), true);
    assert.equal(isCanadianPublicServiceHost(source.application_url), true);
    assert.equal(ids.has(source.id), false);
    assert.equal(sourceUrls.has(source.source_url), false);
    ids.add(source.id);
    sourceUrls.add(source.source_url);
  }
});

test('Canada public-service host policy accepts bounded government and curated municipal roots only', () => {
  assert.equal(isCanadianPublicServiceHost('https://www.canada.ca/en/services.html'), true);
  assert.equal(isCanadianPublicServiceHost('https://www2.gov.bc.ca/gov/content/home'), true);
  assert.equal(isCanadianPublicServiceHost('https://www.ontario.ca/page/example'), true);
  assert.equal(isCanadianPublicServiceHost('https://www.toronto.ca/services-payments/permits-licences-bylaws/'), true);
  assert.equal(isCanadianPublicServiceHost('https://cdn.halifax.ca/example'), true);
  assert.equal(isCanadianPublicServiceHost('https://legacy.winnipeg.ca/example'), true);
  assert.equal(isCanadianPublicServiceHost('https://example.ca/vendors'), false);
  assert.equal(isCanadianPublicServiceHost('https://toronto.example.ca/vendors'), false);
  assert.equal(isCanadianPublicServiceHost('http://toronto.ca/vendors'), false);
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

test('Canada evidence auto-approves curated municipal authority with exact city geography', () => {
  const result = evaluateCanadaSourceEvidence({
    region_code: 'ON',
    source_url: 'https://www.toronto.ca/services-payments/permits-licences-bylaws/vending-permits/',
    application_url: 'https://www.toronto.ca/services-payments/permits-licences-bylaws/vending-permits/',
    title: 'Toronto Vendor Permit Application',
    page_text: 'Toronto food truck vendors can apply using the application form and pay the permit fee.'
  });
  assert.equal(result.status, 'approved');
  assert.equal(result.region_code, 'ON');
  assert.equal(result.jurisdiction, 'CA-ON');
});

test('Canada geography attestation uses exact phrases and cannot match short province codes inside normal words', () => {
  const result = evaluateCanadaSourceEvidence({
    region_code: 'ON',
    source_url: 'https://www.ontario.ca/page/example-market',
    application_url: 'https://www.ontario.ca/page/example-market',
    title: 'Vendor application online',
    page_text: 'Vendor applications are online. Submit the form and registration fee.'
  });
  assert.equal(result.status, 'held');
  assert.equal(result.reason, 'canada_region_not_attested');
});

test('Canada evidence requires manual review for otherwise valid non-public-service first-party hosts', () => {
  const result = evaluateCanadaSourceEvidence({
    region_code: 'BC',
    source_url: 'https://examplemarket.ca/vendors',
    title: 'Vancouver Market Vendor Application',
    page_text: 'Vancouver vendors may apply for a booth using the registration form.'
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
