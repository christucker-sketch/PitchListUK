-- Pending recheck joins need identity, market and source clock, not the wide
-- receipt JSON. The partial predicate preserves the exact producer membership.
-- Apply to the V3 shadow database only, with separate owner approval.
CREATE INDEX IF NOT EXISTS structured_recheck_lookup ON producer_records(
  id,producer_record_id,market,json_extract(normalized_json,'$.last_checked')
) WHERE producer_name='independent-structured'
    AND environment='shadow' AND validation_status='accepted';
