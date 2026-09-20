import test from 'node:test';
import assert from 'node:assert/strict';

import { createDefaultCandidateEvaluator } from '../../platform/findpitches-v2/engine/evaluator.mjs';
import { getMarket } from '../../platform/findpitches-v2/markets/registry.mjs';

const GOOD_HTML = `
<html>
  <head><title>Vendor Opportunity 2027</title></head>
  <body>
    <h1>Vendors wanted</h1>
    <p>Applications are open in REGION for 2027.</p>
    <a href="/apply">Vendor application</a>
  </body>
</html>`;

for (const scenario of [
  { market: 'GB', region: 'KENT', location: 'Kent' },
  { market: 'US', region: 'TX', location: 'Texas' },
  { market: 'CA', region: 'ON', location: 'Ontario' }
]) {
  test(`same evaluator validates ${scenario.market}/${scenario.region}`, async () => {
    const evaluator = createDefaultCandidateEvaluator({
      fetchProvider: {
        async fetch(url) {
          return {
            final_url: url,
            body: GOOD_HTML.replace('REGION', scenario.location)
          };
        }
      },
      now: () => new Date('2026-09-19T00:00:00Z')
    });

    const candidate = await evaluator({
      market: getMarket(scenario.market),
      region_code: scenario.region,
      location: scenario.location,
      result: { url: `https://${scenario.market.toLowerCase()}.example.test/vendors` }
    });

    assert.equal(candidate.market, scenario.market);
    assert.equal(candidate.status, 'validated');
    assert.equal(candidate.publishable, true);
    assert.match(candidate.candidate_id, /^fpv2_[a-f0-9]{24}$/);
  });
}

test('shared evaluator rejects career pages even when vendor wording is present', async () => {
  const evaluator = createDefaultCandidateEvaluator({
    fetchProvider: {
      async fetch(url) {
        return {
          final_url: url,
          body: '<html><body><h1>Careers</h1><p>Current vacancies - vendor application coordinator.</p></body></html>'
        };
      }
    }
  });

  const candidate = await evaluator({
    market: getMarket('US'),
    region_code: 'TX',
    location: 'Texas',
    result: { url: 'https://example.test/careers' }
  });

  assert.equal(candidate.status, 'rejected');
  assert.equal(candidate.rejection_reason, 'negative_page_signal');
  assert.equal(candidate.publishable, false);
});


test('shared evaluator rejects trade-account pages even when generic vendor wording is present', async () => {
  const evaluator = createDefaultCandidateEvaluator({
    fetchProvider: {
      async fetch(url) {
        return {
          final_url: url,
          body: '<html><head><title>Resale Certificates for Interior Designers by State</title></head><body><h1>Vendor application</h1><p>Resale certificates and trade registration application for designers.</p><a href="/trade-registration-application">Trade registration application</a></body></html>'
        };
      }
    }
  });

  const candidate = await evaluator({
    market: getMarket('US'),
    region_code: 'NC',
    location: 'North Carolina',
    result: { url: 'https://example.test/resale-certificate-guide' }
  });

  assert.equal(candidate.status, 'rejected');
  assert.equal(candidate.rejection_reason, 'negative_page_signal');
  assert.equal(candidate.publishable, false);
});


test('shared evaluator rejects procurement pages even when vendor wording is present', async () => {
  const evaluator = createDefaultCandidateEvaluator({ fetchProvider: { async fetch(url) { return { final_url: url, body: '<html><head><title>2026 Vendor Request for Qualifications</title></head><body><h1>Become a Service Partner</h1><p>Public purchase supplier registration. Vendor application and request for qualifications.</p><a href="/vendor-application">Vendor application</a></body></html>' }; } } });
  const candidate = await evaluator({ market: getMarket('US'), region_code: 'KY', location: 'Kentucky', result: { url: 'https://example.test/vendor-rfq' } });
  assert.equal(candidate.status, 'rejected');
  assert.equal(candidate.rejection_reason, 'negative_page_signal');
  assert.equal(candidate.publishable, false);
});

test('shared evaluator rejects forum pages even when vendor wording is present', async () => {
  const evaluator = createDefaultCandidateEvaluator({ fetchProvider: { async fetch(url) { return { final_url: url, body: '<html><head><title>Model Y UK Delivery | Community Forum</title></head><body><p>Forum thread discussing a vendor application and delivery.</p></body></html>' }; } } });
  const candidate = await evaluator({ market: getMarket('GB'), region_code: 'HERTS', location: 'Hertfordshire', result: { url: 'https://example.test/forum/thread' } });
  assert.equal(candidate.status, 'rejected');
  assert.equal(candidate.rejection_reason, 'negative_page_signal');
  assert.equal(candidate.publishable, false);
});
