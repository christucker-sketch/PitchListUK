-- Structured discovery feed staging.
-- This is intentionally isolated from customer_opportunities and publication_queue.
-- Applying this migration does not publish or expose any records.

CREATE TABLE IF NOT EXISTS structured_feed_imports (
  import_id TEXT PRIMARY KEY,
  schema_version TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_export_id TEXT,
  source_generated_at TEXT,
  source_checksum TEXT,
  mode TEXT NOT NULL DEFAULT 'shadow',
  status TEXT NOT NULL DEFAULT 'started',
  total_records INTEGER NOT NULL DEFAULT 0,
  inserted_records INTEGER NOT NULL DEFAULT 0,
  updated_records INTEGER NOT NULL DEFAULT 0,
  unchanged_records INTEGER NOT NULL DEFAULT 0,
  rejected_records INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  error TEXT
);

CREATE INDEX IF NOT EXISTS structured_feed_imports_started
  ON structured_feed_imports (started_at DESC);

CREATE TABLE IF NOT EXISTS structured_feed_records (
  producer_id TEXT PRIMARY KEY,
  schema_version TEXT NOT NULL,
  source_name TEXT NOT NULL,
  market TEXT NOT NULL,
  region_code TEXT,
  event_name TEXT NOT NULL,
  organiser TEXT,
  location TEXT,
  event_start TEXT,
  event_end TEXT,
  application_deadline TEXT,
  canonical_url TEXT,
  application_url TEXT,
  application_state TEXT NOT NULL,
  lifecycle_event TEXT,
  recurring INTEGER,
  discovery_source TEXT,
  discovery_strategy TEXT,
  confidence REAL,
  evidence_json TEXT,
  provenance_json TEXT,
  source_fingerprint TEXT,
  content_hash TEXT NOT NULL,
  first_seen TEXT,
  last_seen TEXT,
  last_checked TEXT,
  import_id TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  reconciliation_status TEXT NOT NULL DEFAULT 'unreconciled',
  matched_candidate_id TEXT,
  matched_customer_id TEXT,
  reconciliation_reason TEXT,
  FOREIGN KEY (import_id) REFERENCES structured_feed_imports(import_id)
);

CREATE INDEX IF NOT EXISTS structured_feed_records_market_state
  ON structured_feed_records (market, application_state);

CREATE INDEX IF NOT EXISTS structured_feed_records_reconciliation
  ON structured_feed_records (reconciliation_status, market);

CREATE INDEX IF NOT EXISTS structured_feed_records_import
  ON structured_feed_records (import_id);
