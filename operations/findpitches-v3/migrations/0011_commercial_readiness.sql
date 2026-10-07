CREATE TABLE commercial_readiness_history (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT NOT NULL UNIQUE,
  entity_id TEXT NOT NULL REFERENCES entities(id),entity_revision INTEGER NOT NULL,
  verification_id TEXT REFERENCES source_verifications(id),status TEXT NOT NULL CHECK(status IN ('ready','watch','blocked')),
  occurred_at TEXT NOT NULL
);
CREATE INDEX commercial_history_entity ON commercial_readiness_history(entity_id,sequence DESC);
CREATE TRIGGER commercial_history_update BEFORE UPDATE ON commercial_readiness_history BEGIN SELECT RAISE(ABORT,'commercial_readiness_history_immutable'); END;
CREATE TRIGGER commercial_history_delete BEFORE DELETE ON commercial_readiness_history BEGIN SELECT RAISE(ABORT,'commercial_readiness_history_immutable'); END;
CREATE TRIGGER commercial_history_replace BEFORE INSERT ON commercial_readiness_history WHEN EXISTS(SELECT 1 FROM commercial_readiness_history WHERE id=NEW.id OR sequence=NEW.sequence) BEGIN SELECT RAISE(IGNORE); END;
-- A supplied AUTOINCREMENT sequence must not bypass immutable proof IDs via REPLACE.
CREATE TRIGGER verification_sequence_replace BEFORE INSERT ON source_verifications WHEN EXISTS(SELECT 1 FROM source_verifications WHERE sequence=NEW.sequence) BEGIN SELECT RAISE(IGNORE); END;
-- Backfill only currently proved shadow readiness; old unverified cache claims are excluded.
INSERT INTO commercial_readiness_history(id,entity_id,entity_revision,verification_id,status,occurred_at)
 SELECT 'initial:'||e.id||':'||v.id,e.id,e.revision,v.id,'ready',r.evaluated_at
 FROM entities e JOIN readiness r ON r.entity_id=e.id JOIN source_verifications v ON v.sequence=(SELECT MAX(sequence) FROM source_verifications WHERE entity_id=e.id)
 WHERE e.environment='shadow' AND r.status='ready' AND r.entity_revision=e.revision AND v.entity_revision=e.revision AND v.status='verified'
 AND v.verifier_version='source-proof-v1' AND julianday(v.expires_at)>julianday('now');
CREATE TRIGGER commercial_ready_history_insert AFTER INSERT ON readiness WHEN EXISTS(SELECT 1 FROM entities WHERE id=NEW.entity_id AND environment='shadow') BEGIN
 INSERT OR IGNORE INTO commercial_readiness_history(id,entity_id,entity_revision,verification_id,status,occurred_at)
 SELECT NEW.entity_id||':'||NEW.entity_revision||':'||v.id||':'||NEW.status||':'||NEW.evaluated_at,NEW.entity_id,NEW.entity_revision,v.id,NEW.status,NEW.evaluated_at
 FROM source_verifications v WHERE v.sequence=(SELECT MAX(sequence) FROM source_verifications WHERE entity_id=NEW.entity_id);
END;
CREATE TRIGGER commercial_ready_history_update AFTER UPDATE ON readiness WHEN EXISTS(SELECT 1 FROM entities WHERE id=NEW.entity_id AND environment='shadow') BEGIN
 INSERT OR IGNORE INTO commercial_readiness_history(id,entity_id,entity_revision,verification_id,status,occurred_at)
 SELECT NEW.entity_id||':'||NEW.entity_revision||':'||v.id||':'||NEW.status||':'||NEW.evaluated_at,NEW.entity_id,NEW.entity_revision,v.id,NEW.status,NEW.evaluated_at
 FROM source_verifications v WHERE v.sequence=(SELECT MAX(sequence) FROM source_verifications WHERE entity_id=NEW.entity_id);
END;
