-- Free source-led discovery. Separate from Claude delivery and paid search.
CREATE TABLE catalogue_runs (
 id TEXT PRIMARY KEY, status TEXT NOT NULL CHECK(status IN ('active','paused','complete')),
 max_candidates INTEGER NOT NULL CHECK(max_candidates BETWEEN 1 AND 2000),
 checked INTEGER NOT NULL DEFAULT 0 CHECK(checked BETWEEN 0 AND max_candidates),
 created_at TEXT NOT NULL, expires_at TEXT NOT NULL, stop_reason TEXT
);
CREATE TABLE catalogue_candidates (
 id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES catalogue_runs(id),
 source_document_id TEXT NOT NULL REFERENCES source_documents(id),
 url TEXT NOT NULL, family TEXT NOT NULL, discovered_at TEXT NOT NULL,
 UNIQUE(run_id,url)
);
CREATE TABLE catalogue_progress (
 candidate_id TEXT PRIMARY KEY REFERENCES catalogue_candidates(id),
 status TEXT NOT NULL CHECK(status IN ('pending','verifying','duplicate','imported','held','failed')),
 reason TEXT, document_id TEXT REFERENCES source_documents(id), record_id TEXT REFERENCES producer_records(id),
 entity_id TEXT REFERENCES entities(id), lease_until TEXT, checked_at TEXT
);
CREATE INDEX catalogue_run_candidates ON catalogue_candidates(run_id,id);
CREATE TRIGGER catalogue_candidate_update BEFORE UPDATE ON catalogue_candidates BEGIN SELECT RAISE(ABORT,'catalogue_discovery_immutable'); END;
CREATE TRIGGER catalogue_candidate_delete BEFORE DELETE ON catalogue_candidates BEGIN SELECT RAISE(ABORT,'catalogue_discovery_immutable'); END;
CREATE TRIGGER catalogue_candidate_replace BEFORE INSERT ON catalogue_candidates WHEN EXISTS(SELECT 1 FROM catalogue_candidates WHERE id=NEW.id) BEGIN SELECT RAISE(IGNORE); END;
CREATE TRIGGER catalogue_import_custody BEFORE UPDATE ON catalogue_progress WHEN OLD.record_id IS NOT NULL AND (NEW.record_id IS NOT OLD.record_id OR NEW.entity_id IS NOT OLD.entity_id OR NEW.document_id IS NOT OLD.document_id) BEGIN SELECT RAISE(ABORT,'catalogue_import_custody_immutable'); END;
CREATE TRIGGER catalogue_progress_delete BEFORE DELETE ON catalogue_progress BEGIN SELECT RAISE(ABORT,'catalogue_progress_required'); END;
CREATE TRIGGER catalogue_progress_replace BEFORE INSERT ON catalogue_progress WHEN EXISTS(SELECT 1 FROM catalogue_progress WHERE candidate_id=NEW.candidate_id) BEGIN SELECT RAISE(IGNORE); END;
