-- FindPitches v2 clean-room storage.
-- This database is intentionally independent from all legacy runtime state.

CREATE TABLE IF NOT EXISTS acquisition_runs (
  run_id TEXT PRIMARY KEY,
  market TEXT NOT NULL,
  region_code TEXT NOT NULL,
  status TEXT NOT NULL,
  query_count INTEGER NOT NULL DEFAULT 0,
  search_results INTEGER NOT NULL DEFAULT 0,
  unique_candidates INTEGER NOT NULL DEFAULT 0,
  validated INTEGER NOT NULL DEFAULT 0,
  duplicates INTEGER NOT NULL DEFAULT 0,
  held INTEGER NOT NULL DEFAULT 0,
  rejected INTEGER NOT NULL DEFAULT 0,
  queued INTEGER NOT NULL DEFAULT 0,
  published INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS acquisition_runs_market_started
  ON acquisition_runs (market, started_at DESC);

CREATE TABLE IF NOT EXISTS candidates (
  id TEXT PRIMARY KEY,
  market TEXT NOT NULL,
  region_code TEXT,
  source_url TEXT NOT NULL,
  canonical_url TEXT NOT NULL,
  application_url TEXT,
  event_name TEXT,
  organiser TEXT,
  geography_json TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  score REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  rejection_reason TEXT,
  first_seen TEXT NOT NULL,
  last_checked TEXT NOT NULL,
  retry_count INTEGER NOT NULL DEFAULT 0,
  run_id TEXT,
  opportunity_fingerprint TEXT,
  FOREIGN KEY (run_id) REFERENCES acquisition_runs(run_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS candidates_market_canonical_url
  ON candidates (market, canonical_url);

CREATE INDEX IF NOT EXISTS candidates_status_market
  ON candidates (status, market);

CREATE INDEX IF NOT EXISTS candidates_fingerprint
  ON candidates (market, opportunity_fingerprint);

CREATE TABLE IF NOT EXISTS query_performance (
  market TEXT NOT NULL,
  region_code TEXT,
  template_id TEXT NOT NULL,
  query_text TEXT NOT NULL,
  runs INTEGER NOT NULL DEFAULT 0,
  results INTEGER NOT NULL DEFAULT 0,
  candidates INTEGER NOT NULL DEFAULT 0,
  validated INTEGER NOT NULL DEFAULT 0,
  published INTEGER NOT NULL DEFAULT 0,
  failures INTEGER NOT NULL DEFAULT 0,
  last_run_at TEXT,
  last_success_at TEXT,
  PRIMARY KEY (market, region_code, template_id, query_text)
);

CREATE TABLE IF NOT EXISTS source_reputation (
  market TEXT NOT NULL,
  domain TEXT NOT NULL,
  organisation TEXT,
  source_type TEXT,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  last_success TEXT,
  candidate_count INTEGER NOT NULL DEFAULT 0,
  published_count INTEGER NOT NULL DEFAULT 0,
  rejection_count INTEGER NOT NULL DEFAULT 0,
  reputation_score REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (market, domain)
);

CREATE TABLE IF NOT EXISTS scheduler_jobs (
  id TEXT PRIMARY KEY,
  market TEXT NOT NULL,
  region_code TEXT NOT NULL,
  location TEXT NOT NULL,
  query_group INTEGER NOT NULL DEFAULT 0,
  priority INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ready',
  available_at TEXT NOT NULL,
  lease_until TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS scheduler_jobs_ready
  ON scheduler_jobs (status, available_at, priority DESC);

CREATE TABLE IF NOT EXISTS publication_queue (
  id TEXT PRIMARY KEY,
  market TEXT NOT NULL,
  candidate_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at TEXT NOT NULL,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (candidate_id) REFERENCES candidates(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS publication_queue_candidate
  ON publication_queue (candidate_id);

CREATE INDEX IF NOT EXISTS publication_queue_ready
  ON publication_queue (status, available_at, market);
