-- Separate enrichment work queue and evidence-backed result store.
-- Enrichment is fed only by validated candidates and does not use Serper.

CREATE TABLE IF NOT EXISTS enrichment_queue (
  candidate_id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'ready',
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at TEXT NOT NULL,
  lease_until TEXT,
  last_error TEXT,
  source_last_checked TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (candidate_id) REFERENCES candidates(id)
);

CREATE INDEX IF NOT EXISTS enrichment_queue_ready ON enrichment_queue (status, available_at);

CREATE TABLE IF NOT EXISTS candidate_enrichment (
  candidate_id TEXT PRIMARY KEY,
  source_last_checked TEXT NOT NULL,
  enrichment_json TEXT NOT NULL,
  provenance_json TEXT NOT NULL DEFAULT '{}',
  fetched_urls_json TEXT NOT NULL DEFAULT '[]',
  enriched_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (candidate_id) REFERENCES candidates(id)
);

CREATE INDEX IF NOT EXISTS candidate_enrichment_source_checked ON candidate_enrichment (source_last_checked);
