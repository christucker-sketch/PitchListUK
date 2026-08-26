import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { normaliseAnalyticsEvent, recordAnalyticsEvent, summariseAnalytics } from '../functions/_lib/analytics.mjs';
import { onRequestPost as analyticsPost } from '../functions/api/analytics/event.js';

const FIXTURES = {
  session: 'fixture-session-value',
  access: 'fixture-access-value',
  token: 'fixture-token-value',
  checkout: 'fixture-checkout-value',
  gclid: 'gclid-fixture',
  fbclid: 'fbclid-fixture'
};
const BROWSER_SESSION_A = `as_${'a'.repeat(32)}`;
const BROWSER_SESSION_B = `as_${'b'.repeat(32)}`;
const LEGACY_SESSION = 'c'.repeat(24);

function contextFor(input = {}, options = {}) {
  const writes = [];
  const request = new Request(options.requestUrl || 'https://pitchlist.uk/api/analytics/event', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      referer: options.headerReferrer || '',
      'user-agent': 'analytics-redaction-test',
      'cf-connecting-ip': '192.0.2.10'
    },
    body: JSON.stringify(input)
  });
  const env = {
    PITCHLIST_ANALYTICS_KV: {
      async put(key, value, metadata) {
        writes.push({ key, value, metadata });
      }
    }
  };
  if (!options.noSalt) env.PITCHLIST_ANALYTICS_SALT = 'test-only-salt';
  Object.assign(env, options.env || {});
  return { context: { request, env }, writes };
}

function assertNoCredentials(value) {
  const serialised = typeof value === 'string' ? value : JSON.stringify(value);
  for (const fixture of Object.values(FIXTURES)) assert.equal(serialised.includes(fixture), false);
  assert.doesNotMatch(serialised, /"(?:session_id|access_token|checkout_session_id)"\s*:/i);
}

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
    clear: () => values.clear()
  };
}

function deterministicCrypto(byte) {
  return {
    getRandomValues(array) {
      array.fill(byte);
      return array;
    }
  };
}

async function runAnalyticsClient(options = {}) {
  const source = fs.readFileSync(new URL('../src/analytics.js', import.meta.url), 'utf8');
  const beacons = [];
  const sessionStorage = options.sessionStorage || memoryStorage();
  const localStorage = options.localStorage || memoryStorage();
  const location = options.location || {
    href: `https://pitchlist.uk/find-pitches?utm_source=newsletter&utm_medium=email&gclid=${FIXTURES.gclid}&session_id=${FIXTURES.session}&access_token=${FIXTURES.access}`,
    pathname: '/find-pitches',
    search: `?utm_source=newsletter&utm_medium=email&gclid=${FIXTURES.gclid}&session_id=${FIXTURES.session}&access_token=${FIXTURES.access}`,
    origin: 'https://pitchlist.uk'
  };
  const document = {
    title: 'Find pitches',
    referrer: options.referrer ?? `https://referrer.test/source?token=${FIXTURES.token}`,
    addEventListener() {}
  };
  const window = { location, sessionStorage, localStorage };
  if (options.crypto !== null) window.crypto = options.crypto || deterministicCrypto(0xaa);
  const sandbox = {
    window,
    document,
    sessionStorage,
    localStorage,
    navigator: { sendBeacon: (url, blob) => { beacons.push({ url, blob }); return true; } },
    Blob,
    URL,
    URLSearchParams,
    console
  };
  vm.runInNewContext(source, sandbox);
  return { window, beacons, sessionStorage, localStorage };
}

async function beaconBody(beacon) {
  return JSON.parse(await beacon.blob.text());
}

test('normal and legacy campaign attribution are preserved without arbitrary query data', async () => {
  const { context } = contextFor();
  const event = await normaliseAnalyticsEvent(context, {
    event: 'page_view',
    url: 'https://pitchlist.uk/find-pitches?utm_source=newsletter&utm_medium=email&utm_campaign=summer&utm_term=food&utm_content=hero&gclid=gclid-fixture&fbclid=fbclid-fixture&ignored=nope'
  });
  assert.equal(event.path, '/find-pitches');
  assert.deepEqual(event.campaign, {
    source: 'newsletter', medium: 'email', campaign: 'summer', content: 'hero', term: 'food',
    fbclid: true, gclid: true
  });
  assert.equal(JSON.stringify(event).includes('ignored'), false);

  const legacy = await normaliseAnalyticsEvent(context, {
    path: '/database',
    source: 'legacy-source',
    medium: 'legacy-medium',
    campaign: 'legacy-campaign',
    term: 'legacy-term',
    content: 'legacy-content',
    unknown: 'not-attribution'
  });
  assert.deepEqual(legacy.campaign, {
    source: 'legacy-source', medium: 'legacy-medium', campaign: 'legacy-campaign',
    content: 'legacy-content', term: 'legacy-term', fbclid: false, gclid: false
  });
  assert.equal(JSON.stringify(legacy).includes('not-attribution'), false);
});

