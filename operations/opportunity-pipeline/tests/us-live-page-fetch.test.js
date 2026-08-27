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

test('live page parser excludes site chrome negative signals', () => {
  const html = `<html><body><header><a>Employment</a></header><nav>Careers Become a Sponsor</nav><main><h1>Farmers Market Vendor Application</h1><p>Applications are open for artisan vendors.</p></main><footer>Employment Become a Sponsor</footer></body></html>`;
  const text = htmlToText(html);
  assert.match(text, /Farmers Market Vendor Application/);
  assert.match(text, /artisan vendors/);
  assert.doesNotMatch(text, /Employment/i);
  assert.doesNotMatch(text, /Become a Sponsor/i);
});

test('live page parser resolves relative application links', () => {
  const html = `<nav><a href="/careers">Employment</a></nav><main><a href="/vendors/apply?utm_source=test">Vendor Application</a></main><footer><a href="/sponsor">Become a Sponsor</a></footer>`;
  const links = extractLinks(html, 'https://example.org/events/fair');
  assert.equal(links.length, 1);
  assert.equal(links[0].text, 'Vendor Application');
  assert.equal(links[0].url, 'https://example.org/vendors/apply?utm_source=test');
});
