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
