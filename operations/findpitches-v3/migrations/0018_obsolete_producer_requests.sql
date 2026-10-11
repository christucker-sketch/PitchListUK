-- Operator-reviewed work resolution, never a producer freshness acknowledgement.
CREATE TABLE producer_recheck_resolutions (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL REFERENCES entities(id),
  requested_at TEXT NOT NULL,
  request_reason TEXT NOT NULL,
  producer_record_id TEXT NOT NULL,
  accepted_record_id TEXT NOT NULL REFERENCES producer_records(id),
  entity_revision INTEGER NOT NULL,
  resolution TEXT NOT NULL CHECK(resolution='obsolete_past_edition'),
  evidence_ref TEXT NOT NULL,
  evidence_hash TEXT NOT NULL,
  evidence_json TEXT NOT NULL CHECK(json_valid(evidence_json)),
  reviewed_by TEXT NOT NULL,
  reviewed_at TEXT NOT NULL,
  UNIQUE(entity_id,requested_at)
);
CREATE TRIGGER recheck_resolution_no_update BEFORE UPDATE ON producer_recheck_resolutions BEGIN SELECT RAISE(ABORT,'recheck_resolution_immutable'); END;
CREATE TRIGGER recheck_resolution_no_delete BEFORE DELETE ON producer_recheck_resolutions BEGIN SELECT RAISE(ABORT,'recheck_resolution_immutable'); END;
CREATE TRIGGER recheck_resolution_no_replace BEFORE INSERT ON producer_recheck_resolutions WHEN EXISTS(SELECT 1 FROM producer_recheck_resolutions WHERE id=NEW.id OR (entity_id=NEW.entity_id AND requested_at=NEW.requested_at)) BEGIN SELECT RAISE(IGNORE); END;
