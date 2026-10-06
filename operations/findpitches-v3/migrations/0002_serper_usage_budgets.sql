-- V3-only paid-search accounting. Reservations remain charged to the safety
-- budget after uncertain failures; legacy billing is explicitly unobserved.
CREATE TABLE serper_policy (
  id INTEGER PRIMARY KEY CHECK (id=1),
  bulk_enabled INTEGER NOT NULL DEFAULT 0 CHECK (bulk_enabled IN (0,1)),
  max_queries_per_run INTEGER NOT NULL DEFAULT 4 CHECK (max_queries_per_run BETWEEN 1 AND 4),
  max_queries_per_hour INTEGER NOT NULL DEFAULT 100 CHECK (max_queries_per_hour BETWEEN 1 AND 1000),
  max_queries_per_day INTEGER NOT NULL DEFAULT 1000 CHECK (max_queries_per_day BETWEEN 1 AND 1000),
  max_credits_per_run INTEGER NOT NULL DEFAULT 4 CHECK (max_credits_per_run BETWEEN 1 AND 4),
  max_credits_per_hour INTEGER NOT NULL DEFAULT 100 CHECK (max_credits_per_hour BETWEEN 1 AND 1000),
  max_credits_per_day INTEGER NOT NULL DEFAULT 1000 CHECK (max_credits_per_day BETWEEN 1 AND 1000),
  credit_unit_cost_usd REAL CHECK (credit_unit_cost_usd IS NULL OR credit_unit_cost_usd>=0),
  manual_paused INTEGER NOT NULL DEFAULT 0 CHECK (manual_paused IN (0,1)),
  pause_until TEXT,
  pause_reason TEXT,
  updated_at TEXT NOT NULL
);
INSERT INTO serper_policy(id,updated_at) VALUES (1,strftime('%Y-%m-%dT%H:%M:%fZ','now'));

CREATE TABLE serper_usage (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES acquisition_runs(id),
  query_index INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('live','legacy')),
  producer TEXT NOT NULL,
  lane TEXT NOT NULL,
  market TEXT,
  region TEXT,
  query_hash TEXT,
  queries_reserved INTEGER NOT NULL CHECK (queries_reserved BETWEEN 1 AND 4),
  queries_attempted INTEGER NOT NULL DEFAULT 0 CHECK (queries_attempted BETWEEN 0 AND 4),
  queries_completed INTEGER NOT NULL DEFAULT 0 CHECK (queries_completed BETWEEN 0 AND 4),
  credit_units_reserved INTEGER NOT NULL CHECK (credit_units_reserved BETWEEN 1 AND 4),
  credits_observed REAL CHECK (credits_observed IS NULL OR credits_observed>=0),
  credits_source TEXT NOT NULL DEFAULT 'unavailable',
  status TEXT NOT NULL CHECK (status IN ('reserved','dispatched','complete','failed')),
  http_status INTEGER,
  candidates_produced INTEGER NOT NULL DEFAULT 0 CHECK (candidates_produced>=0),
  candidates_imported INTEGER NOT NULL DEFAULT 0 CHECK (candidates_imported>=0),
  budget_day TEXT NOT NULL,
  reserved_at TEXT NOT NULL,
  dispatched_at TEXT,
  completed_at TEXT,
  error_code TEXT,
  UNIQUE(run_id,query_index)
);
CREATE INDEX serper_usage_day ON serper_usage(budget_day,reserved_at);
CREATE INDEX serper_usage_hour ON serper_usage(reserved_at);
CREATE TABLE serper_run_records (
  run_id TEXT NOT NULL REFERENCES acquisition_runs(id),
  record_id TEXT NOT NULL REFERENCES producer_records(id),
  usage_id TEXT NOT NULL REFERENCES serper_usage(id),
  new_receipt INTEGER NOT NULL CHECK (new_receipt IN (0,1)),
  created_at TEXT NOT NULL,
  PRIMARY KEY(run_id,record_id)
);

-- Existing V3 runs retained query counts but discarded Serper's credit field.
-- Hold one budget unit per reserved query without inventing observed billing.
INSERT INTO serper_usage(id,run_id,query_index,kind,producer,lane,market,region,
  queries_reserved,queries_attempted,queries_completed,credit_units_reserved,
  credits_source,status,candidates_produced,candidates_imported,budget_day,
  reserved_at,dispatched_at,completed_at)
SELECT 'legacy:'||id,id,-1,'legacy','city-search','city-acquisition',
  CASE WHEN city='austin-tx' THEN 'US' END,CASE WHEN city='austin-tx' THEN 'TX' END,
  queries_reserved,queries_reserved,queries_completed,queries_reserved,
  'unavailable_legacy',CASE WHEN status='complete' THEN 'complete' ELSE 'failed' END,
  COALESCE(json_extract(result_json,'$.discovered'),0),
  COALESCE(json_extract(result_json,'$.imported.accepted'),0),day,
  created_at,created_at,updated_at FROM acquisition_runs;
INSERT INTO serper_run_records(run_id,record_id,usage_id,new_receipt,created_at)
SELECT a.id,j.value,'legacy:'||a.id,
  CASE WHEN COALESCE(json_extract(a.result_json,'$.imported.duplicates'),0)=0 THEN 1 ELSE 0 END,
  a.created_at FROM acquisition_runs a
JOIN json_each(COALESCE(json_extract(a.result_json,'$.imported.record_ids'),'[]')) j
JOIN producer_records p ON p.id=j.value;

CREATE TRIGGER serper_usage_no_delete BEFORE DELETE ON serper_usage
BEGIN SELECT RAISE(ABORT,'serper_accounting_retained'); END;
CREATE TRIGGER serper_usage_no_replace BEFORE INSERT ON serper_usage
WHEN EXISTS(SELECT 1 FROM serper_usage WHERE id=NEW.id OR (run_id=NEW.run_id AND query_index=NEW.query_index))
BEGIN SELECT RAISE(ABORT,'serper_reservation_replay_forbidden'); END;
CREATE TRIGGER serper_usage_identity_immutable BEFORE UPDATE OF id,run_id,query_index,kind,producer,lane,market,region,query_hash,queries_reserved,credit_units_reserved,budget_day,reserved_at ON serper_usage
BEGIN SELECT RAISE(ABORT,'serper_reservation_immutable'); END;
CREATE TRIGGER serper_usage_counters_monotonic BEFORE UPDATE ON serper_usage
WHEN NEW.queries_attempted<OLD.queries_attempted OR NEW.queries_completed<OLD.queries_completed
 OR (OLD.credits_observed IS NOT NULL AND (NEW.credits_observed IS NULL OR NEW.credits_observed<OLD.credits_observed))
BEGIN SELECT RAISE(ABORT,'serper_usage_must_not_decrease'); END;
CREATE TRIGGER serper_links_no_delete BEFORE DELETE ON serper_run_records
BEGIN SELECT RAISE(ABORT,'serper_attribution_retained'); END;
CREATE TRIGGER serper_links_no_update BEFORE UPDATE ON serper_run_records
BEGIN SELECT RAISE(ABORT,'serper_attribution_immutable'); END;
