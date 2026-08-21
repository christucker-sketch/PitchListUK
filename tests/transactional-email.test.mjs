import assert from 'node:assert/strict';
import test from 'node:test';

import {
  accessLinkEmail,
  EmailDeliveryError,
  sendTransactionalEmail,
  welcomeEmail
} from '../functions/_lib/email.mjs';
import { onRequestPost as requestAccessLink } from '../functions/api/billing/access.js';
import { handleCheckoutCompleted } from '../functions/api/billing/webhook.js';
import { onRequestPost as submitSupportRequest } from '../functions/api/sample-request.js';

const apiKey = 'api-test-secret-must-never-leak';
const recipient = 'vendor@example.com';

function emailEnv(overrides = {}) {
  return {
    SMTP2GO_API_KEY: apiKey,
    PITCHLIST_EMAIL_FROM: 'hello@pitchlist.uk',
    PITCHLIST_EMAIL_FROM_NAME: 'PitchList UK',
    ...overrides
  };
}

function successResponse() {
  return new Response(JSON.stringify({
    request_id: 'request_test',
    data: { succeeded: 1, failed: 0, failures: [], email_id: 'email_test' }
  }), { status: 200, headers: { 'content-type': 'application/json' } });
}

function kvEnvironment(overrides = {}) {
  const binding = {
    subscription: 'sub_test',
    customer: 'cus_test',
    email: recipient,
    status: 'active',
    access: 'allowed'
  };
  const records = new Map([
    [`stripe:email:${recipient}`, binding],
    ['stripe:subscription:sub_test', binding]
  ]);
  const calls = { puts: [] };
  return {
    ...emailEnv(),
    ...overrides,
    calls,
    records,
    PITCHLIST_ACCESS_KV: {
      async get(key) {
        const value = records.get(key);
        return value === undefined ? null : JSON.stringify(value);
      },
      async put(key, value, options) {
        const parsed = JSON.parse(value);
        records.set(key, parsed);
        calls.puts.push({ key, value: parsed, options });
      }
    }
  };
}

