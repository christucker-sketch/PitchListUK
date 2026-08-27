import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { TEXAS_PILOT_SOURCES } from '../config/texas-pilot-sources.js';
import { runApprovedTexasStaging } from '../lib/texas-staging-runner.js';
import liveFetch from '../lib/us-live-page-fetch.js';

const { fetchApprovedPage } = liveFetch;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outputPath = process.env.PITCHLIST_US_STAGING_OUTPUT
  || path.resolve(__dirname, '../data/us/texas-approved-manifest.json');

const now = new Date();
const manifest = await runApprovedTexasStaging({
  sources: TEXAS_PILOT_SOURCES,
  generatedAt: now.toISOString(),
  runId: `texas-approved-${now.toISOString().replace(/[:.]/g, '-')}`,
  fetchPage: candidate => fetchApprovedPage(candidate)
});

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

console.log(`Texas approved-source staging complete`);
console.log(`Sources: ${manifest.source_count}`);
console.log(`Discovered: ${manifest.discovered_count}`);
console.log(`Staged: ${manifest.staged_count}`);
console.log(`Rejected: ${manifest.rejected_count}`);
console.log(`Held: ${manifest.held_count}`);
console.log(`Duplicates: ${manifest.duplicate_count}`);
console.log(`Manifest: ${outputPath}`);
console.log('Production writes: disabled');
console.log('Automatic publish: disabled');
