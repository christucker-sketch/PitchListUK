-- FindPitches v2 catalogue growth: READ-ONLY baseline diagnostics.
-- Issue #1869. Run ONLY against the isolated v2 D1 database.
-- Example: npx wrangler d1 execute findpitches-v2 --remote --file=operations/findpitches-v2/catalogue-growth-baseline.sql
-- Confirm actual D1 database name in wrangler.jsonc first. Do not run this against v1.
-- These queries count *stored projections*, not exact current customer-ready listings.
-- Current-ready also requires read-time freshness, candidate disposition, event/deadline
-- validity, application URL rules and readiness logic. Use customer API or /status
-- for the exact current-ready number. Do not interpret a blank state as 0 demand.
--
-- 1. US projection coverage by region. This exposes concentration and gaps among
--    observed US region codes; absent states require comparison to a canonical
--    50-state list in the report renderer, NOT invention of stored counts.
SELECT
  region_code AS us_region,
  COUNT(*) AS projected,
  SUM(CASE WHEN NULLIF(TRIM(location),'') IS NOT NULL
                 AND NULLIF(TRIM(location_evidence_url),'') IS NOT NULL THEN 1 ELSE 0 END)
    AS location_evidenced,
  SUM(CASE WHEN NULLIF(TRIM(location),'') IS NULL
                 OR NULLIF(TRIM(location_evidence_url),'') IS NULL THEN 1 ELSE 0 END)
    AS missing_location_or_evidence,
  SUM(CASE WHEN NULLIF(TRIM(event_start),'') IS NOT NULL THEN 1 ELSE 0 END)
    AS has_event_start,
  SUM(CASE WHEN NULLIF(TRIM(application_deadline),'') IS NOT NULL THEN 1 ELSE 0 END)
    AS has_deadline
FROM customer_opportunities
WHERE market = 'US'
GROUP BY region_code
ORDER BY location_evidenced ASC, projected DESC, us_region;

-- 2. Candidate disposition by market and recorded rejection reason.
--    NULL/blank reasons are intentionally surfaced; don't treat all rejects
--    as permanent or all held records as recoverable without sample review.
SELECT
  market, status,
  COALESCE(NULLIF(TRIM(rejection_reason),''), '[no recorded reason]') AS reason,
  COUNT(*) AS candidates
FROM candidates
GROUP BY market, status, reason
ORDER BY market, status, candidates DESC;

-- 3. Reinspection funnel by candidate market/revision, using present-time
--    disposition. A disposition tied to an older candidate revision does not
--    count as inspected; neither does enrichment of an older revision.
SELECT
  c.market,
  COUNT(*) AS validated_current,
  SUM(CASE WHEN d.candidate_id IS NOT NULL
            AND d.source_last_checked = c.last_checked THEN 1 ELSE 0 END)
    AS revision_inspected,
  SUM(CASE WHEN d.candidate_id IS NOT NULL
            AND d.source_last_checked = c.last_checked
            AND d.disposition = 'promoted' THEN 1 ELSE 0 END)
    AS inspected_promoted,
  SUM(CASE WHEN d.candidate_id IS NOT NULL
            AND d.source_last_checked = c.last_checked
            AND d.disposition = 'not_ready' THEN 1 ELSE 0 END)
    AS inspected_not_ready,
  SUM(CASE WHEN (d.candidate_id IS NULL OR d.source_last_checked <> c.last_checked)
            AND e.candidate_id IS NOT NULL
            AND e.source_last_checked = c.last_checked THEN 1 ELSE 0 END)
    AS uninspected_with_current_enrichment,
  SUM(CASE WHEN (d.candidate_id IS NULL OR d.source_last_checked <> c.last_checked)
            AND (e.candidate_id IS NULL OR e.source_last_checked <> c.last_checked) THEN 1 ELSE 0 END)
    AS uninspected_missing_current_enrichment
FROM candidates c
LEFT JOIN customer_promotion_disposition d ON d.candidate_id = c.id
LEFT JOIN candidate_enrichment e ON e.candidate_id = c.id
WHERE c.status = 'validated'
GROUP BY c.market
ORDER BY validated_current DESC;

-- 4. Projected field coverage and location evidence by market.
--    Provenance presence is a necessary gate but does NOT prove venue accuracy.
SELECT
  market,
  COUNT(*) AS projections,
  SUM(CASE WHEN NULLIF(TRIM(location),'') IS NOT NULL
            AND NULLIF(TRIM(location_evidence_url),'') IS NOT NULL THEN 1 ELSE 0 END)
    AS location_evidenced,
  SUM(CASE WHEN NULLIF(TRIM(location),'') IS NULL
            OR NULLIF(TRIM(location_evidence_url),'') IS NULL THEN 1 ELSE 0 END)
    AS missing_location_evidence,
  SUM(CASE WHEN NULLIF(TRIM(event_start),'') IS NOT NULL THEN 1 ELSE 0 END)
    AS with_event_start,
  SUM(CASE WHEN NULLIF(TRIM(application_deadline),'') IS NOT NULL THEN 1 ELSE 0 END)
    AS with_deadline
FROM customer_opportunities
GROUP BY market
ORDER BY projections DESC;
