const fs = require('fs');
const required = ['src/index.html', 'src/buy.html', 'src/success.html', 'src/festival-trader-applications.html', 'src/stall-holders-wanted.html', 'src/food-traders-wanted.html', 'src/festival-vendors-wanted.html', 'src/styles.css', 'src/sitemap.xml', 'scripts/build.js'];
for (const file of required) {
  if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
}
const html = fs.readFileSync('src/index.html', 'utf8');
const buy = fs.readFileSync('src/buy.html', 'utf8');
const success = fs.readFileSync('src/success.html', 'utf8');
const festival = fs.readFileSync('src/festival-trader-applications.html', 'utf8');
const stallholders = fs.readFileSync('src/stall-holders-wanted.html', 'utf8');
const foodTraders = fs.readFileSync('src/food-traders-wanted.html', 'utf8');
const festivalVendors = fs.readFileSync('src/festival-vendors-wanted.html', 'utf8');
const sitemap = fs.readFileSync('src/sitemap.xml', 'utf8');
if (sitemap.includes('https://pitchlist.uk/buy')) throw new Error('Sitemap must not include noindex page: /buy');
for (const text of ['PitchList UK', 'hello@pitchlist.uk', 'No fake leads', '/buy']) {
  if (!html.includes(text)) throw new Error(`Missing expected text: ${text}`);
}
for (const text of ['£19 Starter Pack', 'Pay securely with Stripe', 'https://buy.stripe.com/aFaeVdeap6Hk34s5XWfAc00']) {
  if (!buy.includes(text)) throw new Error(`Missing buy page text: ${text}`);
}
for (const text of ['Payment received', 'hello@pitchlist.uk']) {
  if (!success.includes(text)) throw new Error(`Missing success page text: ${text}`);
}
for (const [name, page, expected] of [
  ['festival page', festival, ['Festival Trader Applications UK', 'festival trader applications', '/#coverage']],
  ['stallholders page', stallholders, ['Stall Holders Wanted UK', 'stall holders wanted', '/#coverage']],
  ['food traders page', foodTraders, ['Food Traders Wanted UK', 'food traders wanted', '/#coverage']],
  ['festival vendors page', festivalVendors, ['Festival Vendors Wanted UK', 'festival vendors wanted', '/#coverage']],
]) {
  for (const text of expected) {
    if (!page.includes(text)) throw new Error(`Missing ${name} text: ${text}`);
  }
}
for (const url of ['/festival-trader-applications', '/stall-holders-wanted', '/food-traders-wanted', '/festival-vendors-wanted']) {
  if (!html.includes(url)) throw new Error(`Homepage missing internal link: ${url}`);
  if (!sitemap.includes(`https://pitchlist.uk${url}`)) throw new Error(`Sitemap missing URL: ${url}`);
}
console.log('Checks passed');
