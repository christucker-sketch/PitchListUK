PRAGMA foreign_keys = ON;

CREATE TABLE runtime_policy (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  publication_enabled INTEGER NOT NULL DEFAULT 0 CHECK (publication_enabled = 0)
);
INSERT INTO runtime_policy VALUES (1, 0);

CREATE TABLE producer_records (
  id TEXT PRIMARY KEY,
  producer_name TEXT NOT NULL,
  producer_type TEXT NOT NULL,
  producer_record_id TEXT NOT NULL,
  environment TEXT NOT NULL CHECK (environment IN ('test','shadow','production')),
  market TEXT,
  content_hash TEXT NOT NULL,
  raw_json TEXT NOT NULL CHECK (json_valid(raw_json)),
  normalized_json TEXT CHECK (normalized_json IS NULL OR json_valid(normalized_json)),
  validation_status TEXT NOT NULL CHECK (validation_status IN ('accepted','rejected')),
  errors_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(errors_json)),
  received_at TEXT NOT NULL,
  UNIQUE (environment, producer_name, producer_record_id, content_hash)
);
CREATE INDEX producer_records_activity ON producer_records(producer_name, received_at);

CREATE TABLE source_facts (
  id TEXT PRIMARY KEY,
  record_id TEXT NOT NULL REFERENCES producer_records(id),
  field_name TEXT NOT NULL,
  value_json TEXT NOT NULL CHECK (json_valid(value_json)),
  authority INTEGER NOT NULL CHECK (authority BETWEEN 0 AND 100),
  source_url TEXT,
  evidence_json TEXT NOT NULL CHECK (json_valid(evidence_json)),
  provenance_json TEXT NOT NULL CHECK (json_valid(provenance_json)),
  created_at TEXT NOT NULL,
  UNIQUE (record_id, field_name)
);

