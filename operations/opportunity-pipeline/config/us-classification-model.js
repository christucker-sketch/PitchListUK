const US_VENDOR_CATEGORIES = [
  { id: 'food_truck', label: 'Food truck', terms: ['food truck', 'food trucks'] },
  { id: 'food_vendor', label: 'Food vendor', terms: ['food vendor', 'food vendors', 'caterer', 'catering vendor', 'concessionaire', 'concession vendor'] },
  { id: 'craft_vendor', label: 'Craft vendor', terms: ['craft vendor', 'artisan vendor', 'maker vendor', 'handmade vendor'] },
  { id: 'market_vendor', label: 'Market vendor', terms: ['market vendor', 'farmers market vendor', "farmer's market vendor", 'flea market vendor'] },
  { id: 'exhibitor', label: 'Exhibitor', terms: ['exhibitor', 'booth vendor', 'booth application'] },
  { id: 'general_vendor', label: 'Vendor', terms: ['vendor application', 'vendors wanted', 'vendor registration', 'apply to be a vendor'] }
];

const RECURRING_TERMS = [
  'every saturday', 'every sunday', 'weekly market', 'monthly market', 'year-round market',
  'year round market', 'recurring market', 'ongoing vendor applications'
];

const APPLICATION_TERMS = [
  'vendor application', 'apply to be a vendor', 'vendor applications', 'vendor registration',
  'food vendor application', 'food truck application', 'booth application', 'exhibitor application',
  'concession application', 'market vendor application'
];

const DEADLINE_TERMS = ['application deadline', 'apply by', 'deadline', 'applications close', 'vendor deadline'];

module.exports = {
  US_VENDOR_CATEGORIES,
  RECURRING_TERMS,
  APPLICATION_TERMS,
  DEADLINE_TERMS
};
