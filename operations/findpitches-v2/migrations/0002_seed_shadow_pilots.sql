INSERT OR IGNORE INTO scheduler_jobs (
  id, market, region_code, location, query_group, priority, status,
  available_at, attempts, created_at, updated_at
) VALUES
  ('shadow-gb-kent-0', 'GB', 'KENT', 'Kent', 0, 30, 'ready', datetime('now'), 0, datetime('now'), datetime('now')),
  ('shadow-us-tx-0', 'US', 'TX', 'Texas', 0, 60, 'ready', datetime('now'), 0, datetime('now'), datetime('now')),
  ('shadow-ca-on-0', 'CA', 'ON', 'Ontario', 0, 30, 'ready', datetime('now'), 0, datetime('now'), datetime('now'));
