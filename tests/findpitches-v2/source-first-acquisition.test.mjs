import test from 'node:test';
import assert from 'node:assert/strict';
import { extractSourceRouteLinks } from '../../platform/findpitches-v2/acquisition/source-first.mjs';

test('source-first extraction keeps same-domain vendor/application routes', () => {
  const html=`
    <a href="/vendors/apply">Become a Vendor</a>
    <a href="/events/summer-fair">Summer Fair Vendors</a>
    <a href="/privacy">Privacy</a>
    <a href="https://other.example/vendor">Vendor portal</a>`;
  const rows=extractSourceRouteLinks(html,'https://market.example/');
  assert.deepEqual(rows.map(x=>x.url),[
    'https://market.example/vendors/apply',
    'https://market.example/events/summer-fair'
  ]);
  assert.equal(rows[0].route_type,'application');
  assert.equal(rows[1].route_type,'event');
});

test('source-first extraction ignores ordinary navigation', () => {
  const rows=extractSourceRouteLinks('<a href="/about">About</a><a href="/tickets">Tickets</a>','https://market.example/');
  assert.equal(rows.length,0);
});
