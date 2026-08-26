#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { APPROVED_SOURCES } = require('../config/sources');
const { buildSourcePromotionManifest } = require('../lib/source-onboarding');
const { runtimeRoot, atomicWriteJson } = require('../lib/staging-store');

function main() {
  const args = process.argv.slice(2);
  const value = flag => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : ''; };
  const registryArg = value('--registry');
  const outputArg = value('--output');
  const reviewedCommit = value('--reviewed-commit');
  const reviewer = value('--reviewer');
  if (!registryArg || !outputArg || !reviewedCommit || !reviewer) throw new Error('Usage: build-source-promotion-manifest.js --registry FILE --output FILE --reviewed-commit SHA --reviewer NAME');
  const root = runtimeRoot();
  const registryPath = path.resolve(root, registryArg);
  const outputPath = path.resolve(root, outputArg);
  const registryRelative = path.relative(root, registryPath);
  const relative = path.relative(root, outputPath);
  if (registryRelative.startsWith('..') || path.isAbsolute(registryRelative)) throw new Error('source_registry_must_be_in_runtime');
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('source_manifest_output_must_be_in_runtime');
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  const manifest = buildSourcePromotionManifest({ candidates: registry.records || [], reviewedCommit, reviewer, expectedSourceCount: APPROVED_SOURCES.length });
  atomicWriteJson(outputPath, manifest);
  console.log(JSON.stringify({ outputPath, manifestHash: manifest.manifest_hash, sourceCountBefore: manifest.expected_source_count_before, sourceCountAfter: manifest.expected_source_count_after, routes: manifest.routes.map(item => item.official_application_route) }, null, 2));
}

if (require.main === module) { try { main(); } catch (error) { console.error(error.message); process.exit(1); } }
