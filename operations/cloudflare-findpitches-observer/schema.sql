CREATE TABLE IF NOT EXISTS latest_status (
  source TEXT PRIMARY KEY,
  observed_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  payload_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'info',
  event_type TEXT NOT NULL DEFAULT 'log',
  message TEXT NOT NULL,
  payload_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_events_received_at
  ON events(received_at DESC);

CREATE INDEX IF NOT EXISTS idx_events_source_received_at
  ON events(source, received_at DESC);
