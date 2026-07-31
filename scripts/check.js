const fs = require('fs');
const required = ['src/index.html', 'src/buy.html', 'src/success.html', 'src/terms.html', 'src/privacy.html', 'src/festival-trader-applications.html', 'src/stall-holders-wanted.html', 'src/food-traders-wanted.html', 'src/festival-vendors-wanted.html', 'src/market-stallholder-applications.html', 'src/council-event-trader-applications.html', 'src/food-truck-pitches.html', 'src/database.html', 'src/database.js', 'src/styles.css', 'src/sitemap.xml', 'scripts/build.js', 'scripts/export-opportunities.js', 'scripts/generate-seo-pages.js', 'functions/api/customer-opportunities/search.js', 'functions/api/sample-request.js', 'functions/api/billing/checkout.js', 'functions/api/billing/session.js', 'functions/api/billing/portal.js', 'functions/api/billing/webhook.js', 'functions/_lib/stripe.mjs', 'functions/_lib/vendor-profiles.mjs', 'functions/_data/opportunities.mjs'];
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
if (!sitemap.includes('https://pitchlist.uk/database')) throw new Error('Sitemap missing database page');
if (/noindex/i.test(database)) throw new Error('Database page must be indexable');
if (fs.readFileSync('src/_headers', 'utf8').includes('/database')) throw new Error('Database route must not have noindex headers');
for (const text of ['PitchList UK', 'hello@pitchlist.uk', 'No fake leads', '/database']) {
  if (!html.includes(text)) throw new Error(`Missing expected text: ${text}`);
}
if (!html.includes('/database')) throw new Error('Homepage missing database link');
if (!html.includes('/areas')) throw new Error('Homepage missing area coverage link');
if (!html.includes('£4.99')) throw new Error('Homepage missing subscription price');
if (!html.includes('liveDatabaseCount')) throw new Error('Homepage missing live database count hook');
if (!html.includes('/api/customer-opportunities/search?limit=1')) throw new Error('Homepage missing live database count fetch');
for (const text of ['/api/sample-request', 'sampleRequestStatus', 'Request a sample', 'Request free sample', 'Request 5 sample rows', '/#coverage', '/#sample', '£19']) {
  if (html.includes(text)) throw new Error(`Homepage must not include old sample funnel text: ${text}`);
}
for (const text of ['7-day free trial', '£4.99/month', '/database']) {
  if (!buy.includes(text)) throw new Error(`Missing buy page text: ${text}`);
}
for (const text of ['Subscription started', 'hello@pitchlist.uk']) {
  if (!success.includes(text)) throw new Error(`Missing success page text: ${text}`);
}
for (const [name, page, expected] of [
  ['festival page', festival, ['Festival Trader Applications UK', 'festival trader applications', '/database']],
  ['stallholders page', stallholders, ['Stall Holders Wanted UK', 'stall holders wanted', '/database']],
  ['food traders page', foodTraders, ['Food Traders Wanted UK', 'food traders wanted', '/database']],
  ['festival vendors page', festivalVendors, ['Festival Vendors Wanted UK', 'festival vendors wanted', '/database']],
  ['market stallholder page', marketStallholders, ['Market Stallholder Applications UK', 'market stallholder applications', '/database']],
  ['council event page', councilEvents, ['Council Event Trader Applications UK', 'council event trader applications', '/database']],
  ['food truck page', foodTruckPitches, ['Food Truck Pitches UK', 'food truck pitches', '/database']],
]) {
  for (const text of expected) {
    if (!page.includes(text)) throw new Error(`Missing ${name} text: ${text}`);
  }
  for (const text of ['Request free sample', 'Request 5 sample rows', 'Request sample rows', '/#coverage', '/#sample', '£19']) {
    if (page.includes(text)) throw new Error(`${name} must not include old sample funnel text: ${text}`);
  }
}
for (const url of ['/festival-trader-applications', '/stall-holders-wanted', '/food-traders-wanted', '/festival-vendors-wanted', '/market-stallholder-applications', '/council-event-trader-applications', '/food-truck-pitches']) {
  if (!html.includes(url)) throw new Error(`Homepage missing internal link: ${url}`);
  if (!sitemap.includes(`https://pitchlist.uk${url}`)) throw new Error(`Sitemap missing URL: ${url}`);
}
for (const text of ['Search UK Trader Opportunities', 'postcode', 'radius', '/database.js', 'Start free trial', 'savedShortlist']) {
  if (!database.includes(text)) throw new Error(`Missing database page text: ${text}`);
}
for (const text of ['Live searchable database', '/terms', '/privacy']) {
  if (!database.includes(text)) throw new Error(`Missing database legal/proof text: ${text}`);
}
for (const text of ['value="food"', 'public_listing_opt_in" type="checkbox" checked']) {
  if (database.includes(text)) throw new Error(`Database must not include risky/default filter state: ${text}`);
}
for (const text of ['Business name', 'Your name', 'Specialty', 'Regions covered', 'public vendor profile']) {
  if (database.includes(text)) throw new Error(`Database signup must stay low-friction and private by default: ${text}`);
}
if (!database.includes('/database.js?v=20260731-4')) throw new Error('Database JS cache-bust version must be current');
for (const text of ['og:title', 'og:image', 'twitter:card']) {
  if (!database.includes(text)) throw new Error(`Database page missing share metadata: ${text}`);
}
for (const text of ['PitchList UK Terms', '£4.99', 'Cancel any time', 'No guaranteed event acceptance']) {
  if (!terms.includes(text)) throw new Error(`Missing terms page text: ${text}`);
}
for (const text of ['PitchList UK Privacy Notice', 'trial signups', 'Stripe', 'hello@pitchlist.uk']) {
  if (!privacy.includes(text)) throw new Error(`Missing privacy page text: ${text}`);
}
for (const url of ['/terms', '/privacy']) {
  if (!html.includes(url)) throw new Error(`Homepage missing legal link: ${url}`);
  if (!sitemap.includes(`https://pitchlist.uk${url}`)) throw new Error(`Sitemap missing legal URL: ${url}`);
}
for (const text of ['/api/customer-opportunities/search', '/api/billing/checkout', '/api/billing/portal', 'pitchlist_saved_shortlist', 'Export CSV', 'checked in last 14 days', 'result-grid', 'data-load-more', 'next_offset']) {
  if (!databaseJs.includes(text)) throw new Error(`Missing database JS text: ${text}`);
}
const functionApi = fs.readFileSync('functions/api/customer-opportunities/search.js', 'utf8');
for (const text of ['PITCHLIST_DATABASE_ACCESS_CODE', 'postcodes.io', 'haversineMiles', 'opportunitySnapshot', 'checkoutSessionAccess', 'previewRow', 'status_summary', 'coordinate_precision', 'offset', 'next_offset', 'has_more']) {
  if (!functionApi.includes(text)) throw new Error(`Missing customer API text: ${text}`);
}
if (!functionApi.includes('previewLimit = 50')) throw new Error('Preview should show enough rows to prove coverage');
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
for (const row of opportunityData.rows) {
  const text = [row.event_name, row.organiser, row.source_url, row.application_url].join(' ');
  if (/downtownkentwa|farmingvillechamber|visitsuffolkva|smmarket\.org|essexct|londonderrynh|watersidedistrict|downtownnorfolk|pitchlist\.uk|festfinder|pitchmarketsandeventsuk|kfma|moderngov|streetfoodfests|certificates\.lsba|spaceandpeople|britisheventcatering|foodmarketplace|themarketwfd|youtube|whatsonni/i.test(text)) {
    throw new Error(`Export includes non-UK leakage: ${row.event_name}`);
  }
  if (/skip to main content|skip to content|to help us give you the best experience|accept all|your privacy|lorem ipsum|save changes close|our food hall|showcasing local makers/i.test(row.event_name || '')) {
    throw new Error(`Export includes boilerplate title: ${row.event_name}`);
  }
  if (/\b(policy|guidance|checklist|terms and conditions|licensing policy|glossary|case study)\b/i.test(row.event_name || '')) {
    throw new Error(`Export includes non-opportunity title: ${row.event_name}`);
  }
  if (/^(ireland|unknown)$/i.test(row.county || row.region || '')) {
    throw new Error(`Export includes invalid public area: ${row.event_name}`);
  }
  if (/^(street trading|apply to trade|pop-up events|retail services|vendor application|food and drink vendors)$/i.test(row.event_name || '') && !row.organiser) {
    throw new Error(`Export includes generic title with no organiser: ${row.event_name}`);
  }
}
if (fs.existsSync('public/areas')) {
  for (const file of fs.readdirSync('public/areas').filter(name => name.endsWith('.html') && name !== 'index.html')) {
    const areaHtml = fs.readFileSync(`public/areas/${file}`, 'utf8');
    const slug = file.replace(/\.html$/, '');
    if (/noindex/i.test(areaHtml) && sitemap.includes(`https://pitchlist.uk/areas/${slug}`)) {
      throw new Error(`Sitemap includes noindexed area page: ${slug}`);
    }
  }
}
const generator = fs.readFileSync('scripts/generate-seo-pages.js', 'utf8');
for (const text of ['generateSeoPages', '/areas', 'UK_EXCLUDED_AREAS', 'CollectionPage']) {
  if (!generator.includes(text)) throw new Error(`Missing SEO generator text: ${text}`);
}
console.log('Checks passed');
