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

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const file of fs.readdirSync(path.join(root, 'src'))) {
  const source = path.join(root, 'src', file);
  const dest = path.join(out, file);
  copyRecursive(source, dest);
}
console.log('Built public site to ./public');
