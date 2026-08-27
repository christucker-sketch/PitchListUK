'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  APPLY_TOKEN,
  SNAPSHOT_PATH,
  BACKUP_PATH,
  assertTexasPublishGitState,
  assertTexasPublishPlan,
  assertTexasPublishAuthorization,
  changedPathsFromPorcelain
} = require('../lib/us-production-publish-guard');

function planned() {
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
    preview: { rows: [...additions] },
    summary: { before_count: 0, after_count: 5, additions: 5, added_ids: additions.map(row => row.id) }
  };
}

test('Texas production publisher accepts only a clean current main worktree', () => {
  assert.equal(assertTexasPublishGitState({ branch: 'main', head: 'abc', originMain: 'abc', porcelain: '' }), true);
  assert.throws(() => assertTexasPublishGitState({ branch: 'feature', head: 'abc', originMain: 'abc', porcelain: '' }), /main branch/);
  assert.throws(() => assertTexasPublishGitState({ branch: 'main', head: 'abc', originMain: 'def', porcelain: '' }), /current origin\/main/);
  assert.throws(() => assertTexasPublishGitState({ branch: 'main', head: 'abc', originMain: 'abc', porcelain: ' M file' }), /clean worktree/);
});

test('Texas production publisher requires the exact reviewed isolated 0-to-5 delta and US market routing', () => {
  assert.equal(assertTexasPublishPlan(planned()), true);
  const wrongCount = planned();
  wrongCount.summary.after_count = 6;
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

test('Texas production changed-file parsing preserves only the isolated US snapshot path and ignores its rollback backup', () => {
  const porcelain = [
    ` M ${SNAPSHOT_PATH}`,
    `?? ${BACKUP_PATH}`,
    ' M public/index.html'
  ].join('\n');
  assert.deepEqual(changedPathsFromPorcelain(porcelain), [
    SNAPSHOT_PATH,
    'public/index.html'
  ]);

  const trimmedFirstLine = `M ${SNAPSHOT_PATH}\n?? ${BACKUP_PATH}`;
  assert.deepEqual(changedPathsFromPorcelain(trimmedFirstLine), [SNAPSHOT_PATH]);
});
