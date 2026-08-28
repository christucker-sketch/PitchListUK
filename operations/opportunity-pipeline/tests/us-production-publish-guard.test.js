'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  EXPECTED_ADDITIONS,
  APPLY_TOKEN,
  SNAPSHOT_PATH,
  BACKUP_PATH,
  GENERATED_TEXAS_PATHS,
  assertTexasPublishGitState,
  assertTexasPublishPlan,
  assertTexasPublishAuthorization,
  changedPathsFromPorcelain
} = require('../lib/us-production-publish-guard');

function planned() {
  const existing = Array.from({ length: 5 }, (_, index) => ({
    id: `opp_existing_${index}`,
    country_code: 'US',
    region_code: 'TX',
    jurisdiction: 'US-TX',
    publishable: true,
    quality_status: 'customer_ready',
    market_domain: 'findpitches.com',
    currency: 'USD'
  }));
  const additions = Array.from({ length: EXPECTED_ADDITIONS }, (_, index) => ({
    id: `opp_us_${index}`,
    country_code: 'US',
    region_code: 'TX',
    jurisdiction: 'US-TX',
    publishable: true,
    quality_status: 'customer_ready',
    market_domain: 'findpitches.com',
    currency: 'USD'
  }));
  return {
    preview: { rows: [...existing, ...additions] },
    summary: {
      before_count: existing.length,
      after_count: existing.length + additions.length,
      additions: additions.length,
      added_ids: additions.map(row => row.id)
    }
  };
}

test('Texas production publisher accepts current clean main plus only known generated Texas inputs', () => {
  assert.equal(assertTexasPublishGitState({ branch: 'main', head: 'abc', originMain: 'abc', porcelain: '' }), true);
  const generatedOnly = GENERATED_TEXAS_PATHS.map(path => `?? ${path}`).join('\n');
  assert.equal(assertTexasPublishGitState({ branch: 'main', head: 'abc', originMain: 'abc', porcelain: generatedOnly }), true);
  assert.throws(() => assertTexasPublishGitState({ branch: 'feature', head: 'abc', originMain: 'abc', porcelain: '' }), /main branch/);
  assert.throws(() => assertTexasPublishGitState({ branch: 'main', head: 'abc', originMain: 'def', porcelain: '' }), /current origin\/main/);
  assert.throws(() => assertTexasPublishGitState({ branch: 'main', head: 'abc', originMain: 'abc', porcelain: ' M file' }), /clean worktree/);
  assert.throws(() => assertTexasPublishGitState({ branch: 'main', head: 'abc', originMain: 'abc', porcelain: '?? operations/opportunity-pipeline/data/us/unexpected.json' }), /clean worktree/);
});

test('Texas production publisher requires the exact reviewed 5-to-9 net-new delta and US market routing', () => {
  assert.equal(EXPECTED_ADDITIONS, 4);
  assert.equal(assertTexasPublishPlan(planned()), true);
  const wrongCount = planned();
  wrongCount.summary.after_count += 1;
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

test('Texas production changed-file parsing keeps real changes while ignoring generated inputs and rollback backup', () => {
  const porcelain = [
    ` M ${SNAPSHOT_PATH}`,
    `?? ${BACKUP_PATH}`,
    ...GENERATED_TEXAS_PATHS.map(path => `?? ${path}`),
    ' M public/index.html'
  ].join('\n');
  assert.deepEqual(changedPathsFromPorcelain(porcelain), [
    SNAPSHOT_PATH,
    'public/index.html'
  ]);

  const trimmedFirstLine = `M ${SNAPSHOT_PATH}\n?? ${BACKUP_PATH}`;
  assert.deepEqual(changedPathsFromPorcelain(trimmedFirstLine), [SNAPSHOT_PATH]);
});