test('duplicate, mixed-case and encoded sensitive parameters are removed', async () => {
  const { context } = contextFor();
  const event = await normaliseAnalyticsEvent(context, {
    event: 'page_view',
    url: `https://pitchlist.uk/find-pitches?session_id=${FIXTURES.session}&SESSION_ID=duplicate&access_token=${FIXTURES.access}&ToKeN=${FIXTURES.token}&%2573ession_id=encoded&utm_source=first&utm_source=second`,
    session_id: FIXTURES.session,
    session: FIXTURES.session,
    token: FIXTURES.token
  });
  assert.equal(event.path, '/find-pitches');
  assert.equal(event.campaign.source, 'first');
  assert.equal(Object.hasOwn(event, 'session_id'), false);
  assert.equal(Object.hasOwn(event, 'analytics_session_id'), false);
  assertNoCredentials(event);
});

test('percent-encoded sensitive values and non-scalar attribution are rejected', async () => {
  const { context } = contextFor();
  const event = await normaliseAnalyticsEvent(context, {
    path: '/find-pitches',
    utm_campaign: '%2573ession_id%253Dfixture-session-value',
    source: { nested: 'not-scalar' },
    properties: { note: '%2561ccess_token%253Dfixture-access-value', safe: 'kept' }
  });
  assert.equal(event.campaign.campaign, '');
  assert.equal(event.campaign.source, '');
  assert.deepEqual(event.properties, { safe: 'kept' });
  assertNoCredentials(event);
});

test('malformed URLs fail safely without retaining fragments', async () => {
  const { context } = contextFor();
  const event = await normaliseAnalyticsEvent(context, {
    url: `/find-pitches%ZZ?session_id=${FIXTURES.session}`,
    referrer: `https://example.test/source%ZZ?access_token=${FIXTURES.access}`
  });
  assert.equal(event.path, '/');
  assert.equal(event.referrer, '');
  assert.equal(event.referrer_host, '');
  assertNoCredentials(event);
});

test('nested properties, query fields, URLs and referrers are recursively sanitised', async () => {
  const { context } = contextFor();
  const event = await normaliseAnalyticsEvent(context, {
    path: '/safe',
    referrer: `https://referrer.test/start?session_id=${FIXTURES.session}`,
    properties: {
      query: `session_id=${FIXTURES.session}`,
      nested: {
        ACCESS_TOKEN: FIXTURES.access,
        '%2574oken': FIXTURES.token,
        api_token: FIXTURES.token,
        checkout: FIXTURES.checkout,
        stripe_session: FIXTURES.session,
        safe: 'kept',
        url: `https://example.test/path?checkout_session_id=${FIXTURES.checkout}`,
        referrer: `https://origin.test/from?token=${FIXTURES.token}`
      }
    }
  });
  assert.equal(event.referrer, 'https://referrer.test/start');
  assert.deepEqual(event.properties, {
    nested: { safe: 'kept', url: '/path', referrer: 'https://origin.test/from' }
  });
  assertNoCredentials(event);
});

test('forged direct POST is sanitised before KV storage and emits no sensitive logs', async () => {
  const { context, writes } = contextFor({
    event: `page_view?token=${FIXTURES.token}`,
    url: `https://pitchlist.uk/find-pitches?access_token=${FIXTURES.access}&utm_medium=direct&gclid=${FIXTURES.gclid}&fbclid=${FIXTURES.fbclid}`,
    referrer: `https://forged.test/path?session_id=${FIXTURES.session}`,
    session_id: FIXTURES.session,
    analytics_session_id: `as_${FIXTURES.checkout.padEnd(32, 'x').slice(0, 32)}`,
    properties: {
      checkout_session_id: FIXTURES.checkout,
      nested: {
        token: FIXTURES.token,
        copied_browser_id: BROWSER_SESSION_A,
        copied_legacy_id: LEGACY_SESSION,
        gclid: FIXTURES.gclid,
        fbclid: [FIXTURES.fbclid],
        result: 'safe'
      }
    }
  });
  const original = { log: console.log, warn: console.warn, error: console.error };
  const logged = [];
  console.log = (...args) => logged.push(args);
  console.warn = (...args) => logged.push(args);
  console.error = (...args) => logged.push(args);
  try {
    const response = await analyticsPost(context);
    assert.equal(response.status, 200);
  } finally {
    Object.assign(console, original);
  }
  assert.equal(writes.length, 1);
  assert.equal(logged.length, 0);
  assertNoCredentials(writes[0].value);
  const stored = JSON.parse(writes[0].value);
  assert.equal(stored.event, 'event');
  assert.equal(stored.path, '/find-pitches');
  assert.equal(stored.campaign.medium, 'direct');
  assert.equal(stored.campaign.gclid, true);
  assert.equal(stored.campaign.fbclid, true);
  assert.deepEqual(stored.properties, { nested: { gclid: true, result: 'safe' } });
  assert.equal(Object.hasOwn(stored, 'analytics_session_id'), false);
});

