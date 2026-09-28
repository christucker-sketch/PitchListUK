-- Record promotion inspection per candidate revision; do not block future refreshes.
CREATE TABLE IF NOT EXISTS customer_promotion_disposition (
 candidate_id TEXT PRIMARY KEY REFERENCES candidates(id),
 source_last_checked TEXT NOT NULL,
 enrichment_last_checked TEXT NOT NULL,
 disposition TEXT NOT NULL,
 reason TEXT,
 inspected_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS customer_promotion_disposition_state ON customer_promotion_disposition(disposition,inspected_at);
