-- V3-only evidence recovery audit. No bindings or writes to the reference system.
CREATE TABLE legacy_recovery_runs (
  id TEXT PRIMARY KEY,
  snapshot_hash TEXT NOT NULL,
  source_counts_json TEXT NOT NULL,
  total_opportunities INTEGER NOT NULL CHECK(total_opportunities>=0),
  status TEXT NOT NULL CHECK(status IN ('running','complete')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE legacy_recovery_records (
  run_id TEXT NOT NULL REFERENCES legacy_recovery_runs(id),
  legacy_id TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  references_json TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('retained_evidence','source_refetch','quarantine')),
  reason TEXT NOT NULL,
  record_id TEXT REFERENCES producer_records(id),
  field_audit_json TEXT NOT NULL,
  refetch_attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  PRIMARY KEY(run_id,legacy_id),
  CHECK((category='quarantine' AND record_id IS NULL) OR (category<>'quarantine' AND record_id IS NOT NULL))
);
CREATE INDEX legacy_recovery_record ON legacy_recovery_records(record_id);
CREATE TABLE legacy_recovery_claims (
  run_id TEXT NOT NULL REFERENCES legacy_recovery_runs(id),
  legacy_id TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  PRIMARY KEY(run_id,legacy_id)
);
CREATE TRIGGER legacy_claim_no_update BEFORE UPDATE ON legacy_recovery_claims
BEGIN SELECT RAISE(ABORT,'legacy_recovery_claim_immutable'); END;
CREATE TRIGGER legacy_claim_no_delete BEFORE DELETE ON legacy_recovery_claims
BEGIN SELECT RAISE(ABORT,'legacy_recovery_claim_retained'); END;
CREATE TRIGGER legacy_recovery_no_delete BEFORE DELETE ON legacy_recovery_records
BEGIN SELECT RAISE(ABORT,'legacy_recovery_audit_retained'); END;
CREATE TRIGGER legacy_recovery_no_update BEFORE UPDATE ON legacy_recovery_records
BEGIN SELECT RAISE(ABORT,'legacy_recovery_audit_immutable'); END;
CREATE TRIGGER legacy_recovery_no_replace BEFORE INSERT ON legacy_recovery_records
WHEN EXISTS(SELECT 1 FROM legacy_recovery_records WHERE run_id=NEW.run_id AND legacy_id=NEW.legacy_id AND content_hash<>NEW.content_hash)
BEGIN SELECT RAISE(ABORT,'legacy_recovery_replay_conflict'); END;
