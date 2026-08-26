'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { privateAddress, assertPublicUrl, createCandidateFetcher } = require('../lib/source-candidate-fetch');

test('candidate fetching rejects private, loopback, credentialed and non-HTTPS targets', async () => {
  assert.equal(privateAddress('127.0.0.1'), true);
  assert.equal(privateAddress('10.0.0.1'), true);
  assert.equal(privateAddress('8.8.8.8'), false);
  await assert.rejects(() => assertPublicUrl('http://example.co.uk/apply', async () => [{ address: '8.8.8.8' }]), /policy_rejected/);
  await assert.rejects(() => assertPublicUrl('https://localhost/apply', async () => [{ address: '127.0.0.1' }]), /host_policy_rejected/);
  await assert.rejects(() => assertPublicUrl('https://example.co.uk/apply', async () => [{ address: '192.168.1.5' }]), /private_address_rejected/);
});

test('candidate fetching obeys robots without requiring prior source approval', async () => {
  const calls = [];
  const fetcher = createCandidateFetcher({
    lookup: async () => [{ address: '8.8.8.8', family: 4 }], minIntervalMs: 1, sleep: async () => {},
    fetchImpl: async url => {
      calls.push(String(url));
      if (String(url).endsWith('/robots.txt')) return { ok: true, status: 200, url, text: async () => 'User-agent: *\nDisallow: /private' };
      return { ok: true, status: 200, url, headers: { get: () => null }, text: async () => 'Apply to become a market trader' };
    }
  });
  const allowed = await fetcher.fetchCandidate('https://newmarketoperator.co.uk/traders');
  const denied = await fetcher.fetchCandidate('https://newmarketoperator.co.uk/private/apply');
  assert.equal(allowed.ok, true);
  assert.equal(denied.classification, 'robots_disallowed');
  assert.equal(calls.length, 2);
});
