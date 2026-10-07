-- Shadow-only paid programme. The lower cap covers every V3 paid lane.
CREATE TABLE commercial_acquisition_policy (
 id INTEGER PRIMARY KEY CHECK(id=1), daily_query_limit INTEGER NOT NULL CHECK(daily_query_limit BETWEEN 1 AND 50),
 queries_per_market INTEGER NOT NULL CHECK(queries_per_market BETWEEN 1 AND 10),
 manual_paused INTEGER NOT NULL DEFAULT 0 CHECK(manual_paused IN (0,1)), pause_reason TEXT,
 updated_at TEXT NOT NULL
);
INSERT INTO commercial_acquisition_policy VALUES(1,25,5,0,NULL,'2026-10-07T00:00:00.000Z');
CREATE TABLE source_led_programmes (
 id TEXT PRIMARY KEY, budget_day TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('active','paused','complete')),
 max_queries INTEGER NOT NULL CHECK(max_queries BETWEEN 1 AND 50), plan_json TEXT NOT NULL,
 next_query INTEGER NOT NULL DEFAULT 0, active_run_id TEXT, stop_reason TEXT,
 created_at TEXT NOT NULL, expires_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX source_led_single_active ON source_led_programmes(status) WHERE status='active';
CREATE TRIGGER source_led_no_reopen BEFORE UPDATE OF status ON source_led_programmes
 WHEN OLD.status<>'active' AND NEW.status='active' BEGIN SELECT RAISE(ABORT,'source_led_cannot_reopen'); END;
CREATE TABLE source_led_grants (
 run_id TEXT PRIMARY KEY, programme_id TEXT NOT NULL REFERENCES source_led_programmes(id), query_index INTEGER NOT NULL,
 market TEXT NOT NULL CHECK(market IN ('GB','CA','AU','NZ','US')), family TEXT NOT NULL,
 query TEXT NOT NULL, query_hash TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('approved','running','complete','failed')),
 created_at TEXT NOT NULL, UNIQUE(programme_id,query_index)
);
CREATE TRIGGER source_led_grant_scope BEFORE UPDATE ON source_led_grants
 WHEN NEW.run_id<>OLD.run_id OR NEW.programme_id<>OLD.programme_id OR NEW.query_index<>OLD.query_index OR NEW.market<>OLD.market OR NEW.query<>OLD.query OR NEW.query_hash<>OLD.query_hash OR NEW.family<>OLD.family
 BEGIN SELECT RAISE(ABORT,'source_led_grant_scope_immutable'); END;
CREATE TABLE source_led_candidates (
 id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES source_led_grants(run_id), usage_id TEXT NOT NULL REFERENCES serper_usage(id),
 position INTEGER NOT NULL, url TEXT NOT NULL, url_key TEXT NOT NULL, family TEXT NOT NULL,
 discovery_json TEXT NOT NULL, discovered_at TEXT NOT NULL, initial_disposition TEXT NOT NULL,
 UNIQUE(run_id,position)
);
CREATE TRIGGER source_led_candidate_no_update BEFORE UPDATE ON source_led_candidates BEGIN SELECT RAISE(ABORT,'source_led_discovery_immutable'); END;
CREATE TRIGGER source_led_candidate_no_delete BEFORE DELETE ON source_led_candidates BEGIN SELECT RAISE(ABORT,'source_led_discovery_immutable'); END;
CREATE TRIGGER source_led_candidate_no_replace BEFORE INSERT ON source_led_candidates WHEN EXISTS(SELECT 1 FROM source_led_candidates WHERE id=NEW.id)
 BEGIN SELECT RAISE(IGNORE); END;
CREATE TABLE source_led_candidate_progress (
 candidate_id TEXT PRIMARY KEY REFERENCES source_led_candidates(id), status TEXT NOT NULL,
 record_id TEXT REFERENCES producer_records(id), actual_country TEXT, document_json TEXT, report_json TEXT,
 reason TEXT, checked_at TEXT, lease_until TEXT
);
CREATE TRIGGER source_led_source_evidence_immutable BEFORE UPDATE ON source_led_candidate_progress
 WHEN OLD.document_json IS NOT NULL AND (NEW.document_json IS NOT OLD.document_json OR NEW.report_json IS NOT OLD.report_json OR NEW.actual_country IS NOT OLD.actual_country OR NEW.checked_at IS NOT OLD.checked_at OR NEW.record_id IS NOT OLD.record_id)
 BEGIN SELECT RAISE(ABORT,'source_led_source_evidence_immutable'); END;
CREATE TRIGGER source_led_progress_no_delete BEFORE DELETE ON source_led_candidate_progress BEGIN SELECT RAISE(ABORT,'source_led_source_evidence_immutable'); END;
CREATE TRIGGER source_led_progress_no_replace BEFORE INSERT ON source_led_candidate_progress WHEN EXISTS(SELECT 1 FROM source_led_candidate_progress WHERE candidate_id=NEW.candidate_id)
 BEGIN SELECT RAISE(IGNORE); END;
CREATE TABLE commercial_acquisition_policy_history(sequence INTEGER PRIMARY KEY AUTOINCREMENT,policy_json TEXT NOT NULL,changed_at TEXT NOT NULL);
CREATE TRIGGER commercial_acquisition_policy_audit AFTER UPDATE ON commercial_acquisition_policy BEGIN
 INSERT INTO commercial_acquisition_policy_history(policy_json,changed_at) VALUES(json_object('daily_query_limit',NEW.daily_query_limit,'queries_per_market',NEW.queries_per_market,'manual_paused',NEW.manual_paused,'pause_reason',NEW.pause_reason),NEW.updated_at);
END;
-- A second guard protects against a future caller bypassing the reservation helper.
CREATE TRIGGER commercial_daily_spend_guard BEFORE INSERT ON serper_usage WHEN
 (SELECT COALESCE(SUM(queries_reserved),0) FROM serper_usage WHERE budget_day=NEW.budget_day)+NEW.queries_reserved>(SELECT daily_query_limit FROM commercial_acquisition_policy WHERE id=1)
 OR (SELECT COALESCE(SUM(MAX(credit_units_reserved,COALESCE(credits_observed,0))),0) FROM serper_usage WHERE budget_day=NEW.budget_day)+NEW.credit_units_reserved>(SELECT daily_query_limit FROM commercial_acquisition_policy WHERE id=1)
 BEGIN SELECT RAISE(ABORT,'commercial_daily_budget_reached'); END;