test('server stores click attribution as presence booleans and rejects objects and arrays', async () => {
  const scalar = await normaliseAnalyticsEvent(contextFor().context, {
    path: '/safe',
    gclid: FIXTURES.gclid,
    fbclid: 42
  });
  assert.equal(scalar.campaign.gclid, true);
  assert.equal(scalar.campaign.fbclid, true);
  assertNoCredentials(scalar);

  const forged = await normaliseAnalyticsEvent(contextFor().context, {
    path: '/safe',
    gclid: { value: FIXTURES.gclid },
    fbclid: [FIXTURES.fbclid]
  });
  assert.equal(forged.campaign.gclid, false);
  assert.equal(forged.campaign.fbclid, false);
  assertNoCredentials(forged);

  const legacyBooleans = await normaliseAnalyticsEvent(contextFor().context, {
    path: '/safe',
    gclid: true,
    fbclid: false
  });
  assert.equal(legacyBooleans.campaign.gclid, true);
  assert.equal(legacyBooleans.campaign.fbclid, false);
});

test('PITCHLIST_ANALYTICS_SALT produces stable HMAC pseudonyms without serialising the raw browser identifier', async () => {
  const first = contextFor();
  const second = contextFor();
  const distinct = contextFor();
  await recordAnalyticsEvent(first.context, { path: '/one', analytics_session_id: BROWSER_SESSION_A });
  await recordAnalyticsEvent(second.context, { path: '/two', analytics_session_id: BROWSER_SESSION_A });
  await recordAnalyticsEvent(distinct.context, { path: '/three', analytics_session_id: BROWSER_SESSION_B });
  const firstStored = JSON.parse(first.writes[0].value);
  const secondStored = JSON.parse(second.writes[0].value);
  const distinctStored = JSON.parse(distinct.writes[0].value);
  assert.match(firstStored.analytics_session_id, /^aj_[a-f0-9]{64}$/);
  assert.equal(firstStored.analytics_session_id, secondStored.analytics_session_id);
  assert.notEqual(firstStored.analytics_session_id, distinctStored.analytics_session_id);
  assert.equal(first.writes[0].value.includes(BROWSER_SESSION_A), false);
  assert.equal(second.writes[0].value.includes(BROWSER_SESSION_A), false);
  assert.equal(distinct.writes[0].value.includes(BROWSER_SESSION_B), false);
});

test('missing analytics salt omits session correlation entirely', async () => {
  const { context, writes } = contextFor({}, { noSalt: true });
  const result = await recordAnalyticsEvent(context, { path: '/safe', analytics_session_id: BROWSER_SESSION_A });
  assert.equal(result.stored, true);
  const stored = JSON.parse(writes[0].value);
  assert.equal(Object.hasOwn(stored, 'analytics_session_id'), false);
  assert.equal(writes[0].value.includes(BROWSER_SESSION_A), false);
});

test('webhook secrets alone do not produce analytics session correlation', async () => {
  const { context, writes } = contextFor({}, {
    noSalt: true,
    env: { PITCHLIST_WEBHOOK_SECRET: 'webhook-only-test-secret' }
  });
  await recordAnalyticsEvent(context, { path: '/safe', analytics_session_id: BROWSER_SESSION_A });
  assert.equal(Object.hasOwn(JSON.parse(writes[0].value), 'analytics_session_id'), false);
});

