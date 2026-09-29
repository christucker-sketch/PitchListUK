-- Existing customer projections do not carry proof that their location refers
-- to the event. Preserve the rows for reinspection, but fail closed on reads.
ALTER TABLE customer_opportunities ADD COLUMN location_evidence_url TEXT;

CREATE INDEX IF NOT EXISTS customer_opportunities_verified_location
  ON customer_opportunities (market, region_code, location_evidence_url);

-- Reinspect previously promoted revisions once against their existing
-- enrichment evidence; the disposition gate prevents infinite retry loops
-- for revisions still missing a source-backed event location.
DELETE FROM customer_promotion_disposition WHERE disposition = 'promoted';
