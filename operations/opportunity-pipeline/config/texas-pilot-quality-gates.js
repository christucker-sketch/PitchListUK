export const TEXAS_PILOT_QUALITY_GATES = Object.freeze({
  require_first_party_source: true,
  require_actionable_vendor_route: true,
  require_country_code: 'US',
  require_region_code: 'TX',
  reject_regulatory_only: true,
  reject_procurement: true,
  reject_supplier_onboarding: true,
  automatic_publish: false,
  production_writes: false,
});