test('Stripe webhook secret alone does not produce analytics session correlation', async () => {
  const { context, writes } = contextFor({}, {
    noSalt: true,
    env: { STRIPE_WEBHOOK_SECRET: 'stripe-webhook-only-test-secret' }
  });
  await recordAnalyticsEvent(context, { path: '/safe', analytics_session_id: BROWSER_SESSION_A });
  assert.equal(Object.hasOwn(JSON.parse(writes[0].value), 'analytics_session_id'), false);
});

test('blank or whitespace analytics salt omits session correlation', async () => {
  for (const salt of ['', '   \t  ']) {
    const { context, writes } = contextFor({}, { env: { PITCHLIST_ANALYTICS_SALT: salt } });
    await recordAnalyticsEvent(context, { path: '/safe', analytics_session_id: BROWSER_SESSION_A });
    assert.equal(Object.hasOwn(JSON.parse(writes[0].value), 'analytics_session_id'), false);
  }
});

test('only exact legacy 24-hex browser sessions are accepted and weak fallback strings are rejected', async () => {
  const accepted = await normaliseAnalyticsEvent(contextFor().context, { session_id: LEGACY_SESSION });
  const weak = await normaliseAnalyticsEvent(contextFor().context, { session_id: '1700000000000-deadbeef' });
  const accessShaped = await normaliseAnalyticsEvent(contextFor().context, { session_id: 'd'.repeat(64) });
  assert.match(accepted.analytics_session_id, /^aj_[a-f0-9]{64}$/);
  assert.equal(Object.hasOwn(weak, 'analytics_session_id'), false);
  assert.equal(Object.hasOwn(accessShaped, 'analytics_session_id'), false);
});

test('session totals count stored pseudonyms and exact historical IDs through one strict accessor', async () => {
  const fresh = await normaliseAnalyticsEvent(contextFor().context, { analytics_session_id: BROWSER_SESSION_A });
  const summary = summariseAnalytics([
    fresh,
    { ...fresh, id: 'duplicate-event' },
    { session_id: LEGACY_SESSION },
    { session_id: '1700000000000-deadbeef' },
    { session_id: 'e'.repeat(64) },
    { session_id: 'cs_test_not-an-analytics-session' },
    { analytics_session_id: BROWSER_SESSION_A }
  ]);
  assert.equal(summary.totals.sessions, 2);
});

test('browser emits one stable cryptographic ID and no URL credentials', async () => {
  const client = await runAnalyticsClient();
  assert.equal(client.beacons.length, 1);
  const body = await beaconBody(client.beacons[0]);
  assert.equal(body.path, '/find-pitches');
  assert.equal(Object.hasOwn(body, 'url'), false);
  assert.equal(Object.hasOwn(body, 'session_id'), false);
  assert.match(body.analytics_session_id, /^as_[a-f0-9]{32}$/);
  assert.equal(body.utm_source, 'newsletter');
  assert.equal(body.utm_medium, 'email');
  assert.equal(body.gclid, true);
  assert.equal(body.fbclid, false);
  assert.equal(body.referrer, 'https://referrer.test/source');
  assert.equal(body.properties.first_landing_path, '/find-pitches');
  assert.equal(body.properties.first_referrer, 'https://referrer.test/source');
  assert.equal(Object.hasOwn(body.properties, 'query'), false);
  assertNoCredentials(body);
  const storedAttribution = client.localStorage.values.get('pitchlist_attribution');
  assert.equal(storedAttribution.includes(FIXTURES.gclid), false);
  assert.deepEqual(JSON.parse(storedAttribution), {
    utm_source: 'newsletter',
    utm_medium: 'email',
    gclid: true,
    fbclid: false
  });

  client.window.pitchlistTrack(`custom?token=${FIXTURES.token}`, {
    query: `session_id=${FIXTURES.session}`,
    url: `https://pitchlist.uk/internal?access_token=${FIXTURES.access}`,
    href: `https://external.test/path?token=${FIXTURES.token}`,
    contact: `access_token=${FIXTURES.access}`,
    gclid: FIXTURES.gclid,
    fbclid: [FIXTURES.fbclid],
    safe: 'kept'
  });
  const custom = await beaconBody(client.beacons[1]);
  assert.equal(custom.analytics_session_id, body.analytics_session_id);
  assert.equal(custom.event, 'event');
  assert.deepEqual(custom.properties, {
    url: '/internal', href: 'external.test', gclid: true, safe: 'kept',
    first_landing_path: '/find-pitches', first_referrer: 'https://referrer.test/source'
  });
  assertNoCredentials(custom);
});

