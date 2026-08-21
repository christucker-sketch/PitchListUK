const test = require('node:test');
const assert = require('node:assert/strict');
const { creditPreflight } = require('../lib/credit-budget');
const { classifyFetchFailure, parseRobots, robotsAllows, createPolicyFetcher, mapBounded } = require('../lib/fetch-policy');
const { sourceRuleFor } = require('../config/sources');

function response(status, body = '', url = '') {
  return { status, ok: status >= 200 && status < 300, url, text: async () => body };
}

test('credit preflight blocks missing and insufficient budgets', () => {
  assert.equal(creditPreflight({ configured: false, queries: 2 }).reason, 'credit_budget_missing');
  assert.equal(creditPreflight({ available: 101, reserve: 100, queries: 2 }).allowed, false);
  assert.equal(creditPreflight({ available: 110, reserve: 100, queries: 2 }).allowed, true);
  assert.equal(creditPreflight({ runBudget: 2, queries: 2 }).allowed, true);
  assert.equal(creditPreflight({ runBudget: 1, queries: 2 }).reason, 'run_budget_exceeded');
  assert.equal(creditPreflight({ runBudget: 2, available: 101, reserve: 100, queries: 2 }).allowed, false);
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

test('approved weak-region sources retain operational ownership and polling metadata', () => {
  for (const url of [
    'https://durhammarkets.co.uk/become-a-trader/',
    'https://tastecumbria.co.uk/trader-application-form/',
    'https://www.barnsley.gov.uk/services/markets/trade-at-our-local-markets/',
    'https://www.dorchester-tc.gov.uk/Our-Services/Markets',
    'https://www.saundersmarkets.co.uk/aylesbury-market'
  ]) {
    const rule = sourceRuleFor(url);
    assert.equal(rule.approved, true, url);
    assert.ok(rule.organisation, url);
    assert.ok(rule.geographic_coverage, url);
    assert.ok(rule.opportunity_type, url);
    assert.match(rule.official_application_route, /^https:/, url);
    assert.equal(rule.recurring, true, url);
    assert.equal(rule.robots_policy, 'fetch-and-obey', url);
    assert.ok(rule.recommended_polling_days > 0, url);
  }
});

test('page requests have a bounded timeout and retry with a classified failure', async () => {
  let pageAttempts = 0;
  const fetchImpl = async (url, options) => {
    if (url.endsWith('/robots.txt')) return response(200, 'User-agent: *\nDisallow:');
    pageAttempts++;
    return new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true });
    });
  };
  const { fetchWithPolicy } = createPolicyFetcher({ fetchImpl, timeoutMs: 2, sleep: async () => {} });
  const result = await fetchWithPolicy('https://bristol.gov.uk/traders', { maxAttempts: 2 });
  assert.equal(result.ok, false);
  assert.equal(result.classification, 'timeout');
  assert.equal(result.attempts, 2);
  assert.equal(pageAttempts, 2);
});

test('fetch failures are classified and concurrency stays bounded', async () => {
  assert.equal(classifyFetchFailure({ name: 'AbortError' }), 'timeout');
  assert.equal(classifyFetchFailure(null, response(403)), 'access_denied');
  let active = 0, peak = 0;
  await mapBounded([1, 2, 3, 4], 2, async value => { active++; peak = Math.max(peak, active); await new Promise(resolve => setImmediate(resolve)); active--; return value; });
  assert.equal(peak, 2);
});

test('requests to one approved domain are serialised even under global concurrency', async () => {
  let activePages = 0;
  let peakPages = 0;
  const fetchImpl = async url => {
    if (url.endsWith('/robots.txt')) return response(200, 'User-agent: *\nDisallow:');
    activePages++;
    peakPages = Math.max(peakPages, activePages);
    await new Promise(resolve => setImmediate(resolve));
    activePages--;
    return response(200, 'ok', url);
  };
  const { fetchWithPolicy } = createPolicyFetcher({ fetchImpl, sleep: async () => {}, now: (() => { let value = 0; return () => value += 5000; })() });
  await Promise.all([
    fetchWithPolicy('https://bristol.gov.uk/traders/a'),
    fetchWithPolicy('https://bristol.gov.uk/traders/b')
  ]);
  assert.equal(peakPages, 1);
});