test('SMTP2GO request uses the HTTPS API, secret header, verified sender and multipart content', async () => {
  const calls = [];
  const delivery = await sendTransactionalEmail(
    emailEnv(),
    accessLinkEmail('https://pitchlist.uk/find-pitches?access_token=safe-test-token'),
    {
      to: recipient,
      fetchImpl: async (url, options) => {
        calls.push({ url, options });
        return successResponse();
      }
    }
  );

  assert.equal(delivery.provider, 'smtp2go');
  assert.equal(delivery.accepted, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.smtp2go.com/v3/email/send');
  assert.equal(calls[0].options.headers['x-smtp2go-api-key'], apiKey);
  const payload = JSON.parse(calls[0].options.body);
  assert.equal(payload.sender, 'PitchList UK <hello@pitchlist.uk>');
  assert.deepEqual(payload.to, [recipient]);
  assert.match(payload.subject, /sign-in link/i);
  assert.match(payload.text_body, /safe-test-token/);
  assert.match(payload.html_body, /safe-test-token/);
  assert.equal(calls[0].options.body.includes(apiKey), false);
});

test('missing or invalid SMTP2GO configuration fails closed before network access', async () => {
  for (const env of [
    emailEnv({ SMTP2GO_API_KEY: '' }),
    emailEnv({ PITCHLIST_EMAIL_FROM: 'not-an-address' }),
    emailEnv({ SMTP2GO_API_URL: 'http://api.smtp2go.invalid/email/send' })
  ]) {
    let fetched = false;
    await assert.rejects(
      sendTransactionalEmail(env, welcomeEmail('https://pitchlist.uk/find-pitches'), {
        to: recipient,
        logger: { error() {} },
        fetchImpl: async () => {
          fetched = true;
          return successResponse();
        }
      }),
      error => error instanceof EmailDeliveryError && /email_(?:not_configured|invalid_configuration)/.test(error.code)
    );
    assert.equal(fetched, false);
  }

  await assert.rejects(
    sendTransactionalEmail(emailEnv(), welcomeEmail('https://pitchlist.uk/find-pitches'), {
      to: 'not-an-address',
      logger: { error() {} },
      fetchImpl: async () => {
        throw new Error('network must not be reached');
      }
    }),
    error => error instanceof EmailDeliveryError && error.code === 'email_invalid_address'
  );
});

test('provider rejection, rate limit and timeout return stable safe errors without leaking data', async () => {
  const cases = [
    {
      response: async () => new Response(JSON.stringify({
        data: { error_code: 'E_INVALID_SENDER', error: `echo ${apiKey} vendor@example.com` }
      }), { status: 400 }),
      code: 'email_provider_rejected'
    },
    {
      response: async () => new Response(JSON.stringify({
        error_code: 'API key ratelimit exceeded', error: `echo ${apiKey}`
      }), { status: 429 }),
      code: 'email_rate_limited'
    },
    {
      response: async () => {
        const error = new Error(`timeout ${apiKey}`);
        error.name = 'AbortError';
        throw error;
      },
      code: 'email_provider_timeout'
    }
  ];

  for (const item of cases) {
    const logs = [];
    await assert.rejects(
      sendTransactionalEmail(emailEnv(), accessLinkEmail('https://pitchlist.uk/?access_token=secret-link'), {
        to: recipient,
        fetchImpl: item.response,
        logger: { error: (...args) => logs.push(args) }
      }),
      error => error instanceof EmailDeliveryError && error.code === item.code
    );
    const serialised = JSON.stringify(logs);
    assert.equal(serialised.includes(apiKey), false);
    assert.equal(serialised.includes(recipient), false);
    assert.equal(serialised.includes('secret-link'), false);
    assert.match(serialised, new RegExp(item.code));
  }
});

test('active subscriber request creates and emails a magic link without returning or logging it', async () => {
  const env = kvEnvironment();
  const deliveries = [];
  const logs = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    deliveries.push({ url: String(url), options });
    return successResponse();
  };
  try {
    const response = await requestAccessLink({
      request: new Request('https://pitchlist.uk/api/billing/access', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: recipient })
      }),
      env,
      logger: { error: (...args) => logs.push(args) }
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body, {
      ok: true,
      sent: true,
      delivery: 'smtp2go',
      message: 'Access link sent.'
    });
    const tokenWrite = env.calls.puts.find(call => call.key.startsWith('stripe:access-token:'));
    assert.ok(tokenWrite);
    assert.equal(tokenWrite.options.expirationTtl, 60 * 60 * 24 * 30);
    const token = tokenWrite.key.slice('stripe:access-token:'.length);
    assert.match(token, /^[a-f0-9]{64}$/);
    const emailPayload = JSON.parse(deliveries[0].options.body);
    assert.match(emailPayload.text_body, new RegExp(token));
    assert.equal(JSON.stringify(body).includes(token), false);
    assert.equal(JSON.stringify(body).includes(apiKey), false);
    assert.equal(JSON.stringify(logs).includes(token), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('access-link provider failure returns no token, link, provider body or API key', async () => {
  const env = kvEnvironment();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    error_code: 'rejected',
    error: `secret echo ${apiKey}`
  }), { status: 500 });
  try {
    const response = await requestAccessLink({
      request: new Request('https://pitchlist.uk/api/billing/access', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: recipient })
      }),
      env,
      logger: { error() {} }
    });
    assert.equal(response.status, 503);
    const text = await response.text();
    assert.match(text, /email_delivery_unavailable/);
    assert.equal(text.includes(apiKey), false);
    assert.equal(text.includes('access_token'), false);
    assert.equal(text.includes(recipient), false);
    assert.equal(text.includes('secret echo'), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('checkout completion sends one idempotent welcome magic link and stores no link in its marker', async () => {
  const env = kvEnvironment({
    PUBLIC_BASE_URL: 'https://pitchlist.uk',
    STRIPE_SECRET_KEY: 'sk_test'
  });
  const fetchCalls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    fetchCalls.push({ url: String(url), options });
    if (String(url).includes('/v1/customers/')) {
      return new Response(JSON.stringify({ id: 'cus_test', email: recipient }), { status: 200 });
    }
    if (String(url).includes('smtp2go.com')) return successResponse();
    throw new Error(`Unexpected URL: ${url}`);
  };
  const session = {
    id: 'cs_checkout_test',
    customer: 'cus_test',
    customer_details: { email: recipient },
    subscription: {
      id: 'sub_test',
      customer: 'cus_test',
      status: 'active',
      metadata: { product: 'pitchlist_database' }
    }
  };
  try {
    const context = {
      request: new Request('https://pitchlist.uk/api/billing/webhook', { method: 'POST' }),
      env,
      logger: { error() {} }
    };
    await handleCheckoutCompleted(context, session);
    await handleCheckoutCompleted(context, session);
    const smtpCalls = fetchCalls.filter(call => call.url.includes('smtp2go.com'));
    assert.equal(smtpCalls.length, 1);
    const payload = JSON.parse(smtpCalls[0].options.body);
    assert.match(payload.subject, /welcome/i);
    assert.match(payload.text_body, /access_token=[a-f0-9]{64}/);
    const marker = env.records.get('email:welcome:cs_checkout_test');
    assert.equal(marker.status, 'sent');
    assert.equal(marker.provider, 'smtp2go');
    assert.equal(JSON.stringify(marker).includes('access_token'), false);
    assert.equal(JSON.stringify(marker).includes(recipient), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('legacy support request uses the shared service with a validated reply-to header', async () => {
  const env = emailEnv({ PITCHLIST_FORM_TO: 'hello@pitchlist.uk' });
  const deliveries = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    deliveries.push({ url: String(url), options });
    return successResponse();
  };
  try {
    const response = await submitSupportRequest({
      request: new Request('https://pitchlist.uk/api/sample-request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Test Vendor',
          business: 'Test Coffee',
          email: recipient,
          base_location: 'PL4 7EE',
          travel_radius: '50 miles'
        })
      }),
      env,
      logger: { error() {} }
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, delivery: { provider: 'smtp2go' } });
    assert.equal(deliveries.length, 1);
    const payload = JSON.parse(deliveries[0].options.body);
    assert.equal(payload.sender, 'PitchList UK <hello@pitchlist.uk>');
    assert.deepEqual(payload.to, ['hello@pitchlist.uk']);
    assert.deepEqual(payload.custom_headers, [{ header: 'Reply-To', value: recipient }]);
    assert.match(payload.subject, /Test Coffee/);
    assert.match(payload.html_body, /New PitchList UK support request/);
    assert.equal(deliveries[0].options.body.includes(apiKey), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
