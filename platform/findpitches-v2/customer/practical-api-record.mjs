// Compatibility adapter for the existing customer/front-end shape.
// The canonical practical model owns evidence/precision; the UI still receives
// a scalar location while optional metadata describes what that location means.
export function practicalApiRecord(projected={}) {
 const opportunity=projected?.opportunity||{};
 const readiness=projected?.readiness||{};
 const provenance=projected?.provenance||{};
 return Object.freeze({
  id:opportunity.id??null,
  market:opportunity.market??null,
  title:opportunity.title??null,
  organiser:opportunity.organiser??null,
  region_code:opportunity.region_code??null,
  location:opportunity.location??null,
  location_precision:opportunity.location_precision??null,
  location_confidence:opportunity.location_confidence??null,
  venue_verified:Boolean(opportunity.venue_verified),
  event_start:opportunity.event_start??null,
  event_end:opportunity.event_end??null,
  application_deadline:opportunity.application_deadline??null,
  canonical_url:opportunity.canonical_url??null,
  application_url:opportunity.application_url??null,
  last_checked:opportunity.last_checked??null,
  completeness:Object.freeze({
    venue:Boolean(readiness.completeness?.venue),
    event_date:Boolean(readiness.completeness?.event_date),
    application_deadline:Boolean(readiness.completeness?.application_deadline)
  }),
  readiness:Object.freeze({
    usable:Boolean(readiness.ready),
    schema_version:readiness.schema_version??null
  }),
  provenance:Object.freeze({
    location:provenance.location??null
  })
 });
}
