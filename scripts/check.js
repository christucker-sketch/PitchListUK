const fs = require('fs');
const required = ['src/index.html', 'src/buy.html', 'src/success.html', 'src/styles.css', 'scripts/build.js'];
for (const file of required) {
  if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
}
const html = fs.readFileSync('src/index.html', 'utf8');
const buy = fs.readFileSync('src/buy.html', 'utf8');
const success = fs.readFileSync('src/success.html', 'utf8');
for (const text of ['PitchList UK', 'hello@pitchlist.uk', 'No fake leads', '/buy.html']) {
  if (!html.includes(text)) throw new Error(`Missing expected text: ${text}`);
}
for (const text of ['£19 Starter Pack', 'Pay securely with Stripe', 'https://buy.stripe.com/aFaeVdeap6Hk34s5XWfAc00']) {
  if (!buy.includes(text)) throw new Error(`Missing buy page text: ${text}`);
}
for (const text of ['Payment received', 'hello@pitchlist.uk']) {
  if (!success.includes(text)) throw new Error(`Missing success page text: ${text}`);
}
console.log('Checks passed');
