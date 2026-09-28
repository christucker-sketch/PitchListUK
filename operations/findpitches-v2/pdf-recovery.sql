-- One-time, operator-triggered recovery AFTER the PDF-capable Worker is deployed.
-- Preview counts first. Each UPDATE requeues at most 25 matching dead letters.
-- Re-run in small batches only after checking PDF parse failures / queue health.
-- Publication must remain disabled; do not reset unrelated dead letters.

SELECT 'enrichment' AS queue, COUNT(*) AS pdf_dead
  FROM enrichment_queue
 WHERE status='dead' AND
       (last_error LIKE 'findpitches_v2_fetch_content_type_unsupported:%pdf%'
        OR last_error LIKE 'findpitches_v2_pdf_%')
UNION ALL
SELECT 'classification' AS queue, COUNT(*) AS pdf_dead
  FROM classification_queue
 WHERE status='dead' AND
       (last_error LIKE 'findpitches_v2_fetch_content_type_unsupported:%pdf%'
        OR last_error LIKE 'findpitches_v2_pdf_%');

-- Enable only when ready to requeue. Keep separate transactions for visibility.
-- Existing PDF content-type dead letters are known PDF failures; new parsing
-- failures are requeued only after the source/parser issue is fixed.
--
-- UPDATE enrichment_queue
--    SET status='ready', attempts=0, available_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),
--        lease_until=NULL, last_error=NULL, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
--  WHERE candidate_id IN (
--    SELECT candidate_id FROM enrichment_queue
--     WHERE status='dead' AND last_error LIKE 'findpitches_v2_fetch_content_type_unsupported:%pdf%'
--     ORDER BY updated_at, candidate_id LIMIT 25
--  );
--
-- UPDATE classification_queue
--    SET status='ready', attempts=0, available_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),
--        lease_until=NULL, last_error=NULL, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
--  WHERE candidate_id IN (
--    SELECT candidate_id FROM classification_queue
--     WHERE status='dead' AND last_error LIKE 'findpitches_v2_fetch_content_type_unsupported:%pdf%'
--     ORDER BY updated_at, candidate_id LIMIT 25
--  );
