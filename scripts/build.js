const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const out = path.join(root, 'public');
function copyRecursive(source, dest) {
  const stat = fs.statSync(source);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const child of fs.readdirSync(source)) {
      copyRecursive(path.join(source, child), path.join(dest, child));
    }
    return;
  }
  fs.copyFileSync(source, dest);
}

function loadOpportunityTotal() {
  const dataFile = path.join(root, 'functions', '_data', 'opportunities.mjs');
  if (!fs.existsSync(dataFile)) return '';
  const raw = fs.readFileSync(dataFile, 'utf8')
    .replace(/^export const opportunitySnapshot = /, '')
    .replace(/;\s*$/, '');
  try {
    const parsed = JSON.parse(raw);
    return Number.isFinite(Number(parsed.total)) ? String(parsed.total) : '';
  } catch {
    return '';
  }
}

function stampHomepageCount() {
  const total = loadOpportunityTotal();
  if (!total) return;
  const indexFile = path.join(out, 'index.html');
  const html = fs.readFileSync(indexFile, 'utf8').replace(
    /(<strong id="liveDatabaseCount">)[^<]+(<\/strong>)/,
    `$1${total}$2`
  );
  fs.writeFileSync(indexFile, html);
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const file of fs.readdirSync(path.join(root, 'src'))) {
  const source = path.join(root, 'src', file);
  const dest = path.join(out, file);
  copyRecursive(source, dest);
}
stampHomepageCount();
require('./generate-seo-pages').generateSeoPages({ root, out });
console.log('Built public site to ./public');
