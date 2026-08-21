#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  parseSnapshot, serializeSnapshot, assertGitState, validateManifest, planChanges,
  changedFilesFromPorcelain, assertAllowedChanges, assertRequiredHeaders, assertLiveHeaders, resultStatus,
  parseDeployments, atomicWrite
} = require('./lib/reviewed-opportunity-publisher');

const root = path.resolve(__dirname, '..');
const snapshotFile = path.join(root, 'functions/_data/opportunities.mjs');

function run(command, args, options = {}) {
  return spawnSync(command, args, { cwd: root, env: process.env, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, ...options });
}

function commandOutput(command, args, label) {
  const result = resultStatus(run(command, args), label);
  return String(result.stdout || '').trim();
}

function gitState() {
  const branch = commandOutput('git', ['branch', '--show-current'], 'git_branch');
  return {
    branch,
    detached: !branch,
    head: commandOutput('git', ['rev-parse', 'HEAD'], 'git_head'),
    originMain: commandOutput('git', ['rev-parse', 'origin/main'], 'git_origin_main'),
    porcelain: commandOutput('git', ['status', '--porcelain'], 'git_status')
  };
}

function deploymentListArgs() {
  const project = process.env.PITCHLIST_CLOUDFLARE_PAGES_PROJECT || 'pitchlistuk';
  const args = ['--yes', 'wrangler', 'pages', 'deployment', 'list', '--project-name', project, '--json'];
  if (process.env.PITCHLIST_DEPLOY_ENV_FILE) args.push('--env-file', process.env.PITCHLIST_DEPLOY_ENV_FILE);
  return args;
}

function writeReceipt(receipt) {
  const directory = process.env.PITCHLIST_PUBLISH_RECEIPT_DIR;
  if (!directory || !path.isAbsolute(directory)) throw new Error('PITCHLIST_PUBLISH_RECEIPT_DIR_required');
  fs.mkdirSync(directory, { recursive: true });
  const target = path.join(directory, `opportunity-publish-${receipt.git_sha}.json`);
  atomicWrite(target, `${JSON.stringify(receipt, null, 2)}\n`);
  return target;
}

function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const manifestArg = args.find(arg => !arg.startsWith('--'));
  if (!manifestArg) throw new Error('Usage: node scripts/publish-reviewed-opportunities.js MANIFEST.json [--dry-run|--apply]');
  const manifestPath = path.resolve(manifestArg);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const state = gitState();
  const reviewedCommit = manifest.approval?.reviewed_commit;
  assertGitState(state, reviewedCommit);
  validateManifest(manifest, reviewedCommit);
  const snapshot = parseSnapshot(fs.readFileSync(snapshotFile, 'utf8'));
  const planned = planChanges(snapshot, manifest);
  const dryRun = { mode: 'dry-run', reviewed_commit: reviewedCommit, ...planned.summary };
  if (!apply) { console.log(JSON.stringify(dryRun, null, 2)); return; }

  if (!process.env.PITCHLIST_PUBLISH_RECEIPT_DIR || !path.isAbsolute(process.env.PITCHLIST_PUBLISH_RECEIPT_DIR)) throw new Error('PITCHLIST_PUBLISH_RECEIPT_DIR_required');

  const rollback = parseDeployments(commandOutput('npx', deploymentListArgs(), 'rollback_lookup'));
  const nextSnapshot = { ...snapshot, exported_at: new Date().toISOString(), source: `reviewed-manifest:${path.basename(manifestPath)}`, total: planned.rows.length, rows: planned.rows };
  atomicWrite(snapshotFile, serializeSnapshot(nextSnapshot));
  resultStatus(run(process.execPath, ['scripts/build.js']), 'generation');
  assertRequiredHeaders(fs.readFileSync(path.join(root, 'src/_headers'), 'utf8'), fs.readFileSync(path.join(root, 'public/_headers'), 'utf8'));
  const files = changedFilesFromPorcelain(commandOutput('git', ['status', '--porcelain'], 'git_changed_files'));
  assertAllowedChanges(files);
  for (const [command, commandArgs, label] of [
    [process.execPath, ['scripts/check.js'], 'site_check'],
    [process.execPath, ['--test', 'tests/*.test.mjs'], 'regression_tests'],
    ['git', ['diff', '--check'], 'diff_check'],
    ['sh', ['-c', 'cmp -s src/database.js public/database.js && cmp -s src/analytics.js public/analytics.js && cmp -s src/styles.css public/styles.css && cmp -s src/_headers public/_headers'], 'asset_parity']
  ]) resultStatus(run(command, commandArgs, label === 'regression_tests' ? { shell: true } : {}), label);
  resultStatus(run('git', ['add', '--', ...files]), 'git_add');
  resultStatus(run('git', ['commit', '-m', `Publish reviewed opportunities: ${manifest.review_id || path.basename(manifestPath)}`]), 'git_commit');
  const publishedSha = commandOutput('git', ['rev-parse', 'HEAD'], 'published_sha');
  resultStatus(run('git', ['push', 'origin', 'main']), 'git_push');
  resultStatus(run('npm', ['run', 'deploy:production'], { stdio: 'inherit' }), 'wrangler_deploy');
  const deployed = parseDeployments(commandOutput('npx', deploymentListArgs(), 'deployment_lookup'));
  if (deployed.source && !publishedSha.startsWith(deployed.source)) throw new Error('deployed_sha_mismatch');
  assertLiveHeaders(commandOutput('curl', ['--fail', '--silent', '--show-error', '--head', 'https://pitchlist.uk/'], 'live_header_check'));
  const receipt = { generated_at: new Date().toISOString(), git_sha: publishedSha, before_count: planned.summary.before_count, after_count: planned.summary.after_count, deployment: deployed, rollback_deployment: rollback, manifest: path.basename(manifestPath) };
  console.log(JSON.stringify({ ...receipt, receipt_file: writeReceipt(receipt) }, null, 2));
}

try { main(); } catch (error) { console.error(String(error.message || error).replace(/[^a-z0-9_.,:/ -]+/gi, '')); process.exit(1); }
