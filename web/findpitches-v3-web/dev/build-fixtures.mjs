// Builds dev/fixtures/opportunities.json from a producer export (current.jsonl as delivered to V3).
//   node dev/build-fixtures.mjs <path/to/current.jsonl> [YYYY-MM-DD]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toSiteOpportunity } from '../contract/reference/map-producer-record.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = process.argv[2];
if (!src) { console.error('usage: node dev/build-fixtures.mjs <current.jsonl> [today]'); process.exit(2); }
const today = process.argv[3] || new Date().toISOString().slice(0, 10);
const recs = fs.readFileSync(src, 'utf8').split('\n').filter(Boolean).map(JSON.parse)
  .filter(r => r.schema_version === 'findpitches-discovery-export-v1' && r.channel === 'current');
const out = { generated_from: { file: path.basename(src), records: recs.length, built_at: new Date().toISOString(), today },
  opportunities: recs.map(r => toSiteOpportunity(r, today)) };
fs.mkdirSync(path.join(here, 'fixtures'), { recursive: true });
fs.writeFileSync(path.join(here, 'fixtures', 'opportunities.json'), JSON.stringify(out));
const by = {}; out.opportunities.forEach(o => { by[o.market] = (by[o.market] || 0) + 1; });
console.log(`fixtures: ${out.opportunities.length} opportunities`, by);
