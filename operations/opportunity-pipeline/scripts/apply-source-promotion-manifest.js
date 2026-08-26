#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const child = require('node:child_process');
const { APPROVED_SOURCES, sourceRuleFor } = require('../config/sources');
const { validateSourcePromotionManifest } = require('../lib/source-onboarding');

const ROOT = path.resolve(__dirname, '../../..');
const REGISTRY = path.join(ROOT, 'operations/opportunity-pipeline/config/approved-source-routes.json');

function git(...args) {
  const result = child.spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`source_promotion_git_${args[0]}_failed`);
  return result.stdout.trim();
}

function assertWorktree(manifestPath) {
  const head = git('rev-parse', 'HEAD');
  if (head !== JSON.parse(fs.readFileSync(manifestPath, 'utf8')).reviewed_commit) throw new Error('source_manifest_sha_mismatch');
  const dirty = git('status', '--porcelain');
  if (dirty) throw new Error('source_promotion_refused_dirty_worktree');
  return head;
}

function applyManifest(manifest, existing, options = {}) {
  validateSourcePromotionManifest(manifest, { reviewedCommit: options.reviewedCommit, currentSourceCount: options.currentSourceCount });
  const routes = [...existing];
  const urls = new Set(routes.map(item => item.official_application_route));
  for (const route of manifest.routes) {
    if (sourceRuleFor(route.official_application_route).approved) throw new Error(`source_promotion_duplicate_approved_route:${route.official_application_route}`);
    if (urls.has(route.official_application_route)) throw new Error(`source_promotion_duplicate_route:${route.official_application_route}`);
    urls.add(route.official_application_route);
    routes.push({
      host: route.host, organisation: route.organisation, type: route.type, terms_policy: route.terms_policy,
      geographic_coverage: route.geographic_coverage, opportunity_type: route.opportunity_type,
      official_application_route: route.official_application_route, recurring: route.recurring,
      recommended_polling_days: route.recommended_polling_days, opportunity_title: route.opportunity_title,
      source_path_prefix: route.source_path_prefix, approval_evidence_hash: route.evidence_hash,
      approval_decision: route.decision, approval_manifest_hash: manifest.manifest_hash
    });
  }
  return routes.sort((a, b) => a.official_application_route.localeCompare(b.official_application_route));
}

function main() {
  const manifestArg = process.argv[2];
  if (!manifestArg) throw new Error('Usage: apply-source-promotion-manifest.js MANIFEST [--apply]');
  const manifestPath = path.resolve(manifestArg);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const currentSourceCount = APPROVED_SOURCES.length;
  validateSourcePromotionManifest(manifest, { reviewedCommit: manifest.reviewed_commit, currentSourceCount });
  const existing = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
  const next = applyManifest(manifest, existing, { reviewedCommit: manifest.reviewed_commit, currentSourceCount });
  if (!process.argv.includes('--apply')) {
    console.log(JSON.stringify({ mode: 'dry-run', manifestHash: manifest.manifest_hash, sourceCountBefore: currentSourceCount, sourceCountAfter: currentSourceCount + manifest.routes.length, routes: manifest.routes.map(item => item.official_application_route) }, null, 2));
    return;
  }
  assertWorktree(manifestPath);
  const temporary = `${REGISTRY}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`);
  fs.renameSync(temporary, REGISTRY);
  console.log(JSON.stringify({ mode: 'applied', registry: REGISTRY, added: manifest.routes.length, sourceCountAfter: currentSourceCount + manifest.routes.length, removals: 0 }, null, 2));
}

if (require.main === module) { try { main(); } catch (error) { console.error(error.message); process.exit(1); } }
module.exports = { applyManifest };
