-- Append-only proof, separate from immutable discovery receipts. V3 shadow only.
CREATE TABLE source_documents (
  id TEXT PRIMARY KEY, source_url TEXT NOT NULL, content_hash TEXT,
  fetched_at TEXT NOT NULL, document_json TEXT NOT NULL CHECK(json_valid(document_json))
);
CREATE TABLE source_verifications (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE,
  entity_id TEXT NOT NULL REFERENCES entities(id), entity_revision INTEGER NOT NULL,
  document_id TEXT NOT NULL REFERENCES source_documents(id), verifier_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('verified','partial','unverified','quarantine')),
  report_json TEXT NOT NULL CHECK(json_valid(report_json)), checked_at TEXT NOT NULL, expires_at TEXT NOT NULL
);
CREATE INDEX verification_entity_latest ON source_verifications(entity_id,sequence DESC);
CREATE TRIGGER document_update BEFORE UPDATE ON source_documents BEGIN SELECT RAISE(ABORT,'source_document_immutable'); END;
CREATE TRIGGER document_delete BEFORE DELETE ON source_documents BEGIN SELECT RAISE(ABORT,'source_document_immutable'); END;
CREATE TRIGGER document_replace BEFORE INSERT ON source_documents WHEN EXISTS(SELECT 1 FROM source_documents WHERE id=NEW.id) BEGIN SELECT RAISE(IGNORE); END;
CREATE TRIGGER verification_update BEFORE UPDATE ON source_verifications BEGIN SELECT RAISE(ABORT,'source_verification_immutable'); END;
CREATE TRIGGER verification_delete BEFORE DELETE ON source_verifications BEGIN SELECT RAISE(ABORT,'source_verification_immutable'); END;
CREATE TRIGGER verification_replace BEFORE INSERT ON source_verifications WHEN EXISTS(SELECT 1 FROM source_verifications WHERE id=NEW.id) BEGIN SELECT RAISE(IGNORE); END;
CREATE TRIGGER verification_invalidates AFTER INSERT ON source_verifications BEGIN
  DELETE FROM readiness WHERE entity_id=NEW.entity_id;
  DELETE FROM shadow_projections WHERE entity_id=NEW.entity_id;
END;
CREATE TRIGGER ready_requires_proof_insert BEFORE INSERT ON readiness WHEN NEW.status='ready' AND NOT EXISTS (
 SELECT 1 FROM source_verifications v WHERE v.entity_id=NEW.entity_id AND v.sequence=(SELECT MAX(sequence) FROM source_verifications WHERE entity_id=NEW.entity_id)
 AND v.entity_revision=NEW.entity_revision AND v.status='verified' AND v.verifier_version='source-proof-v1'
 AND julianday(v.checked_at)<=julianday(NEW.evaluated_at) AND julianday(v.expires_at)>julianday(NEW.evaluated_at)
) BEGIN SELECT RAISE(ABORT,'current_source_proof_required'); END;
CREATE TRIGGER ready_requires_proof_update BEFORE UPDATE ON readiness WHEN NEW.status='ready' AND NOT EXISTS (
 SELECT 1 FROM source_verifications v WHERE v.entity_id=NEW.entity_id AND v.sequence=(SELECT MAX(sequence) FROM source_verifications WHERE entity_id=NEW.entity_id)
 AND v.entity_revision=NEW.entity_revision AND v.status='verified' AND v.verifier_version='source-proof-v1'
 AND julianday(v.checked_at)<=julianday(NEW.evaluated_at) AND julianday(v.expires_at)>julianday(NEW.evaluated_at)
) BEGIN SELECT RAISE(ABORT,'current_source_proof_required'); END;
-- Reversible invalidation of old derived READY claims; retained source facts are untouched.
UPDATE readiness SET status='watch',reasons_json='["source_verification_required"]' WHERE status='ready';
UPDATE shadow_projections SET payload_json=json_set(payload_json,'$.readiness','watch','$.verification.status','unverified') WHERE json_extract(payload_json,'$.readiness')='ready';
