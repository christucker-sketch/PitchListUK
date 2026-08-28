'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { authorizationTokenForPromotion } = require('../lib/us-production-publish-guard');

const root = path.resolve(__dirname, '../../..');
const dataDir = path.join(root, 'operations/opportunity-pipeline/data/us');
const promotionPath = path.join(dataDir, 'texas-promotion-manifest.json');
const previewPath = path.join(dataDir, 'texas-production-preview.json');
const snapshotPath = path.join(root, 'functions/_data/us-opportunities.mjs');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: options.env || process.env,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
    maxBuffer: 20 * 1024 * 1024
  });
  if (result.error || result.signal || result.status !== 0) {
    const detail = options.capture ? String(result.stderr || result.stdout || '').trim() : '';
    throw new Error(`${command} ${args.join(' ')} failed${detail ? `: ${detail}` : ''}`);
  }
  return options.capture ? String(result.stdout || '').trim() : '';
}

function cleanupGeneratedPublic() {
  run('git', ['restore', '--worktree', '--', 'public']);
  run('git', ['clean', '-fd', '--', 'public']);
}

function branchName() {
  return `data/texas-growth-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const push = process.argv.includes('--push');
  if (push && !apply) throw new Error('--push requires --apply');

  console.log('Texas growth cycle');
  console.log(`Mode: ${apply ? 'apply' : 'preview-only'}${push ? ' + push branch' : ''}`);

  run('npm', ['run', 'staging:texas-approved']);
  run('npm', ['run', 'staging:texas-promotion']);
  run('npm', ['run', 'staging:texas-production-preview']);

  const promotionManifest = JSON.parse(fs.readFileSync(promotionPath, 'utf8'));
  const preview = JSON.parse(fs.readFileSync(previewPath, 'utf8'));
  const snapshotModule = await import(`${pathToFileURL(snapshotPath).href}?grow=${Date.now()}`);
  const before = Array.isArray(snapshotModule.usOpportunitySnapshot?.rows) ? snapshotModule.usOpportunitySnapshot.rows.length : Number(snapshotModule.usOpportunitySnapshot?.total || 0);
  const after = Array.isArray(preview?.rows) ? preview.rows.length : Number(preview?.total || 0);
  const additions = after - before;

  if (!Number.isInteger(additions) || additions < 0) throw new Error('Texas growth preview produced an invalid count delta');
  console.log(`\nTexas growth summary: ${before} -> ${after} (${additions} net-new)`);

  if (additions === 0) {
    console.log('No net-new customer-ready Texas rows. Nothing to publish.');
    return;
  }

  run('npm', ['run', 'staging:texas-production-publish']);
  if (!apply) {
    console.log('\nPreview cycle complete. Re-run with --apply to write the isolated US snapshot.');
    return;
  }

  // Previous builds/deploys can leave regenerated public/ files behind. public/ is
  // build output, not source. Return it to HEAD before the guarded apply so the
  // publisher evaluates only real source/data changes plus its known manifests.
  cleanupGeneratedPublic();

  const token = authorizationTokenForPromotion(promotionManifest);
  run('npm', ['run', 'staging:texas-production-publish', '--', '--apply'], {
    env: { ...process.env, PITCHLIST_US_PRODUCTION_WRITE_AUTHORIZATION: token }
  });

  if (!push) {
    console.log('\nTexas snapshot updated locally. Re-run with --apply --push to create and push a data branch automatically.');
    return;
  }

  const branch = branchName();
  run('git', ['switch', '-c', branch]);
  run('git', ['add', 'functions/_data/us-opportunities.mjs']);
  run('git', ['commit', '-m', `Publish ${additions} reviewed Texas opportunities`]);
  run('git', ['push', '-u', 'origin', branch]);

  console.log(`\nTexas growth branch pushed: ${branch}`);
  console.log(`Net-new opportunities: ${additions}`);
  console.log('Production deploy remains separate until the branch passes PR/CI and is merged.');
}

main().catch(error => {
  console.error(error.message || error);
  process.exit(1);
});
