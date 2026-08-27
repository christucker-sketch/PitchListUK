'use strict';

const EXPECTED_ADDITIONS = 5;
const APPLY_TOKEN = 'PUBLISH-EXACTLY-5-TEXAS';

function assertTexasPublishGitState(state = {}) {
  if (state.branch !== 'main') throw new Error('Texas publisher requires main branch');
  if (!state.head || state.head !== state.originMain) throw new Error('Texas publisher requires current origin/main');
  if (String(state.porcelain || '').trim()) throw new Error('Texas publisher requires a clean worktree');
  return true;
}

function assertTexasPublishPlan(planned) {
  const summary = planned?.summary || {};
  const rows = planned?.preview?.rows || [];
  if (summary.additions !== EXPECTED_ADDITIONS) throw new Error('Texas publisher requires exactly five additions');
  if (summary.after_count !== summary.before_count + EXPECTED_ADDITIONS) throw new Error('Texas publisher count delta mismatch');
  if (rows.length !== summary.after_count) throw new Error('Texas publisher snapshot count mismatch');
  if (!Array.isArray(summary.added_ids) || summary.added_ids.length !== EXPECTED_ADDITIONS || new Set(summary.added_ids).size !== EXPECTED_ADDITIONS) {
    throw new Error('Texas publisher addition identities invalid');
  }
  const additions = rows.slice(summary.before_count);
  if (additions.length !== EXPECTED_ADDITIONS) throw new Error('Texas publisher planned additions mismatch');
  for (const row of additions) {
    if (row.country_code !== 'US' || row.region_code !== 'TX' || row.jurisdiction !== 'US-TX') throw new Error('Texas publisher country boundary failed');
    if (row.publishable !== true || row.quality_status !== 'customer_ready') throw new Error('Texas publisher row is not customer ready');
    if (row.market_domain !== 'pitchlist.com' || row.currency !== 'USD') throw new Error('Texas publisher market routing failed');
  }
  return true;
}

function assertTexasPublishAuthorization(options = {}) {
  if (options.apply !== true) return { authorized: false, mode: 'dry-run' };
  if (options.authorization !== APPLY_TOKEN) throw new Error('Texas production write is not explicitly authorized');
  return { authorized: true, mode: 'apply' };
}

module.exports = {
  EXPECTED_ADDITIONS,
  APPLY_TOKEN,
  assertTexasPublishGitState,
  assertTexasPublishPlan,
  assertTexasPublishAuthorization
};
