const test = require('node:test');
const assert = require('node:assert/strict');
const { directSourceRoutes, approvedFollowLinks, fetchApprovedSources } = require('../scripts/fetch-approved-sources');

test('direct approved-source inventory is unique and needs no Serper query', () => {
  const routes = directSourceRoutes();
  assert.ok(routes.length >= 30);
  assert.equal(new Set(routes.map(route => route.url)).size, routes.length);
  assert.ok(routes.some(route => route.url.includes('quaysidemarket.co.uk/traders')));
  assert.ok(routes.every(route => route.source.approved && route.source.official_application_route));
});

test('link following stays on the approved first-party route', () => {
  const html = '<a href="/traders/apply">Trader application</a><a href="https://evil.example/apply">Apply</a><a href="/tickets">Tickets</a>';
  const links = approvedFollowLinks(html, 'https://quaysidemarket.co.uk/traders', 3);
  assert.equal(links.length, 1);
  assert.match(links[0].url, /quaysidemarket\.co\.uk\/traders\/apply/);
});

test('direct cycle fetches approved routes without search and retains failures', async () => {
  const source = { host: 'quaysidemarket.co.uk', organisation: 'Quayside Market Sheffield', type: 'market-operator', approved: true, terms_policy: 'manual-reviewed', geographic_coverage: 'South Yorkshire', opportunity_type: 'recurring_market', official_application_route: 'https://www.quaysidemarket.co.uk/traders', recurring: true, opportunity_title: 'Quayside Market Sheffield trader applications' };
  const result = await fetchApprovedSources({ sources: [source], followLimit: 0, today: '2026-08-21', fetchWithPolicy: async url => ({ ok: true, final_url: url, attempts: 1, response: { text: async () => '<h1>Apply to become a trader</h1><a href="/traders/apply">Full application</a><p>Victoria Quays Sheffield South Yorkshire</p>' } }) });
  assert.equal(result.routes.length, 1);
  assert.equal(result.outcomes.length, 1);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].organiser, 'Quayside Market Sheffield');
});
