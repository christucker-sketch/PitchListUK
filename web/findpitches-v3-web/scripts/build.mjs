// Builds dist/: exactly the files a V3 host serves (public/ copied as-is) plus dist/MANIFEST.sha256.
//   node scripts/build.mjs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'public'), out = path.join(root, 'dist');
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(src, out, { recursive: true });
const lines = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
  const p = path.join(d, e.name); if (e.isDirectory()) walk(p);
  else lines.push(crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex') + '  ' + path.relative(out, p).split(path.sep).join('/')); } })(out);
fs.writeFileSync(path.join(out, 'MANIFEST.sha256'), lines.join('\n') + '\n');
console.log(`dist/ built: ${lines.length} files`);
