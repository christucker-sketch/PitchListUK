const US_VENDOR_TERMS = [
  'vendor application',
  'vendor applications',
  'apply to be a vendor',
  'vendor registration',
  'food vendor',
  'food truck',
  'food trailer',
  'mobile food vendor',
  'concession vendor',
  'concessionaire',
  'exhibitor application',
  'booth application',
  'merchant vendor',
  'artisan vendor',
  'craft vendor',
  'maker vendor',
  'farmers market vendor',
  'market vendor',
  'street fair vendor',
  'festival vendor',
  'fair vendor',
  'holiday market vendor',
  'pop-up vendor'
];

const US_NEGATIVE_TERMS = [
  'procurement',
  'supplier registration',
  'supplier portal',
  'vendor management system',
  'government contractor',
  'contracting opportunity',
  'request for proposal',
  'request for quote',
  'invitation to bid',
  'bid solicitation',
  'doing business with',
  'approved vendor list',
  'employment',
  'job opening',
  'careers',
  'software vendor',
  'technology vendor',
  'sponsorship only',
  'become a sponsor'
];

const US_SOURCE_CLASSES = [
  'city-government',
  'county-government',
  'state-government',
  'parks-and-recreation',
  'downtown-development',
  'chamber-of-commerce',
  'tourism-organisation',
  'market-organisation',
  'festival-organisation',
  'fairgrounds',
  'convention-centre',
  'university',
  'community-organisation'
];

const TEXAS_DISCOVERY_INTENTS = [
  'vendor application festival',
  'food vendor application festival',
  'food truck vendor application',
  'market vendor application',
  'farmers market vendor application',
  'street fair vendor application',
  'exhibitor application festival',
  'booth application market',
  'artisan vendor application',
  'craft vendor application',
  'county fair vendor application',
  'state fair vendor application',
  'holiday market vendor application',
  'community event vendor application',
  'concession vendor application'
];

const TEXAS_SOURCE_PATTERNS = [
  'site:.gov Texas "vendor application" festival',
  'site:.gov Texas "food vendor application"',
  'site:.gov Texas "market vendor application"',
  'site:.org Texas "vendor application" festival',
  'site:.org Texas "food truck vendor" application',
  'site:.com Texas "vendor application" festival',
  'intitle:"vendor application" Texas festival',
  'intitle:"food vendor application" Texas',
  'inurl:vendors Texas festival apply',
  'inurl:vendor Texas market application'
];

const TEXAS_DISCOVERY_QUERIES = [
  ...TEXAS_SOURCE_PATTERNS,
  ...TEXAS_DISCOVERY_INTENTS.map(intent => `Texas ${intent}`)
];

const US_DATE_RULES = Object.freeze({
  namedMonthOrder: 'month-day-year',
  numericOrder: 'month-day-year',
  examples: ['August 27, 2027', '08/27/2027'],
  ambiguousNumericDatesRequireCountryContext: true
});

const US_VALIDATION_RULES = Object.freeze({
  requiredCountryCode: 'US',
  requiredJurisdictionPrefix: 'US-',
  pilotRegionCode: 'TX',
  requireFirstPartyEvidence: true,
  requireActionableVendorRoute: true,
  rejectProcurementAndSupplierOnboarding: true,
  rejectEmployment: true,
  rejectSponsorshipOnly: true,
  automaticPublishing: false
});

module.exports = {
  US_VENDOR_TERMS,
  US_NEGATIVE_TERMS,
  US_SOURCE_CLASSES,
  TEXAS_DISCOVERY_INTENTS,
  TEXAS_SOURCE_PATTERNS,
  TEXAS_DISCOVERY_QUERIES,
  US_DATE_RULES,
  US_VALIDATION_RULES
};
