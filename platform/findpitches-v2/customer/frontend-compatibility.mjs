// Compatibility mapper for the existing customer/API shape.
// It keeps the familiar scalar fields while exposing precision/completeness
// separately so the front end does not dictate canonical evidence modelling.
export function toFrontendCompatibleOpportunity(projected = {}) {
  const opportunity=projected.opportunity||{};
  const readiness=projected.readiness||{};
  return Object.freeze({
    id:opportunity.id??null,
    market:opportunity.market??null,
    title:opportunity.title??null,
    organiser:opportunity.organiser??null,
    region_code:opportunity.region_code??null,
    location:opportunity.location??null,
    event_start:opportunity.event_start??null,
    event_end:opportunity.event_end??null,
    application_deadline:opportunity.application_deadline??null,
    canonical_url:opportunity.canonical_url??null,
    application_url:opportunity.application_url??null,
    last_checked:opportunity.last_checked??null,
    metadata:Object.freeze({
      location_precision:opportunity.location_precision??null,
      location_confidence:opportunity.location_confidence??null,
      venue_verified:Boolean(opportunity.venue_verified),
      usable:Boolean(readiness.ready),
      completeness:Object.freeze({
        venue:Boolean(readiness.completeness?.venue),
        event_date:Boolean(readiness.completeness?.event_date),
        application_deadline:Boolean(readiness.completeness?.application_deadline)
      }),
      schema_version:readiness.schema_version??null
    })
  });
}
