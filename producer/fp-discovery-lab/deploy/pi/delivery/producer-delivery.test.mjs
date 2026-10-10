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

// V3-002 option B (prepared, off by default)
import { createHash } from 'node:crypto';
import { uploadSourceDocuments } from './producer-delivery.mjs';

function docsFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fpd-docs-')), v3 = path.join(dir, 'v3');
  fs.mkdirSync(path.join(v3, 'docs'), { recursive: true });
  const docs = ['<html>a</html>', '<html>b</html>'].map((html, i) => {
    const body = Buffer.from(html), sha = createHash('sha256').update(body).digest('hex');
    fs.writeFileSync(path.join(v3, 'docs', sha + '.bin'), body);
    return { schema: 'findpitches-source-document-v1', content_sha256: sha, url: 'https://www.ukcraftfairs.com/craft-events/' + i + '/x',
      final_url: 'https://www.ukcraftfairs.com/craft-events/' + i + '/x', fetched_at: '2026-10-10T09:00:00Z', http_status: 200,
      content_type: 'text/html', bytes: body.length, producer_record_ids: ['fdx1_' + i], file: 'docs/' + sha + '.bin' };
  });
  const manifest = path.join(v3, 'docs-manifest.json');
  fs.writeFileSync(manifest, JSON.stringify({ schema: 'findpitches-source-documents-manifest-v1', documents: docs }));
  return { dir, manifest, docs };
}

test('source documents: exact bytes sent once, recorded only on matching receipt', async () => {
  const { dir, manifest, docs } = docsFixture(), seen = [];
  const fetcher = async (url, options) => {
    assert.equal(new URL(url).pathname, '/source-documents');
    const { environment, document } = JSON.parse(options.body); seen.push(document);
    assert.equal(environment, 'shadow');
    assert.equal(createHash('sha256').update(Buffer.from(document.body_base64, 'base64')).digest('hex'), document.content_sha256);
    assert.equal(document.file, undefined);
    return json({ accepted: true, content_sha256: document.content_sha256 });
  };
  const stateFile = path.join(dir, 'state.json');
  const first = await uploadSourceDocuments({ manifestFile: manifest, ingestUrl: ORIGIN, token: TOKEN, stateFile, fetcher });
  assert.deepEqual(first, { sent: 2, skipped: 0, pending: 0 });
  const again = await uploadSourceDocuments({ manifestFile: manifest, ingestUrl: ORIGIN, token: TOKEN, stateFile, fetcher });
  assert.deepEqual(again, { sent: 0, skipped: 0, pending: 0 });
  assert.equal(seen.length, 2);
  assert.deepEqual(seen[0].producer_record_ids, docs[0].producer_record_ids);
});

test('source documents: tampered file skipped; mismatched receipt rejected', async () => {
  const { dir, manifest, docs } = docsFixture();
  fs.writeFileSync(path.join(dir, 'v3', docs[0].file), 'tampered');
  const fetcher = async (url, options) => json({ accepted: true, content_sha256: 'f'.repeat(64) });
  await assert.rejects(uploadSourceDocuments({ manifestFile: manifest, ingestUrl: ORIGIN, token: TOKEN, stateFile: path.join(dir, 's.json'), fetcher }), /source_document_receipt_invalid/);
});

test('delivery cycle: document upload is off by default and never fails record delivery', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fpd-cycle-docs-'));
  const tokenFile = path.join(dir, 'token.env'); fs.writeFileSync(tokenFile, 'V3_INGEST_TOKEN=' + TOKEN + '\n');
  const input = path.join(dir, 'feed.jsonl');
  fs.writeFileSync(input, JSON.stringify({ schema_version: 'findpitches-discovery-export-v1', opportunity_id: 'fdx1_0000', last_checked: '2026-10-10T09:00:00.000Z' }) + '\n');
  const { fetcher } = mockIngest([]);
  const base = { input_file: input, token_file: tokenFile, ingest_url: ORIGIN, environment: 'shadow', interval_seconds: 900 };
  const off = await deliveryCycle({ ...base, state_dir: path.join(dir, 's1') }, { fetcher });
  assert.equal(off.status, 'delivered'); assert.equal(off.source_documents, undefined);
  const { manifest } = docsFixture();   // endpoint absent on the mock ingest -> 404
  const on = await deliveryCycle({ ...base, state_dir: path.join(dir, 's2'), source_documents_manifest: manifest }, { fetcher });
  assert.equal(on.status, 'delivered'); assert.deepEqual(on.source_documents, { error: 'source_document_http_404' });
});
