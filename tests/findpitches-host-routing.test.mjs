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

test('findpitches.com homepage is served from the global country selector', async () => {
  const fixture = contextFor('https://findpitches.com/');
  const response = await onRequest(fixture.context);
  assert.equal(response.status, 200);
  assert.deepEqual(fixture.assetRequests, ['/global/']);
  assert.equal(fixture.nextCalls(), 0);
});

test('legacy root finder redirects to the canonical US finder', async () => {
  const fixture = contextFor('https://www.findpitches.com/find-pitches');
  const response = await onRequest(fixture.context);
  assert.equal(response.status, 308);
  assert.equal(response.headers.get('location'), 'https://www.findpitches.com/us/find-pitches');
  assert.deepEqual(fixture.assetRequests, []);
  assert.equal(fixture.nextCalls(), 0);
});

test('US and UK country roots are public on their canonical paths', async () => {
  for (const [path, asset] of [['/us/', '/us/'], ['/us/find-pitches', '/us/find-pitches'], ['/uk/', '/uk/']]) {
    const fixture = contextFor(`https://findpitches.com${path}`);
    const response = await onRequest(fixture.context);
    assert.equal(response.status, 200);
    assert.deepEqual(fixture.assetRequests, [asset]);
    assert.equal(fixture.nextCalls(), 0);
  }
});

test('FindPitches API and shared assets pass through to existing handlers', async () => {
  for (const path of ['/api/us-customer-opportunities/search', '/styles.css', '/assets/hero-food-festival.jpg', '/shared/findpitches-shell.css', '/global/home.css', '/uk/home.css', '/us/home.css', '/us/find-pitches.css', '/us/find-pitches.js']) {
    const fixture = contextFor(`https://findpitches.com${path}`);
    const response = await onRequest(fixture.context);
    assert.equal(response.status, 200);
    assert.equal(fixture.nextCalls(), 1);
    assert.deepEqual(fixture.assetRequests, []);
  }
});

test('old UK preview route redirects to the now-public UK country page', async () => {
  const preview = contextFor('https://findpitches.com/preview/uk/');
  const previewResponse = await onRequest(preview.context);
  assert.equal(previewResponse.status, 308);
  assert.equal(previewResponse.headers.get('location'), 'https://findpitches.com/uk/');
  assert.deepEqual(preview.assetRequests, []);
  assert.equal(preview.nextCalls(), 0);
});

test('UK finder hands off to the existing PitchList UK product without losing filters', async () => {
  const fixture = contextFor('https://findpitches.com/uk/find-pitches?postcode=ME15&radius=50');
  const response = await onRequest(fixture.context);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), 'https://pitchlist.uk/find-pitches?postcode=ME15&radius=50');
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

test('global, US and UK sources carry canonical metadata and the US finder uses the live API', async () => {
  const [global, home, finder, uk, client] = await Promise.all([
    readFile(new URL('../src/global/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/us/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/us/find-pitches.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/uk/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/us/find-pitches.js', import.meta.url), 'utf8')
  ]);
  assert.match(global, /https:\/\/findpitches\.com\//);
  assert.match(global, /href="\/us\/"/);
  assert.match(global, /href="\/uk\/"/);
  assert.match(home, /https:\/\/findpitches\.com\/us\//);
  assert.match(home, /<html lang="en-US">/);
  assert.match(finder, /https:\/\/findpitches\.com\/us\/find-pitches/);
  assert.match(finder, /US commercial access remains disabled|preview access while coverage grows/);
  assert.match(uk, /https:\/\/findpitches\.com\/uk\//);
  assert.match(uk, /index,follow/);
  assert.match(client, /\/api\/us-customer-opportunities\/search/);
  assert.doesNotMatch(client, /\/api\/customer-opportunities\/search/);
});
