import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { onRequestGet as validateAccessToken } from '../functions/api/billing/access.js';
import { onRequestGet as validateCheckoutSession } from '../functions/api/billing/session.js';
import { onRequestGet as searchOpportunities } from '../functions/api/customer-opportunities/search.js';

const accountEmail = 'vendor@example.com';
const vendorId = 'ven_search_defaults';
const searchDefaults = {
  postcode: 'PL4 7EE',
  category: 'Cuban toasties, Coffee, Matcha'
};

function profileRecords() {
  return new Map([
    [`vendor:email:${accountEmail}`, JSON.stringify({ vendor_id: vendorId, email: accountEmail })],
    [`vendor:${vendorId}`, JSON.stringify({
      vendor_id: vendorId,
      private_account: {
        email: accountEmail,
        base_postcode: searchDefaults.postcode,
        phone: 'private-phone-must-not-leak'
      },
      public_profile: {
        specialty: searchDefaults.category,
        business_name: 'Private business must not leak'
      }
    })]
  ]);
}

function kvFrom(records) {
  return {
    async get(key) {
      return records.get(key) ?? null;
    }
  };
}

async function withFetch(mock, callback) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mock;
  try {
    return await callback();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function search(params) {
  const url = new URL('https://pitchlist.uk/api/customer-opportunities/search');
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  if (!url.searchParams.has('limit')) url.searchParams.set('limit', '250');
  const postcodeRequests = [];
  return withFetch(
    async requestUrl => {
      assert.match(String(requestUrl), /api\.postcodes\.io\/(?:postcodes|outcodes)\//);
      postcodeRequests.push(String(requestUrl));
      if (String(requestUrl).endsWith('/outcodes/PL47')) {
        return new Response(JSON.stringify({ status: 404 }), {
          status: 404,
          headers: { 'content-type': 'application/json' }
        });
      }
      assert.match(String(requestUrl), /\/(?:outcodes\/PL4|postcodes\/PL47EE)$/);
      return new Response(JSON.stringify({
        result: { latitude: 50.3714, longitude: -4.1427 }
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
    async () => {
      const response = await searchOpportunities({
        request: new Request(url),
        env: { PITCHLIST_DATABASE_PUBLIC_FULL_ACCESS: 'true' }
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      if (params.postcode === 'PL47') {
        assert.deepEqual(postcodeRequests.map(value => new URL(value).pathname), [
          '/outcodes/PL47',
          '/outcodes/PL4'
        ]);
      }
      return body;
    }
  );
}

function hasMarketSignal(row) {
  const text = [
    row.route_type,
    row.event_name,
    row.location,
    row.organiser,
    row.vendor_categories,
    row.notes
  ].join(' ').toLowerCase().replace(/[_-]+/g, ' ');
  return /\b(?:markets?|marketplace|farmers?\s+market|artisan\s+market|street\s+market|stallholders?)\b/.test(text);
}

test('ORD-017 pitch intent is neutral and preserves all category/geographic matches', async () => {
  const filters = {
    postcode: 'PL47',
    radius_miles: '250',
    category: 'Cuban toasties, Coffee, Matcha'
  };
  const categoryOnly = await search(filters);
  for (const keyword of ['Pitch', 'Pitches', 'Opportunity', 'Opportunities']) {
    const body = await search({ ...filters, q: keyword });
    assert.equal(body.access, 'subscriber');
    assert.equal(body.count, categoryOnly.count, `${keyword} must not broaden or narrow category matches`);
    assert.deepEqual(body.rows.map(row => row.id), categoryOnly.rows.map(row => row.id));
    assert.equal(body.match_summary.keyword.neutral, body.count);
    assert.deepEqual(body.postcode_resolution, {
      requested: 'PL47',
      resolved: 'PL4',
      fallback_used: true
    });
  }
});

test('valid outcode resolves directly without fallback metadata', async () => {
  const body = await search({ postcode: 'PL4', radius_miles: '250' });
  assert.deepEqual(body.postcode_resolution, {
    requested: 'PL4',
    resolved: 'PL4',
    fallback_used: false
  });
});

test('arbitrary invalid postcode input is rejected without a lookup or silent substitution', async () => {
  let fetched = false;
  const response = await withFetch(
    async () => {
      fetched = true;
      throw new Error('Invalid syntax must not reach Postcodes.io');
    },
    () => searchOpportunities({
      request: new Request('https://pitchlist.uk/api/customer-opportunities/search?postcode=NOT-A-POSTCODE'),
      env: { PITCHLIST_DATABASE_PUBLIC_FULL_ACCESS: 'true' }
    })
  );
  assert.equal(response.status, 400);
  assert.equal(fetched, false);
  assert.equal((await response.json()).error, 'postcode_not_found');
});

test('market intent requires genuine market evidence and is a strict pitch subset', async () => {
  const filters = {
    postcode: 'PL47',
    radius_miles: '250',
    category: 'Coffee, Matcha'
  };
  const pitch = await search({ ...filters, q: 'Pitch' });
  for (const keyword of ['Market', 'Markets']) {
    const body = await search({ ...filters, q: keyword });
    assert.ok(body.count > 0, `${keyword} should return matches`);
    assert.ok(body.count < pitch.count, `${keyword} should be a meaningful subset of Pitch results`);
    const pitchIds = new Set(pitch.rows.map(row => row.id));
    assert.ok(body.rows.every(row => pitchIds.has(row.id)), `${keyword} rows must be Pitch-result rows`);
    assert.ok(body.rows.every(hasMarketSignal), `${keyword} rows must contain a market signal`);
    assert.ok(body.rows.every(row => row.match_basis.keyword === 'market'));
    assert.equal(body.match_summary.keyword.market, body.count);
  }
});

test('direct and alias category matches sort before broad food fallback rows', async () => {
  const body = await search({
    postcode: 'PL47',
    radius_miles: '250',
    category: 'Cuban toasties, Coffee, Matcha',
    q: 'Pitch'
  });
  assert.ok(body.match_summary.category.direct > 0);
  assert.ok(body.match_summary.category.alias > 0);
  assert.ok(body.match_summary.category.broad_food_fallback > 0);
  const ranks = { direct: 0, alias: 1, broad_food_fallback: 2 };
  const observed = body.rows.map(row => ranks[row.match_basis.category]);
  assert.deepEqual(observed, [...observed].sort((a, b) => a - b));
  assert.equal(body.rows[0].match_basis.category, 'direct');
  assert.match(JSON.stringify(body.rows[0]), /coffee|matcha|cuban|toastie/i);
});

test('zero-result response identifies recoverable filters', async () => {
  const body = await search({
    postcode: 'PL47',
    radius_miles: '250',
    category: 'Coffee, Matcha',
    q: 'definitely-no-such-opportunity-term'
  });
  assert.equal(body.count, 0);
  assert.ok(body.recovery.geographic_matches > 0);
  assert.ok(body.recovery.without_keywords.count > 0);
  assert.equal(body.recovery.without_keywords.recovers_matches, true);
  assert.equal(body.recovery.without_category.recovers_matches, false);
});

test('API marks filtered searches from effective parameters and leaves national searches unfiltered', async () => {
  const filtered = await search({ category: 'Coffee' });
  const unfiltered = await search({});
  assert.equal(filtered.search_filtered, true);
  assert.equal(unfiltered.search_filtered, false);
  assert.equal(unfiltered.count, unfiltered.total);
  assert.equal(unfiltered.postcode_resolution, null);
});

test('successful checkout returns only authenticated profile search defaults', async () => {
  const profiles = profileRecords();
  const body = await withFetch(
    async () => new Response(JSON.stringify({
      customer: 'cus_test',
      customer_details: { email: accountEmail },
      subscription: { status: 'trialing', customer: 'cus_test' }
    }), { status: 200, headers: { 'content-type': 'application/json' } }),
    async () => {
      const response = await validateCheckoutSession({
        request: new Request('https://pitchlist.uk/api/billing/session?session_id=checkout_test'),
        env: {
          STRIPE_SECRET_KEY: 'test-secret',
          PITCHLIST_VENDOR_KV: kvFrom(profiles)
        }
      });
      assert.equal(response.status, 200);
      return response.json();
    }
  );
  assert.deepEqual(body.search_defaults, searchDefaults);
  assert.equal(JSON.stringify(body).includes('private-phone-must-not-leak'), false);
  assert.equal(JSON.stringify(body).includes('Private business must not leak'), false);
});

test('email access unlock returns only canonically authenticated profile defaults', async () => {
  const profiles = profileRecords();
  const accessRecords = new Map([
    ['stripe:access-token:test-token', JSON.stringify({
      subscription: 'sub_test', customer: 'cus_test', email: accountEmail
    })],
    ['stripe:subscription:sub_test', JSON.stringify({
      subscription: 'sub_test', customer: 'cus_test', email: accountEmail,
      status: 'active', access: 'allowed'
    })]
  ]);
  const response = await validateAccessToken({
    request: new Request('https://pitchlist.uk/api/billing/access?token=test-token'),
    env: {
      PITCHLIST_ACCESS_KV: kvFrom(accessRecords),
      PITCHLIST_VENDOR_KV: kvFrom(profiles)
    }
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.search_defaults, searchDefaults);
  assert.equal(JSON.stringify(body).includes('private-phone-must-not-leak'), false);
  assert.equal(JSON.stringify(body).includes('Private business must not leak'), false);
});

test('profile defaults fail closed on stale indexes and KV errors without breaking access', async () => {
  const accessRecords = new Map([
    ['stripe:access-token:test-token', JSON.stringify({
      subscription: 'sub_test', customer: 'cus_test', email: accountEmail
    })],
    ['stripe:subscription:sub_test', JSON.stringify({
      subscription: 'sub_test', customer: 'cus_test', email: accountEmail,
      status: 'active', access: 'allowed'
    })]
  ]);
  for (const vendorKv of [
    kvFrom(new Map([
      [`vendor:email:${accountEmail}`, JSON.stringify({ vendor_id: vendorId })],
      [`vendor:${vendorId}`, JSON.stringify({
        private_account: { email: 'other@example.com', base_postcode: 'SECRET' },
        public_profile: { specialty: 'SECRET' }
      })]
    ])),
    { async get() { throw new Error('KV unavailable'); } }
  ]) {
    const response = await validateAccessToken({
      request: new Request('https://pitchlist.uk/api/billing/access?token=test-token'),
      env: {
        PITCHLIST_ACCESS_KV: kvFrom(accessRecords),
        PITCHLIST_VENDOR_KV: vendorKv
      }
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).search_defaults, null);
  }
});

test('browser assets preserve defaults, recovery guidance, hidden state and generated parity', () => {
  const sourceJs = fs.readFileSync('src/database.js', 'utf8');
  const publicJs = fs.readFileSync('public/database.js', 'utf8');
  const sourceCss = fs.readFileSync('src/styles.css', 'utf8');
  const publicCss = fs.readFileSync('public/styles.css', 'utf8');
  const sourceHtml = fs.readFileSync('src/database.html', 'utf8');
  const publicHtml = fs.readFileSync('public/find-pitches.html', 'utf8');
  assert.equal(publicJs, sourceJs);
  assert.equal(publicCss, sourceCss);
  assert.match(sourceJs, /applySearchDefaults\(data\.search_defaults\)/);
  assert.match(sourceJs, /Remove the keyword filter to recover/);
  assert.match(sourceJs, /Broader food-trader opportunity/);
  assert.match(sourceJs, /headlineCount = data\.search_filtered \? data\.count : data\.total/);
  assert.match(sourceJs, /matches for this search/);
  assert.match(sourceJs, /opportunities tracked UK-wide/);
  assert.match(sourceJs, /postcodeNotice = resolution\?\.fallback_used/);
  assert.match(sourceJs, /wasn’t recognised; showing results from the/);
  assert.match(sourceJs, /postcode-resolution-notice[\s\S]+?\$\{esc\(/);
  assert.match(sourceCss, /\[hidden\]\{display:none!important\}/);
  assert.match(sourceHtml, /database\.js\?v=20260820-1/);
  assert.match(publicHtml, /database\.js\?v=20260820-1/);
});
