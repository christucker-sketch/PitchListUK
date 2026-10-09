// Fails (exit 1) if anything in this package depends on, points at or embeds V1/V2 systems, the old repository,
// mock data from earlier builds, or a third-party runtime resource; or if a page references a file that isn't here.
//   node scripts/check-independence.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SELF = path.join('scripts', 'check-independence.mjs');
const files = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name);
  if (e.isDirectory()) { if (!['node_modules', 'dist', '.git'].includes(e.name)) walk(p); } else files.push(path.relative(root, p)); } })(root);
const textual = f => /\.(html|js|mjs|css|json|md|txt|py|toml|sh)$/.test(f);
const FORBIDDEN = [
  [/findpitches-v2/i, 'V2 Worker / project'], [/findpitches-web\.pages\.dev/i, 'old Pages deployment'], [/pitchlistuk\b/i, 'V1 Pages project'],
  [/api\.findpitches\.com/i, 'V2 customer API host'], [/v2-client|V2_API_|WEB_DB|v2 customer api/i, 'V2 API layer'],
  [/PitchListUK/, 'V1/V2 repository'], [/\/v1\/(markets|regions|opportunities)/, 'V2 /v1 endpoints'],
  [/mock\/fixtures|mock-api\.js|live-api\.js|finder-live|draft-tools\.js/, 'pre-V3 draft/V2 files'],
  [/\bOPP-\d{5}\b|opp_us_[0-9a-f]{6}|opp_3cee/, 'mock listing ids from earlier builds'],
  [/fonts\.googleapis|fonts\.gstatic/, 'third-party font CDN'], [/[A-Z]:\\\\Users\\\\|OneDrive -/, 'path on a developer PC'],
  [/workers\.dev/i, 'non-V3 worker host']
];
// Allowed mentions: the legacy pitchlist.uk → /uk/ redirect DATA (SEO), and documentation that explains what was removed.
const DOCS = /\.md$/;
const problems = [];
for (const f of files) {
  if (f === SELF || !textual(f)) continue;
  const s = fs.readFileSync(path.join(root, f), 'utf8');
  for (const [re, what] of FORBIDDEN) if (re.test(s) && !DOCS.test(f)) problems.push(`${f}: ${what} (${s.match(re)[0]})`);
  if (/pitchlist/i.test(s) && !DOCS.test(f) && !/seo-config\.js$|seo-core\.js$|seo-edge\.mjs$/.test(f)) problems.push(`${f}: mentions PitchList outside the legacy redirect data`);
}
// Browser-side external resources: none allowed except plain outbound hyperlinks and schema.org/canonical identifiers.
for (const f of files.filter(f => f.startsWith('public' + path.sep) && /\.(html|css|js)$/.test(f))) {
  const s = fs.readFileSync(path.join(root, f), 'utf8');
  for (const m of s.matchAll(/(?:src|href)=["'](https?:)?\/\/[^"']+["']|url\((["']?)https?:\/\/[^)]+\)|@import\s+["']?https?:/g)) {
    const tag = s.slice(Math.max(0, m.index - 40), m.index);
    const isLink = /<a\b[^>]*$/.test(tag) || /<link rel="canonical"/.test(tag);
    if (!isLink) problems.push(`${f}: external resource ${m[0].slice(0, 80)}`);
  }
}
// Every local src/href in the pages must exist in public/.
for (const f of files.filter(f => f.startsWith('public' + path.sep) && f.endsWith('.html'))) {
  const s = fs.readFileSync(path.join(root, f), 'utf8');
  for (const m of s.matchAll(/(?:src|href)="([^"#?:]+)(?:[?#][^"]*)?"/g)) {
    const ref = m[1]; if (!ref || ref.startsWith('/') && ref.length === 1) continue;
    const target = path.join(root, 'public', ref.replace(/^\//, ''));
    if (!fs.existsSync(target)) problems.push(`${f}: missing local file ${ref}`);
  }
}
for (const f of files.filter(f => f.startsWith(path.join('public', 'assets', 'css')) && f.endsWith('.css'))) {
  const s = fs.readFileSync(path.join(root, f), 'utf8');
  for (const m of s.matchAll(/url\((["']?)([^)"']+)\1\)/g)) { if (/^(data:|https?:)/.test(m[2])) continue;
    if (!fs.existsSync(path.join(root, path.dirname(f), m[2]))) problems.push(`${f}: missing ${m[2]}`); }
}
if (problems.length) { console.error('INDEPENDENCE CHECK FAILED\n' + problems.map(p => ' - ' + p).join('\n')); process.exit(1); }
console.log(`independence check passed: ${files.length} files scanned; no V1/V2, old-repo, mock-id, CDN or missing-file references`);