test('browser retains privacy-safe first touch across internal navigation', async () => {
  const sessionStorage = memoryStorage();
  const first = await runAnalyticsClient({
    sessionStorage,
    location: { href: 'https://pitchlist.uk/', pathname: '/', search: '', origin: 'https://pitchlist.uk' },
    referrer: 'https://www.google.com/search?q=private-search'
  });
  const next = await runAnalyticsClient({
    sessionStorage,
    location: { href: 'https://pitchlist.uk/database', pathname: '/database', search: '', origin: 'https://pitchlist.uk' },
    referrer: 'https://pitchlist.uk/'
  });
  const firstBody = await beaconBody(first.beacons[0]);
  const nextBody = await beaconBody(next.beacons[0]);
  assert.equal(firstBody.properties.first_landing_path, '/');
  assert.equal(nextBody.properties.first_landing_path, '/');
  assert.equal(firstBody.properties.first_referrer, 'https://www.google.com/search');
  assert.equal(nextBody.properties.first_referrer, 'https://www.google.com/search');
  assertNoCredentials(nextBody);
});

test('browser click attribution absence is false and raw identifiers never enter payload or storage', async () => {
  const localStorage = memoryStorage();
  const client = await runAnalyticsClient({
    localStorage,
    location: { href: 'https://pitchlist.uk/database', pathname: '/database', search: '', origin: 'https://pitchlist.uk' }
  });
  const body = await beaconBody(client.beacons[0]);
  assert.equal(body.gclid, false);
  assert.equal(body.fbclid, false);
  assertNoCredentials(body);
  assert.deepEqual(JSON.parse(localStorage.values.get('pitchlist_attribution')), { gclid: false, fbclid: false });
});

test('URL, storage, checkout and identity data cannot influence the generated browser ID', async () => {
  const first = await runAnalyticsClient({
    crypto: deterministicCrypto(0xab),
    localStorage: memoryStorage({
      pitchlist_checkout_session_id: 'fixture-checkout-storage',
      pitchlist_access_token: 'fixture-access-storage',
      pitchlist_account: JSON.stringify({ email: 'fixture@example.test', customer: 'fixture-customer' })
    })
  });
  const second = await runAnalyticsClient({
    crypto: deterministicCrypto(0xab),
    location: {
      href: 'https://pitchlist.uk/database?customer=other&subscription=other',
      pathname: '/database',
      search: '?customer=other&subscription=other',
      origin: 'https://pitchlist.uk'
    },
    localStorage: memoryStorage({ pitchlist_account: JSON.stringify({ email: 'other@example.test' }) })
  });
  const firstId = (await beaconBody(first.beacons[0])).analytics_session_id;
  const secondId = (await beaconBody(second.beacons[0])).analytics_session_id;
  assert.equal(firstId, `as_${'ab'.repeat(16)}`);
  assert.equal(secondId, firstId);
});

test('session storage reuse, clearing and invalid preseeding behave safely', async () => {
  const shared = memoryStorage();
  const first = await runAnalyticsClient({ sessionStorage: shared, crypto: deterministicCrypto(0xaa) });
  const firstId = (await beaconBody(first.beacons[0])).analytics_session_id;
  const reused = await runAnalyticsClient({ sessionStorage: shared, crypto: deterministicCrypto(0xbb) });
  assert.equal((await beaconBody(reused.beacons[0])).analytics_session_id, firstId);

  shared.clear();
  const cleared = await runAnalyticsClient({ sessionStorage: shared, crypto: deterministicCrypto(0xbb) });
  assert.notEqual((await beaconBody(cleared.beacons[0])).analytics_session_id, firstId);

  const invalid = memoryStorage({ pitchlist_analytics_session_v2: `as_${FIXTURES.session}` });
  const replaced = await runAnalyticsClient({ sessionStorage: invalid, crypto: deterministicCrypto(0xcc) });
  assert.equal((await beaconBody(replaced.beacons[0])).analytics_session_id, `as_${'cc'.repeat(16)}`);
});

test('sessionStorage exceptions do not break analytics and no Web Crypto omits correlation', async () => {
  const throwingStorage = {
    getItem() { throw new Error('storage unavailable'); },
    setItem() { throw new Error('storage unavailable'); }
  };
  const resilient = await runAnalyticsClient({ sessionStorage: throwingStorage, crypto: deterministicCrypto(0xdd) });
  assert.match((await beaconBody(resilient.beacons[0])).analytics_session_id, /^as_[a-f0-9]{32}$/);

  const noCrypto = await runAnalyticsClient({ crypto: null, sessionStorage: memoryStorage({ pitchlist_analytics_session_v2: BROWSER_SESSION_A }) });
  assert.equal(Object.hasOwn(await beaconBody(noCrypto.beacons[0]), 'analytics_session_id'), false);
});

