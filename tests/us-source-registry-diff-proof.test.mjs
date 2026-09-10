import test from 'node:test';
import assert from 'node:assert/strict';
import { proveUsSourceRegistryAdditionsOnly } from '../operations/cloudflare-texas-acquisition/src/us-source-registry-diff-proof.js';

const existing = { id: 'src_existing', name: 'Existing', nested: { b: 2, a: 1 } };

function base() {
  return { version: 1, updated_at: 'old', sources: [structuredClone(existing)] };
}

function head() {
  return { version: 1, updated_at: 'new', sources: [{ id: 'src_new', name: 'New' }, structuredClone(existing)] };
}

test('registry proof allows only updated_at plus new source IDs and ignores object key ordering', () => {
  const candidate = head();
  candidate.sources[1] = { nested: { a: 1, b: 2 }, name: 'Existing', id: 'src_existing' };
  assert.deepEqual(proveUsSourceRegistryAdditionsOnly(base(), candidate), {
    additions_only: true,
    base_count: 1,
    head_count: 2,
    added_count: 1,
    added_ids: ['src_new']
  });
});

test('registry proof rejects removals, rewrites, envelope changes, duplicates and zero additions', () => {
  const cases = [
    { version: 1, updated_at: 'new', sources: [{ id: 'src_new', name: 'New' }] },
    { version: 1, updated_at: 'new', sources: [{ id: 'src_existing', name: 'Changed', nested: { a: 1, b: 2 } }, { id: 'src_new', name: 'New' }] },
    { version: 2, updated_at: 'new', sources: [structuredClone(existing), { id: 'src_new', name: 'New' }] },
    { version: 1, updated_at: 'new', sources: [structuredClone(existing), structuredClone(existing), { id: 'src_new', name: 'New' }] },
    { version: 1, updated_at: 'new', sources: [structuredClone(existing)] }
  ];
  for (const candidate of cases) assert.throws(() => proveUsSourceRegistryAdditionsOnly(base(), candidate));
});
