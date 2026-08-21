import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveCanonicalBinding,
  resolveCanonicalEntitlement,
  resolveCanonicalTokenBinding
} from '../functions/_lib/stripe.mjs';
import {
  onRequestGet as validateAccessToken,
  onRequestPost as requestAccessLink
} from '../functions/api/billing/access.js';
import { onRequestPost as openBillingPortal } from '../functions/api/billing/portal.js';
import { onRequestGet as searchOpportunities } from '../functions/api/customer-opportunities/search.js';

const token = 'test-token';
const binding = {
  subscription: 'sub_test',
  customer: 'cus_test',
  email: 'vendor@example.com',
  status: 'trialing',
  access: 'allowed'
};

function canonical(overrides = {}) {
  return {
    subscription: binding.subscription,
    customer: binding.customer,
    email: binding.email,
    status: 'active',
    access: 'allowed',
    ...overrides
  };
}

function environment({ tokenRecord = binding, emailRecord = binding, canonicalRecord = canonical() } = {}) {
  const records = new Map();
  const calls = { puts: [] };
  if (tokenRecord !== null) records.set(`stripe:access-token:${token}`, tokenRecord);
  if (emailRecord !== null) records.set(`stripe:email:${binding.email}`, emailRecord);
  if (canonicalRecord !== null) {
    records.set(`stripe:subscription:${binding.subscription}`, canonicalRecord);
  }
  return {
    calls,
    PITCHLIST_ACCESS_KV: {
      async get(key) {
        const value = records.get(key);
        return value === undefined ? null : JSON.stringify(value);
      },
      async put(key, value, options) {
        calls.puts.push({ key, value, options });
      }
    }
  };
}

function entitlement(env, record = binding) {
  return resolveCanonicalBinding(env, record).then(resolveCanonicalEntitlement);
}

test('verified binding is independent from active, past_due or canceled entitlement', async () => {
  for (const status of ['active', 'past_due', 'canceled']) {
    const env = environment({
      canonicalRecord: canonical({
        status,
        access: status === 'active' ? 'allowed' : 'blocked'
      })
    });
    const verified = await resolveCanonicalBinding(env, binding);
    assert.equal(verified.verified, true);
    assert.equal(verified.status, status);
    assert.equal(resolveCanonicalEntitlement(verified).allowed, status === 'active');
  }
});

test('entitlement requires both canonical allowed policy and an allowed status', async () => {
  assert.equal((await entitlement(environment({
    canonicalRecord: canonical({ status: 'active', access: 'blocked' })
  }))).allowed, false);

  assert.equal((await entitlement(environment({
    canonicalRecord: canonical({ status: 'past_due', access: 'allowed' })
  }))).allowed, false);
});

test('missing, malformed and incomplete canonical data fails closed', async () => {
  assert.equal((await resolveCanonicalBinding(environment(), null)).verified, false);
  assert.equal((await resolveCanonicalBinding(environment(), {
    subscription: binding.subscription
  })).verified, false);
  assert.equal((await resolveCanonicalBinding(
    environment({ canonicalRecord: null }),
    binding
  )).verified, false);
  assert.equal((await resolveCanonicalBinding(
    environment({ canonicalRecord: [] }),
    binding
  )).verified, false);
});

test('subscription, customer and normalised email mismatches fail closed', async () => {
  for (const mismatch of [
    { subscription: 'sub_other' },
    { customer: 'cus_other' },
    { email: 'other@example.com' }
  ]) {
    const result = await resolveCanonicalBinding(
      environment({ canonicalRecord: canonical(mismatch) }),
      binding
    );
    assert.equal(result.verified, false);
    assert.equal(result.reason, 'canonical_binding_mismatch');
  }

  const normalised = await resolveCanonicalBinding(
    environment({ canonicalRecord: canonical({ email: 'VENDOR@EXAMPLE.COM' }) }),
    binding
  );
  assert.equal(normalised.verified, true);
});

test('token-binding resolver loads the token and canonical subscription every time', async () => {
  const verified = await resolveCanonicalTokenBinding(environment(), token);
  assert.equal(verified.verified, true);
  assert.equal(verified.customer, binding.customer);

  const missing = await resolveCanonicalTokenBinding(
    environment({ tokenRecord: null }),
    token
  );
  assert.equal(missing.verified, false);
});

test('past_due and canceled tokens are denied subscriber search and access-token validation', async () => {
  for (const status of ['past_due', 'canceled']) {
    const env = environment({
      canonicalRecord: canonical({ status, access: 'blocked' })
    });
    const accessResponse = await validateAccessToken({
      request: new Request(`https://pitchlist.uk/api/billing/access?token=${token}`),
      env
    });
    assert.equal(accessResponse.status, 404);

    const searchResponse = await searchOpportunities({
      request: new Request(
        `https://pitchlist.uk/api/customer-opportunities/search?access_token=${token}&limit=1`
      ),
      env
    });
    assert.equal((await searchResponse.json()).access, 'preview');
  }
});

async function portalResponse(status) {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response(JSON.stringify({ url: 'https://billing.stripe.test/session' }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };
  try {
    const response = await openBillingPortal({
      request: new Request('https://pitchlist.uk/api/billing/portal', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ access_token: token })
      }),
      env: {
        ...environment({ canonicalRecord: canonical({ status, access: 'blocked' }) }),
        STRIPE_SECRET_KEY: 'sk_test'
      }
    });
    return { response, calls };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test('past_due correctly bound token may open its canonical customer portal', async () => {
  const { response, calls } = await portalResponse('past_due');
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/billing_portal\/sessions$/);
  assert.equal(new URLSearchParams(calls[0].options.body).get('customer'), binding.customer);
});

test('canceled correctly bound token may open its canonical customer portal', async () => {
  // Cancellation blocks subscriber data but intentionally preserves authenticated billing management.
  const { response, calls } = await portalResponse('canceled');
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(new URLSearchParams(calls[0].options.body).get('customer'), binding.customer);
});

test('binding mismatch is denied before Stripe is called', async () => {
  const originalFetch = globalThis.fetch;
  let stripeCalled = false;
  globalThis.fetch = async () => {
    stripeCalled = true;
    throw new Error('Stripe must not be called');
  };
  try {
    const response = await openBillingPortal({
      request: new Request('https://pitchlist.uk/api/billing/portal', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ access_token: token })
      }),
      env: {
        ...environment({ canonicalRecord: canonical({ customer: 'cus_other' }) }),
        STRIPE_SECRET_KEY: 'sk_test'
      }
    });
    assert.equal(response.status, 404);
    assert.equal(stripeCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('blocked canonical email POST does not issue a token or attempt email delivery', async () => {
  const env = environment({
    canonicalRecord: canonical({ status: 'past_due', access: 'blocked' })
  });
  const originalFetch = globalThis.fetch;
  let deliveryAttempted = false;
  globalThis.fetch = async () => {
    deliveryAttempted = true;
    throw new Error('Email delivery must not be attempted');
  };
  try {
    const response = await requestAccessLink({
      request: new Request('https://pitchlist.uk/api/billing/access', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: binding.email })
      }),
      env
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).sent, false);
    assert.equal(env.calls.puts.length, 0);
    assert.equal(deliveryAttempted, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
