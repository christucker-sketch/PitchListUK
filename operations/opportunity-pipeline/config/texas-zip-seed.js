const TEXAS_ZIP_PREFIXES = new Set([
  '733','750','751','752','753','754','755','756','757','758','759','760','761','762','763','764','765','766','767','768','769','770','772','773','774','775','776','777','778','779','780','781','782','783','784','785','786','787','788','789','790','791','792','793','794','795','796','797','798','799','885'
]);

// ZIP3 is a routing heuristic, not an exact state boundary. 739 is generally
// routed with Oklahoma, but 73960 is a Texas ZIP (Texhoma, Sherman County).
// Keep exact exceptions separate so final state authority still comes from
// the offline ZIP index record when coordinates are resolved.
const TEXAS_ZIP_EXCEPTIONS = new Set(['73960']);

// Pilot-only offline centroids for the initial Texas metros.
// This seed is deliberately small; the resolver also accepts an injected full ZIP index.
const TEXAS_PILOT_ZIPS = Object.freeze({
  '78701': { city: 'Austin', state_code: 'TX', state_name: 'Texas', latitude: 30.2711, longitude: -97.7437 },
  '77002': { city: 'Houston', state_code: 'TX', state_name: 'Texas', latitude: 29.7559, longitude: -95.3652 },
  '75201': { city: 'Dallas', state_code: 'TX', state_name: 'Texas', latitude: 32.7876, longitude: -96.7994 },
  '78205': { city: 'San Antonio', state_code: 'TX', state_name: 'Texas', latitude: 29.4241, longitude: -98.4936 },
  '76102': { city: 'Fort Worth', state_code: 'TX', state_name: 'Texas', latitude: 32.7555, longitude: -97.3308 },
  '79901': { city: 'El Paso', state_code: 'TX', state_name: 'Texas', latitude: 31.7587, longitude: -106.4869 }
});

module.exports = { TEXAS_ZIP_PREFIXES, TEXAS_ZIP_EXCEPTIONS, TEXAS_PILOT_ZIPS };
