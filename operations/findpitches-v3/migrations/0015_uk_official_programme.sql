-- Independent free GB programme. Source custody stays append-only.
CREATE TABLE uk_source_runs (
 id TEXT PRIMARY KEY,status TEXT NOT NULL CHECK(status IN ('active','paused','complete')),
 max_visits INTEGER NOT NULL CHECK(max_visits BETWEEN 1 AND 250),
 visits_reserved INTEGER NOT NULL DEFAULT 0 CHECK(visits_reserved BETWEEN 0 AND max_visits),
 max_candidates INTEGER NOT NULL CHECK(max_candidates BETWEEN 1 AND 500),
 checked INTEGER NOT NULL DEFAULT 0 CHECK(checked BETWEEN 0 AND max_candidates),
 created_at TEXT NOT NULL,expires_at TEXT NOT NULL,stop_reason TEXT
);
CREATE TABLE uk_source_visits (
 id TEXT PRIMARY KEY,run_id TEXT NOT NULL REFERENCES uk_source_runs(id),url TEXT NOT NULL,
 visited_at TEXT NOT NULL,document_id TEXT REFERENCES source_documents(id),reason TEXT
);
CREATE TABLE uk_source_candidates (
 id TEXT PRIMARY KEY,run_id TEXT NOT NULL REFERENCES uk_source_runs(id),
 source_document_id TEXT NOT NULL REFERENCES source_documents(id),
 url TEXT NOT NULL,source_identifier TEXT NOT NULL,family TEXT NOT NULL,discovered_at TEXT NOT NULL,
 UNIQUE(run_id,url,source_identifier)
);
CREATE TABLE uk_source_progress (
 candidate_id TEXT PRIMARY KEY REFERENCES uk_source_candidates(id),
 status TEXT NOT NULL CHECK(status IN ('pending','verifying','imported','held','failed')),
 reason TEXT,record_id TEXT REFERENCES producer_records(id),entity_id TEXT REFERENCES entities(id),
 identity_outcome TEXT,checked_at TEXT,lease_until TEXT
);
CREATE INDEX uk_run_candidates ON uk_source_candidates(run_id,id);
CREATE TRIGGER uk_candidates_update BEFORE UPDATE ON uk_source_candidates BEGIN SELECT RAISE(ABORT,'uk_source_discovery_immutable'); END;
CREATE TRIGGER uk_candidates_delete BEFORE DELETE ON uk_source_candidates BEGIN SELECT RAISE(ABORT,'uk_source_discovery_immutable'); END;
CREATE TRIGGER uk_candidates_replace BEFORE INSERT ON uk_source_candidates WHEN EXISTS(SELECT 1 FROM uk_source_candidates WHERE id=NEW.id) BEGIN SELECT RAISE(IGNORE); END;
CREATE TRIGGER uk_visits_update BEFORE UPDATE ON uk_source_visits BEGIN SELECT RAISE(ABORT,'uk_source_visits_immutable'); END;
CREATE TRIGGER uk_visits_delete BEFORE DELETE ON uk_source_visits BEGIN SELECT RAISE(ABORT,'uk_source_visits_immutable'); END;
CREATE TRIGGER uk_visits_replace BEFORE INSERT ON uk_source_visits WHEN EXISTS(SELECT 1 FROM uk_source_visits WHERE id=NEW.id) BEGIN SELECT RAISE(IGNORE); END;
CREATE TRIGGER uk_custody_update BEFORE UPDATE ON uk_source_progress WHEN OLD.record_id IS NOT NULL AND (NEW.record_id IS NOT OLD.record_id OR NEW.entity_id IS NOT OLD.entity_id) BEGIN SELECT RAISE(ABORT,'uk_source_custody_immutable'); END;
CREATE TRIGGER uk_progress_delete BEFORE DELETE ON uk_source_progress BEGIN SELECT RAISE(ABORT,'uk_source_progress_required'); END;
CREATE TRIGGER uk_progress_replace BEFORE INSERT ON uk_source_progress WHEN EXISTS(SELECT 1 FROM uk_source_progress WHERE candidate_id=NEW.candidate_id) BEGIN SELECT RAISE(IGNORE); END;
