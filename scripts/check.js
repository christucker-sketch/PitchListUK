const fs = require('fs');
const required = ['src/index.html', 'src/buy.html', 'src/success.html', 'src/terms.html', 'src/privacy.html', 'src/festival-trader-applications.html', 'src/stall-holders-wanted.html', 'src/food-traders-wanted.html', 'src/festival-vendors-wanted.html', 'src/market-stallholder-applications.html', 'src/council-event-trader-applications.html', 'src/food-truck-pitches.html', 'src/database.html', 'src/database.js', 'src/analytics.js', 'src/activity.html', 'src/activity.js', 'src/styles.css', 'src/sitemap.xml', 'scripts/build.js', 'scripts/deploy-public-site.js', 'scripts/export-opportunities.js', 'scripts/generate-seo-pages.js', 'functions/api/customer-opportunities/search.js', 'functions/api/sample-request.js', 'functions/api/analytics/event.js', 'functions/api/analytics/summary.js', 'functions/api/billing/checkout.js', 'functions/api/billing/session.js', 'functions/api/billing/portal.js', 'functions/api/billing/webhook.js', 'functions/_lib/analytics.mjs', 'functions/_lib/email.mjs', 'functions/_lib/stripe.mjs', 'functions/_lib/vendor-profiles.mjs', 'functions/_data/opportunities.mjs'];
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
const analyticsJs = fs.readFileSync('src/analytics.js', 'utf8');
const activity = fs.readFileSync('src/activity.html', 'utf8');
const activityJs = fs.readFileSync('src/activity.js', 'utf8');
const sitemap = fs.readFileSync('src/sitemap.xml', 'utf8');
const publicHome = fs.existsSync('public/index.html') ? fs.readFileSync('public/index.html', 'utf8') : '';
const sourceHeaders = fs.readFileSync('src/_headers', 'utf8');
const publicHeaders = fs.readFileSync('public/_headers', 'utf8');
if (sourceHeaders !== publicHeaders) throw new Error('Source/generated security headers must be identical');
for (const header of ['Content-Security-Policy:', 'X-Frame-Options: DENY', 'X-Content-Type-Options: nosniff', 'Referrer-Policy: strict-origin-when-cross-origin', 'Permissions-Policy:']) {
  if (!sourceHeaders.includes(header)) throw new Error(`Missing required security header: ${header}`);
}
if (sitemap.includes('https://pitchlist.uk/buy')) throw new Error('Sitemap must not include noindex page: /buy');
if (!sitemap.includes('https://pitchlist.uk/find-pitches')) throw new Error('Sitemap missing pitch finder page');
if (/noindex/i.test(database)) throw new Error('Pitch finder page must be indexable');
if (fs.readFileSync('src/_headers', 'utf8').includes('/find-pitches')) throw new Error('Pitch finder route must not have noindex headers');
for (const text of ['PitchList UK', 'hello@pitchlist.uk', 'No fake leads', '/find-pitches']) {
  if (!html.includes(text)) throw new Error(`Missing expected text: ${text}`);
}
if (!html.includes('/find-pitches')) throw new Error('Homepage missing pitch finder link');
if (!html.includes('/areas')) throw new Error('Homepage missing area coverage link');
if (!html.includes('£4.99')) throw new Error('Homepage missing subscription price');
if (!html.includes('/styles.css?v=20260731-4')) throw new Error('Homepage stylesheet cache-bust version must be current');
if (!html.includes('liveDatabaseCount')) throw new Error('Homepage missing live opportunity count hook');
if (!html.includes('/api/customer-opportunities/search?limit=1')) throw new Error('Homepage missing live opportunity count fetch');
for (const text of ['hero-search', 'name="postcode"', 'name="radius"', 'Show my pitches', 'proof-row-list', 'This is what a row looks like', 'comparison-strip', '£4.99 a month, or an evening a week', 'faq-section', 'FAQPage']) {
  if (!html.includes(text)) throw new Error(`Homepage missing conversion structure: ${text}`);
}
for (const text of ['Fee or deadline', 'Confidence marker', 'before the deadline disappears']) {
  if (html.includes(text)) throw new Error(`Homepage must not overclaim unavailable fields/copy: ${text}`);
}
for (const text of ['/api/sample-request', 'sampleRequestStatus', 'Request a sample', 'Request free sample', 'Request 5 sample rows', '/#coverage', '/#sample', '£19']) {
  if (html.includes(text)) throw new Error(`Homepage must not include old sample funnel text: ${text}`);
}
for (const text of ['7-day free trial', '£4.99/month', '/find-pitches']) {
  if (!buy.includes(text)) throw new Error(`Missing buy page text: ${text}`);
}
for (const text of ['Subscription started', 'hello@pitchlist.uk']) {
  if (!success.includes(text)) throw new Error(`Missing success page text: ${text}`);
}
for (const [name, page, expected] of [
  ['festival page', festival, ['Festival Trader Applications UK', 'festival trader applications', '/find-pitches']],
  ['stallholders page', stallholders, ['Stall Holders Wanted UK', 'stall holders wanted', '/find-pitches']],
  ['food traders page', foodTraders, ['Food Traders Wanted UK', 'food traders wanted', '/find-pitches']],
  ['festival vendors page', festivalVendors, ['Festival Vendors Wanted UK', 'festival vendors wanted', '/find-pitches']],
  ['market stallholder page', marketStallholders, ['Market Stallholder Applications UK', 'market stallholder applications', '/find-pitches']],
  ['council event page', councilEvents, ['Council Event Trader Applications UK', 'council event trader applications', '/find-pitches']],
  ['food truck page', foodTruckPitches, ['Food Truck Pitches UK', 'food truck pitches', '/find-pitches']],
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
for (const text of ['Find UK Trader Pitches', 'postcode', 'radius', '/database.js', 'Start free trial', 'savedShortlist']) {
  if (!database.includes(text)) throw new Error(`Missing pitch finder page text: ${text}`);
}
if (!database.includes('/styles.css?v=20260731-4')) throw new Error('Pitch finder stylesheet cache-bust version must be current');
for (const text of ['Live searchable pitch finder', '/terms', '/privacy']) {
  if (!database.includes(text)) throw new Error(`Missing pitch finder legal/proof text: ${text}`);
}
for (const text of ['value="food"', 'public_listing_opt_in" type="checkbox" checked']) {
  if (database.includes(text)) throw new Error(`Database must not include risky/default filter state: ${text}`);
}
for (const text of ['Business name', 'Your name', 'Specialty', 'Regions covered', 'public vendor profile', 'Manage billing', 'Sign out', 'Any confidence']) {
  if (database.includes(text)) throw new Error(`Pitch finder signup must stay low-friction and private by default: ${text}`);
}
if (!database.includes('/database.js?v=20260820-1')) throw new Error('Pitch finder JS cache-bust version must be current');
for (const text of ['og:title', 'og:image', 'twitter:card']) {
  if (!database.includes(text)) throw new Error(`Pitch finder page missing share metadata: ${text}`);
}
for (const text of ['PitchList UK Terms', '£4.99', 'Cancel any time', 'No guaranteed event acceptance']) {
  if (!terms.includes(text)) throw new Error(`Missing terms page text: ${text}`);
}
for (const text of ['PitchList UK Privacy Notice', 'trial signups', 'Stripe', 'site activity', 'raw IP addresses', 'hello@pitchlist.uk']) {
  if (!privacy.includes(text)) throw new Error(`Missing privacy page text: ${text}`);
}
for (const url of ['/terms', '/privacy']) {
  if (!html.includes(url)) throw new Error(`Homepage missing legal link: ${url}`);
  if (!sitemap.includes(`https://pitchlist.uk${url}`)) throw new Error(`Sitemap missing legal URL: ${url}`);
}
for (const text of ['/api/customer-opportunities/search', '/api/billing/checkout', '/api/billing/portal', '/api/analytics/event', 'database_search', 'checkout_start', 'pitchlist_saved_shortlist', 'Export CSV', 'checked in last 14 days', 'result-grid', 'data-load-more', 'next_offset', 'applyInboundSearchParams', 'radius_miles', 'result-row', 'result-title']) {
  if (!databaseJs.includes(text)) throw new Error(`Missing database JS text: ${text}`);
}
for (const text of ["document.getElementById('manageBilling')", "document.getElementById('clearAccess')", "document.getElementById('databaseAccount')"]) {
  if (databaseJs.includes(text)) throw new Error(`Subscriber controls must be conditionally rendered: ${text}`);
}
const functionApi = fs.readFileSync('functions/api/customer-opportunities/search.js', 'utf8');
for (const text of ['PITCHLIST_DATABASE_ACCESS_CODE', 'postcodes.io', 'haversineMiles', 'opportunitySnapshot', 'checkoutSessionAccess', 'previewRow', 'status_summary', 'coordinate_precision', 'offset', 'next_offset', 'has_more']) {
  if (!functionApi.includes(text)) throw new Error(`Missing customer API text: ${text}`);
}
if (!functionApi.includes('previewLimit = 50')) throw new Error('Preview should show enough rows to prove coverage');
const checkoutApi = fs.readFileSync('functions/api/billing/checkout.js', 'utf8');
for (const text of ['STRIPE_SECRET_KEY', 'STRIPE_PRICE_ID', 'trial_period_days', 'payment_method_collection', 'trial_already_used', 'existing_active_access']) {
  if (!checkoutApi.includes(text)) throw new Error(`Missing checkout API text: ${text}`);
}
const webhookApi = fs.readFileSync('functions/api/billing/webhook.js', 'utf8');
for (const text of ['STRIPE_WEBHOOK_SECRET', 'checkout.session.completed', 'customer.subscription.updated', 'customer.subscription.deleted']) {
  if (!webhookApi.includes(text)) throw new Error(`Missing webhook API text: ${text}`);
}
const sampleRequestApi = fs.readFileSync('functions/api/sample-request.js', 'utf8');
for (const text of ['PITCHLIST_SAMPLE_WEBHOOK_URL', 'sendTransactionalEmail', 'delivery_not_configured']) {
  if (!sampleRequestApi.includes(text)) throw new Error(`Missing sample request API text: ${text}`);
}
const emailLib = fs.readFileSync('functions/_lib/email.mjs', 'utf8');
for (const text of ['SMTP2GO_API_KEY', 'x-smtp2go-api-key', 'subscriber_access_link', 'subscriber_welcome', 'email_provider_timeout']) {
  if (!emailLib.includes(text)) throw new Error(`Missing transactional email service text: ${text}`);
}
const analyticsLib = fs.readFileSync('functions/_lib/analytics.mjs', 'utf8');
for (const text of ['PITCHLIST_ANALYTICS_KV', 'PITCHLIST_ANALYTICS_TOKEN', 'analytics:event:', 'summariseAnalytics', 'database_search']) {
  if (!analyticsLib.includes(text)) throw new Error(`Missing analytics library text: ${text}`);
}
for (const text of ['/api/analytics/event', 'page_view', 'database_cta_click', 'sendBeacon']) {
  if (!analyticsJs.includes(text)) throw new Error(`Missing analytics JS text: ${text}`);
}
for (const text of ['PitchList Activity Monitor', '/api/analytics/summary', 'Campaigns', 'Recent pitch finder searches']) {
  if (!activity.includes(text) && !activityJs.includes(text)) throw new Error(`Missing activity monitor text: ${text}`);
}
if (publicHome && !publicHome.includes('/analytics.js?v=20260809-1')) {
  throw new Error('Built homepage missing analytics script');
}
const dataModule = fs.readFileSync('functions/_data/opportunities.mjs', 'utf8');
const opportunityData = JSON.parse(dataModule.replace(/^export const opportunitySnapshot = /, '').replace(/;\s*$/, ''));
if (!Array.isArray(opportunityData.rows) || opportunityData.rows.length < 50) throw new Error('Expected at least 50 exported opportunities');
if (publicHome && !publicHome.includes(`<strong id="liveDatabaseCount">${opportunityData.total}</strong>`)) {
  throw new Error('Built homepage fallback count must match exported opportunity total');
}
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
  if (/Autumn Festival registration|Culture Litter Markets Parks|Download food and vendor application form/i.test(row.event_name || row.organiser || '')) {
    throw new Error(`Export includes missed title rewrite: ${row.event_name}`);
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
