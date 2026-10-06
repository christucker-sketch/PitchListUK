-- Source qualification is separate from preserving the original fetched evidence.
CREATE TABLE legacy_quality_holds (
  record_id TEXT PRIMARY KEY REFERENCES producer_records(id),
  rules_version TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TRIGGER legacy_quality_hold_update BEFORE UPDATE ON legacy_quality_holds
BEGIN SELECT RAISE(ABORT,'legacy_quality_hold_immutable'); END;
CREATE TRIGGER legacy_quality_hold_delete BEFORE DELETE ON legacy_quality_holds
BEGIN SELECT RAISE(ABORT,'legacy_quality_hold_immutable'); END;
CREATE TRIGGER legacy_quality_hold_replace BEFORE INSERT ON legacy_quality_holds
WHEN EXISTS(SELECT 1 FROM legacy_quality_holds WHERE record_id=NEW.record_id)
BEGIN SELECT RAISE(IGNORE); END;
