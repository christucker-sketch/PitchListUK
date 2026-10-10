// node --test deploy/pi/delivery/producer-delivery.test.mjs   (no network; a mock ingest stands in for V3)
// V3-001: the Pi runner reads every recheck page and acknowledges with producer_record_id + entity_id + requested_at.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fetchRechecks } from './producer-delivery.mjs';
import { deliveryCycle } from './producer-runner.mjs';

const TOKEN = 'test-token-not-a-secret-0123456789';
const ORIGIN = 'https://ingest.example.test';
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function mockIngest(requests, { pageSize = 100 } = {}) {
  const calls = { pages: [], acks: [], imports: 0 };
  const fetcher = async (url, options = {}) => {
    const u = new URL(url);
    assert.equal(options.headers?.Authorization, 'Bearer ' + TOKEN);
    if (u.pathname === '/rechecks') {
      const start = Number(u.searchParams.get('cursor') || 0);
      calls.pages.push(start);
      const page = requests.slice(start, start + pageSize), next = start + pageSize < requests.length ? String(start + pageSize) : null;
      return json({ requests: page, next_cursor: next });
    }
    if (u.pathname === '/imports') {
      const { records } = JSON.parse(options.body); calls.imports += records.length;
      return json({ accepted: records.length, rejected: 0, inserted: records.length, duplicates: 0, record_ids: records.map((_, i) => 'r' + i), errors: [] });
    }
    if (u.pathname === '/rechecks/ack') { calls.acks.push(JSON.parse(options.body)); return json({ acknowledged: true }); }
    return json({ error: 'not_found' }, 404);
  };
  return { fetcher, calls };
}

const req = (i, at = '2026-10-10T08:00:00.000Z') => ({ environment: 'shadow', producer_record_id: 'fdx1_' + String(i).padStart(4, '0'), entity_id: 'ent_' + i, requested_at: at, reason: 'watch_recheck_due' });

test('fetchRechecks follows next_cursor to the end', async () => {
  const all = Array.from({ length: 250 }, (_, i) => req(i));
  const { fetcher, calls } = mockIngest(all);
  const got = await fetchRechecks({ ingestUrl: ORIGIN, token: TOKEN, fetcher });
  assert.equal(got.length, 250);
  assert.deepEqual(calls.pages, [0, 100, 200]);
});

test('fetchRechecks refuses a cursor loop', async () => {
  const fetcher = async () => json({ requests: [req(1)], next_cursor: 'same' });
  await assert.rejects(fetchRechecks({ ingestUrl: ORIGIN, token: TOKEN, fetcher }), /recheck_cursor_loop/);
});

test('delivery cycle acks only fresh delivered records, with exact identifiers, across all pages', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fpd-delivery-'));
  const tokenFile = path.join(dir, 'token.env'); fs.writeFileSync(tokenFile, 'V3_INGEST_TOKEN=' + TOKEN + '\n');
  // 150 requests over two pages; records 0..139 are delivered, 0..119 re-checked after the request.
  const all = Array.from({ length: 150 }, (_, i) => req(i));
  const records = Array.from({ length: 140 }, (_, i) => ({ schema_version: 'findpitches-discovery-export-v1', opportunity_id: 'fdx1_' + String(i).padStart(4, '0'),
    last_checked: i < 120 ? '2026-10-10T09:00:00.000Z' : '2026-10-10T07:00:00.000Z' }));
  const input = path.join(dir, 'feed.jsonl'); fs.writeFileSync(input, records.map(r => JSON.stringify(r)).join('\n') + '\n');
  const { fetcher, calls } = mockIngest(all);
  const status = await deliveryCycle({ input_file: input, token_file: tokenFile, state_dir: path.join(dir, 'state'), ingest_url: ORIGIN, environment: 'shadow', interval_seconds: 900 }, { fetcher });
  assert.equal(status.status, 'delivered');
  assert.equal(status.pending_rechecks, 150);
  assert.equal(status.acknowledged_rechecks, 120);
  assert.equal(calls.imports, 140);
  assert.deepEqual(calls.acks[0], { entity_id: 'ent_0', requested_at: '2026-10-10T08:00:00.000Z', producer_record_id: 'fdx1_0000' });
  assert.ok(calls.acks.every(a => Number(a.entity_id.slice(4)) < 120));
  const handoff = JSON.parse(fs.readFileSync(path.join(dir, 'state', 'rechecks.json'), 'utf8'));
  assert.equal(handoff.requests.length, 150);   // the discovery side sees every page, not just the first 100
});
