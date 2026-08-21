const test = require('node:test');
const assert = require('node:assert/strict');
const { creditPreflight } = require('../lib/credit-budget');
const { classifyFetchFailure, parseRobots, robotsAllows, createPolicyFetcher, mapBounded } = require('../lib/fetch-policy');

function response(status, body = '', url = '') {
  return { status, ok: status >= 200 && status < 300, url, text: async () => body };
}

test('credit preflight blocks missing and insufficient budgets', () => {
  assert.equal(creditPreflight({ configured: false, queries: 2 }).reason, 'credit_balance_missing');
  assert.equal(creditPreflight({ available: 101, reserve: 100, queries: 2 }).allowed, false);
  assert.equal(creditPreflight({ available: 110, reserve: 100, queries: 2 }).allowed, true);
});

test('robots policy is parsed and enforced', () => {
  const rules = parseRobots('User-agent: *\nDisallow: /private\nDisallow: /admin');
  assert.equal(robotsAllows('https://example.com/public', rules), true);
  assert.equal(robotsAllows('https://example.com/private/item', rules), false);
});

test('approved source fetch follows robots, retries bounded failures and reports redirects', async () => {
  const calls = [];
  let pageAttempts = 0;
  const fetchImpl = async url => {
    calls.push(url);
    if (url.endsWith('/robots.txt')) return response(200, 'User-agent: *\nDisallow:');
    pageAttempts++;
    if (pageAttempts === 1) return response(429);
    return response(200, 'ok', 'https://englandsmedievalfestival.com/traders');
  };
  const waits = [];
  const { fetchWithPolicy } = createPolicyFetcher({ fetchImpl, sleep: async ms => waits.push(ms), now: () => 5000 });
  const result = await fetchWithPolicy('https://englandsmedievalfestival.com/old-traders');
  assert.equal(result.ok, true);
  assert.equal(result.attempts, 2);
  assert.equal(result.final_url, 'https://englandsmedievalfestival.com/traders');
  assert.ok(waits.length >= 1);
  assert.equal(calls.length, 3);
});

test('unapproved sources and robot exclusions fail closed', async () => {
  const denied = createPolicyFetcher({ fetchImpl: async () => { throw new Error('should not fetch'); } });
  assert.equal((await denied.fetchWithPolicy('https://unknown.example/vendors')).classification, 'source_not_approved');
  const robot = createPolicyFetcher({ fetchImpl: async url => url.endsWith('/robots.txt') ? response(200, 'User-agent: *\nDisallow: /private') : response(200, 'ok') });
  assert.equal((await robot.fetchWithPolicy('https://bristol.gov.uk/private/vendor')).classification, 'robots_disallowed');
});

test('fetch failures are classified and concurrency stays bounded', async () => {
  assert.equal(classifyFetchFailure({ name: 'AbortError' }), 'timeout');
  assert.equal(classifyFetchFailure(null, response(403)), 'access_denied');
  let active = 0, peak = 0;
  await mapBounded([1, 2, 3, 4], 2, async value => { active++; peak = Math.max(peak, active); await new Promise(resolve => setImmediate(resolve)); active--; return value; });
  assert.equal(peak, 2);
});
