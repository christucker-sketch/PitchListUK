-- Additive operational custody. A failed transport attempt is not new proof.
CREATE TABLE source_renewal_attempts (
 sequence INTEGER PRIMARY KEY AUTOINCREMENT,
 id TEXT NOT NULL UNIQUE,
 entity_id TEXT NOT NULL REFERENCES entities(id),
 entity_revision INTEGER NOT NULL,
 source_host TEXT NOT NULL,
 document_id TEXT NOT NULL REFERENCES source_documents(id),
 verification_id TEXT REFERENCES source_verifications(id),
 active_verification_id TEXT REFERENCES source_verifications(id),
 outcome TEXT NOT NULL CHECK(outcome IN ('source_result','transient_failure')),
 reason TEXT,
 diagnostic TEXT,
 attempted_at TEXT NOT NULL,
 retry_at TEXT,
 retry_exhausted INTEGER NOT NULL DEFAULT 0 CHECK(retry_exhausted IN (0,1))
);
CREATE INDEX renewal_entity_latest ON source_renewal_attempts(entity_id,sequence DESC);
CREATE INDEX renewal_attempt_time ON source_renewal_attempts(attempted_at,outcome);
CREATE TRIGGER renewal_update BEFORE UPDATE ON source_renewal_attempts BEGIN SELECT RAISE(ABORT,'source_renewal_attempt_immutable'); END;
CREATE TRIGGER renewal_delete BEFORE DELETE ON source_renewal_attempts BEGIN SELECT RAISE(ABORT,'source_renewal_attempt_immutable'); END;
CREATE TRIGGER renewal_replace BEFORE INSERT ON source_renewal_attempts WHEN EXISTS(SELECT 1 FROM source_renewal_attempts WHERE id=NEW.id OR sequence=NEW.sequence) BEGIN SELECT RAISE(IGNORE); END;
-- Mutable retry admission only; never contains source facts or credentials.
CREATE TABLE source_renewal_domain_windows (
 source_host TEXT NOT NULL, window_start TEXT NOT NULL,
 retries INTEGER NOT NULL CHECK(retries>=0 AND retries<=16),
 PRIMARY KEY(source_host,window_start)
);
