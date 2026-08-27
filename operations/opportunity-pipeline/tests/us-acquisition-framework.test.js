const test = require('node:test');
const assert = require('node:assert/strict');
const { US_ACQUISITION_FRAMEWORK, assertUsAcquisitionFramework } = require('../config/us-acquisition-framework');
const { canonicalUrl, dedupeTexasCandidates, runTexasAcquisitionCycle } = require('../lib/us-acquisition-framework');

test('US acquisition framework is Texas-scoped and staging-only', () => {
  assert.equal(assertUsAcquisitionFramework(), true);
  assert.equal(US_ACQUISITION_FRAMEWORK.countryCode, 'US');
  assert.equal(US_ACQUISITION_FRAMEWORK.regionCode, 'TX');
  assert.equal(US_ACQUISITION_FRAMEWORK.runtimeNamespace, 'us');
  assert.equal(US_ACQUISITION_FRAMEWORK.sourceRegistryNamespace, 'us');
  assert.equal(US_ACQUISITION_FRAMEWORK.automaticPublishEnabled, false);
  assert.equal(US_ACQUISITION_FRAMEWORK.productionWritesEnabled, false);
  assert.equal(US_ACQUISITION_FRAMEWORK.stagingOnly, true);
});

test('canonical URL removes tracking noise before dedupe', () => {
  assert.equal(
    canonicalUrl('https://example.org/apply/?utm_source=google&gclid=abc#vendors'),
    'https://example.org/apply'
  );
});

test('dedupe collapses duplicate stable ids and application routes', () => {
  const a = { row: { stable_id: 'opp_us_a', application_url: 'https://example.org/apply?utm_source=x' } };
  const b = { row: { stable_id: 'opp_us_a', application_url: 'https://other.org/apply' } };
  const c = { row: { stable_id: 'opp_us_c', application_url: 'https://example.org/apply' } };
  const d = { row: { stable_id: 'opp_us_d', application_url: 'https://example.org/other' } };
  const result = dedupeTexasCandidates([a, b, c, d]);
  assert.deepEqual(result.unique.map(item => item.row.stable_id), ['opp_us_a', 'opp_us_d']);
  assert.equal(result.duplicates.length, 2);
});

test('Texas acquisition cycle stages strong candidates and never publishes them', async () => {
  const report = await runTexasAcquisitionCycle({
    discover: async args => {
      assert.equal(args.country_code, 'US');
      assert.equal(args.region_code, 'TX');
      assert.ok(args.credit_budget > 0);
      return [{ url: 'https://example.org/austin-fair?utm_source=test' }];
    },
    fetchPage: async ({ url, country_code, region_code }) => {
      assert.equal(country_code, 'US');
      assert.equal(region_code, 'TX');
      assert.equal(url, 'https://example.org/austin-fair');
      return {
        url,
        title: 'Austin Fall Fair Vendor Application',
        text: 'Hosted by Austin Events. Event Date: October 17, 2026. Food truck vendor application. Austin, TX 78701.',
        organiser: 'Austin Events',
        links: [{ text: 'Vendor Application', url: 'https://example.org/austin-fair/apply' }]
      };
    }
  });

  assert.equal(report.mode, 'staging-only');
  assert.equal(report.country_code, 'US');
  assert.equal(report.region_code, 'TX');
  assert.equal(report.staged_count, 1);
  assert.equal(report.staging_rows[0].publishable, false);
  assert.equal(report.staging_rows[0].quality_status, 'review');
});

test('procurement contamination is rejected before staging', async () => {
  const report = await runTexasAcquisitionCycle({
    discover: async () => [{ url: 'https://example.org/vendor-registration' }],
    fetchPage: async ({ url }) => ({
      url,
      title: 'Vendor Registration',
      text: 'Register as a supplier for procurement opportunities and bids with the city.'
    })
  });
  assert.equal(report.staged_count, 0);
  assert.equal(report.rejected_count, 1);
});

test('weak or incomplete candidates are held for review', async () => {
  const report = await runTexasAcquisitionCycle({
    discover: async () => [{ url: 'https://example.org/community-day' }],
    fetchPage: async ({ url }) => ({
      url,
      title: 'Community Day',
      text: 'Local community event in Austin, TX 78701.'
    })
  });
  assert.equal(report.staged_count, 0);
  assert.equal(report.held_count, 1);
});

test('fetch failures are held and do not abort the bounded cycle', async () => {
  const report = await runTexasAcquisitionCycle({
    discover: async () => [
      { url: 'https://example.org/bad' },
      { url: 'https://example.org/good' }
    ],
    fetchPage: async ({ url }) => {
      if (url.endsWith('/bad')) throw new Error('timeout');
      return {
        url,
        title: 'Dallas Makers Market Vendor Application',
        text: 'Hosted by Dallas Makers. Every Saturday. Craft vendor application. Dallas, TX 75201.',
        organiser: 'Dallas Makers',
        recurring: true,
        links: [{ text: 'Vendor Application', url: `${url}/apply` }]
      };
    }
  });
  assert.equal(report.held_count, 1);
  assert.equal(report.staged_count, 1);
});

test('framework rejects production-capable configuration', () => {
  assert.throws(() => assertUsAcquisitionFramework({
    ...US_ACQUISITION_FRAMEWORK,
    productionWritesEnabled: true
  }), /staging only/);
});
