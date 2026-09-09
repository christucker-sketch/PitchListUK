import assert from 'node:assert/strict';
import test from 'node:test';

import {
  chunkControllerStateText,
  joinControllerStateChunks,
  sha256Hex,
  validateControllerStateText
} from '../operations/cloudflare-global-acquisition/lib/controller-state-codec.mjs';

function sampleState(extra = {}) {
  const priority = [
    'CA','TX','FL','NY','PA','IL','OH','GA','NC','MI','NJ','VA','WA','AZ','CO','TN','IN','MO','MD','MN','WI','OR','SC','AL','KY','LA','OK','CT','IA','KS','NV','UT','AR','NE','NM','ID','ME','AK','HI','MS','MT','DE','NH','ND','RI','SD','VT','WV','WY','MA'
  ];
  return {
    status: 'ready',
    priority_order: priority,
    query_offsets: Object.fromEntries(priority.map(code => [code, code === 'MA' ? 140 : 144])),
    deferred_units: [],
    ...extra
  };
}

test('controller state codec validates the production state shape', () => {
  const text = JSON.stringify(sampleState());
  const parsed = validateControllerStateText(text);
  assert.equal(parsed.status, 'ready');
  assert.equal(parsed.priority_order.length, 50);
});

test('controller state codec chunks and reconstructs multi-megabyte state exactly', async () => {
  const text = JSON.stringify(sampleState({
    deferred_units: Array.from({ length: 130 }, (_, index) => ({
      disposition: 'deferred_for_replay',
      state_code: 'MA',
      query_offset: index * 4,
      error: 'x'.repeat(40_000)
    }))
  }), null, 2);

  assert.ok(Buffer.byteLength(text) > 5_000_000);
  const originalSha = await sha256Hex(text);
  const { chunks, bytes } = chunkControllerStateText(text);
  assert.ok(chunks.length > 2);
  assert.equal(bytes, Buffer.byteLength(text));

  const reconstructed = joinControllerStateChunks(chunks);
  assert.equal(reconstructed, text);
  assert.equal(await sha256Hex(reconstructed), originalSha);
});

test('controller state codec rejects incomplete controller snapshots', () => {
  assert.throws(
    () => validateControllerStateText(JSON.stringify({ priority_order: ['CA'], query_offsets: {}, deferred_units: [] })),
    /50-state priority_order/
  );
});
