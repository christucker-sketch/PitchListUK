// Requires separately approved migration 0028. All producer columns and the JSON
// clock expression are in its partial covering index: no wide receipt-table reads.
// The literal environment is equivalent to the mandatory shadow predicate below.
export const PRODUCER_RECHECK_PAGE_SQL = `SELECT q.entity_id,q.requested_at,q.reason,r.producer_record_id,r.market,'shadow' AS environment,
    MAX(json_extract(r.normalized_json,'$.last_checked')) AS latest_accepted_source_check
    FROM recheck_requests q CROSS JOIN entity_records er ON er.entity_id=q.entity_id
      CROSS JOIN producer_records r INDEXED BY structured_recheck_lookup ON r.id=er.record_id
    WHERE r.producer_name='independent-structured' AND r.environment='shadow' AND r.validation_status='accepted'
      AND (q.requested_at>? OR (q.requested_at=? AND (q.entity_id>? OR (q.entity_id=? AND r.producer_record_id>?))))
    GROUP BY q.entity_id,q.requested_at,q.reason,r.producer_record_id,r.market
    ORDER BY q.requested_at,q.entity_id,r.producer_record_id LIMIT ?`;

export const PRODUCER_RECHECK_COUNT_SQL = `SELECT COUNT(*) AS n FROM recheck_requests q WHERE EXISTS(
    SELECT 1 FROM entity_records er INDEXED BY entity_records_entity
      CROSS JOIN producer_records r INDEXED BY structured_recheck_lookup ON r.id=er.record_id
    WHERE er.entity_id=q.entity_id AND r.producer_name='independent-structured'
      AND r.environment='shadow' AND r.validation_status='accepted')`;