CREATE TABLE entities (
  id TEXT PRIMARY KEY,
  market TEXT NOT NULL,
  edition TEXT,
  environment TEXT NOT NULL CHECK (environment IN ('test','shadow','production')),
  shadow_only INTEGER NOT NULL CHECK (shadow_only IN (0,1)),
  promotion_eligible INTEGER NOT NULL DEFAULT 0 CHECK (promotion_eligible IN (0,1)),
  publication_eligible INTEGER NOT NULL DEFAULT 0 CHECK (publication_eligible IN (0,1)),
  revision INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (environment = 'production' OR (shadow_only = 1 AND promotion_eligible = 0 AND publication_eligible = 0))
);
CREATE TABLE entity_records (
  record_id TEXT PRIMARY KEY REFERENCES producer_records(id),
  entity_id TEXT NOT NULL REFERENCES entities(id)
);
CREATE TABLE entity_facts (
  entity_id TEXT NOT NULL REFERENCES entities(id),
  fact_id TEXT NOT NULL REFERENCES source_facts(id),
  PRIMARY KEY (entity_id, fact_id)
);
CREATE TABLE identity_keys (
  environment TEXT NOT NULL,
  market TEXT NOT NULL,
  identity_key TEXT NOT NULL,
  entity_id TEXT NOT NULL REFERENCES entities(id),
  PRIMARY KEY (environment, market, identity_key, entity_id)
);
CREATE TABLE field_selections (
  entity_id TEXT NOT NULL REFERENCES entities(id),
  field_name TEXT NOT NULL,
  fact_id TEXT NOT NULL REFERENCES source_facts(id),
  PRIMARY KEY (entity_id, field_name)
);
CREATE TABLE selection_audit (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL REFERENCES entities(id),
  field_name TEXT NOT NULL,
  proposed_fact_id TEXT NOT NULL REFERENCES source_facts(id),
  previous_fact_id TEXT,
  decision TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE reconciliation_decisions (
  record_id TEXT PRIMARY KEY REFERENCES producer_records(id),
  outcome TEXT NOT NULL,
  entity_id TEXT REFERENCES entities(id),
  candidates_json TEXT NOT NULL CHECK (json_valid(candidates_json)),
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE conflicts (
  id TEXT PRIMARY KEY,
  entity_id TEXT REFERENCES entities(id),
  record_id TEXT NOT NULL REFERENCES producer_records(id),
  field_name TEXT,
  reason TEXT NOT NULL,
  resolved INTEGER NOT NULL DEFAULT 0 CHECK (resolved IN (0,1)),
  created_at TEXT NOT NULL
);
CREATE INDEX conflicts_entity ON conflicts(entity_id, resolved);
CREATE TABLE assessments (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL REFERENCES entities(id),
  entity_revision INTEGER NOT NULL,
  ruleset TEXT NOT NULL,
  status TEXT NOT NULL,
  reasons_json TEXT NOT NULL CHECK (json_valid(reasons_json)),
  score REAL NOT NULL,
  assessed_at TEXT NOT NULL,
  UNIQUE (entity_id, entity_revision, ruleset)
);
CREATE TABLE enrichment_proposals (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL REFERENCES entities(id),
  fact_id TEXT NOT NULL REFERENCES source_facts(id),
  decision TEXT NOT NULL,
  reason TEXT NOT NULL,
  proposed_at TEXT NOT NULL
);
CREATE TABLE readiness (
  entity_id TEXT PRIMARY KEY REFERENCES entities(id),
  entity_revision INTEGER NOT NULL,
  status TEXT NOT NULL,
  reasons_json TEXT NOT NULL CHECK (json_valid(reasons_json)),
  snapshot_hash TEXT NOT NULL,
  evaluated_at TEXT NOT NULL
);
CREATE TABLE shadow_projections (
  entity_id TEXT PRIMARY KEY REFERENCES entities(id),
  entity_revision INTEGER NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  updated_at TEXT NOT NULL
);
CREATE TABLE customer_projections (
  entity_id TEXT PRIMARY KEY REFERENCES entities(id),
  entity_revision INTEGER NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  updated_at TEXT NOT NULL
);
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  stage TEXT NOT NULL CHECK (stage IN ('reconcile','eligibility','enrichment','readiness','watch','acquisition','publication')),
  dedupe_key TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('ready','leased','complete','dead')),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 10),
  available_at TEXT NOT NULL,
  lease_until TEXT,
  lease_token TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (stage, dedupe_key)
);
CREATE INDEX jobs_ready ON jobs(stage,status,available_at);
CREATE TABLE quality_gates (
  name TEXT PRIMARY KEY,
  tested_records INTEGER NOT NULL,
  destructive_mutations INTEGER NOT NULL,
  report_json TEXT NOT NULL CHECK (json_valid(report_json)),
  report_hash TEXT NOT NULL,
  passed_at TEXT NOT NULL
);
CREATE TABLE publication_queue (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL REFERENCES entities(id),
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE recheck_requests (
  entity_id TEXT PRIMARY KEY REFERENCES entities(id),
  requested_at TEXT NOT NULL,
  reason TEXT NOT NULL
);
CREATE TABLE acquisition_runs (
  id TEXT PRIMARY KEY,
  city TEXT NOT NULL,
  day TEXT NOT NULL,
  queries_reserved INTEGER NOT NULL CHECK (queries_reserved BETWEEN 1 AND 4),
  queries_completed INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('reserved','complete','failed')),
  result_json TEXT CHECK (result_json IS NULL OR json_valid(result_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX acquisition_day ON acquisition_runs(day);

CREATE TRIGGER records_immutable_update BEFORE UPDATE ON producer_records BEGIN SELECT RAISE(ABORT,'source_record_immutable'); END;
CREATE TRIGGER records_immutable_delete BEFORE DELETE ON producer_records BEGIN SELECT RAISE(ABORT,'source_record_immutable'); END;
CREATE TRIGGER facts_immutable_update BEFORE UPDATE ON source_facts BEGIN SELECT RAISE(ABORT,'source_fact_immutable'); END;
CREATE TRIGGER facts_immutable_delete BEFORE DELETE ON source_facts BEGIN SELECT RAISE(ABORT,'source_fact_immutable'); END;
CREATE TRIGGER records_no_replace BEFORE INSERT ON producer_records WHEN EXISTS (SELECT 1 FROM producer_records WHERE id=NEW.id OR (environment=NEW.environment AND producer_name=NEW.producer_name AND producer_record_id=NEW.producer_record_id AND content_hash=NEW.content_hash))
BEGIN SELECT RAISE(IGNORE); END;
CREATE TRIGGER facts_no_replace BEFORE INSERT ON source_facts WHEN EXISTS (SELECT 1 FROM source_facts WHERE id=NEW.id OR (record_id=NEW.record_id AND field_name=NEW.field_name))
BEGIN SELECT RAISE(IGNORE); END;
CREATE TRIGGER decisions_immutable_update BEFORE UPDATE ON reconciliation_decisions BEGIN SELECT RAISE(ABORT,'reconciliation_immutable'); END;
CREATE TRIGGER decisions_immutable_delete BEFORE DELETE ON reconciliation_decisions BEGIN SELECT RAISE(ABORT,'reconciliation_immutable'); END;
CREATE TRIGGER assessments_immutable_update BEFORE UPDATE ON assessments BEGIN SELECT RAISE(ABORT,'assessment_immutable'); END;
CREATE TRIGGER assessments_immutable_delete BEFORE DELETE ON assessments BEGIN SELECT RAISE(ABORT,'assessment_immutable'); END;
CREATE TRIGGER entity_scope_immutable BEFORE UPDATE OF environment,shadow_only ON entities BEGIN SELECT RAISE(ABORT,'entity_scope_immutable'); END;
CREATE TRIGGER entity_no_replace BEFORE INSERT ON entities WHEN EXISTS(SELECT 1 FROM entities WHERE id=NEW.id) BEGIN SELECT RAISE(IGNORE); END;
CREATE TRIGGER entity_no_delete BEFORE DELETE ON entities BEGIN SELECT RAISE(ABORT,'entity_evidence_retained'); END;
CREATE TRIGGER entity_market_immutable BEFORE UPDATE OF market,edition ON entities BEGIN SELECT RAISE(ABORT,'entity_identity_immutable'); END;
CREATE TRIGGER entity_records_update BEFORE UPDATE ON entity_records BEGIN SELECT RAISE(ABORT,'record_link_immutable'); END;
CREATE TRIGGER entity_records_delete BEFORE DELETE ON entity_records BEGIN SELECT RAISE(ABORT,'record_link_immutable'); END;
CREATE TRIGGER entity_records_replace BEFORE INSERT ON entity_records WHEN EXISTS(SELECT 1 FROM entity_records WHERE record_id=NEW.record_id) BEGIN SELECT RAISE(IGNORE); END;
CREATE TRIGGER record_link_scope BEFORE INSERT ON entity_records WHEN NOT EXISTS(SELECT 1 FROM entities e JOIN producer_records r ON r.id=NEW.record_id WHERE e.id=NEW.entity_id AND e.market=r.market AND e.environment=r.environment)
BEGIN SELECT RAISE(ABORT,'record_scope_mismatch'); END;
CREATE TRIGGER entity_facts_update BEFORE UPDATE ON entity_facts BEGIN SELECT RAISE(ABORT,'fact_membership_immutable'); END;
CREATE TRIGGER entity_facts_delete BEFORE DELETE ON entity_facts BEGIN SELECT RAISE(ABORT,'fact_membership_immutable'); END;
CREATE TRIGGER audit_update BEFORE UPDATE ON selection_audit BEGIN SELECT RAISE(ABORT,'audit_immutable'); END;
CREATE TRIGGER audit_delete BEFORE DELETE ON selection_audit BEGIN SELECT RAISE(ABORT,'audit_immutable'); END;
CREATE TRIGGER audit_replace BEFORE INSERT ON selection_audit WHEN EXISTS(SELECT 1 FROM selection_audit WHERE id=NEW.id) BEGIN SELECT RAISE(IGNORE); END;
CREATE TRIGGER proposal_update BEFORE UPDATE ON enrichment_proposals BEGIN SELECT RAISE(ABORT,'proposal_immutable'); END;
CREATE TRIGGER proposal_delete BEFORE DELETE ON enrichment_proposals BEGIN SELECT RAISE(ABORT,'proposal_immutable'); END;
CREATE TRIGGER proposal_replace BEFORE INSERT ON enrichment_proposals WHEN EXISTS(SELECT 1 FROM enrichment_proposals WHERE id=NEW.id) BEGIN SELECT RAISE(IGNORE); END;
CREATE TRIGGER identity_scope BEFORE INSERT ON identity_keys WHEN NOT EXISTS(SELECT 1 FROM entities WHERE id=NEW.entity_id AND environment=NEW.environment AND market=NEW.market)
BEGIN SELECT RAISE(ABORT,'identity_scope_mismatch'); END;
CREATE TRIGGER identity_update BEFORE UPDATE ON identity_keys BEGIN SELECT RAISE(ABORT,'identity_key_immutable'); END;
CREATE TRIGGER identity_delete BEFORE DELETE ON identity_keys BEGIN SELECT RAISE(ABORT,'identity_key_immutable'); END;
CREATE TRIGGER decisions_replace BEFORE INSERT ON reconciliation_decisions WHEN EXISTS(SELECT 1 FROM reconciliation_decisions WHERE record_id=NEW.record_id) BEGIN SELECT RAISE(IGNORE); END;
CREATE TRIGGER assessments_replace BEFORE INSERT ON assessments WHEN EXISTS(SELECT 1 FROM assessments WHERE id=NEW.id OR (entity_id=NEW.entity_id AND entity_revision=NEW.entity_revision AND ruleset=NEW.ruleset)) BEGIN SELECT RAISE(IGNORE); END;
CREATE TRIGGER selection_replace_guard BEFORE INSERT ON field_selections
WHEN EXISTS(SELECT 1 FROM field_selections WHERE entity_id=NEW.entity_id AND field_name=NEW.field_name AND fact_id<>NEW.fact_id)
BEGIN SELECT RAISE(ABORT,'selection_replace_forbidden'); END;
CREATE TRIGGER selection_same_ignore BEFORE INSERT ON field_selections
WHEN EXISTS(SELECT 1 FROM field_selections WHERE entity_id=NEW.entity_id AND field_name=NEW.field_name AND fact_id=NEW.fact_id)
BEGIN SELECT RAISE(IGNORE); END;
CREATE TRIGGER fact_scope_guard BEFORE INSERT ON entity_facts WHEN NOT EXISTS (
  SELECT 1 FROM entities e JOIN source_facts f ON f.id=NEW.fact_id JOIN producer_records r ON r.id=f.record_id
  WHERE e.id=NEW.entity_id AND e.environment=r.environment AND e.market=r.market
) BEGIN SELECT RAISE(ABORT,'fact_scope_mismatch'); END;
CREATE TRIGGER selection_member_insert BEFORE INSERT ON field_selections WHEN NOT EXISTS (
  SELECT 1 FROM entity_facts ef JOIN source_facts f ON f.id=ef.fact_id
  WHERE ef.entity_id=NEW.entity_id AND ef.fact_id=NEW.fact_id AND f.field_name=NEW.field_name
) BEGIN SELECT RAISE(ABORT,'selection_membership_required'); END;
CREATE TRIGGER selection_member_update BEFORE UPDATE ON field_selections WHEN NOT EXISTS (
  SELECT 1 FROM entity_facts ef JOIN source_facts f ON f.id=ef.fact_id
  WHERE ef.entity_id=NEW.entity_id AND ef.fact_id=NEW.fact_id AND f.field_name=NEW.field_name
) BEGIN SELECT RAISE(ABORT,'selection_membership_required'); END;
CREATE TRIGGER selection_scope_immutable BEFORE UPDATE OF entity_id,field_name ON field_selections
WHEN NEW.entity_id<>OLD.entity_id OR NEW.field_name<>OLD.field_name BEGIN SELECT RAISE(ABORT,'selection_scope_immutable'); END;
CREATE TRIGGER selection_no_weaker BEFORE UPDATE OF fact_id ON field_selections
WHEN (SELECT authority FROM source_facts WHERE id=NEW.fact_id)<(SELECT authority FROM source_facts WHERE id=OLD.fact_id)
BEGIN SELECT RAISE(ABORT,'weaker_evidence_replacement'); END;
CREATE TRIGGER selection_equal_conflict BEFORE UPDATE OF fact_id ON field_selections
WHEN NEW.fact_id<>OLD.fact_id AND EXISTS (
  SELECT 1 FROM source_facts n JOIN source_facts o ON o.id=OLD.fact_id
  JOIN producer_records nr ON nr.id=n.record_id JOIN producer_records oldr ON oldr.id=o.record_id
  WHERE n.id=NEW.fact_id AND n.authority=o.authority AND n.value_json<>o.value_json
  AND NOT (NEW.field_name IN ('application_state','lifecycle_state')
    AND nr.producer_name=oldr.producer_name AND nr.producer_record_id=oldr.producer_record_id
    AND julianday(json_extract(nr.normalized_json,'$.last_checked'))>julianday(json_extract(oldr.normalized_json,'$.last_checked'))
    AND json_extract(nr.normalized_json,'$.lifecycle_state') IN ('STATE_CHANGED','CLOSED','REOPENED','WITHDRAWN'))
) BEGIN SELECT RAISE(ABORT,'equal_authority_conflict'); END;
CREATE TRIGGER selection_no_delete BEFORE DELETE ON field_selections BEGIN SELECT RAISE(ABORT,'selected_evidence_retained'); END;
CREATE TRIGGER selection_revision_insert AFTER INSERT ON field_selections BEGIN
  UPDATE entities SET revision=revision+1,updated_at=(SELECT created_at FROM source_facts WHERE id=NEW.fact_id) WHERE id=NEW.entity_id;
  DELETE FROM readiness WHERE entity_id=NEW.entity_id;
  DELETE FROM shadow_projections WHERE entity_id=NEW.entity_id;
  DELETE FROM customer_projections WHERE entity_id=NEW.entity_id;
END;
CREATE TRIGGER selection_revision_update AFTER UPDATE OF fact_id ON field_selections WHEN NEW.fact_id<>OLD.fact_id BEGIN
  UPDATE entities SET revision=revision+1,updated_at=(SELECT created_at FROM source_facts WHERE id=NEW.fact_id) WHERE id=NEW.entity_id;
  DELETE FROM readiness WHERE entity_id=NEW.entity_id;
  DELETE FROM shadow_projections WHERE entity_id=NEW.entity_id;
  DELETE FROM customer_projections WHERE entity_id=NEW.entity_id;
END;
CREATE TRIGGER shadow_projection_insert BEFORE INSERT ON shadow_projections WHEN NOT EXISTS (
  SELECT 1 FROM entities WHERE id=NEW.entity_id AND environment IN ('shadow','test') AND shadow_only=1 AND revision=NEW.entity_revision
) BEGIN SELECT RAISE(ABORT,'shadow_projection_scope'); END;
CREATE TRIGGER shadow_projection_update BEFORE UPDATE ON shadow_projections WHEN NOT EXISTS (
  SELECT 1 FROM entities WHERE id=NEW.entity_id AND environment IN ('shadow','test') AND shadow_only=1 AND revision=NEW.entity_revision
) BEGIN SELECT RAISE(ABORT,'shadow_projection_scope'); END;
CREATE TRIGGER customer_projection_insert BEFORE INSERT ON customer_projections WHEN NOT EXISTS (
  SELECT 1 FROM entities e JOIN readiness r ON r.entity_id=e.id
  WHERE e.id=NEW.entity_id AND e.environment='production' AND e.shadow_only=0 AND e.promotion_eligible=1
    AND e.revision=NEW.entity_revision AND r.entity_revision=e.revision AND r.status='ready'
    AND NOT EXISTS (SELECT 1 FROM conflicts c WHERE c.entity_id=e.id AND c.resolved=0)
) BEGIN SELECT RAISE(ABORT,'customer_projection_blocked'); END;
CREATE TRIGGER customer_projection_update BEFORE UPDATE ON customer_projections WHEN NOT EXISTS (
  SELECT 1 FROM entities e JOIN readiness r ON r.entity_id=e.id
  WHERE e.id=NEW.entity_id AND e.environment='production' AND e.shadow_only=0 AND e.promotion_eligible=1
    AND e.revision=NEW.entity_revision AND r.entity_revision=e.revision AND r.status='ready'
    AND NOT EXISTS (SELECT 1 FROM conflicts c WHERE c.entity_id=e.id AND c.resolved=0)
) BEGIN SELECT RAISE(ABORT,'customer_projection_blocked'); END;
CREATE TRIGGER conflict_invalidates AFTER INSERT ON conflicts WHEN NEW.entity_id IS NOT NULL BEGIN
  DELETE FROM readiness WHERE entity_id=NEW.entity_id;
  DELETE FROM shadow_projections WHERE entity_id=NEW.entity_id;
  DELETE FROM customer_projections WHERE entity_id=NEW.entity_id;
END;
CREATE TRIGGER publication_disabled_insert BEFORE INSERT ON publication_queue BEGIN SELECT RAISE(ABORT,'publication_disabled'); END;
CREATE TRIGGER publication_disabled_update BEFORE UPDATE ON publication_queue BEGIN SELECT RAISE(ABORT,'publication_disabled'); END;
CREATE TRIGGER permission_revoked AFTER UPDATE OF promotion_eligible,publication_eligible ON entities
WHEN NEW.promotion_eligible=0 OR NEW.publication_eligible=0 BEGIN DELETE FROM customer_projections WHERE entity_id=NEW.id; END;
CREATE TRIGGER readiness_blocks_customer AFTER UPDATE ON readiness WHEN NEW.status<>'ready' OR NEW.entity_revision<>(SELECT revision FROM entities WHERE id=NEW.entity_id)
BEGIN DELETE FROM customer_projections WHERE entity_id=NEW.entity_id; END;
CREATE TRIGGER readiness_delete_customer AFTER DELETE ON readiness BEGIN DELETE FROM customer_projections WHERE entity_id=OLD.entity_id; END;

CREATE VIEW selected_facts AS
SELECT s.entity_id,s.field_name,f.id AS fact_id,f.value_json,f.authority,f.source_url,f.record_id
FROM field_selections s JOIN source_facts f ON f.id=s.fact_id;
