'use strict';

const SNAPSHOT_PATH = 'functions/_data/us-opportunities.mjs';
const BACKUP_PATH = `${SNAPSHOT_PATH}.pli017-backup`;
const GENERATED_TEXAS_PATHS = Object.freeze([
  'operations/opportunity-pipeline/data/us/texas-approved-manifest.json',
  'operations/opportunity-pipeline/data/us/texas-promotion-manifest.json',
  'operations/opportunity-pipeline/data/us/texas-production-preview.json'
]);

function changedPathsFromPorcelain(output) {
  return String(output || '')
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => {
      const canonical = line.match(/^[ MARCUD?!]{2}\s+(.*)$/);
      const trimmedFirstLine = line.match(/^[MARCUD?!]\s+(.*)$/);
      const path = (canonical?.[1] || trimmedFirstLine?.[1] || line).trim();
      return path.includes(' -> ') ? path.split(' -> ').at(-1) : path;
    })
    .filter(path => path !== BACKUP_PATH && !GENERATED_TEXAS_PATHS.includes(path));
}

function assertTexasPublishGitState(state = {}) {
  if (state.branch !== 'main') throw new Error('Texas publisher requires main branch');
  if (!state.head || state.head !== state.originMain) throw new Error('Texas publisher requires current origin/main');
  if (changedPathsFromPorcelain(state.porcelain).length) throw new Error('Texas publisher requires a clean worktree');
  return true;
}

function assertTexasPublishPlan(planned) {
  const summary = planned?.summary || {};
  const rows = planned?.preview?.rows || [];
  const additions = Number(summary.additions);
  if (!Number.isInteger(additions) || additions < 1) throw new Error('Texas publisher requires at least one net-new addition');
  if (summary.after_count !== summary.before_count + additions) throw new Error('Texas publisher count delta mismatch');
  if (rows.length !== summary.after_count) throw new Error('Texas publisher snapshot count mismatch');
  if (!Array.isArray(summary.added_ids) || summary.added_ids.length !== additions || new Set(summary.added_ids).size !== additions) {
    throw new Error('Texas publisher addition identities invalid');
  }
  const plannedAdditions = rows.slice(summary.before_count);
  if (plannedAdditions.length !== additions) throw new Error('Texas publisher planned additions mismatch');
  for (const row of plannedAdditions) {
    if (row.country_code !== 'US' || row.region_code !== 'TX' || row.jurisdiction !== 'US-TX') throw new Error('Texas publisher country boundary failed');
    if (row.publishable !== true || row.quality_status !== 'customer_ready') throw new Error('Texas publisher row is not customer ready');
    if (row.market_domain !== 'findpitches.com' || row.currency !== 'USD') throw new Error('Texas publisher market routing failed');
  }
  return true;
}

function authorizationTokenForPromotion(promotionManifest = {}) {
  const hash = String(promotionManifest.rows_sha256 || '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error('Texas promotion hash is invalid');
  return `PUBLISH-TEXAS-${hash}`;
}

function assertTexasPublishAuthorization(options = {}) {
  if (options.apply !== true) return { authorized: false, mode: 'dry-run' };
  const expected = authorizationTokenForPromotion(options.promotionManifest);
  if (options.authorization !== expected) throw new Error('Texas production write is not explicitly authorized for this promotion manifest');
  return { authorized: true, mode: 'apply' };
}

module.exports = {
  SNAPSHOT_PATH,
  BACKUP_PATH,
  GENERATED_TEXAS_PATHS,
  assertTexasPublishGitState,
  assertTexasPublishPlan,
  authorizationTokenForPromotion,
  assertTexasPublishAuthorization,
  changedPathsFromPorcelain
};
