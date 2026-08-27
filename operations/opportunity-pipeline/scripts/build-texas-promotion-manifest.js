import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { TEXAS_PILOT_SOURCES } from '../config/texas-pilot-sources.js';

const require = createRequire(import.meta.url);
const { buildTexasPromotionManifest, verifyTexasPromotionManifest } = require('../lib/us-promotion-manifest');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const inputPath = process.env.PITCHLIST_US_STAGING_INPUT
  || path.resolve(__dirname, '../data/us/texas-approved-manifest.json');
const outputPath = process.env.PITCHLIST_US_PROMOTION_OUTPUT
  || path.resolve(__dirname, '../data/us/texas-promotion-manifest.json');

const stagingManifest = JSON.parse(await fs.readFile(inputPath, 'utf8'));
const promotionManifest = buildTexasPromotionManifest(stagingManifest, { sources: TEXAS_PILOT_SOURCES });
verifyTexasPromotionManifest(promotionManifest, stagingManifest, { sources: TEXAS_PILOT_SOURCES });

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(promotionManifest, null, 2)}\n`, 'utf8');

console.log('Texas controlled promotion manifest built');
console.log(`Input: ${inputPath}`);
console.log(`Output: ${outputPath}`);
console.log(`Expected additions: ${promotionManifest.expected_additions}`);
console.log(`Approved sources: ${promotionManifest.approved_source_ids.join(', ')}`);
console.log(`Held sources: ${promotionManifest.held_source_ids.join(', ')}`);
console.log(`Staging SHA256: ${promotionManifest.staging_manifest_sha256}`);
console.log(`Rows SHA256: ${promotionManifest.rows_sha256}`);
console.log('Automatic publish: disabled');
console.log('Production write authorized: false');
