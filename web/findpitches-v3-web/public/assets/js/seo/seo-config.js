/*
 * FindPitches SEO landing-page registry (offline draft).
 *
 * One registry drives every landing page. A page is a combination of:
 *   market (canonical code)  +  optional intent  +  optional region
 * e.g.  GB + stall-holders-wanted + kent  →  /uk/stall-holders-wanted/kent/
 *
 * Intents are market-neutral KEYS with localised slugs, labels and wording per market,
 * so "Stall holders wanted" (GB) and "Vendors wanted" (US) are the same intent and are
 * linked with hreflang. Filters map an intent onto FP.api search parameters.
 *
 * In production this registry should be owned server-side (it drives server-rendered pages,
 * sitemaps and redirects). The draft keeps it here so it can be reviewed and edited easily.
 */
(function () {
  const FP = (window.FP = window.FP || {});

  const INTENTS = [
    // generic: true → no filters, so intent × region would duplicate the region page. Those URLs 301 to the region page.
    { key: 'traders-wanted', filters: {}, generic: true,
      keywords: { GB: ['stall holders wanted', 'stallholders wanted', 'market traders wanted', 'traders wanted'], US: ['vendors wanted', 'vendor opportunities', 'looking for vendors'] },
      slugs: { GB: 'stall-holders-wanted', US: 'vendors-wanted', CA: 'vendors-wanted', AU: 'stallholders-wanted', IE: 'traders-wanted', NZ: 'stallholders-wanted', SG: 'vendors-wanted', HK: 'vendors-wanted' },
      labels: { GB: 'Stall holders wanted', US: 'Vendors wanted', CA: 'Vendors wanted', AU: 'Stallholders wanted', IE: 'Traders wanted', NZ: 'Stallholders wanted', SG: 'Vendors wanted', HK: 'Vendors wanted' },
      blurb: 'Every checked market, fair, festival, show and event looking for traders.' },
    { key: 'festivals', filters: { types: ['festival', 'food_festival', 'show'] },
      // festival-vendors-wanted is MERGED here (301). Its wording is kept as keyword metadata, not a second page.
      keywords: { GB: ['festival trader applications', 'festival vendors wanted', 'festival traders wanted', 'festival pitches'], US: ['festival vendor applications', 'festival vendors wanted', 'fair vendor applications'] },
      slugs: { GB: 'festival-trader-applications', US: 'festival-vendor-applications', CA: 'festival-vendor-applications', AU: 'festival-stallholder-applications', IE: 'festival-trader-applications', NZ: 'festival-stallholder-applications', SG: 'festival-vendor-applications', HK: 'festival-vendor-applications' },
      labels: { GB: 'Festival trader applications', US: 'Festival vendor applications', CA: 'Festival vendor applications', AU: 'Festival stallholder applications', IE: 'Festival trader applications', NZ: 'Festival stallholder applications', SG: 'Festival vendor applications', HK: 'Festival vendor applications' },
      blurb: 'Food festivals, music and arts festivals, county shows and fairs taking applications.' },
    { key: 'food', filters: { sells: 'food' },
      // food-truck-pitches is MERGED here (301). Its wording is kept as keyword metadata, not a second page.
      keywords: { GB: ['food traders wanted', 'food truck pitches', 'street food pitches', 'catering pitches'], US: ['food vendors wanted', 'food truck vendors wanted', 'food truck events'] },
      slugs: { GB: 'food-traders-wanted', US: 'food-vendors-wanted', CA: 'food-vendors-wanted', AU: 'food-vendors-wanted', IE: 'food-traders-wanted', NZ: 'food-vendors-wanted', SG: 'food-vendors-wanted', HK: 'food-vendors-wanted' },
      labels: { GB: 'Food traders wanted', US: 'Food vendors & food trucks wanted', CA: 'Food vendors & food trucks wanted', AU: 'Food vendors wanted', IE: 'Food traders wanted', NZ: 'Food vendors wanted', SG: 'Food vendors wanted', HK: 'Food vendors wanted' },
      blurb: 'Street food, catering, food trucks and drinks: events that want food traders.' },
    { key: 'christmas', filters: { types: ['christmas_market', 'holiday_market'] },
      keywords: { GB: ['christmas market stalls', 'christmas market traders wanted', 'christmas market pitches'], US: ['holiday market vendors', 'christmas market vendor applications'] },
      slugs: { GB: 'christmas-market-stalls', US: 'holiday-market-vendors', CA: 'holiday-market-vendors', AU: 'christmas-market-stalls', IE: 'christmas-market-stalls', NZ: 'christmas-market-stalls', SG: 'christmas-market-booths', HK: 'christmas-market-booths' },
      labels: { GB: 'Christmas market stalls', US: 'Holiday market vendors', CA: 'Holiday market vendors', AU: 'Christmas market stalls', IE: 'Christmas market stalls', NZ: 'Christmas market stalls', SG: 'Christmas market booths', HK: 'Christmas market booths' },
      blurb: 'Christmas and holiday markets looking for stallholders for the festive season.' },
    { key: 'markets', filters: { types: ['market'] },
      keywords: { GB: ['market stall opportunities', 'market stallholder applications', 'market pitches'], US: ['farmers market vendors', 'farmers market vendor applications'] },
      slugs: { GB: 'market-stall-opportunities', US: 'farmers-market-vendors', CA: 'farmers-market-vendors', AU: 'market-stalls', IE: 'market-stall-opportunities', NZ: 'market-stalls', SG: 'market-booths', HK: 'market-stalls' },
      labels: { GB: 'Market stall opportunities', US: 'Farmers market vendors', CA: 'Farmers’ market vendors', AU: 'Market stalls', IE: 'Market stall opportunities', NZ: 'Market stalls', SG: 'Market booths', HK: 'Market stalls' },
      blurb: 'Weekly, monthly and farmers’ markets with space for traders.' },
    { key: 'craft', filters: { sells: 'craft' },
      keywords: { GB: ['craft fair stall holders', 'craft fairs looking for stallholders'], US: ['craft fair vendor applications', 'craft show vendors wanted'] },
      slugs: { GB: 'craft-fair-stall-holders', US: 'craft-fair-vendor-applications', CA: 'craft-show-vendor-applications', AU: 'craft-market-stallholders', IE: 'craft-fair-traders', NZ: 'craft-market-stallholders', SG: 'craft-market-vendors', HK: 'craft-market-vendors' },
      labels: { GB: 'Craft fair stall holders', US: 'Craft fair vendor applications', CA: 'Craft show vendor applications', AU: 'Craft market stallholders', IE: 'Craft fair traders', NZ: 'Craft market stallholders', SG: 'Craft market vendors', HK: 'Craft market vendors' },
      blurb: 'Craft fairs, makers’ markets and art trails that want handmade and artisan traders.' },
    { key: 'sports', filters: { types: ['sport'] },
      keywords: { GB: ['race day traders', 'sporting event trade stands'], US: ['stadium vendors', 'sports event vendor applications', 'marathon expo vendors'] },
      slugs: { GB: 'sporting-event-traders', US: 'sports-event-vendors', CA: 'sports-event-vendors', AU: 'sporting-event-stallholders', IE: 'sporting-event-traders', NZ: 'sporting-event-stallholders', SG: 'sports-event-vendors', HK: 'sports-event-vendors' },
      labels: { GB: 'Sporting event & race day traders', US: 'Sports event & stadium vendors', CA: 'Sports event vendors', AU: 'Sporting event stallholders', IE: 'Sporting event traders', NZ: 'Sporting event stallholders', SG: 'Sports event vendors', HK: 'Sports event vendors' },
      blurb: 'Race days, rodeos, marathons, tournaments and stadium concessions.' },
    { key: 'council', filters: { organiser_types: ['council'] }, markets: ['GB'],
      slugs: { GB: 'council-event-trader-applications' }, labels: { GB: 'Council event trader applications' },
      blurb: 'Council-run events, markets and street trading pitches.' },
    { key: 'street-trading', filters: { types: ['street_trading'] }, markets: ['GB'],
      slugs: { GB: 'street-trading-pitches' }, labels: { GB: 'Street trading pitches' },
      blurb: 'Council street trading consents and permanent pitches.' }
  ];

  // Market-specific practical guidance (kept deliberately general: "organisers often ask for…").
  const GUIDANCE = {
    GB: ['public liability insurance (often £5m cover)', 'a food hygiene rating and council food business registration if you sell food', 'gas and electrical safety certificates for catering units', 'photos of your stall or unit'],
    US: ['a vendor or temporary event permit from the city or county', 'a state sales tax permit', 'a health department permit if you sell food', 'general liability insurance and photos of your booth'],
    CA: ['a municipal vendor or event permit', 'public health approval if you sell food', 'liability insurance'],
    AU: ['public liability insurance', 'council food business registration if you sell food', 'photos of your stall'],
    IE: ['public liability insurance', 'HSE/FSAI food registration if you sell food', 'casual trading licence for some public spaces'],
    NZ: ['public liability insurance', 'a food control plan or registration if you sell food', 'photos of your stall'],
    SG: ['event organiser approval and any required SFA food licence for food stalls', 'your business registration (UEN)', 'photos of your booth'],
    HK: ['organiser approval and any required FEHD licence or permit for food', 'your business registration', 'photos of your booth']
  };

  // Legacy PitchList / old FindPitches URLs → new canonical paths (301s at the edge in production).
  const LEGACY = [
    { from: 'pitchlist.uk/', to: '/uk/' },
    { from: 'pitchlist.uk/find-pitches', to: '/uk/find-pitches/' },
    { from: 'pitchlist.uk/database', to: '/uk/find-pitches/' },
    { from: 'pitchlist.uk/stall-holders-wanted', to: '/uk/stall-holders-wanted/' },
    { from: 'pitchlist.uk/festival-trader-applications', to: '/uk/festival-trader-applications/' },
    { from: 'pitchlist.uk/festival-vendors-wanted', to: '/uk/festival-trader-applications/', note: 'merged: same intent' },
    { from: 'pitchlist.uk/food-traders-wanted', to: '/uk/food-traders-wanted/' },
    { from: 'pitchlist.uk/food-truck-pitches', to: '/uk/food-traders-wanted/', note: 'merged: same intent' },
    { from: 'pitchlist.uk/market-stallholder-applications', to: '/uk/market-stall-opportunities/' },
    { from: 'pitchlist.uk/council-event-trader-applications', to: '/uk/council-event-trader-applications/' },
    { from: 'pitchlist.uk/areas/{county}', to: '/uk/{county}/', note: 'slug overrides below; unknown areas → /uk/' },
    { from: 'findpitches.com/uk/', to: '/uk/', note: 'unchanged' },
    { from: 'findpitches.com/us/', to: '/us/', note: 'unchanged' },
    { from: 'findpitches.com/us/find-pitches', to: '/us/find-pitches/', note: 'unchanged' }
  ];
  const AREA_OVERRIDES = { 'greater-london': 'london', 'antrim': 'northern-ireland', 'belfast': 'northern-ireland', 'midlands': 'midlands' };

  // Per-market page policy. SG and HK terminology is provisional (not validated with keyword data), so they get a
  // market hub only: no intent or region landing pages until Chris approves a keyword set. Both remain noindex while building.
  const MARKET_POLICY = {
    SG: { hub_only: true, note: 'Terminology provisional: hub page only until keyword research is done' },
    HK: { hub_only: true, note: 'Terminology provisional: hub page only until keyword research is done' }
  };
  // Regions that are real in the data but aren't genuine, well-defined places for a landing page.
  const NON_INDEXABLE_REGIONS = {
    'gb/midlands': 'Catch-all "Midlands" bucket in the source data. It overlaps East and West Midlands, so it isn’t a genuine area to target'
  };

  FP.seoConfig = {
    // ELIGIBILITY threshold (not the whole indexing decision): a page needs at least this many live listings before the
    // other indexability checks are even considered. Thin-content rule carried over from PitchList's SEO strategy.
    // Change it here only; nothing else hard-codes the number.
    thresholds: { eligibility_min: 3 },
    marketPolicy: MARKET_POLICY,
    nonIndexableRegions: NON_INDEXABLE_REGIONS,
    intents: INTENTS,
    guidance: GUIDANCE,
    legacy: LEGACY,
    areaOverrides: AREA_OVERRIDES,
    intentFor(market, key) { return FP.seoConfig.intentsFor(market).find(x => x.key === key) || null; },
    intentsFor(market) { if ((MARKET_POLICY[market] || {}).hub_only) return []; return INTENTS.filter(i => !i.markets || i.markets.includes(market)); },
    hubOnly(market) { return !!(MARKET_POLICY[market] || {}).hub_only; },
    bySlug(market, slug) { return FP.seoConfig.intentsFor(market).find(i => i.slugs[market] === slug) || null; }
  };
})();
