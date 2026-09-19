import test from 'node:test';
import assert from 'node:assert/strict';

import { extractEvidence } from '../../platform/findpitches-v2/engine/evidence.mjs';
import { scoreCandidate } from '../../platform/findpitches-v2/engine/scoring.mjs';

test('extracts application evidence, geography and future year', () => {
  const extracted = extractEvidence({
    body: `
      <html>
        <head><title>Kent Food Festival 2027</title></head>
        <body>
          <h1>Food vendors wanted</h1>
          <p>Join us in Kent in 2027.</p>
          <a href="/vendor-application">Vendor application</a>
        </body>
      </html>`,
    sourceUrl: 'https://festival.test/vendors',
    location: 'Kent',
    now: new Date('2026-09-19T00:00:00Z')
  });

  assert.equal(extracted.title, 'Kent Food Festival 2027');
  assert.equal(extracted.application_url, 'https://festival.test/vendor-application');
  assert.ok(extracted.evidence.some(item => item.type === 'application_phrase'));
  assert.ok(extracted.evidence.some(item => item.type === 'geography_match'));
  assert.ok(extracted.evidence.some(item => item.type === 'current_or_future_year'));

  const scored = scoreCandidate({
    evidence: extracted.evidence,
    sourceUrl: 'https://festival.test/vendors',
    applicationUrl: extracted.application_url
  });
  assert.equal(scored.score, 80);
});

test('negative career signal carries a strong penalty', () => {
  const extracted = extractEvidence({
    body: '<html><body><h1>Careers</h1><p>Current vacancies and vendor application support role.</p></body></html>',
    sourceUrl: 'https://example.test/careers',
    location: 'Texas',
    now: new Date('2026-09-19T00:00:00Z')
  });

  const scored = scoreCandidate({
    evidence: extracted.evidence,
    sourceUrl: 'https://example.test/careers',
    applicationUrl: extracted.application_url
  });

  assert.ok(scored.score < 0);
  assert.ok(extracted.evidence.some(item => item.type === 'negative_phrase'));
});
