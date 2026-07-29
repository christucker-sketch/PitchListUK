const fs = require('fs');
const required = ['src/index.html', 'src/buy.html', 'src/success.html', 'src/terms.html', 'src/privacy.html', 'src/festival-trader-applications.html', 'src/stall-holders-wanted.html', 'src/food-traders-wanted.html', 'src/festival-vendors-wanted.html', 'src/market-stallholder-applications.html', 'src/council-event-trader-applications.html', 'src/food-truck-pitches.html', 'src/database.html', 'src/database.js', 'src/styles.css', 'src/sitemap.xml', 'scripts/build.js', 'scripts/export-opportunities.js', 'functions/api/customer-opportunities/search.js', 'functions/api/sample-request.js', 'functions/api/billing/checkout.js', 'functions/api/billing/session.js', 'functions/api/billing/portal.js', 'functions/api/billing/webhook.js', 'functions/_lib/stripe.mjs', 'functions/_data/opportunities.mjs'];
for (const file of required) {
  if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
}
const html = fs.readFileSync('src/index.html', 'utf8');
const buy = fs.readFileSync('src/buy.html', 'utf8');
const success = fs.readFileSync('src/success.html', 'utf8');
const terms = fs.readFileSync('src/terms.html', 'utf8');
const privacy = fs.readFileSync('src/privacy.html', 'utf8');
const festival = fs.readFileSync('src/festival-trader-applications.html', 'utf8');
const stallholders = fs.readFileSync('src/stall-holders-wanted.html', 'utf8');
const foodTraders = fs.readFileSync('src/food-traders-wanted.html', 'utf8');
const festivalVendors = fs.readFileSync('src/festival-vendors-wanted.html', 'utf8');
const marketStallholders = fs.readFileSync('src/market-stallholder-applications.html', 'utf8');
const councilEvents = fs.readFileSync('src/council-event-trader-applications.html', 'utf8');
const foodTruckPitches = fs.readFileSync('src/food-truck-pitches.html', 'utf8');
const database = fs.readFileSync('src/database.html', 'utf8');
const databaseJs = fs.readFileSync('src/database.js', 'utf8');
const sitemap = fs.readFileSync('src/sitemap.xml', 'utf8');
if (sitemap.includes('https://pitchlist.uk/buy')) throw new Error('Sitemap must not include noindex page: /buy');
for (const text of ['PitchList UK', 'hello@pitchlist.uk', 'No fake leads', '/database']) {
  if (!html.includes(text)) throw new Error(`Missing expected text: ${text}`);
}
if (!html.includes('/database')) throw new Error('Homepage missing database link');
if (!html.includes('£4.99')) throw new Error('Homepage missing subscription price');
if (!html.includes('/api/sample-request')) throw new Error('Homepage missing sample request API submit');
if (html.includes('id="coverageForm" action="mailto:hello@pitchlist.uk"')) throw new Error('Homepage coverage form must not depend on mailto action');
if (!html.includes('sampleRequestStatus')) throw new Error('Homepage missing sample request status message');
for (const text of ['7-day free trial', '£4.99/month', '/database']) {
  if (!buy.includes(text)) throw new Error(`Missing buy page text: ${text}`);
}
for (const text of ['Subscription started', 'hello@pitchlist.uk']) {
  if (!success.includes(text)) throw new Error(`Missing success page text: ${text}`);
}
for (const [name, page, expected] of [
  ['festival page', festival, ['Festival Trader Applications UK', 'festival trader applications', '/#coverage']],
  ['stallholders page', stallholders, ['Stall Holders Wanted UK', 'stall holders wanted', '/#coverage']],
  ['food traders page', foodTraders, ['Food Traders Wanted UK', 'food traders wanted', '/#coverage']],
  ['festival vendors page', festivalVendors, ['Festival Vendors Wanted UK', 'festival vendors wanted', '/#coverage']],
  ['market stallholder page', marketStallholders, ['Market Stallholder Applications UK', 'market stallholder applications', '/#coverage']],
  ['council event page', councilEvents, ['Council Event Trader Applications UK', 'council event trader applications', '/#coverage']],
  ['food truck page', foodTruckPitches, ['Food Truck Pitches UK', 'food truck pitches', '/#coverage']],
]) {
  for (const text of expected) {
    if (!page.includes(text)) throw new Error(`Missing ${name} text: ${text}`);
  }
}
for (const url of ['/festival-trader-applications', '/stall-holders-wanted', '/food-traders-wanted', '/festival-vendors-wanted', '/market-stallholder-applications', '/council-event-trader-applications', '/food-truck-pitches']) {
  if (!html.includes(url)) throw new Error(`Homepage missing internal link: ${url}`);
  if (!sitemap.includes(`https://pitchlist.uk${url}`)) throw new Error(`Sitemap missing URL: ${url}`);
}
for (const text of ['Search UK Trader Opportunities', 'postcode', 'radius', '/database.js', 'Start free trial', 'savedShortlist']) {
  if (!database.includes(text)) throw new Error(`Missing database page text: ${text}`);
}
for (const text of ['100+ checked rows', '/terms', '/privacy']) {
  if (!database.includes(text)) throw new Error(`Missing database legal/proof text: ${text}`);
}
for (const text of ['PitchList UK Terms', '£4.99', 'Cancel any time', 'No guaranteed event acceptance']) {
  if (!terms.includes(text)) throw new Error(`Missing terms page text: ${text}`);
}
for (const text of ['PitchList UK Privacy Notice', 'sample requests', 'Stripe', 'hello@pitchlist.uk']) {
  if (!privacy.includes(text)) throw new Error(`Missing privacy page text: ${text}`);
}
for (const url of ['/terms', '/privacy']) {
  if (!html.includes(url)) throw new Error(`Homepage missing legal link: ${url}`);
  if (!sitemap.includes(`https://pitchlist.uk${url}`)) throw new Error(`Sitemap missing legal URL: ${url}`);
}
for (const text of ['/api/customer-opportunities/search', '/api/billing/checkout', '/api/billing/portal', 'pitchlist_saved_shortlist', 'Export CSV']) {
  if (!databaseJs.includes(text)) throw new Error(`Missing database JS text: ${text}`);
}
const functionApi = fs.readFileSync('functions/api/customer-opportunities/search.js', 'utf8');
for (const text of ['PITCHLIST_DATABASE_ACCESS_CODE', 'postcodes.io', 'haversineMiles', 'opportunitySnapshot', 'checkoutSessionAccess', 'previewRow']) {
  if (!functionApi.includes(text)) throw new Error(`Missing customer API text: ${text}`);
}
const checkoutApi = fs.readFileSync('functions/api/billing/checkout.js', 'utf8');
for (const text of ['STRIPE_SECRET_KEY', 'STRIPE_PRICE_ID', 'trial_period_days', 'payment_method_collection']) {
  if (!checkoutApi.includes(text)) throw new Error(`Missing checkout API text: ${text}`);
}
const webhookApi = fs.readFileSync('functions/api/billing/webhook.js', 'utf8');
for (const text of ['STRIPE_WEBHOOK_SECRET', 'checkout.session.completed', 'customer.subscription.updated', 'customer.subscription.deleted']) {
  if (!webhookApi.includes(text)) throw new Error(`Missing webhook API text: ${text}`);
}
const sampleRequestApi = fs.readFileSync('functions/api/sample-request.js', 'utf8');
for (const text of ['PITCHLIST_SAMPLE_WEBHOOK_URL', 'PITCHLIST_FORM_SMTP2GO_API_KEY', 'delivery_not_configured']) {
  if (!sampleRequestApi.includes(text)) throw new Error(`Missing sample request API text: ${text}`);
}
const dataModule = fs.readFileSync('functions/_data/opportunities.mjs', 'utf8');
const opportunityData = JSON.parse(dataModule.replace(/^export const opportunitySnapshot = /, '').replace(/;\s*$/, ''));
if (!Array.isArray(opportunityData.rows) || opportunityData.rows.length < 50) throw new Error('Expected at least 50 exported opportunities');
console.log('Checks passed');
