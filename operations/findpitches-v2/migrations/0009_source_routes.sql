-- FindPitches v2 source-first acquisition foundation.
-- Shadow-only. Adds route-level registry; no publication or legacy tables touched.

CREATE TABLE IF NOT EXISTS source_routes (
  market TEXT NOT NULL,
  route_url TEXT NOT NULL,
  domain TEXT NOT NULL,
  organisation TEXT,
  route_type TEXT NOT NULL DEFAULT 'unknown',
  status TEXT NOT NULL DEFAULT 'discovered',
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  last_checked TEXT,
  next_check TEXT,
  refresh_minutes INTEGER NOT NULL DEFAULT 10080,
  candidate_count INTEGER NOT NULL DEFAULT 0,
  usable_count INTEGER NOT NULL DEFAULT 0,
  rejection_count INTEGER NOT NULL DEFAULT 0,
  reputation_score REAL NOT NULL DEFAULT 0,
  discovery_method TEXT NOT NULL DEFAULT 'search',
  PRIMARY KEY (market, route_url)
);

CREATE INDEX IF NOT EXISTS source_routes_due
  ON source_routes (market, status, next_check, reputation_score DESC);

CREATE INDEX IF NOT EXISTS source_routes_domain
  ON source_routes (market, domain, reputation_score DESC);

-- Backfill reputation from the current candidate pool so the pilot does not
-- have to wait for only post-deploy discoveries/classifications to learn.
INSERT INTO source_reputation (
  market, domain, organisation, source_type, first_seen, last_seen, last_success,
  candidate_count, published_count, rejection_count, reputation_score
)
SELECT market,
       LOWER(REPLACE(REPLACE(SUBSTR(canonical_url, INSTR(canonical_url, '://') + 3,
         CASE WHEN INSTR(SUBSTR(canonical_url, INSTR(canonical_url, '://') + 3), '/') > 0
           THEN INSTR(SUBSTR(canonical_url, INSTR(canonical_url, '://') + 3), '/') - 1
           ELSE LENGTH(canonical_url) END), 'www.', ''), ':443', '')) AS domain,
       MAX(organiser),
       'historical_backfill',
       MIN(first_seen),
       MAX(last_checked),
       MAX(CASE WHEN status='validated' THEN last_checked END),
       COUNT(*),
       0,
       SUM(CASE WHEN status='rejected' THEN 1 ELSE 0 END),
       100.0 * SUM(CASE WHEN status='validated' THEN 1 ELSE 0 END) / COUNT(*)
  FROM candidates
 WHERE canonical_url LIKE 'http%'
 GROUP BY market, domain
HAVING domain LIKE '%.%'
ON CONFLICT(market, domain) DO UPDATE SET
  organisation=COALESCE(source_reputation.organisation, excluded.organisation),
  first_seen=MIN(source_reputation.first_seen, excluded.first_seen),
  last_seen=MAX(source_reputation.last_seen, excluded.last_seen),
  last_success=COALESCE(MAX(source_reputation.last_success, excluded.last_success), source_reputation.last_success, excluded.last_success),
  candidate_count=MAX(source_reputation.candidate_count, excluded.candidate_count),
  rejection_count=MAX(source_reputation.rejection_count, excluded.rejection_count),
  reputation_score=excluded.reputation_score;
