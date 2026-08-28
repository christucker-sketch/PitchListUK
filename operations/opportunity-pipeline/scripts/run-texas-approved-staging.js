import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { TEXAS_SOURCES } from '../config/texas-source-registry.js';
import { runApprovedTexasStaging } from '../lib/texas-staging-runner.js';
import liveFetch from '../lib/us-live-page-fetch.js';

const { fetchApprovedPage } = liveFetch;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outputPath = process.env.PITCHLIST_US_STAGING_OUTPUT
  || path.resolve(__dirname, '../data/us/texas-approved-manifest.json');

function sourceLabel(item) {
  return item?.source?.name
    || item?.candidate?.source?.name
    || item?.candidate?.source_id
    || item?.row?.event_name
    || item?.row?.source_url
    || item?.candidate?.url
    || 'unknown source';
}

function reasonLabel(item) {
  return item?.reason
    || item?.classification?.reason
    || item?.validation?.reason
    || item?.validation?.reasons?.join(', ')
    || item?.reasons?.join(', ')
    || item?.status
    || 'unspecified';
}

function printVerdicts(manifest) {
  if (manifest.rows?.length) {
    console.log('\nStaged:');
    for (const row of manifest.rows) console.log(`  + ${row.event_name || row.source_url}`);
  }
  if (manifest.rejected?.length) {
    console.log('\nRejected:');
    for (const item of manifest.rejected) console.log(`  - ${sourceLabel(item)} :: ${reasonLabel(item)}`);
  }
  if (manifest.held?.length) {
    console.log('\nHeld:');
    for (const item of manifest.held) console.log(`  ? ${sourceLabel(item)} :: ${reasonLabel(item)}`);
  }
  if (manifest.duplicates?.length) {
    console.log('\nDuplicates:');
    for (const item of manifest.duplicates) console.log(`  = ${sourceLabel(item)} :: duplicate`);
  }
}

const now = new Date();
const manifest = await runApprovedTexasStaging({
  sources: TEXAS_SOURCES,
  generatedAt: now.toISOString(),
  runId: `texas-approved-${now.toISOString().replace(/[:.]/g, '-')}`,
  fetchPage: candidate => fetchApprovedPage(candidate)
});

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

console.log('Texas approved-source staging complete');
console.log(`Sources: ${manifest.source_count}`);
console.log(`Discovered: ${manifest.discovered_count}`);
console.log(`Staged: ${manifest.staged_count}`);
console.log(`Rejected: ${manifest.rejected_count}`);
console.log(`Held: ${manifest.held_count}`);
console.log(`Duplicates: ${manifest.duplicate_count}`);
printVerdicts(manifest);
console.log(`\nManifest: ${outputPath}`);
console.log('Production writes: disabled');
console.log('Automatic publish: disabled');
