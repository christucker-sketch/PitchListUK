'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  APPLY_TOKEN,
  assertTexasPublishGitState,
  assertTexasPublishPlan,
  assertTexasPublishAuthorization,
  changedPathsFromPorcelain
} = require('../lib/us-production-publish-guard');

function planned() {
  const existing = Array.from({ length: 289 }, (_, index) => ({ id: `gb-${index}` }));
  const additions = Array.from({ length: 5 }, (_, index) => ({
    id: `opp_us_${index}`,
    country_code: 'US',
    region_code: 'TX',
    jurisdiction: 'US-TX',
    publishable: true,
    quality_status: 'customer_ready',
    market_domain: 'pitchlist.com',
    currency: 'USD'
  }));
  return {
    preview: { rows: [...existing, ...additions] },
    summary: { before_count: 289, after_count: 294, additions: 5, added_ids: additions.map(row => row.id) }
  };
}

test('Texas production publisher accepts only a clean current main worktree', () => {
  assert.equal(assertTexasPublishGitState({ branch: 'main', head: 'abc', originMain: 'abc', porcelain: '' }), true);
  assert.throws(() => assertTexasPublishGitState({ branch: 'feature', head: 'abc', originMain: 'abc', porcelain: '' }), /main branch/);
  assert.throws(() => assertTexasPublishGitState({ branch: 'main', head: 'abc', originMain: 'def', porcelain: '' }), /current origin\/main/);
  assert.throws(() => assertTexasPublishGitState({ branch: 'main', head: 'abc', originMain: 'abc', porcelain: ' M file' }), /clean worktree/);
});

test('Texas production publisher requires the exact reviewed +5 delta and US market routing', () => {
  assert.equal(assertTexasPublishPlan(planned()), true);
  const wrongCount = planned();
  wrongCount.summary.after_count = 295;
  assert.throws(() => assertTexasPublishPlan(wrongCount), /count delta mismatch/);
  const wrongMarket = planned();
  wrongMarket.preview.rows.at(-1).currency = 'GBP';
  assert.throws(() => assertTexasPublishPlan(wrongMarket), /market routing failed/);
});

test('Texas production write requires an explicit exact authorization token', () => {
  assert.deepEqual(assertTexasPublishAuthorization({ apply: false }), { authorized: false, mode: 'dry-run' });
  assert.throws(() => assertTexasPublishAuthorization({ apply: true, authorization: '' }), /not explicitly authorized/);
  assert.deepEqual(assertTexasPublishAuthorization({ apply: true, authorization: APPLY_TOKEN }), { authorized: true, mode: 'apply' });
});

test('Texas production changed-file parsing preserves the snapshot path and ignores the temporary rollback backup', () => {
  const porcelain = [
    ' M functions/_data/opportunities.mjs',
    '?? functions/_data/opportunities.mjs.pli016-backup',
    ' M public/index.html'
  ].join('\n');
  assert.deepEqual(changedPathsFromPorcelain(porcelain), [
    'functions/_data/opportunities.mjs',
    'public/index.html'
  ]);

  const trimmedFirstLine = 'M functions/_data/opportunities.mjs\n?? functions/_data/opportunities.mjs.pli016-backup';
  assert.deepEqual(changedPathsFromPorcelain(trimmedFirstLine), ['functions/_data/opportunities.mjs']);
});
