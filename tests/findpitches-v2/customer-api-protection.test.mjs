import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { routeCustomerApi } from '../../platform/findpitches-v2/customer/http.mjs';
import { createMigratedD1 } from './helpers/d1-sqlite.mjs';

const TOKEN = 'test-service-token-0123456789abcdef0123456789';
const NOW = new Date('2026-09-28T12:00:00Z');

function seed(db, overrides = {}, candidate = {}) {
  const o = {
    id: 'opp-1', market: 'GB', region_code: 'GB-ENG-KENT', title: 'Kent Food Fair', organiser: 'Kent Events',
    location: 'Maidstone', coordinates_json: '{"lat":51.27,"lng":0.52}', event_start: '2026-10-10', event_end: '2026-10-11',
    application_deadline: '2026-10-01', canonical_url: 'https://kentevents.example/food-fair',
    application_url: 'https://kentevents.example/food-fair/apply', offerings_json: '[{"label":"Street food","kind":"food"}]',
    recurring: 0, description: 'Two-day food fair.', search_text: 'Kent Food Fair Kent Events Maidstone Street food',
    last_checked: '2026-09-20T09:00:00Z', updated_at: '2026-09-20T09:00:00Z',
    location_evidence_url: 'https://kentevents.example/venue', ...overrides
  };
  if (!('canonical_url' in overrides)) o.canonical_url = `https://kentevents.example/${o.id}`;
  const c = { status: 'validated', last_checked: o.last_checked, ...candidate };
  db.sqlite.prepare(`INSERT INTO candidates (id, market, region_code, source_url, canonical_url, application_url, event_name, organiser,
    geography_json, evidence_json, score, status, first_seen, last_checked) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(o.id, o.market, o.region_code, o.canonical_url, o.canonical_url, o.application_url, o.title, o.organiser, '{}', '{}', 0.9, c.status, '2026-09-01T00:00:00Z', c.last_checked);
  const cols = Object.keys(o);
  db.sqlite.prepare(`INSERT INTO customer_opportunities (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...cols.map(k => o[k]));
  if (c.disposition) {
    db.sqlite.prepare(`INSERT INTO customer_promotion_disposition (candidate_id, source_last_checked, enrichment_last_checked, disposition, inspected_at) VALUES (?,?,?,?,?)`)
      .run(o.id, c.last_checked, c.last_checked, c.disposition, c.last_checked);
  }
  return o;
}

function envWith(db, extra = {}) { return { FINDPITCHES_DB: db, FINDPITCHES_CUSTOMER_API_TOKENS: TOKEN, ...extra }; }
function req(path, { token = TOKEN, method = 'GET' } = {}) {
  return new Request(`https://api.findpitches.com${path}`, { method, headers: token ? { authorization: `Bearer ${token}` } : {} });
}
async function call(path, env, opts) { const r = await routeCustomerApi(req(path, opts), env, { now: NOW }); return { status: r.status, body: await r.json(), headers: r.headers }; }

/* ---------- authentication ---------- */

test('fails closed with 503 when no service token is configured', async () => {
  const r = await call('/v1/opportunities/search?market=GB', { FINDPITCHES_DB: createMigratedD1() });
  assert.equal(r.status, 503);
  assert.equal(r.body.error, 'customer_api_not_configured');
});

test('missing or wrong bearer token is 401 and returns no data', async () => {
  const db = createMigratedD1(); seed(db);
  for (const token of [null, 'wrong-token-wrong-token-wrong-token-xx']) {
    const r = await call('/v1/opportunities/search?market=GB', envWith(db), { token });
    assert.equal(r.status, 401);
    assert.deepEqual(Object.keys(r.body).sort(), ['error', 'ok']);
    assert.equal(r.headers.get('www-authenticate'), 'Bearer');
  }
  const d = await call('/v1/opportunities/opp-1', envWith(db), { token: null });
  assert.equal(d.status, 401);
  assert.equal(JSON.stringify(d.body).includes('kentevents'), false);
});

test('rotation: any configured token is accepted; short tokens are ignored', async () => {
  const db = createMigratedD1(); seed(db);
  const env = envWith(db, { FINDPITCHES_CUSTOMER_API_TOKENS: `short, ${TOKEN}, other-token-0123456789abcdef0123456789` });
  assert.equal((await call('/v1/opportunities/search?market=GB', env)).status, 200);
  assert.equal((await call('/v1/opportunities/search?market=GB', env, { token: 'short' })).status, 401);
});

test('metadata is protected by default and public only when explicitly enabled', async () => {
  const db = createMigratedD1();
  assert.equal((await call('/v1/markets', envWith(db), { token: null })).status, 401);
  const open = envWith(db, { FINDPITCHES_CUSTOMER_API_PUBLIC_METADATA: 'true' });
  assert.equal((await call('/v1/markets', open, { token: null })).status, 200);
  assert.equal((await call('/v1/regions?market=GB', open, { token: null })).status, 200);
  assert.equal((await call('/v1/opportunities/search?market=GB', open, { token: null })).status, 401);
});

/* ---------- stable errors ---------- */

test('stable errors for method, market, unsupported parameters and ids', async () => {
  const env = envWith(createMigratedD1());
  assert.equal((await call('/v1/markets', env, { method: 'POST' })).status, 405);
  const bad = await call('/v1/opportunities/search?market=XX', env);
  assert.deepEqual([bad.status, bad.body.error], [400, 'invalid_market']);
  const reg = await call('/v1/regions?market=XX', env);
  assert.deepEqual([reg.status, reg.body.error], [400, 'invalid_market']);
  const noMarket = await call('/v1/regions', env);
  assert.deepEqual([noMarket.status, noMarket.body.error], [400, 'market_required']);
  for (const q of ['lat=51&lng=0&radius_km=10', 'cursor=abc']) {
    const r = await call(`/v1/opportunities/search?market=GB&${q}`, env);
    assert.deepEqual([r.status, r.body.error], [400, 'unsupported_parameter']);
  }
  const missing = await call('/v1/opportunities/nope', env);
  assert.deepEqual([missing.status, missing.body.error], [404, 'opportunity_not_found']);
});

test('internal failures are 500 internal_error without leaking details', async () => {
  const broken = { prepare() { throw new Error('D1_ERROR: no such table: secret_internal_table'); } };
  const originalError = console.error; console.error = () => {};
  try {
    const r = await call('/v1/opportunities/search?market=GB', envWith(broken));
    assert.equal(r.status, 500);
    assert.deepEqual(r.body, { ok: false, error: 'internal_error' });
    assert.ok(r.headers.get('x-request-id'));
  } finally { console.error = originalError; }
});

/* ---------- read-time visibility (current-record protection) ---------- */

async function visibleIds(db, query = 'market=GB&limit=100') {
  const r = await call(`/v1/opportunities/search?${query}`, envWith(db));
  assert.equal(r.status, 200);
  assert.equal(r.body.count, r.body.opportunities.length);
  return r.body.opportunities.map(o => o.id).sort();
}

test('only current, validated, in-date, fresh records are returned', async () => {
  const db = createMigratedD1();
  seed(db, { id: 'ok' });
  seed(db, { id: 'published' }, { status: 'published' });
  seed(db, { id: 'held-after-revalidation' }, { status: 'held' });
  seed(db, { id: 'rejected' }, { status: 'rejected' });
  seed(db, { id: 'deadline-passed', application_deadline: '2026-09-27' });
  seed(db, { id: 'deadline-today', application_deadline: '2026-09-28' });
  seed(db, { id: 'event-ended', event_end: '2026-09-27', application_deadline: null });
  seed(db, { id: 'one-day-past', event_start: '2026-09-20', event_end: null, application_deadline: null });
  seed(db, { id: 'recurring-past-start', event_start: '2026-09-20', event_end: null, application_deadline: null, recurring: 1 });
  seed(db, { id: 'undated', event_start: null, event_end: null, application_deadline: null });
  seed(db, { id: 'too-old', last_checked: '2026-07-01T00:00:00Z' });
  seed(db, { id: 'superseded-not-ready', last_checked: '2026-09-10T00:00:00Z' }, { last_checked: '2026-09-25T00:00:00Z', disposition: 'not_ready' });
  seed(db, { id: 'newer-revision-pending', last_checked: '2026-09-10T00:00:00Z' }, { last_checked: '2026-09-25T00:00:00Z' });
  seed(db, { id: 'blocked-social-url', application_url: 'https://www.facebook.com/events/123' });
  seed(db, { id: 'orphan-projection' }); db.sqlite.prepare("DELETE FROM candidates WHERE id = 'orphan-projection'").run();

  // 'deadline-today' is hidden once today has started (UTC): the read-time check reuses readiness.mjs, which
  // treats a date-only deadline as midnight. Kept deliberately (promotion rules unchanged); see docs.
  assert.deepEqual(await visibleIds(db), ['newer-revision-pending', 'ok', 'published', 'recurring-past-start', 'undated'].sort());
});

test('location gate (PR #1865): rows without a source-backed event location are hidden from search and detail', async () => {
  const db = createMigratedD1();
  seed(db, { id: 'sourced' });
  seed(db, { id: 'legacy-no-evidence', location_evidence_url: null });
  seed(db, { id: 'blank-evidence', location_evidence_url: '  ' });
  seed(db, { id: 'blank-location', location: '   ' });
  seed(db, { id: 'null-location', location: null });
  assert.deepEqual(await visibleIds(db, 'market=GB&limit=100'), ['sourced']);
  for (const id of ['legacy-no-evidence', 'blank-evidence', 'blank-location', 'null-location']) {
    const r = await call(`/v1/opportunities/${id}`, envWith(db));
    assert.equal(r.status, 404, id);
    assert.equal(r.body.error, 'opportunity_not_found');
  }
  const ok = await call('/v1/opportunities/sourced', envWith(db));
  assert.equal(ok.status, 200);
  assert.equal('location_evidence_url' in ok.body.opportunity, false, 'provenance URL is internal, not a customer field');
});

test('freshness window is configurable', async () => {
  const db = createMigratedD1();
  seed(db, { id: 'fifty-days', last_checked: '2026-08-09T12:00:00Z' });
  assert.deepEqual(await visibleIds(db), ['fifty-days']);
  const r = await call('/v1/opportunities/search?market=GB', envWith(db, { FINDPITCHES_CUSTOMER_MAX_AGE_DAYS: '30' }));
  assert.equal(r.body.count, 0);
});

test('hidden records are also unavailable by id', async () => {
  const db = createMigratedD1();
  seed(db, { id: 'ok' });
  seed(db, { id: 'gone', application_deadline: '2026-09-01' });
  assert.equal((await call('/v1/opportunities/ok', envWith(db))).status, 200);
  assert.equal((await call('/v1/opportunities/gone', envWith(db))).status, 404);
});

test('filters and limit apply after visibility; count is the returned count, not a total', async () => {
  const db = createMigratedD1();
  for (let i = 0; i < 5; i++) seed(db, { id: `kent-${i}`, last_checked: `2026-09-2${i}T00:00:00Z` });
  seed(db, { id: 'surrey', region_code: 'GB-ENG-SURREY', search_text: 'Surrey Craft Fair crafts', offerings_json: '[{"label":"Handmade crafts","kind":"craft"}]' });
  seed(db, { id: 'us-1', market: 'US', region_code: 'TX' });
  assert.deepEqual(await visibleIds(db, 'market=GB&region_code=GB-ENG-SURREY'), ['surrey']);
  assert.deepEqual(await visibleIds(db, 'market=GB&q=craft'), ['surrey']);
  assert.deepEqual(await visibleIds(db, 'market=US'), ['us-1']);
  const r = await call('/v1/opportunities/search?market=GB&limit=2', envWith(db));
  assert.equal(r.body.count, 2);
  assert.equal(r.body.query.limit, 2);
  for (const k of ['lat', 'lng', 'radius_km', 'cursor']) assert.equal(k in r.body.query, false, `${k} is not advertised`);
  assert.equal('total' in r.body, false);
});

test('responses never include internal candidate fields', async () => {
  const db = createMigratedD1(); seed(db);
  const r = await call('/v1/opportunities/opp-1', envWith(db));
  const keys = Object.keys(r.body.opportunity).sort();
  assert.deepEqual(keys, ['application_deadline', 'application_url', 'canonical_url', 'coordinates', 'description', 'event_end', 'event_start', 'id', 'last_checked', 'location', 'market', 'offerings', 'organiser', 'recurring', 'region_code', 'title']);
  for (const internal of ['evidence', 'score', 'status', 'rejection', 'search_text', 'classifier']) assert.equal(JSON.stringify(r.body).includes(`"${internal}`), false, internal);
});

/* ---------- worker wiring and isolation ---------- */

test('worker routes /v1 through the protected handler and keeps existing routes', async () => {
  const { default: worker } = await import('../../operations/findpitches-v2/worker/index.mjs');
  const db = createMigratedD1();
  const unauth = await worker.fetch(new Request('https://api.findpitches.com/v1/opportunities/search?market=GB'), envWith(db));
  assert.equal(unauth.status, 401);
  const ok = await worker.fetch(new Request('https://api.findpitches.com/v1/markets', { headers: { authorization: `Bearer ${TOKEN}` } }), envWith(db));
  assert.equal(ok.status, 200);
  assert.ok((await ok.json()).markets.some(m => m.code === 'HK'));
  const unknown = await worker.fetch(new Request('https://api.findpitches.com/v1/nope'), envWith(db));
  assert.equal(unknown.status, 404);
});

test('customer API modules are read-only and do not touch pipeline tables', () => {
  for (const file of ['http.mjs', 'auth.mjs', 'service.mjs']) {
    const src = readFileSync(new URL(`../../platform/findpitches-v2/customer/${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /\b(INSERT|UPDATE|DELETE|DROP|ALTER)\b/i, file);
    assert.doesNotMatch(src, /publication_queue|scheduler_jobs|classification_queue|enrichment_queue/, file);
  }
  const worker = readFileSync(new URL('../../operations/findpitches-v2/worker/index.mjs', import.meta.url), 'utf8');
  assert.match(worker, /FINDPITCHES_V2_MODE|shadow/);
});

test('service re-checks readiness at read time: a row without a location is dropped even if SQL returned it', async () => {
  const { createCustomerApiService } = await import('../../platform/findpitches-v2/customer/service.mjs');
  const row = { id: 'x', market: 'GB', region_code: 'GB-ENG-KENT', title: 'T', canonical_url: 'https://a.example/x', application_url: 'https://a.example/apply', last_checked: '2026-09-20T09:00:00Z' };
  const fake = { prepare() { return { bind() { return this; }, async all() { return { results: [row] }; }, async first() { return row; } }; } };
  const api = createCustomerApiService(fake, { now: NOW });
  assert.equal((await api.search({ market: 'GB' })).count, 0);
  assert.equal(await api.opportunity('x'), null);
});
