import assert from 'node:assert/strict';
import test from 'node:test';

import {
  publicationEvidenceCounts,
  receiptsForAddedSources
} from '../../cloudflare-texas-acquisition/src/source-evidence-receipts.js';

test('source PR evidence receipts are limited to the net-new sources actually written', () => {
  const receipts = [
    { source_id: 'az-new-source', route: 'https://example.com/new' },
    { source_id: 'az-existing-source', route: 'https://example.com/existing' }
  ];
  const addedSources = [{ id: 'az-new-source' }];

  assert.deepEqual(receiptsForAddedSources(receipts, addedSources), [receipts[0]]);
});

test('source PR evidence receipt selection fails closed when a net-new source has no receipt', () => {
  assert.throws(
    () => receiptsForAddedSources([], [{ id: 'az-new-source' }]),
    /requires exactly one deterministic evidence receipt/
  );
});

test('source PR evidence receipt selection fails closed when a net-new source has duplicate receipts', () => {
  assert.throws(
    () => receiptsForAddedSources([
      { source_id: 'az-new-source' },
      { source_id: 'az-new-source' }
    ], [{ id: 'az-new-source' }]),
    /found 2/
  );
});

test('compact discovery accounting reports the net-new publication set separately from validated candidates', () => {
  assert.deepEqual(publicationEvidenceCounts(
    {
      sources: [{ id: 'az-new-source' }, { id: 'az-existing-source' }],
      receipts: [{ source_id: 'az-new-source' }, { source_id: 'az-existing-source' }]
    },
    {
      source_ids: ['az-new-source'],
      evidence_passed_count: 1
    }
  ), {
    validated_source_count: 2,
    validated_evidence_count: 2,
    generated_source_count: 1,
    evidence_passed_count: 1
  });
});
