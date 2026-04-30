const fs = require('fs');
const required = ['src/index.html', 'src/styles.css', 'scripts/build.js'];
for (const file of required) {
  if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
}
const html = fs.readFileSync('src/index.html', 'utf8');
for (const text of ['PitchList UK', 'hello@pitchlist.uk', 'No fake leads']) {
  if (!html.includes(text)) throw new Error(`Missing expected text: ${text}`);
}
console.log('Checks passed');
