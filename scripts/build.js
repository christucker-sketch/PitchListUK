const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const out = path.join(root, 'public');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const file of ['index.html', 'styles.css']) {
  fs.copyFileSync(path.join(root, 'src', file), path.join(out, file));
}
const assetsSrc = path.join(root, 'src', 'assets');
const assetsOut = path.join(out, 'assets');
if (fs.existsSync(assetsSrc)) {
  fs.mkdirSync(assetsOut, { recursive: true });
  for (const file of fs.readdirSync(assetsSrc)) {
    fs.copyFileSync(path.join(assetsSrc, file), path.join(assetsOut, file));
  }
}
console.log('Built public site to ./public');
