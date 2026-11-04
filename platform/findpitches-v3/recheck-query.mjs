// Use the existing 0025 expression index for clocks; never parse every historical
// normalized_json blob to build a page. MATERIALIZED keeps clock lookups after LIMIT.
// Membership, grouping, keyset cursor and MAX semantics match producerRechecks.
export const PRODUCER_RECHECK_PAGE_SQL = `WITH page AS MATERIALIZED (
    SELECT q.entity_id,q.requested_at,q.reason,r.producer_record_id,r.market,r.environment
    FROM recheck_requests q CROSS JOIN entity_records er ON er.entity_id=q.entity_id
      CROSS JOIN producer_records r ON r.id=er.record_id
    WHERE r.producer_name='independent-structured' AND r.environment='shadow' AND r.validation_status='accepted'
      AND (q.requested_at>? OR (q.requested_at=? AND (q.entity_id>? OR (q.entity_id=? AND r.producer_record_id>?))))
    GROUP BY q.entity_id,q.requested_at,q.reason,r.producer_record_id,r.market,r.environment
    ORDER BY q.requested_at,q.entity_id,r.producer_record_id LIMIT ?
  )
  SELECT page.*,
    (SELECT MAX(json_extract(clock.normalized_json,'$.last_checked'))
      FROM producer_records clock INDEXED BY structured_customer_policy_lookup
      JOIN entity_records linked ON linked.record_id=clock.id AND linked.entity_id=page.entity_id
      WHERE clock.producer_name='independent-structured' AND clock.environment='shadow' AND clock.validation_status='accepted'
        AND clock.producer_record_id=page.producer_record_id AND clock.market IS page.market
    ) AS latest_accepted_source_check
  FROM page ORDER BY page.requested_at,page.entity_id,page.producer_record_id`;
