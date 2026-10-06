-- Coalesce transport wake-ups while durable jobs remain the authoritative outbox.
CREATE TABLE queue_dispatches (
  job_id TEXT PRIMARY KEY REFERENCES jobs(id),
  last_sent_at TEXT NOT NULL
);
