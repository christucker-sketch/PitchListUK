'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { planTexasProductionSnapshot } = require('../lib/us-promotion-apply');
const {
  APPLY_TOKEN,
  SNAPSHOT_PATH,
  BACKUP_PATH,
  assertTexasPublishGitState,
  assertTexasPublishPlan,
  assertTexasPublishAuthorization,
  changedPathsFromPorcelain
} = require('../lib/us-production-publish-guard');

const root = path.resolve(__dirname, '../../..');
const snapshotPath = path.join(root, SNAPSHOT_PATH);
const backupPath = path.join(root, BACKUP_PATH);
const stagingPath = process.env.PITCHLIST_US_STAGING_INPUT || path.join(root, 'operations/opportunity-pipeline/data/us/texas-approved-manifest.json');
const promotionPath = process.env.PITCHLIST_US_PROMOTION_INPUT || path.join(root, 'operations/opportunity-pipeline/data/us/texas-promotion-manifest.json');

function run(command, args, options = {}) {
  return spawnSync(command, args, { cwd: root, env: process.env, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, ...options });
}

function output(command, args, label) {
  const result = run(command, args);
  if (result.error || result.signal || result.status !== 0) throw new Error(`${label} failed`);
  return String(result.stdout || '').trim();
}

function gitState() {
  return {
    branch: output('git', ['branch', '--show-current'], 'git branch'),
    head: output('git', ['rev-parse', 'HEAD'], 'git head'),
    originMain: output('git', ['rev-parse', 'origin/main'], 'git origin main'),
    porcelain: output('git', ['status', '--porcelain', '--untracked-files=all'], 'git status')
  };
}

function serializeSnapshot(snapshot) {
  return `export const usOpportunitySnapshot = ${JSON.stringify(snapshot, null, 2)};\n`;
}

function check(command, args, label, options = {}) {
  const result = run(command, args, options);
  if (result.error || result.signal || result.status !== 0) throw new Error(`${label} failed`);
}

async function main() {
  const apply = process.argv.includes('--apply');
  const authorization = process.env.PITCHLIST_US_PRODUCTION_WRITE_AUTHORIZATION || '';
  const auth = assertTexasPublishAuthorization({ apply, authorization });

  output('git', ['fetch', '--quiet', 'origin', 'main'], 'git fetch origin main');
  const state = gitState();
  if (apply) assertTexasPublishGitState(state);

  const stagingManifest = JSON.parse(fs.readFileSync(stagingPath, 'utf8'));
  const promotionManifest = JSON.parse(fs.readFileSync(promotionPath, 'utf8'));
  const snapshotModule = await import(`${pathToFileURL(snapshotPath).href}?publish=${Date.now()}`);
  const { TEXAS_PILOT_SOURCES } = await import(`${pathToFileURL(path.join(root, 'operations/opportunity-pipeline/config/texas-pilot-sources.js')).href}?publish=${Date.now()}`);
  const planned = planTexasProductionSnapshot(snapshotModule.usOpportunitySnapshot, promotionManifest, stagingManifest, { sources: TEXAS_PILOT_SOURCES });
  assertTexasPublishPlan(planned);

  const summary = {
    mode: auth.mode,
    before: planned.summary.before_count,
    after: planned.summary.after_count,
    additions: planned.summary.additions,
    ids: planned.summary.added_ids,
    uk_snapshot_unchanged: true,
    production_write_authorized: auth.authorized,
    deploy_authorized: false
  };

  if (!apply) {
    console.log(JSON.stringify(summary, null, 2));
    console.log(`Apply requires: PITCHLIST_US_PRODUCTION_WRITE_AUTHORIZATION=${APPLY_TOKEN}`);
    return;
  }

  const nextSnapshot = {
    ...planned.preview,
    exported_at: new Date().toISOString(),
    source: `reviewed-us-texas-promotion:${promotionManifest.rows_sha256}`,
    total: planned.summary.after_count
  };
  fs.copyFileSync(snapshotPath, backupPath);
  try {
    fs.writeFileSync(snapshotPath, serializeSnapshot(nextSnapshot), 'utf8');
    check('npm', ['run', 'build'], 'build');
    check('npm', ['run', 'check'], 'check');
    check('npm', ['run', 'test:pipeline'], 'pipeline tests');
    check('git', ['diff', '--check'], 'diff check');

    const changedPaths = changedPathsFromPorcelain(output('git', ['status', '--porcelain', '--untracked-files=all'], 'git changed files'));
    const unexpected = changedPaths.filter(file => file !== SNAPSHOT_PATH);
    if (unexpected.length) throw new Error(`unexpected production changes: ${unexpected.join(', ')}`);
    if (!changedPaths.includes(SNAPSHOT_PATH)) throw new Error('US production snapshot did not change');

    console.log(JSON.stringify({ ...summary, changed_files: changedPaths, backup: backupPath }, null, 2));
    console.log('Isolated US snapshot write complete; UK snapshot unchanged; commit/push/deploy remain manual and separate.');
  } catch (error) {
    fs.copyFileSync(backupPath, snapshotPath);
    throw error;
  } finally {
    if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath);
  }
}

main().catch(error => { console.error(error.message || error); process.exit(1); });
