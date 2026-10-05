-- Structured-feed protected pilot ledger.
-- Keeps an immutable copy of producer-backed fields before normal classification.
-- Does not publish anything and does not write customer_opportunities/publication_queue.

CREATE TABLE IF NOT EXISTS structured_feed_candidate_pilot (
  producer_id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL UNIQUE,
  pilot_batch TEXT NOT NULL,
  market TEXT NOT NULL,
  baseline_event_name TEXT NOT NULL,
  baseline_organiser TEXT,
  baseline_location TEXT,
  baseline_event_start TEXT,
  baseline_event_end TEXT,
  baseline_application_deadline TEXT,
  baseline_canonical_url TEXT,
  baseline_application_url TEXT,
  baseline_application_state TEXT,
  baseline_evidence_json TEXT,
  baseline_provenance_json TEXT,
  candidate_inserted_at TEXT,
  classifier_completed_at TEXT,
  after_status TEXT,
  after_event_name TEXT,
  after_organiser TEXT,
  after_application_url TEXT,
  after_geography_json TEXT,
  after_evidence_json TEXT,
  after_score REAL,
  after_rejection_reason TEXT,
  audited_at TEXT,
  FOREIGN KEY (producer_id) REFERENCES structured_feed_records(producer_id),
  FOREIGN KEY (candidate_id) REFERENCES candidates(id)
);

CREATE INDEX IF NOT EXISTS structured_feed_candidate_pilot_batch
  ON structured_feed_candidate_pilot (pilot_batch, market);

CREATE INDEX IF NOT EXISTS structured_feed_candidate_pilot_status
  ON structured_feed_candidate_pilot (after_status, pilot_batch);
