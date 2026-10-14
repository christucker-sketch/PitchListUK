-- Additive coordinate evidence only. No source fact, identity or readiness write.
CREATE TABLE address_coordinate_cache (
 id TEXT PRIMARY KEY, address_hash TEXT NOT NULL, document_id TEXT NOT NULL REFERENCES source_documents(id),
 status TEXT NOT NULL CHECK(status IN ('matched','held')), reason TEXT,
 position_json TEXT, created_at TEXT NOT NULL
);
CREATE INDEX address_coordinate_cache_lookup ON address_coordinate_cache(address_hash,created_at DESC);
CREATE TABLE venue_address_coordinates (
 id TEXT PRIMARY KEY, entity_id TEXT NOT NULL REFERENCES entities(id), entity_revision INTEGER NOT NULL,
 verification_id TEXT NOT NULL REFERENCES source_verifications(id), verification_sequence INTEGER NOT NULL,
 source_document_id TEXT NOT NULL REFERENCES source_documents(id), cache_id TEXT NOT NULL REFERENCES address_coordinate_cache(id),
 position_json TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(entity_id,verification_id)
);
CREATE INDEX venue_address_current ON venue_address_coordinates(entity_id,entity_revision,verification_sequence);
CREATE TRIGGER address_cache_update BEFORE UPDATE ON address_coordinate_cache BEGIN SELECT RAISE(ABORT,'immutable address coordinate receipt'); END;
CREATE TRIGGER address_cache_delete BEFORE DELETE ON address_coordinate_cache BEGIN SELECT RAISE(ABORT,'immutable address coordinate receipt'); END;
CREATE TRIGGER address_cache_replace BEFORE INSERT ON address_coordinate_cache WHEN EXISTS(SELECT 1 FROM address_coordinate_cache WHERE id=NEW.id) BEGIN SELECT RAISE(IGNORE); END;
CREATE TRIGGER venue_address_update BEFORE UPDATE ON venue_address_coordinates BEGIN SELECT RAISE(ABORT,'immutable address coordinate binding'); END;
CREATE TRIGGER venue_address_delete BEFORE DELETE ON venue_address_coordinates BEGIN SELECT RAISE(ABORT,'immutable address coordinate binding'); END;
CREATE TRIGGER venue_address_replace BEFORE INSERT ON venue_address_coordinates WHEN EXISTS(SELECT 1 FROM venue_address_coordinates WHERE entity_id=NEW.entity_id AND verification_id=NEW.verification_id) BEGIN SELECT RAISE(IGNORE); END;
CREATE TRIGGER venue_address_source_guard BEFORE INSERT ON venue_address_coordinates
WHEN NOT EXISTS(SELECT 1 FROM entities e JOIN source_verifications v ON v.entity_id=e.id
 JOIN address_coordinate_cache c ON c.id=NEW.cache_id AND c.status='matched'
 WHERE e.id=NEW.entity_id AND e.environment IN ('shadow','test') AND e.market='US' AND e.revision=NEW.entity_revision
 AND v.id=NEW.verification_id AND v.entity_revision=e.revision AND v.sequence=NEW.verification_sequence
 AND v.sequence=(SELECT MAX(sequence) FROM source_verifications WHERE entity_id=e.id)
 AND v.status='verified' AND v.document_id=NEW.source_document_id AND v.checked_at<=NEW.created_at AND v.expires_at>NEW.created_at
 AND json_extract(v.report_json,'$.facts.country')='US'
 AND json_extract(v.report_json,'$.facts.location')=json_extract(NEW.position_json,'$.location')
 AND json_extract(c.position_json,'$.lat')=json_extract(NEW.position_json,'$.lat')
 AND json_extract(c.position_json,'$.lng')=json_extract(NEW.position_json,'$.lng'))
BEGIN SELECT RAISE(ABORT,'current source address binding required'); END;
CREATE TABLE venue_map_runs (
 id TEXT PRIMARY KEY,status TEXT NOT NULL CHECK(status IN ('active','paused')),
 max_requests INTEGER NOT NULL CHECK(max_requests BETWEEN 1 AND 250), requests_reserved INTEGER NOT NULL DEFAULT 0,
 max_entities INTEGER NOT NULL CHECK(max_entities BETWEEN 1 AND 3000), entities_checked INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL, expires_at TEXT NOT NULL, stop_reason TEXT
);
CREATE TABLE venue_map_checks (
 run_id TEXT NOT NULL REFERENCES venue_map_runs(id),entity_id TEXT NOT NULL REFERENCES entities(id),
 status TEXT NOT NULL, reason TEXT, result_json TEXT, PRIMARY KEY(run_id,entity_id)
);
