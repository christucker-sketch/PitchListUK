-- Customer hold checks must not repeatedly decode large immutable receipts.
-- Sparse, derived index only: no source, selection, identity or policy rewrite.
CREATE INDEX structured_customer_policy_lookup ON producer_records(
 producer_record_id,
 COALESCE(json_extract(normalized_json,'$.last_checked'),'') DESC,
 received_at DESC,id DESC,
 json_extract(normalized_json,'$.last_checked'),
 json_extract(normalized_json,'$.confidence.level'),
 json_extract(normalized_json,'$.producer_channel'),
 json_extract(normalized_json,'$.producer_export_readiness')
) WHERE producer_name='independent-structured' AND environment='shadow' AND validation_status='accepted';