test('legacy stored attribution maps only approved scalar fields', async () => {
  const localStorage = memoryStorage({
    pitchlist_attribution: JSON.stringify({
      source: 'legacy-source', medium: 'legacy-medium', campaign: 'legacy-campaign',
      term: 'legacy-term', content: 'legacy-content', query: FIXTURES.session,
      access_token: FIXTURES.access, gclid: true, fbclid: FIXTURES.fbclid
    })
  });
  const client = await runAnalyticsClient({
    localStorage,
    location: { href: 'https://pitchlist.uk/database', pathname: '/database', search: '', origin: 'https://pitchlist.uk' }
  });
  const body = await beaconBody(client.beacons[0]);
  assert.equal(body.utm_source, 'legacy-source');
  assert.equal(body.utm_medium, 'legacy-medium');
  assert.equal(body.utm_campaign, 'legacy-campaign');
  assert.equal(body.utm_term, 'legacy-term');
  assert.equal(body.utm_content, 'legacy-content');
  assert.equal(body.gclid, true);
  assert.equal(body.fbclid, false);
  const normalisedAttribution = localStorage.values.get('pitchlist_attribution');
  assert.equal(normalisedAttribution.includes(FIXTURES.fbclid), false);
  assert.equal(JSON.parse(normalisedAttribution).fbclid, false);
  assertNoCredentials(body);
});

test('database fallback uses the shared anonymous session and transmits no href or raw query', async () => {
  const fullSource = fs.readFileSync(new URL('../src/database.js', import.meta.url), 'utf8');
  const source = fullSource.slice(0, fullSource.indexOf('const esc ='));
  const requests = [];
  const sessionStorage = memoryStorage({ pitchlist_analytics_session_v2: BROWSER_SESSION_A });
  const localStorage = memoryStorage({
    pitchlist_attribution: JSON.stringify({ source: 'legacy-source', campaign: 'legacy-campaign', token: FIXTURES.token })
  });
  const location = {
    href: `https://pitchlist.uk/database?utm_medium=email&gclid=${FIXTURES.gclid}&fbclid=${FIXTURES.fbclid}&session_id=${FIXTURES.session}&access_token=${FIXTURES.access}`,
    pathname: '/database',
    search: `?utm_medium=email&gclid=${FIXTURES.gclid}&fbclid=${FIXTURES.fbclid}&session_id=${FIXTURES.session}&access_token=${FIXTURES.access}`,
    origin: 'https://pitchlist.uk'
  };
  const window = { location, sessionStorage, localStorage, crypto: deterministicCrypto(0xee) };
  const sandbox = {
    window,
    document: { title: 'Database', referrer: `https://referrer.test/from?token=${FIXTURES.token}`, getElementById: () => ({}) },
    fetch: async (url, options) => { requests.push({ url, options }); return { ok: true }; },
    URL,
    URLSearchParams,
    console
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  vm.runInContext(`trackEvent('database_search', { query: 'session_id=${FIXTURES.session}', access_token: '${FIXTURES.access}', safe: 'kept' })`, sandbox);
  assert.equal(requests.length, 1);
  const body = JSON.parse(requests[0].options.body);
  assert.equal(body.path, '/database');
  assert.equal(Object.hasOwn(body, 'url'), false);
  assert.equal(Object.hasOwn(body, 'href'), false);
  assert.equal(body.referrer, 'https://referrer.test/from');
  assert.equal(body.analytics_session_id, BROWSER_SESSION_A);
  assert.equal(body.utm_medium, 'email');
  assert.equal(body.gclid, true);
  assert.equal(body.fbclid, true);
  assert.equal(Object.hasOwn(body, 'utm_source'), false);
  assert.deepEqual(body.properties, { safe: 'kept' });
  assertNoCredentials(body);
});

test('generated analytics and database assets exactly match source', () => {
  assert.equal(
    fs.readFileSync(new URL('../public/analytics.js', import.meta.url), 'utf8'),
    fs.readFileSync(new URL('../src/analytics.js', import.meta.url), 'utf8')
  );
  assert.equal(
    fs.readFileSync(new URL('../public/database.js', import.meta.url), 'utf8'),
    fs.readFileSync(new URL('../src/database.js', import.meta.url), 'utf8')
  );
});
