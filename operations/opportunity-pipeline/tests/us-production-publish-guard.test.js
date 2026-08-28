'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SNAPSHOT_PATH,
  BACKUP_PATH,
  GENERATED_TEXAS_PATHS,
  assertTexasPublishGitState,
  assertTexasPublishPlan,
  authorizationTokenForPromotion,
  assertTexasPublishAuthorization,
  changedPathsFromPorcelain
} = require('../lib/us-production-publish-guard');

function planned(additionCount = 4) {
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
  const additions = Array.from({ length: additionCount }, (_, index) => ({
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

const promotionManifest = { rows_sha256: 'a'.repeat(64) };

test('Texas production publisher accepts current clean main plus only known generated Texas inputs', () => {
  assert.equal(assertTexasPublishGitState({ branch: 'main', head: 'abc', originMain: 'abc', porcelain: '' }), true);
  const generatedOnly = GENERATED_TEXAS_PATHS.map(path => `?? ${path}`).join('\n');
  assert.equal(assertTexasPublishGitState({ branch: 'main', head: 'abc', originMain: 'abc', porcelain: generatedOnly }), true);
  assert.throws(() => assertTexasPublishGitState({ branch: 'feature', head: 'abc', originMain: 'abc', porcelain: '' }), /main branch/);
  assert.throws(() => assertTexasPublishGitState({ branch: 'main', head: 'abc', originMain: 'def', porcelain: '' }), /current origin\/main/);
  assert.throws(() => assertTexasPublishGitState({ branch: 'main', head: 'abc', originMain: 'abc', porcelain: ' M file' }), /clean worktree/);
  assert.throws(() => assertTexasPublishGitState({ branch: 'main', head: 'abc', originMain: 'abc', porcelain: '?? operations/opportunity-pipeline/data/us/unexpected.json' }), /clean worktree/);
});

test('Texas production publisher accepts any positive net-new batch while preserving strict boundaries', () => {
  assert.equal(assertTexasPublishPlan(planned(1)), true);
  assert.equal(assertTexasPublishPlan(planned(4)), true);
  assert.equal(assertTexasPublishPlan(planned(7)), true);
  assert.throws(() => assertTexasPublishPlan(planned(0)), /at least one net-new addition/);

  const wrongCount = planned(4);
  wrongCount.summary.after_count += 1;
  assert.throws(() => assertTexasPublishPlan(wrongCount), /count delta mismatch/);

  const wrongMarket = planned(4);
  wrongMarket.preview.rows.at(-1).currency = 'GBP';
  assert.throws(() => assertTexasPublishPlan(wrongMarket), /market routing failed/);
});

test('Texas production write authorization is bound to the exact promotion hash', () => {
  const token = authorizationTokenForPromotion(promotionManifest);
  assert.equal(token, `PUBLISH-TEXAS-${'a'.repeat(64)}`);
  assert.deepEqual(assertTexasPublishAuthorization({ apply: false, promotionManifest }), { authorized: false, mode: 'dry-run' });
  assert.throws(() => assertTexasPublishAuthorization({ apply: true, authorization: '', promotionManifest }), /not explicitly authorized/);
  assert.throws(() => assertTexasPublishAuthorization({ apply: true, authorization: `PUBLISH-TEXAS-${'b'.repeat(64)}`, promotionManifest }), /not explicitly authorized/);
  assert.deepEqual(assertTexasPublishAuthorization({ apply: true, authorization: token, promotionManifest }), { authorized: true, mode: 'apply' });
  assert.throws(() => authorizationTokenForPromotion({ rows_sha256: 'bad' }), /hash is invalid/);
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
