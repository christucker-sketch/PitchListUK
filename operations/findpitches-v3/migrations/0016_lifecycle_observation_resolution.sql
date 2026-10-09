-- Derived conflict repair only. Original producer receipts/facts are retained.
CREATE TABLE lifecycle_observation_resolutions (
 conflict_id TEXT PRIMARY KEY REFERENCES conflicts(id),
 entity_id TEXT NOT NULL REFERENCES entities(id),
 record_id TEXT NOT NULL REFERENCES producer_records(id),
 incoming_fact_id TEXT NOT NULL REFERENCES source_facts(id),
 selected_fact_id TEXT NOT NULL REFERENCES source_facts(id),
 policy_version TEXT NOT NULL CHECK(policy_version='lifecycle-observation-v1'),
 reason TEXT NOT NULL CHECK(reason='delivery_observation_not_source_disagreement'),
 evidence_json TEXT NOT NULL CHECK(json_valid(evidence_json)),
 resolved_at TEXT NOT NULL
);
CREATE TRIGGER lifecycle_resolution_scope BEFORE INSERT ON lifecycle_observation_resolutions WHEN NOT EXISTS (
 SELECT 1 FROM conflicts c JOIN entities e ON e.id=c.entity_id
 JOIN producer_records p ON p.id=c.record_id
 JOIN entity_records er ON er.record_id=p.id AND er.entity_id=e.id
 JOIN reconciliation_decisions d ON d.record_id=p.id AND d.entity_id=e.id
 JOIN source_facts f ON f.id=NEW.incoming_fact_id AND f.record_id=p.id AND f.field_name='lifecycle_state'
 JOIN field_selections s ON s.entity_id=e.id AND s.field_name='lifecycle_state' AND s.fact_id=NEW.selected_fact_id
 WHERE c.id=NEW.conflict_id AND c.entity_id=NEW.entity_id AND c.record_id=NEW.record_id AND c.resolved=0
 AND c.field_name='lifecycle_state' AND c.reason='equal_authority_disagreement'
 AND e.environment='shadow' AND p.environment='shadow' AND p.producer_name='independent-structured' AND p.validation_status='accepted'
 AND json_extract(f.value_json,'$') IN ('NEW','UPDATED','UNCHANGED')
 AND json_extract(p.normalized_json,'$.lifecycle_state')=json_extract(f.value_json,'$')
) BEGIN SELECT RAISE(ABORT,'lifecycle_metadata_resolution_scope_required'); END;
CREATE TRIGGER lifecycle_resolution_update BEFORE UPDATE ON lifecycle_observation_resolutions BEGIN SELECT RAISE(ABORT,'lifecycle_resolution_immutable'); END;
CREATE TRIGGER lifecycle_resolution_delete BEFORE DELETE ON lifecycle_observation_resolutions BEGIN SELECT RAISE(ABORT,'lifecycle_resolution_immutable'); END;
CREATE TRIGGER lifecycle_resolution_replace BEFORE INSERT ON lifecycle_observation_resolutions WHEN EXISTS(SELECT 1 FROM lifecycle_observation_resolutions WHERE conflict_id=NEW.conflict_id) BEGIN SELECT RAISE(IGNORE); END;
CREATE TRIGGER lifecycle_resolution_required BEFORE UPDATE OF resolved ON conflicts
WHEN OLD.resolved=0 AND NEW.resolved=1 AND OLD.field_name='lifecycle_state' AND OLD.reason='equal_authority_disagreement'
 AND EXISTS(SELECT 1 FROM producer_records p WHERE p.id=OLD.record_id AND p.producer_name='independent-structured'
  AND json_extract(p.normalized_json,'$.lifecycle_state') IN ('NEW','UPDATED','UNCHANGED'))
 AND NOT EXISTS(SELECT 1 FROM lifecycle_observation_resolutions a WHERE a.conflict_id=OLD.id AND a.entity_id=OLD.entity_id AND a.record_id=OLD.record_id)
BEGIN SELECT RAISE(ABORT,'lifecycle_resolution_audit_required'); END;
