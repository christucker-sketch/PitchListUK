'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { planTexasProductionSnapshot } = require('../lib/us-promotion-apply');

async function main() {
  const root = path.resolve(__dirname, '../../..');
  const stagingPath = process.env.PITCHLIST_US_STAGING_INPUT || path.join(root, 'operations/opportunity-pipeline/data/us/texas-approved-manifest.json');
  const promotionPath = process.env.PITCHLIST_US_PROMOTION_INPUT || path.join(root, 'operations/opportunity-pipeline/data/us/texas-promotion-manifest.json');
  const snapshotPath = path.join(root, 'functions/_data/us-opportunities.mjs');
  const outputPath = process.env.PITCHLIST_US_PRODUCTION_PREVIEW || path.join(root, 'operations/opportunity-pipeline/data/us/texas-production-preview.json');

  const stagingManifest = JSON.parse(fs.readFileSync(stagingPath, 'utf8'));
  const promotionManifest = JSON.parse(fs.readFileSync(promotionPath, 'utf8'));
  const snapshotModule = await import(`${pathToFileURL(snapshotPath).href}?preview=${Date.now()}`);
  const { TEXAS_PILOT_SOURCES } = await import(`${pathToFileURL(path.join(root, 'operations/opportunity-pipeline/config/texas-pilot-sources.js')).href}?preview=${Date.now()}`);
  const planned = planTexasProductionSnapshot(snapshotModule.usOpportunitySnapshot, promotionManifest, stagingManifest, { sources: TEXAS_PILOT_SOURCES });

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(planned.preview, null, 2)}\n`, 'utf8');

  console.log('Texas isolated production apply preview built');
  console.log(`Before: ${planned.summary.before_count}`);
  console.log(`After: ${planned.summary.after_count}`);
  console.log(`Additions: ${planned.summary.additions}`);
  console.log(`IDs: ${planned.summary.added_ids.join(', ')}`);
  console.log(`Preview: ${outputPath}`);
  console.log('UK production snapshot: unchanged');
  console.log('Production write authorized: false');
  console.log('Deploy authorized: false');
}

main().catch(error => { console.error(error.message || error); process.exit(1); });
