-- Storage representations may change only after hash-verified archival or exact restore.
-- Source facts, receipt payloads, document identity/clocks and proof rows remain immutable.
CREATE TABLE source_document_archives (
 document_id TEXT PRIMARY KEY REFERENCES source_documents(id), serialized_sha256 TEXT NOT NULL,
 serialized_bytes INTEGER NOT NULL CHECK(serialized_bytes>0), archive_key TEXT NOT NULL,
 wrapper_json TEXT NOT NULL CHECK(json_valid(wrapper_json)), source_url TEXT NOT NULL,
 content_hash TEXT, fetched_at TEXT NOT NULL, verified_at TEXT NOT NULL
);
CREATE TRIGGER archive_receipt_update BEFORE UPDATE ON source_document_archives BEGIN SELECT RAISE(ABORT,'archive_receipt_immutable'); END;
CREATE TRIGGER archive_receipt_delete BEFORE DELETE ON source_document_archives BEGIN SELECT RAISE(ABORT,'archive_receipt_immutable'); END;
CREATE TRIGGER archive_receipt_replace BEFORE INSERT ON source_document_archives WHEN EXISTS(SELECT 1 FROM source_document_archives WHERE document_id=NEW.document_id) BEGIN SELECT RAISE(IGNORE); END;
CREATE TABLE source_document_storage_events (sequence INTEGER PRIMARY KEY AUTOINCREMENT,document_id TEXT NOT NULL REFERENCES source_documents(id),event TEXT NOT NULL CHECK(event IN ('archived','restored')),serialized_sha256 TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TRIGGER storage_event_update BEFORE UPDATE ON source_document_storage_events BEGIN SELECT RAISE(ABORT,'storage_event_immutable'); END;
CREATE TRIGGER storage_event_delete BEFORE DELETE ON source_document_storage_events BEGIN SELECT RAISE(ABORT,'storage_event_immutable'); END;
CREATE TABLE source_archive_restore_permits(document_id TEXT PRIMARY KEY,permit_json TEXT NOT NULL CHECK(json_valid(permit_json)));
DROP TRIGGER document_update;
CREATE TRIGGER document_update BEFORE UPDATE ON source_documents WHEN
 NEW.id IS NOT OLD.id OR NEW.source_url IS NOT OLD.source_url OR NEW.content_hash IS NOT OLD.content_hash OR NEW.fetched_at IS NOT OLD.fetched_at OR NOT (
 EXISTS(SELECT 1 FROM source_document_archives a WHERE a.document_id=OLD.id AND a.wrapper_json=NEW.document_json AND a.source_url=OLD.source_url AND a.content_hash IS OLD.content_hash AND a.fetched_at=OLD.fetched_at)
 OR EXISTS(SELECT 1 FROM source_archive_restore_permits p JOIN source_document_archives a ON a.document_id=p.document_id WHERE p.document_id=OLD.id AND json_extract(p.permit_json,'$.serialized_sha256')=a.serialized_sha256 AND json_extract(p.permit_json,'$.document_json')=NEW.document_json AND OLD.document_json=a.wrapper_json)
 ) BEGIN SELECT RAISE(ABORT,'source_document_immutable'); END;
CREATE INDEX verification_document_reference ON source_verifications(document_id,entity_id,sequence);
CREATE TABLE storage_capacity_samples(observed_at TEXT PRIMARY KEY,file_size_bytes INTEGER NOT NULL CHECK(file_size_bytes>=0));
