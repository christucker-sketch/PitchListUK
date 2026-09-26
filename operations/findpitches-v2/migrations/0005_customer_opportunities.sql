-- Customer-facing storage is separate from raw classifier candidates.
-- Creating this table does not publish or expose any records.

CREATE TABLE IF NOT EXISTS customer_opportunities (
  id TEXT PRIMARY KEY,
  market TEXT NOT NULL,
  region_code TEXT NOT NULL,
  title TEXT NOT NULL,
  organiser TEXT,
  location TEXT,
  coordinates_json TEXT,
  event_start TEXT,
  event_end TEXT,
  application_deadline TEXT,
  canonical_url TEXT NOT NULL,
  application_url TEXT NOT NULL,
  offerings_json TEXT,
  recurring INTEGER,
  description TEXT,
  search_text TEXT NOT NULL DEFAULT '',
  last_checked TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS customer_opportunities_market_region
  ON customer_opportunities (market, region_code);

CREATE INDEX IF NOT EXISTS customer_opportunities_checked
  ON customer_opportunities (last_checked DESC);
