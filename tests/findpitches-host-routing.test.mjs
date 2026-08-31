import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { onRequest } from '../functions/_middleware.js';

function contextFor(url) {
  const assetRequests = [];
  let nextCalls = 0;
  return {
    context: {
      request: new Request(url),
      env: {
        ASSETS: {
          fetch: async target => {
            const parsed = new URL(target);
            assetRequests.push(parsed.pathname);
            return new Response(`asset:${parsed.pathname}`, { status: 200 });
          }
        }
      },
      next: async () => {
        nextCalls += 1;
        return new Response('next', { status: 200 });
      }
    },
    assetRequests,
    nextCalls: () => nextCalls
  };
}

test('findpitches.com homepage is served from isolated US static content', async () => {
  const fixture = contextFor('https://findpitches.com/');
  const response = await onRequest(fixture.context);
  assert.equal(response.status, 200);
  assert.deepEqual(fixture.assetRequests, ['/us/']);
  assert.equal(fixture.nextCalls(), 0);
});

test('FindPitches finder maps to the isolated US finder asset', async () => {
  const fixture = contextFor('https://www.findpitches.com/find-pitches');
  await onRequest(fixture.context);
  assert.deepEqual(fixture.assetRequests, ['/us/find-pitches']);
  assert.equal(fixture.nextCalls(), 0);
});

test('FindPitches API and shared assets pass through to existing handlers', async () => {
  for (const path of ['/api/us-customer-opportunities/search', '/styles.css', '/assets/hero-food-festival.jpg', '/shared/findpitches-shell.css', '/uk/home.css', '/us/find-pitches.js']) {
    const fixture = contextFor(`https://findpitches.com${path}`);
    const response = await onRequest(fixture.context);
    assert.equal(response.status, 200);
    assert.equal(fixture.nextCalls(), 1);
    assert.deepEqual(fixture.assetRequests, []);
  }
});

test('UK redesign is available only through the noindex review route', async () => {
  const preview = contextFor('https://findpitches.com/preview/uk/');
  const previewResponse = await onRequest(preview.context);
  assert.equal(previewResponse.status, 200);
  assert.equal(previewResponse.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.deepEqual(preview.assetRequests, ['/uk/']);
  assert.equal(preview.nextCalls(), 0);

  const publicUk = contextFor('https://findpitches.com/uk/');
  const publicUkResponse = await onRequest(publicUk.context);
  assert.equal(publicUkResponse.status, 404);
  assert.equal(publicUkResponse.headers.get('x-robots-tag'), 'noindex');
  assert.deepEqual(publicUk.assetRequests, []);
});

test('pitchlist.uk remains completely untouched by host middleware', async () => {
  const fixture = contextFor('https://pitchlist.uk/find-pitches');
  await onRequest(fixture.context);
  assert.equal(fixture.nextCalls(), 1);
  assert.deepEqual(fixture.assetRequests, []);
});

test('unknown FindPitches routes fail closed instead of leaking UK pages', async () => {
  const fixture = contextFor('https://findpitches.com/areas');
  const response = await onRequest(fixture.context);
  assert.equal(response.status, 404);
  assert.equal(response.headers.get('x-robots-tag'), 'noindex');
  assert.equal(fixture.nextCalls(), 0);
});

test('US source pages carry FindPitches canonical metadata and use the isolated US API', async () => {
  const [home, finder, client] = await Promise.all([
    readFile(new URL('../src/us/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/us/find-pitches.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/us/find-pitches.js', import.meta.url), 'utf8')
  ]);
  assert.match(home, /https:\/\/findpitches\.com\//);
  assert.match(home, /<html lang="en-US">/);
  assert.match(finder, /https:\/\/findpitches\.com\/find-pitches/);
  assert.match(finder, /US commercial access remains disabled|preview access while coverage grows/);
  assert.match(client, /\/api\/us-customer-opportunities\/search/);
  assert.doesNotMatch(client, /\/api\/customer-opportunities\/search/);
});
