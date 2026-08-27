const test = require('node:test');
const assert = require('node:assert/strict');

const { htmlToText, extractTitle, extractLinks } = require('../lib/us-live-page-fetch');

test('live page parser strips scripts and preserves vendor evidence text', () => {
  const html = `<!doctype html><html><head><title>Vendor Application &amp; Info</title><style>.x{}</style></head><body><script>bad()</script><h1>Food Truck Vendor Application</h1><p>Apply by November 1, 2026.</p></body></html>`;
  const text = htmlToText(html);
  assert.match(text, /Food Truck Vendor Application/);
  assert.match(text, /Apply by November 1, 2026/);
  assert.doesNotMatch(text, /bad\(\)/);
  assert.equal(extractTitle(html), 'Vendor Application & Info');
});

test('live page parser resolves relative application links', () => {
  const html = `<a href="/vendors/apply?utm_source=test">Vendor Application</a><a href="mailto:test@example.org">Email</a>`;
  const links = extractLinks(html, 'https://example.org/events/fair');
  assert.equal(links[0].text, 'Vendor Application');
  assert.equal(links[0].url, 'https://example.org/vendors/apply?utm_source=test');
  assert.equal(links[1].url, 'mailto:test@example.org');
});
