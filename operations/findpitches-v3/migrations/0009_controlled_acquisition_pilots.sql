-- Explicit operator-granted experiments; no scheduler or bulk enablement switch.
CREATE TABLE acquisition_pilots (
  id TEXT PRIMARY KEY,
  budget_day TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK(status IN ('active','paused','complete')),
  daily_ceiling INTEGER NOT NULL CHECK(daily_ceiling BETWEEN 1 AND 250),
  max_queries INTEGER NOT NULL CHECK(max_queries BETWEEN 1 AND 250),
  plan_json TEXT NOT NULL CHECK(json_valid(plan_json)),
  next_run INTEGER NOT NULL DEFAULT 0,
  active_run_id TEXT,
  stop_reason TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE pilot_run_grants (
  run_id TEXT PRIMARY KEY,
  pilot_id TEXT NOT NULL REFERENCES acquisition_pilots(id),
  run_index INTEGER NOT NULL,
  city_id TEXT NOT NULL,
  queries_json TEXT NOT NULL CHECK(json_valid(queries_json)),
  status TEXT NOT NULL CHECK(status IN ('approved','running','complete','failed')),
  created_at TEXT NOT NULL,
  UNIQUE(pilot_id,run_index)
);
CREATE TRIGGER pilot_policy_immutable BEFORE UPDATE OF id,budget_day,daily_ceiling,max_queries,plan_json,created_at,expires_at ON acquisition_pilots
BEGIN SELECT RAISE(ABORT,'pilot_grant_immutable'); END;
CREATE TRIGGER pilot_no_reopen BEFORE UPDATE OF status ON acquisition_pilots
WHEN OLD.status<>'active' AND NEW.status='active'
BEGIN SELECT RAISE(ABORT,'stopped_pilot_cannot_reopen'); END;
CREATE TRIGGER pilot_no_delete BEFORE DELETE ON acquisition_pilots
BEGIN SELECT RAISE(ABORT,'pilot_audit_retained'); END;
CREATE TRIGGER pilot_run_grant_immutable BEFORE UPDATE OF run_id,pilot_id,run_index,city_id,queries_json,created_at ON pilot_run_grants
BEGIN SELECT RAISE(ABORT,'pilot_run_grant_immutable'); END;
CREATE TRIGGER pilot_runs_no_delete BEFORE DELETE ON pilot_run_grants
BEGIN SELECT RAISE(ABORT,'pilot_audit_retained'); END;
